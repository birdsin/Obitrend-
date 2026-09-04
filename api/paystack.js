/*
===========================================================
OBITREND PRO — PAYSTACK PAYMENT API
===========================================================

PLANS

Weekly:
NGN 15,000 / week
20 OBITREND generations
7 days

Monthly:
NGN 45,000 / month
80 OBITREND generations
30 days

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

The browser can request the plan type,
but never controls the price or credit allowance.
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
    code ===
      cfg.monthlyPlanCode
  ) {
    return getPlan(
      "monthly",
      cfg
    );
  }

  if (
    code &&
    code ===
      cfg.weeklyPlanCode
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
  const request = {
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
    }
  };

  if (
    options.body !==
    undefined
  ) {
    request.body =
      JSON.stringify(
        options.body
      );
  }

  const response =
    await fetch(
      `${PAYSTACK_API}${path}`,
      request
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
FETCH PAYSTACK CUSTOMER
========================================================= */

async function fetchCustomer(
  customerCode,
  cfg
) {
  const code =
    clean(customerCode);

  if (!code) {
    return {
      success: false,
      error:
        "Paystack customer code is missing."
    };
  }

  const result =
    await paystack(
      `/customer/${encodeURIComponent(
        code
      )}`,
      cfg.secretKey
    );

  if (
    !result.ok ||
    !result.data?.status ||
    !result.data?.data
  ) {
    return {
      success: false,
      error:
        "Unable to retrieve the Paystack customer."
    };
  }

  return {
    success: true,
    customer:
      result.data.data
  };
}

/* =========================================================
SAVE OBITREND USER ID ON PAYSTACK CUSTOMER

This creates the permanent mapping:

Paystack customer
        ↓
OBITREND user ID

The recurring webhook can then find the correct
OBITREND account even when Paystack does not send
our original transaction metadata again.
========================================================= */

