/*
===========================================================
OBITREND PAYMENTS
PAYSTACK + SUPABASE + REDIS

PLANS

4 DAYS
₦10,000
5 CREDITS
SMALL FEATURES

8 DAYS
₦20,000
10 CREDITS
SMALL FEATURES

14 DAYS
₦30,000
15 CREDITS
LIMITED PRO

MONTHLY
₦60,000
30 CREDITS
FULL PRO

FLOW

USER
  ↓
LOGIN
  ↓
AUTHENTICATE SUPABASE USER
  ↓
SELECT PLAN
  ↓
SERVER SELECTS PRICE
  ↓
CREATE PAYSTACK TRANSACTION
  ↓
BIND PAYMENT REFERENCE TO USER
  ↓
USER PAYS
  ↓
PAYSTACK RETURNS REFERENCE
  ↓
SERVER VERIFIES PAYMENT
  ↓
VERIFY USER
  ↓
VERIFY AMOUNT
  ↓
VERIFY REFERENCE OWNERSHIP
  ↓
VERIFY PAYMENT HAS NOT BEEN USED
  ↓
ACTIVATE EXACT PLAN
  ↓
SAVE PLAN + CREDITS + EXPIRY
  ↓
USER CAN GENERATE

NO CREDIT
  ↓
GENERATION STOPS
  ↓
UPGRADE

OPENAI GENERATION
  ↓
DEDUCT 1 CREDIT
  ↓
SUCCESS = CREDIT STAYS SPENT
  ↓
OPENAI FAILURE = REFUND 1 CREDIT
===========================================================
*/

import {
  activatePro,
  getAuthenticatedUser,
  getRedisConfig
} from "./credits.js";


/* =========================================================
PAYSTACK
========================================================= */

const PAYSTACK_API =
  "https://api.paystack.co";


const DEFAULT_APP_URL =
  "https://obitrend.vercel.app";


const CURRENCY =
  "NGN";


/* =========================================================
PLAN SETTINGS

Amounts here are Naira.

Paystack receives Kobo.
========================================================= */

const PLANS = {

  "4day": {
    key: "4day",

    name:
      "OBITREND 4 Day",

    amount:
      10000,

    durationSeconds:
      4 * 24 * 60 * 60,

    credits:
      5,

    featureLevel:
      "small",

    fullPro:
      false
  },


  "8day": {
    key: "8day",

    name:
      "OBITREND 8 Day",

    amount:
      20000,

    durationSeconds:
      8 * 24 * 60 * 60,

    credits:
      10,

    featureLevel:
      "small",

    fullPro:
      false
  },


  "14day": {
    key: "14day",

    name:
      "OBITREND 14 Day Pro",

    amount:
      30000,

    durationSeconds:
      14 * 24 * 60 * 60,

    credits:
      15,

    featureLevel:
      "limited_pro",

    fullPro:
      false
  },


  monthly: {
    key:
      "monthly",

    name:
      "OBITREND Monthly Full Pro",

    amount:
      60000,

    durationSeconds:
      30 * 24 * 60 * 60,

    credits:
      30,

    featureLevel:
      "full_pro",

    fullPro:
      true
  }

};


/* =========================================================
HELPERS
========================================================= */

function clean(
  value
) {
  return String(
    value ?? ""
  ).trim();
}


function lower(
  value
) {
  return clean(
    value
  ).toLowerCase();
}


function send(
  res,
  status,
  data
) {
  return res
    .status(status)
    .json(data);
}


function appUrl() {

  return (
    clean(
      process.env.OBITREND_APP_URL
    ) ||
    DEFAULT_APP_URL
  );
}


/* =========================================================
PLAN NORMALIZATION

The browser can request the plan by several compatible
names, but the SERVER always converts it to the exact
server-side plan.
========================================================= */

