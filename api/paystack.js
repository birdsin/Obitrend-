/*
===========================================================
OBITREND PRO — PAYSTACK PAYMENT API
===========================================================

PLANS

Weekly:
NGN 15,000 / week
20 OBITREND generations

Monthly:
NGN 45,000 / month
80 OBITREND generations

REQUIRED VERCEL VARIABLES:

PAYSTACK_SECRET_KEY
PAYSTACK_WEEKLY_PLAN_CODE
PAYSTACK_MONTHLY_PLAN_CODE

OPTIONAL:

OBITREND_APP_URL

===========================================================
*/

import {
  getRedisConfig,
  activatePro,
  getProStatus,
  getAuthenticatedUser
} from "./credits.js";

const PAYSTACK_API =
  "https://api.paystack.co";

const DEFAULT_APP_URL =
  "https://obitrend.vercel.app";

const WEEKLY_AMOUNT =
  1500000;

const MONTHLY_AMOUNT =
  4500000;

const CURRENCY =
  "NGN";

const WEEKLY_INTERVAL =
  "weekly";

const MONTHLY_INTERVAL =
  "monthly";

/* =========================================================
HELPERS
========================================================= */

function clean(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return clean(value).toLowerCase();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function send(res, status, data) {
  return res.status(status).json(data);
}

/* =========================================================
CONFIG
========================================================= */

function config() {
  return {
    secretKey:
      clean(
        process.env.PAYSTACK_SECRET_KEY
      ),

    weeklyPlanCode:
      clean(
        process.env.PAYSTACK_WEEKLY_PLAN_CODE
      ),

    monthlyPlanCode:
      clean(
        process.env.PAYSTACK_MONTHLY_PLAN_CODE
      ),

    appUrl:
      clean(
        process.env.OBITREND_APP_URL
      ) ||
      DEFAULT_APP_URL
  };
}

function validate(res, cfg) {
  if (!cfg.secretKey) {
    return send(res, 500, {
      success: false,
      error:
        "Payment service is temporarily unavailable."
    });
  }

  if (
    !cfg.weeklyPlanCode ||
    !cfg.monthlyPlanCode
  ) {
    return send(res, 500, {
      success: false,
      error:
        "OBITREND payment plans are not configured yet."
    });
  }

  return null;
}

/* =========================================================
PLAN DEFINITIONS

The browser may request "weekly" or "monthly",
but NEVER controls the amount or credit allowance.
========================================================= */

function getPlan(type, cfg) {
  const value =
    lower(type);

  if (
    value === "monthly" ||
    value === "month"
  ) {
    return {
      type: "monthly",
      name:
        "OBITREND Pro Monthly",
      planCode:
        cfg.monthlyPlanCode,
      amount:
        MONTHLY_AMOUNT,
      interval:
        MONTHLY_INTERVAL,
      credits: 80,
      durationDays: 30
    };
  }

  return {
    type: "weekly",
    name:
      "OBITREND Pro Weekly",
    planCode:
      cfg.weeklyPlanCode,
    amount:
      WEEKLY_AMOUNT,
    interval:
      WEEKLY_INTERVAL,
    credits: 20,
    durationDays: 7
  };
}

/* =========================================================
IDENTIFY PLAN FROM PAYSTACK PLAN CODE
========================================================= */

function getPlanFromCode(
  planCode,
  cfg
) {
  const code =
    clean(planCode);

  if (
    code &&
    code === cfg.monthlyPlanCode
  ) {
    return getPlan(
      "monthly",
      cfg
    );
  }

  if (
    code &&
    code === cfg.weeklyPlanCode
  ) {
    return getPlan(
      "weekly",
      cfg
    );
  }

  return null;
}

/* =========================================================
PAYSTACK REQUEST
========================================================= */

async function paystack(
  path,
  secretKey,
  options = {}
) {
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
          options.body !== undefined
            ? JSON.stringify(
                options.body
              )
            : undefined
      }
    );

  let data = null;

  try {
    data =
      await response.json();
  } catch {
    data = null;
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
VERIFY PAYSTACK PLAN
========================================================= */

async function verifyPlan(
  plan,
  cfg
) {
  if (!plan?.planCode) {
    return {
      valid: false,
      error:
        "OBITREND payment plan is unavailable."
    };
  }

  const result =
    await paystack(
      `/plan/${encodeURIComponent(
        plan.planCode
      )}`,
      cfg.secretKey
    );

  if (
    !result.ok ||
    !result.data?.status
  ) {
    return {
      valid: false,
      error:
        "Unable to verify the OBITREND payment plan."
    };
  }

  const remote =
    result.data.data;

  if (!remote) {
    return {
      valid: false,
      error:
        "Paystack returned no plan information."
    };
  }

  const amount =
    Number(remote.amount);

  const currency =
    upper(remote.currency);

  const interval =
    lower(remote.interval);

  const remoteCode =
    clean(
      remote.plan_code ||
      remote.planCode ||
      ""
    );

  if (
    remoteCode &&
    remoteCode !==
      plan.planCode
  ) {
    return {
      valid: false,
      error:
        "The configured Paystack plan is invalid."
    };
  }

  if (
    amount !==
    plan.amount
  ) {
    return {
      valid: false,
      error:
        "The Paystack plan amount does not match the OBITREND price."
    };
  }

  if (
    currency !==
    CURRENCY
  ) {
    return {
      valid: false,
      error:
        "The Paystack plan currency does not match OBITREND."
    };
  }

  if (
    interval !==
    plan.interval
  ) {
    return {
      valid: false,
      error:
        "The Paystack plan interval does not match OBITREND."
    };
  }

  return {
    valid: true,
    plan: remote
  };
}

/* =========================================================
EXTRACT TRANSACTION PLAN CODE
========================================================= */

function extractTransactionPlanCode(
  tx
) {
  if (
    typeof tx?.plan ===
    "string"
  ) {
    return clean(
      tx.plan
    );
  }

  if (
    tx?.plan &&
    typeof tx.plan ===
      "object"
  ) {
    return clean(
      tx.plan.plan_code ||
      tx.plan.planCode ||
      tx.plan.code ||
      ""
    );
  }

  if (
    tx?.plan_object
  ) {
    return clean(
      tx.plan_object.plan_code ||
      tx.plan_object.planCode ||
      tx.plan_object.code ||
      ""
    );
  }

  return "";
}

/* =========================================================
VERIFY TRANSACTION
========================================================= */

async function verifyTransaction(
  reference,
  cfg
) {
  const ref =
    clean(reference);

  if (!ref) {
    return {
      success: false,
      paid: false,
      error:
        "Payment reference is required."
    };
  }

  const result =
    await paystack(
      `/transaction/verify/${encodeURIComponent(
        ref
      )}`,
      cfg.secretKey
    );

  if (
    !result.ok ||
    !result.data?.status
  ) {
    return {
      success: false,
      paid: false,
      reference: ref,
      error:
        "Paystack could not verify this payment."
    };
  }

  const tx =
    result.data.data;

  if (!tx) {
    return {
      success: false,
      paid: false,
      reference: ref,
      error:
        "Paystack returned no transaction data."
    };
  }

  if (
    lower(tx.status) !==
    "success"
  ) {
    return {
      success: false,
      paid: false,
      reference:
        tx.reference || ref,
      error:
        "Payment has not been completed successfully."
    };
  }

  if (
    upper(tx.currency) !==
    CURRENCY
  ) {
    return {
      success: false,
      paid: false,
      reference:
        tx.reference || ref,
      error:
        "Payment currency does not match OBITREND."
    };
  }

  /*
  ---------------------------------------------------------
  IDENTIFY THE ACTUAL PAYSTACK PLAN
  ---------------------------------------------------------
  */

  const transactionPlanCode =
    extractTransactionPlanCode(
      tx
    );

  const plan =
    getPlanFromCode(
      transactionPlanCode,
      cfg
    );

  /*
  If Paystack does not return a plan code,
  fall back to the requested amount.
  */

  let verifiedPlan =
    plan;

  if (!verifiedPlan) {
    const requestedAmount =
      Number(
        tx.requested_amount
      );

    const actualAmount =
      Number(tx.amount);

    const fees =
      Number(tx.fees);

    if (
      Number.isFinite(
        requestedAmount
      )
    ) {
      if (
        requestedAmount ===
        WEEKLY_AMOUNT
      ) {
        verifiedPlan =
          getPlan(
            "weekly",
            cfg
          );
      } else if (
        requestedAmount ===
        MONTHLY_AMOUNT
      ) {
        verifiedPlan =
          getPlan(
            "monthly",
            cfg
          );
      }
    }

    if (
      !verifiedPlan &&
      Number.isFinite(
        actualAmount
      ) &&
      Number.isFinite(fees)
    ) {
      const net =
        actualAmount -
        fees;

      if (
        net ===
        WEEKLY_AMOUNT
      ) {
        verifiedPlan =
          getPlan(
            "weekly",
            cfg
          );
      } else if (
        net ===
        MONTHLY_AMOUNT
      ) {
        verifiedPlan =
          getPlan(
            "monthly",
            cfg
          );
      }
    }
  }

  if (!verifiedPlan) {
    return {
      success: false,
      paid: false,
      reference:
        tx.reference || ref,
      error:
        "The successful payment could not be matched to an OBITREND plan."
    };
  }

  /*
  ---------------------------------------------------------
  VERIFY THE ACTUAL PAYSTACK PLAN
  ---------------------------------------------------------
  */

  const planCheck =
    await verifyPlan(
      verifiedPlan,
      cfg
    );

  if (!planCheck.valid) {
    return {
      success: false,
      paid: false,
      reference:
        tx.reference || ref,
      error:
        "The OBITREND payment plan could not be verified."
    };
  }

  /*
  ---------------------------------------------------------
  VERIFY AMOUNT
  ---------------------------------------------------------
  */

  const actualAmount =
    Number(tx.amount);

  const requestedAmount =
    Number(
      tx.requested_amount
    );

  const fees =
    Number(tx.fees);

  let amountValid =
    false;

  if (
    Number.isFinite(
      requestedAmount
    )
  ) {
    amountValid =
      requestedAmount ===
      verifiedPlan.amount;
  }

  if (
    !amountValid &&
    Number.isFinite(
      actualAmount
    ) &&
    Number.isFinite(
      fees
    )
  ) {
    amountValid =
      actualAmount -
        fees ===
      verifiedPlan.amount;
  }

  if (
    !amountValid &&
    Number.isFinite(
      actualAmount
    )
  ) {
    amountValid =
      actualAmount ===
      verifiedPlan.amount;
  }

  if (!amountValid) {
    return {
      success: false,
      paid: false,
      reference:
        tx.reference || ref,
      error:
        "Payment amount could not be verified."
    };
  }

  const email =
    clean(
      tx.customer?.email ||
      tx.email ||
      ""
    ).toLowerCase();

  const customerCode =
    clean(
      tx.customer?.customer_code ||
      tx.customer?.customerCode ||
      ""
    );

  return {
    success: true,
    paid: true,
    pro: true,

    reference:
      tx.reference || ref,

    status:
      tx.status,

    amount:
      actualAmount,

    requestedAmount:
      Number.isFinite(
        requestedAmount
      )
        ? requestedAmount
        : null,

    currency:
      tx.currency,

    fees:
      Number.isFinite(
        fees
      )
        ? fees
        : null,

    email,

    customerCode,

    paidAt:
      tx.paid_at ||
      tx.paidAt ||
      tx.transaction_date ||
      tx.created_at ||
      tx.createdAt ||
      null,

    authorization:
      tx.authorization ||
      null,

    planCode:
      verifiedPlan.planCode,

    plan:
      verifiedPlan.type,

    planName:
      verifiedPlan.name,

    interval:
      verifiedPlan.interval,

    credits:
      verifiedPlan.credits,

    durationDays:
      verifiedPlan.durationDays,

    message:
      "OBITREND Pro payment verified successfully."
  };
}

/* =========================================================
INITIALIZE PAYMENT
========================================================= */

async function initializePayment(
  email,
  requestedPlan,
  cfg
) {
  const cleanEmail =
    clean(email)
      .toLowerCase();

  if (!cleanEmail) {
    return {
      success: false,
      error:
        "Email address is required."
    };
  }

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      cleanEmail
    )
  ) {
    return {
      success: false,
      error:
        "Please provide a valid email address."
    };
  }

  const plan =
    getPlan(
      requestedPlan,
      cfg
    );

  /*
  ---------------------------------------------------------
  VERIFY PLAN BEFORE INITIALIZING
  ---------------------------------------------------------
  */

  const planCheck =
    await verifyPlan(
      plan,
      cfg
    );

  if (!planCheck.valid) {
    return {
      success: false,
      planFound: false,
      error:
        "OBITREND payment is temporarily unavailable."
    };
  }

  /*
  ---------------------------------------------------------
  UNIQUE REFERENCE
  ---------------------------------------------------------
  */

  const reference =
    `OBITREND-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;

  const callbackUrl =
    `${cfg.appUrl.replace(
      /\/+$/,
      ""
    )}/`;

  /*
  ---------------------------------------------------------
  PAYSTACK INITIALIZATION
  ---------------------------------------------------------
  */

  const payload = {
    email:
      cleanEmail,

    /*
    Amount is supplied for compatibility,
    but Paystack uses the plan code for
    subscription plan transactions.
    */

    amount:
      String(
        plan.amount
      ),

    currency:
      CURRENCY,

    plan:
      plan.planCode,

    reference,

    callback_url:
      callbackUrl,

    metadata: {
      product:
        "OBITREND_PRO",

      plan:
        plan.type,

      plan_name:
        plan.name,

      plan_code:
        plan.planCode,

      credits:
        plan.credits,

      interval:
        plan.interval,

      duration_days:
        plan.durationDays,

      source:
        "OBITREND_AI_FASHION_CREATOR"
    }
  };

  const result =
    await paystack(
      "/transaction/initialize",
      cfg.secretKey,
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
    console.error(
      "Paystack initialization failed:",
      result.data
    );

    return {
      success: false,
      error:
        "Unable to start payment. Please try again."
    };
  }

  const data =
    result.data.data;

  if (
    !data?.authorization_url
  ) {
    return {
      success: false,
      error:
        "Paystack did not return a payment URL."
    };
  }

  /*
  ---------------------------------------------------------
  KEEP EXISTING FRONTEND RESPONSE FIELDS
  ---------------------------------------------------------
  */

  return {
    success: true,

    message:
      "OBITREND Pro payment initialized.",

    authorization_url:
      data.authorization_url,

    reference:
      data.reference ||
      reference,

    access_code:
      data.access_code ||
      null,

    plan_code:
      plan.planCode,

    plan:
      plan.type,

    plan_name:
      plan.name,

    amount:
      plan.amount,

    currency:
      CURRENCY,

    interval:
      plan.interval,

    credits:
      plan.credits,

    duration_days:
      plan.durationDays
  };
}

/* =========================================================
GET
========================================================= */

async function handleGet(
  req,
  res
) {
  const cfg =
    config();

  const configError =
    validate(
      res,
      cfg
    );

  if (configError) {
    return configError;
  }

  const url =
    new URL(
      req.url,
      cfg.appUrl
    );

  const reference =
    clean(
      url.searchParams.get(
        "reference"
      ) ||
      url.searchParams.get(
        "trxref"
      ) ||
      url.searchParams.get(
        "transaction"
      ) ||
      url.searchParams.get(
        "transaction_reference"
      ) ||
      ""
    );

  const action =
    lower(
      url.searchParams.get(
        "action"
      ) ||
      ""
    );

  /*
  ---------------------------------------------------------
  PLAN INFORMATION
  ---------------------------------------------------------
  */

  if (
    action === "plan"
  ) {
    const weekly =
      getPlan(
        "weekly",
        cfg
      );

    const monthly =
      getPlan(
        "monthly",
        cfg
      );

    const [
      weeklyCheck,
      monthlyCheck
    ] =
      await Promise.all([
        verifyPlan(
          weekly,
          cfg
        ),
        verifyPlan(
          monthly,
          cfg
        )
      ]);

    return send(
      res,
      200,
      {
        success: true,

        weekly: {
          available:
            weeklyCheck.valid,

          name:
            weekly.name,

          amount:
            weekly.amount,

          currency:
            CURRENCY,

          interval:
            weekly.interval,

          credits:
            weekly.credits,

          durationDays:
            weekly.durationDays,

          planCode:
            weekly.planCode
        },

        monthly: {
          available:
            monthlyCheck.valid,

          name:
            monthly.name,

          amount:
            monthly.amount,

          currency:
            CURRENCY,

          interval:
            monthly.interval,

          credits:
            monthly.credits,

          durationDays:
            monthly.durationDays,

          planCode:
            monthly.planCode
        }
      }
    );
  }

  /*
  ---------------------------------------------------------
  CONFIG
  ---------------------------------------------------------
  */

  if (
    action === "config"
  ) {
    return send(
      res,
      200,
      {
        success: true,

        service:
          "OBITREND Paystack Pro",

        status:
          "ready",

        secretKeyConfigured:
          Boolean(
            cfg.secretKey
          ),

        weeklyPlanConfigured:
          Boolean(
            cfg.weeklyPlanCode
          ),

        monthlyPlanConfigured:
          Boolean(
            cfg.monthlyPlanCode
          ),

        weeklyAmount:
          WEEKLY_AMOUNT,

        monthlyAmount:
          MONTHLY_AMOUNT,

        currency:
          CURRENCY
      }
    );
  }

  /*
  ---------------------------------------------------------
  PAYMENT VERIFICATION
  ---------------------------------------------------------
  */

  if (!reference) {
    return send(
      res,
      400,
      {
        success: false,
        paid: false,
        proActive: false,
        error:
          "Payment reference is required."
      }
    );
  }

  /*
  IMPORTANT:
  Customer must be logged in.
  */

  const auth =
    await getAuthenticatedUser(
      req
    );

  if (!auth.ok) {
    return send(
      res,
      auth.status,
      {
        success: false,
        paid: false,
        proActive: false,
        error:
          auth.error
      }
    );
  }

  const redis =
    getRedisConfig();

  if (
    !redis.url ||
    !redis.token
  ) {
    return send(
      res,
      500,
      {
        success: false,
        paid: false,
        proActive: false,
        error:
          "Payment service is temporarily unavailable."
      }
    );
  }

  const result =
    await verifyTransaction(
      reference,
      cfg
    );

  if (
    !result.success ||
    !result.paid
  ) {
    return send(
      res,
      400,
      {
        success: false,
        paid: false,
        proActive: false,
        error:
          result.error ||
          "Payment could not be verified."
      }
    );
  }

  /*
  ---------------------------------------------------------
  MATCH PAYMENT TO SIGNED-IN USER
  ---------------------------------------------------------
  */

  if (
    result.email &&
    result.email !==
      auth.user.email
  ) {
    return send(
      res,
      403,
      {
        success: false,
        paid: false,
        proActive: false,
        error:
          "This payment belongs to a different OBITREND account."
      }
    );
  }

  /*
  ---------------------------------------------------------
  ACTIVATE THE CORRECT PLAN
  ---------------------------------------------------------
  */

  const activated =
    await activatePro(
      auth.user.id,
      auth.user.email,
      result.reference,
      redis,
      result.plan
    );

  const status =
    await getProStatus(
      auth.user.id,
      redis
    );

  return send(
    res,
    200,
    {
      success: true,

      paid: true,

      activated:
        activated.active ===
        true,

      alreadyProcessed:
        activated.alreadyProcessed ===
        true,

      proActive:
        status.active ===
        true,

      active:
        status.active ===
        true,

      reference:
        result.reference,

      email:
        auth.user.email,

      plan:
        status.plan,

      interval:
        status.interval,

      expiresAt:
        status.expiresAt,

      proExpiresAt:
        status.expiresAt,

      proSecondsRemaining:
        status.expiresAt ===
        null
          ? null
          : Math.max(
              0,
              Number(
                status.expiresAt
              ) -
                Math.floor(
                  Date.now() /
                    1000
                )
            ),

      proCredits:
        Number(
          status.proCredits ||
          0
        ),

      proCreditsTotal:
        Number(
          status.proCreditsTotal ||
          0
        ),

      message:
        "OBITREND Pro activated successfully."
    }
  );
}

/* =========================================================
POST
========================================================= */

async function handlePost(
  req,
  res
) {
  const cfg =
    config();

  const configError =
    validate(
      res,
      cfg
    );

  if (configError) {
    return configError;
  }

  /*
  ---------------------------------------------------------
  AUTHENTICATE USER
  ---------------------------------------------------------
  */

  const auth =
    await getAuthenticatedUser(
      req
    );

  if (!auth.ok) {
    return send(
      res,
      auth.status,
      {
        success: false,
        error:
          auth.error
      }
    );
  }

  let body =
    req.body || {};

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
          success: false,
          error:
            "Request body contains invalid JSON."
        }
      );
    }
  }

  /*
  ---------------------------------------------------------
  EMAIL
  ---------------------------------------------------------
  */

  const requestedEmail =
    clean(
      body.email ||
      body.customer_email ||
      ""
    ).toLowerCase();

  if (
    requestedEmail &&
    requestedEmail !==
      auth.user.email
  ) {
    return send(
      res,
      400,
      {
        success: false,
        error:
          "The payment email must match your signed-in OBITREND account."
      }
    );
  }

  /*
  ---------------------------------------------------------
  PLAN
  ---------------------------------------------------------

  Accepted frontend values:

  weekly
  monthly
  month

  Anything else defaults to weekly.
  */

  const requestedPlan =
    lower(
      body.plan ||
      body.planType ||
      body.interval ||
      "weekly"
    );

  if (
    requestedPlan !==
      "weekly" &&
    requestedPlan !==
      "monthly" &&
    requestedPlan !==
      "month"
  ) {
    return send(
      res,
      400,
      {
        success: false,
        error:
          "Please select a valid OBITREND Pro plan."
      }
    );
  }

  const payment =
    await initializePayment(
      auth.user.email,
      requestedPlan,
      cfg
    );

  return send(
    res,
    payment.success
      ? 200
      : 400,
    payment
  );
}

/* =========================================================
VERCEL HANDLER
========================================================= */

export default async function handler(
  req,
  res
) {
  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
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
      "GET"
    ) {
      return await handleGet(
        req,
        res
      );
    }

    if (
      req.method ===
      "POST"
    ) {
      return await handlePost(
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
        success: false,
        error:
          "Method not allowed."
      }
    );
  } catch (error) {
    /*
    NEVER expose internal Paystack,
    Redis or server errors to customers.
    */

    console.error(
      "OBITREND PAYSTACK ERROR:",
      error
    );

    return send(
      res,
      500,
      {
        success: false,
        error:
          "Payment could not be completed right now. Please try again shortly."
      }
    );
  }
}