async function saveCustomerMapping(
  customerCode,
  userId,
  email,
  cfg
) {
  const code =
    clean(customerCode);

  const uid =
    clean(userId);

  const expectedEmail =
    lower(email);

  if (!code || !uid) {
    return {
      success: false,
      error:
        "Customer mapping information is incomplete."
    };
  }

  const fetched =
    await fetchCustomer(
      code,
      cfg
    );

  if (!fetched.success) {
    return fetched;
  }

  const customer =
    fetched.customer;

  const customerEmail =
    lower(
      customer?.email
    );

  if (
    expectedEmail &&
    customerEmail &&
    customerEmail !==
      expectedEmail
  ) {
    return {
      success: false,
      error:
        "Paystack customer email does not match the OBITREND account."
    };
  }

  const existingMetadata =
    customer?.metadata &&
    typeof customer.metadata ===
      "object"
      ? customer.metadata
      : {};

  const metadata = {
    ...existingMetadata,

    obitrend_user_id:
      uid,

    obitrend_product:
      "OBITREND_PRO"
  };

  const result =
    await paystack(
      `/customer/${encodeURIComponent(
        code
      )}`,
      cfg.secretKey,
      {
        method:
          "PUT",

        body: {
          metadata
        }
      }
    );

  if (
    !result.ok ||
    !result.data?.status
  ) {
    console.error(
      "Unable to save OBITREND Paystack customer mapping:",
      result.data
    );

    return {
      success: false,
      error:
        "Unable to save the payment account mapping."
    };
  }

  return {
    success: true,
    customer:
      result.data.data ||
      customer
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
      valid: false
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
      valid: false
    };
  }

  const remote =
    result.data.data;

  if (!remote) {
    return {
      valid: false
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
      valid: false
    };
  }

  if (
    amount !==
    plan.amount
  ) {
    return {
      valid: false
    };
  }

  if (
    currency !==
    CURRENCY
  ) {
    return {
      valid: false
    };
  }

  if (
    interval !==
    plan.interval
  ) {
    return {
      valid: false
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

  const transactionPlanCode =
    extractTransactionPlanCode(
      tx
    );

  let verifiedPlan =
    getPlanFromCode(
      transactionPlanCode,
      cfg
    );

  /*
  If Paystack does not return the plan code,
  determine the plan from the gross transaction
  amount.
  */

  if (!verifiedPlan) {
    const amount =
      Number(tx.amount);

    if (
      amount ===
      WEEKLY_AMOUNT
    ) {
      verifiedPlan =
        getPlan(
          "weekly",
          cfg
        );
    }

    if (
      amount ===
      MONTHLY_AMOUNT
    ) {
      verifiedPlan =
        getPlan(
          "monthly",
          cfg
        );
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

  const actualAmount =
    Number(tx.amount);

  const requestedAmount =
    Number(
      tx.requested_amount
    );

  /*
  Paystack transaction amount is
  expressed in the smallest currency unit.
  */

  const amountValid =
    (
      Number.isFinite(
        requestedAmount
      ) &&
      requestedAmount ===
        verifiedPlan.amount
    ) ||
    (
      Number.isFinite(
        actualAmount
      ) &&
      actualAmount ===
        verifiedPlan.amount
    );

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
    lower(
      tx.customer?.email ||
      tx.email ||
      ""
    );

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
      upper(tx.currency),

    fees:
      Number.isFinite(
        Number(tx.fees)
      )
        ? Number(tx.fees)
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
      verifiedPlan.durationDays
  };
}

/* =========================================================
INITIALIZE PAYMENT
========================================================= */

async function initializePayment(
  email,
  userId,
  requestedPlan,
  cfg
) {
  const cleanEmail =
    lower(email);

  const cleanUserId =
    clean(userId);

  if (!cleanEmail) {
    return {
      success: false,
      error:
        "Email address is required."
    };
  }

  if (!cleanUserId) {
    return {
      success: false,
      error:
        "Your OBITREND account could not be verified."
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

  const planCheck =
    await verifyPlan(
      plan,
      cfg
    );

  if (!planCheck.valid) {
    return {
      success: false,
      error:
        "OBITREND payment is temporarily unavailable."
    };
  }

  const reference =
    `OBITREND-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;

  const callbackUrl =
    `${cfg.appUrl.replace(
      /\/+$/,
      ""
    )}/`;

  const payload = {
    email:
      cleanEmail,

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

      obitrend_user_id:
        cleanUserId,

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

  /* =======================================================
  PLAN
  ======================================================= */

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
            weekly.durationDays
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
            monthly.durationDays
        }
      }
    );
  }

  /* =======================================================
  CONFIG
  ======================================================= */

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

  /* =======================================================
  PAYMENT REFERENCE
  ======================================================= */

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

  /* =======================================================
  AUTHENTICATE
  ======================================================= */

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

  /* =======================================================
  MATCH EMAIL
  ======================================================= */

  if (
    result.email &&
    lower(result.email) !==
      lower(auth.user.email)
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

  /* =======================================================
  SAVE PAYSTACK CUSTOMER → OBITREND USER MAPPING
  ======================================================= */

  if (
    result.customerCode
  ) {
    const mapping =
      await saveCustomerMapping(
        result.customerCode,
        auth.user.id,
        auth.user.email,
        cfg
      );

    if (!mapping.success) {
      console.error(
        "OBITREND customer mapping failed:",
        mapping.error
      );

      return send(
        res,
        500,
        {
          success: false,
          paid: false,
          proActive: false,
          error:
            "Payment was received, but account activation is temporarily delayed. Please try again shortly."
        }
      );
    }
  }

  /* =======================================================
  ACTIVATE CORRECT PLAN

  credits.js already protects against processing
  the same Paystack reference twice.
  ======================================================= */

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

  /* =======================================================
  AUTHENTICATE USER
  ======================================================= */

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

  const requestedEmail =
    lower(
      body.email ||
      body.customer_email ||
      ""
    );

  if (
    requestedEmail &&
    requestedEmail !==
      lower(auth.user.email)
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
      auth.user.id,
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