function getPlan(
  value
) {

  const plan =
    lower(
      value
    );


  if (
    plan === "4" ||
    plan === "4day" ||
    plan === "4days"
  ) {
    return PLANS["4day"];
  }


  if (
    plan === "8" ||
    plan === "8day" ||
    plan === "8days"
  ) {
    return PLANS["8day"];
  }


  if (
    plan === "14" ||
    plan === "14day" ||
    plan === "14days"
  ) {
    return PLANS["14day"];
  }


  if (
    plan === "monthly" ||
    plan === "month" ||
    plan === "30day" ||
    plan === "30days"
  ) {
    return PLANS.monthly;
  }


  return null;
}


/* =========================================================
REDIS KEYS
========================================================= */

function pendingKey(
  reference
) {

  return `obitrend:paystack:pending:${clean(
    reference
  )}`;
}


function processedKey(
  reference
) {

  return `obitrend:paystack:processed:${clean(
    reference
  )}`;
}


function lockKey(
  reference
) {

  return `obitrend:paystack:lock:${clean(
    reference
  )}`;
}


/* =========================================================
REDIS
========================================================= */

async function redisCommand(
  redis,
  command
) {

  if (
    !redis?.url ||
    !redis?.token
  ) {
    throw new Error(
      "Redis is not configured."
    );
  }


  const response =
    await fetch(
      `${redis.url.replace(
        /\/$/,
        ""
      )}/${command
        .map(
          encodeURIComponent
        )
        .join("/")}`,
      {
        method:
          "GET",

        headers: {
          Authorization:
            `Bearer ${redis.token}`
        }
      }
    );


  let data =
    null;


  try {

    data =
      await response.json();

  } catch {

    data =
      null;
  }


  if (
    !response.ok ||
    !data ||
    data.error
  ) {

    throw new Error(
      data?.error ||
        "Redis request failed."
    );
  }


  return data.result;
}


/* =========================================================
PAYSTACK
========================================================= */

function getSecretKey() {

  return clean(
    process.env.PAYSTACK_SECRET_KEY
  );
}


async function paystack(
  path,
  options = {}
) {

  const secretKey =
    getSecretKey();


  if (!secretKey) {

    throw new Error(
      "Paystack is not configured."
    );
  }


  const response =
    await fetch(
      `${PAYSTACK_API}${path}`,
      {

        method:
          options.method ||
          "GET",

        headers: {

          Authorization:
            `Bearer ${secretKey}`,

          "Content-Type":
            "application/json",

          Accept:
            "application/json"
        },

        body:
          options.body !==
          undefined
            ? JSON.stringify(
                options.body
              )
            : undefined
      }
    );


  let data =
    null;


  try {

    data =
      await response.json();

  } catch {

    data =
      null;
  }


  return {

    ok:
      response.ok,

    status:
      response.status,

    data
  };
}


/* =========================================================
PENDING PAYMENT
========================================================= */

async function savePendingPayment(
  redis,
  reference,
  userId,
  email,
  plan
) {

  const payload = {

    reference:
      String(
        reference
      ),

    userId:
      String(
        userId
      ),

    email:
      String(
        email
      )
        .trim()
        .toLowerCase(),

    plan:
      plan.key,

    amount:
      plan.amount,

    credits:
      plan.credits,

    durationSeconds:
      plan.durationSeconds,

    featureLevel:
      plan.featureLevel,

    fullPro:
      plan.fullPro,

    createdAt:
      Math.floor(
        Date.now() /
          1000
      )
  };


  await redisCommand(
    redis,
    [

      "SET",

      pendingKey(
        reference
      ),

      JSON.stringify(
        payload
      ),

      "EX",

      24 * 60 * 60

    ]
  );


  return payload;
}


async function getPendingPayment(
  redis,
  reference
) {

  const raw =
    await redisCommand(
      redis,
      [

        "GET",

        pendingKey(
          reference
        )

      ]
    );


  if (!raw) {
    return null;
  }


  try {

    return JSON.parse(
      raw
    );

  } catch {

    return null;
  }
}


/* =========================================================
PROCESSED PAYMENT
========================================================= */

async function getProcessedPayment(
  redis,
  reference
) {

  const raw =
    await redisCommand(
      redis,
      [

        "GET",

        processedKey(
          reference
        )

      ]
    );


  if (!raw) {
    return null;
  }


  try {

    return JSON.parse(
      raw
    );

  } catch {

    return null;
  }
}


async function markProcessed(
  redis,
  reference,
  userId,
  plan
) {

  const payload = {

    reference:
      String(
        reference
      ),

    userId:
      String(
        userId
      ),

    plan:
      plan.key,

    processedAt:
      Math.floor(
        Date.now() /
          1000
      )
  };


  await redisCommand(
    redis,
    [

      "SET",

      processedKey(
        reference
      ),

      JSON.stringify(
        payload
      ),

      "EX",

      10 * 365 * 24 * 60 * 60

    ]
  );


  return payload;
}


/* =========================================================
PAYMENT LOCK
========================================================= */

async function acquireLock(
  redis,
  reference,
  userId
) {

  const result =
    await redisCommand(
      redis,
      [

        "SET",

        lockKey(
          reference
        ),

        String(
          userId
        ),

        "EX",

        60,

        "NX"

      ]
    );


  return (
    result === "OK"
  );
}


async function releaseLock(
  redis,
  reference
) {

  try {

    await redisCommand(
      redis,
      [

        "DEL",

        lockKey(
          reference
        )

      ]
    );

  } catch {}
}


/* =========================================================
INITIALIZE PAYMENT
========================================================= */

async function initializePayment(
  req,
  res,
  plan
) {

  /*
  ---------------------------------------------------------
  AUTHENTICATE THE ACTUAL SUPABASE USER

  credits.js returns the USER DIRECTLY.
  ---------------------------------------------------------
  */

  const user =
    await getAuthenticatedUser(
      req
    );


  if (
    !user?.id
  ) {

    return send(
      res,
      401,
      {
        success:
          false,

        error:
          "Please log in to continue."
      }
    );
  }


  const redis =
    getRedisConfig();


  if (
    !redis?.url ||
    !redis?.token
  ) {

    return send(
      res,
      500,
      {
        success:
          false,

        error:
          "Payment is temporarily unavailable. Please try again."
      }
    );
  }


  /*
  ---------------------------------------------------------
  UNIQUE SERVER-SIDE PAYMENT REFERENCE
  ---------------------------------------------------------
  */

  const reference =
    `OBITREND-${plan.key.toUpperCase()}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;


  /*
  ---------------------------------------------------------
  BIND PAYMENT TO AUTHENTICATED USER BEFORE CHECKOUT
  ---------------------------------------------------------
  */

  await savePendingPayment(
    redis,
    reference,
    user.id,
    user.email,
    plan
  );


  /*
  ---------------------------------------------------------
  SERVER-CONTROLLED AMOUNT

  ₦10,000 = 1,000,000 Kobo
  ₦20,000 = 2,000,000 Kobo
  ₦30,000 = 3,000,000 Kobo
  ₦60,000 = 6,000,000 Kobo
  ---------------------------------------------------------
  */

  const amountInKobo =
    plan.amount *
    100;


  const payload = {

    email:
      user.email,

    amount:
      String(
        amountInKobo
      ),

    currency:
      CURRENCY,

    reference,

    callback_url:
      `${appUrl()}/`,

    metadata: {

      product:
        "OBITREND_PRO",

      plan:
        plan.key,

      plan_name:
        plan.name,

      credits:
        String(
          plan.credits
        ),

      duration_seconds:
        String(
          plan.durationSeconds
        ),

      feature_level:
        plan.featureLevel,

      full_pro:
        String(
          plan.fullPro
        ),

      user_id:
        String(
          user.id
        )
    }
  };


  /*
  ---------------------------------------------------------
  NO PAYSTACK SUBSCRIPTION PLAN CODE

  OBITREND controls these packages itself.
  ---------------------------------------------------------
  */

  const result =
    await paystack(
      "/transaction/initialize",
      {

        method:
          "POST",

        body:
          payload
      }
    );


  if (
    !result.ok ||
    !result.data?.status
  ) {

    return send(
      res,
      400,
      {

        success:
          false,

        error:
          "The secure payment page could not be opened. Please try again."
      }
    );
  }


  const data =
    result.data.data;


  if (
    !data?.authorization_url
  ) {

    return send(
      res,
      400,
      {

        success:
          false,

        error:
          "The secure payment page could not be opened. Please try again."
      }
    );
  }


  return send(
    res,
    200,
    {

      success:
        true,

      authorization_url:
        data.authorization_url,

      access_code:
        data.access_code ||
        null,

      reference:
        data.reference ||
        reference,

      plan:
        plan.key,

      planName:
        plan.name,

      amount:
        plan.amount,

      currency:
        CURRENCY,

      credits:
        plan.credits,

      durationSeconds:
        plan.durationSeconds,

      featureLevel:
        plan.featureLevel,

      fullPro:
        plan.fullPro
    }
  );
}


/* =========================================================
VERIFY PAYMENT
========================================================= */

async function verifyPayment(
  req,
  res,
  reference
) {

  /*
  ---------------------------------------------------------
  AUTHENTICATE ACTUAL SUPABASE USER
  ---------------------------------------------------------
  */

  const user =
    await getAuthenticatedUser(
      req
    );


  if (
    !user?.id
  ) {

    return send(
      res,
      401,
      {

        success:
          false,

        error:
          "Please log in to continue."
      }
    );
  }


  const redis =
    getRedisConfig();


  if (
    !redis?.url ||
    !redis?.token
  ) {

    return send(
      res,
      500,
      {

        success:
          false,

        error:
          "Payment verification is temporarily unavailable. Please try again."
      }
    );
  }


  /*
  ---------------------------------------------------------
  CHECK WHETHER THIS PAYMENT WAS ALREADY USED
  ---------------------------------------------------------
  */

  const alreadyProcessed =
    await getProcessedPayment(
      redis,
      reference
    );


  if (
    alreadyProcessed
  ) {

    if (
      String(
        alreadyProcessed.userId
      ) !==
      String(
        user.id
      )
    ) {

      return send(
        res,
        400,
        {

          success:
            false,

          error:
            "This payment belongs to another account."
        }
      );
    }


    return send(
      res,
      200,
      {

        success:
          true,

        paid:
          true,

        proActivated:
          true,

        proActive:
          true,

        reference,

        plan:
          alreadyProcessed.plan,

        message:
          "Your OBITREND plan is already active."
      }
    );
  }


  /*
  ---------------------------------------------------------
  GET ORIGINAL SERVER-SIDE PAYMENT
  ---------------------------------------------------------
  */

  const pending =
    await getPendingPayment(
      redis,
      reference
    );


  if (
    !pending
  ) {

    return send(
      res,
      400,
      {

        success:
          false,

        error:
          "This payment could not be connected to your account."
      }
    );
  }


  /*
  ---------------------------------------------------------
  VERIFY PAYMENT BELONGS TO THIS USER
  ---------------------------------------------------------
  */

  if (
    String(
      pending.userId
    ) !==
    String(
      user.id
    )
  ) {

    return send(
      res,
      400,
      {

        success:
          false,

        error:
          "This payment belongs to another account."
      }
    );
  }


  /*
  ---------------------------------------------------------
  VERIFY PAYMENT EMAIL
  ---------------------------------------------------------
  */

  if (
    String(
      pending.email
    )
      .toLowerCase() !==
    String(
      user.email
    )
      .toLowerCase()
  ) {

    return send(
      res,
      400,
      {

        success:
          false,

        error:
          "This payment belongs to another account."
      }
    );
  }


  /*
  ---------------------------------------------------------
  GET EXACT PLAN FROM SERVER
  ---------------------------------------------------------
  */

  const plan =
    getPlan(
      pending.plan
    );


  if (
    !plan
  ) {

    return send(
      res,
      400,
      {

        success:
          false,

        error:
          "This payment plan could not be verified."
      }
    );
  }


  /*
  ---------------------------------------------------------
  PAYMENT LOCK

  Prevent two verification requests from activating
  the same payment at the same time.
  ---------------------------------------------------------
  */

  const locked =
    await acquireLock(
      redis,
      reference,
      user.id
    );


  if (
    !locked
  ) {

    return send(
      res,
      409,
      {

        success:
          false,

        error:
          "Your payment is being processed. Please try again shortly."
      }
    );
  }


  try {

    /*
    =======================================================
    VERIFY TRANSACTION WITH PAYSTACK
    =======================================================
    */

    const result =
      await paystack(
        `/transaction/verify/${encodeURIComponent(
          reference
        )}`
      );


    if (
      !result.ok ||
      !result.data?.status
    ) {

      return send(
        res,
        400,
        {

          success:
            false,

          paid:
            false,

          error:
            "We could not verify this payment yet. Please try again."
        }
      );
    }


    const transaction =
      result.data.data;


    if (
      !transaction
    ) {

      return send(
        res,
        400,
        {

          success:
            false,

          paid:
            false,

          error:
            "We could not confirm this payment yet. Please try again."
        }
      );
    }


    /*
    =======================================================
    PAYMENT MUST BE SUCCESSFUL
    =======================================================
    */

    if (
      lower(
        transaction.status
      ) !==
      "success"
    ) {

      return send(
        res,
        400,
        {

          success:
            false,

          paid:
            false,

          error:
            "The payment has not been completed."
        }
      );
    }


    /*
    =======================================================
    REFERENCE
    =======================================================
    */

    if (
      String(
        transaction.reference
      ) !==
      String(
        reference
      )
    ) {

      return send(
        res,
        400,
        {

          success:
            false,

          paid:
            false,

          error:
            "The payment reference could not be verified."
        }
      );
    }


    /*
    =======================================================
    CURRENCY
    =======================================================
    */

    if (
      String(
        transaction.currency ||
          ""
      ).toUpperCase() !==
      CURRENCY
    ) {

      return send(
        res,
        400,
        {

          success:
            false,

          paid:
            false,

          error:
            "The payment currency could not be verified."
        }
      );
    }


    /*
    =======================================================
    AMOUNT

    Paystack amount is in Kobo.
    =======================================================
    */

    const expectedKobo =
      plan.amount *
      100;


    const actualKobo =
      Number(
        transaction.amount
      );


    if (
      actualKobo !==
      expectedKobo
    ) {

      return send(
        res,
        400,
        {

          success:
            false,

          paid:
            false,

          error:
            "The payment amount does not match this OBITREND plan."
        }
      );
    }


    /*
    =======================================================
    CUSTOMER EMAIL
    =======================================================
    */

    const paidEmail =
      String(
        transaction.customer
          ?.email ||
          transaction.email ||
          ""
      )
        .trim()
        .toLowerCase();


    if (
      paidEmail &&
      paidEmail !==
        String(
          user.email
        )
          .trim()
          .toLowerCase()
    ) {

      return send(
        res,
        400,
        {

          success:
            false,

          paid:
            false,

          error:
            "This payment belongs to another account."
        }
      );
    }


    /*
    =======================================================
    ACTIVATE EXACT VERIFIED PLAN

    credits.js receives:

    plan.key
      ↓
    4day / 8day / 14day / monthly
      ↓
    exact credits
      ↓
    exact duration
      ↓
    exact feature level
    =======================================================
    */

    const activated =
      await activatePro(
        user.id,
        user.email,
        reference,
        redis,
        plan.durationSeconds,
        plan.key
      );


    /*
    =======================================================
    MARK PAYMENT AS USED
    =======================================================
    */

    await markProcessed(
      redis,
      reference,
      user.id,
      plan
    );


    /*
    =======================================================
    REMOVE PENDING PAYMENT
    =======================================================
    */

    try {

      await redisCommand(
        redis,
        [

          "DEL",

          pendingKey(
            reference
          )

        ]
      );

    } catch {}


    /*
    =======================================================
    SUCCESS
    =======================================================
    */

    return send(
      res,
      200,
      {

        success:
          true,

        paid:
          true,

        proActivated:
          true,

        proActive:
          true,

        reference,

        plan:
          plan.key,

        planName:
          plan.name,

        amount:
          plan.amount,

        credits:
          plan.credits,

        durationSeconds:
          plan.durationSeconds,

        featureLevel:
          plan.featureLevel,

        fullPro:
          plan.fullPro,

        expiresAt:
          activated?.expiresAt ||
          null,

        proCredits:
          activated?.proCredits ??
          plan.credits,

        proCreditsTotal:
          activated?.proCreditsTotal ??
          plan.credits,

        message:
          `${plan.name} is now active.`
      }
    );

  } finally {

    await releaseLock(
      redis,
      reference
    );
  }
}


/* =========================================================
POST
========================================================= */

async function handlePost(
  req,
  res
) {

  let body =
    req.body ||
    {};


  if (
    typeof body ===
    "string"
  ) {

    try {

      body =
        JSON.parse(
          body
        );

    } catch {

      return send(
        res,
        400,
        {

          success:
            false,

          error:
            "Please select a valid plan."
        }
      );
    }
  }


  const plan =
    getPlan(
      body.plan ||
      body.planId ||
      body.subscription ||
      body.package
    );


  if (
    !plan
  ) {

    return send(
      res,
      400,
      {

        success:
          false,

        error:
          "Please select a valid OBITREND plan."
      }
    );
  }


  return initializePayment(
    req,
    res,
    plan
  );
}


/* =========================================================
GET
========================================================= */

async function handleGet(
  req,
  res
) {

  const url =
    new URL(
      req.url,
      appUrl()
    );


  const reference =
    clean(
      url.searchParams.get(
        "reference"
      ) ||
      url.searchParams.get(
        "trxref"
      ) ||
      ""
    );


  /*
  ---------------------------------------------------------
  PAYMENT CALLBACK / VERIFICATION
  ---------------------------------------------------------
  */

  if (
    reference
  ) {

    return verifyPayment(
      req,
      res,
      reference
    );
  }


  /*
  ---------------------------------------------------------
  PLAN INFORMATION
  ---------------------------------------------------------
  */

  const action =
    lower(
      url.searchParams.get(
        "action"
      )
    );


  if (
    action ===
    "plans"
  ) {

    return send(
      res,
      200,
      {

        success:
          true,

        plans:
          Object.values(
            PLANS
          ).map(
            (plan) => ({

              id:
                plan.key,

              name:
                plan.name,

              amount:
                plan.amount,

              currency:
                CURRENCY,

              credits:
                plan.credits,

              durationSeconds:
                plan.durationSeconds,

              featureLevel:
                plan.featureLevel,

              fullPro:
                plan.fullPro
            })
          )
      }
    );
  }


  return send(
    res,
    200,
    {

      success:
        true,

      service:
        "OBITREND Payments",

      status:
        "ready",

      plans:
        Object.values(
          PLANS
        ).map(
          (plan) => ({

            id:
              plan.key,

            name:
              plan.name,

            amount:
              plan.amount,

            currency:
              CURRENCY,

            credits:
              plan.credits,

            featureLevel:
              plan.featureLevel,

            fullPro:
              plan.fullPro
          })
        )
    }
  );
}


/* =========================================================
MAIN HANDLER
========================================================= */

export default async function handler(
  req,
  res
) {

  res.setHeader(
    "Access-Control-Allow-Origin",
    appUrl()
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Authorization"
  );


  if (
    req.method ===
    "OPTIONS"
  ) {

    return res
      .status(204)
      .end();
  }


  try {

    if (
      req.method ===
      "POST"
    ) {

      return await handlePost(
        req,
        res
      );
    }


    if (
      req.method ===
      "GET"
    ) {

      return await handleGet(
        req,
        res
      );
    }


    res.setHeader(
      "Allow",
      "GET, POST, OPTIONS"
    );


    return send(
      res,
      405,
      {

        success:
          false,

        error:
          "This request cannot be completed."
      }
    );

  } catch (
    error
  ) {

    console.error(
      "OBITREND payment error:",
      error
    );


    return send(
      res,
      500,
      {

        success:
          false,

        error:
          error?.message ||
          "Something went wrong while processing the payment. Please try again."
      }
    );
  }
}
