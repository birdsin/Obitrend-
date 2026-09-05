/*
===========================================================
 OBITREND AI — PAYSTACK PRO PAYMENT API
===========================================================

 SUPPORTED PLANS

 WEEKLY
   ₦15,000 / week
   STANDARD PRO

 MONTHLY
   ₦45,000 / month
   FULL PRO

 REQUIRED VERCEL VARIABLES

 PAYSTACK_SECRET_KEY
 PAYSTACK_WEEKLY_PLAN_CODE
 PAYSTACK_MONTHLY_PLAN_CODE

 OPTIONAL LEGACY FALLBACK

 PAYSTACK_PRO_PLAN_CODE

 SUPABASE VARIABLES

 SUPABASE_URL
 SUPABASE_PUBLISHABLE_KEY

 OR

 SUPABASE_ANON_KEY

 REDIS VARIABLES

 KV_REST_API_URL
 KV_REST_API_TOKEN

===========================================================
*/

import {
  getRedisConfig,
  activatePro,
  getAuthenticatedUser
} from "./credits.js";

const PAYSTACK_API = "https://api.paystack.co";

const DEFAULT_APP_URL = "https://obitrend.vercel.app";

const PLANS = {
  PRO_WEEKLY: {
    key: "PRO_WEEKLY",
    tier: "standard",
    name: "OBITREND Standard Pro",
    amount: 1500000,
    currency: "NGN",
    interval: "weekly",
    days: 7,
    planEnv: "PAYSTACK_WEEKLY_PLAN_CODE"
  },

  PRO_MONTHLY: {
    key: "PRO_MONTHLY",
    tier: "full",
    name: "OBITREND Full Pro",
    amount: 4500000,
    currency: "NGN",
    interval: "monthly",
    days: 30,
    planEnv: "PAYSTACK_MONTHLY_PLAN_CODE"
  }
};

/* =========================================================
   BASIC HELPERS
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

function getAppUrl() {
  return (
    clean(process.env.OBITREND_APP_URL) ||
    clean(process.env.APP_URL) ||
    DEFAULT_APP_URL
  );
}

/* =========================================================
   PLAN RESOLUTION
========================================================= */

function getPlan(planInput) {
  const value = upper(planInput);

  if (
    value === "PRO_MONTHLY" ||
    value === "MONTHLY" ||
    value === "FULL" ||
    value === "FULL_PRO"
  ) {
    return PLANS.PRO_MONTHLY;
  }

  return PLANS.PRO_WEEKLY;
}

function getPlanCode(plan) {
  if (plan.key === "PRO_MONTHLY") {
    return (
      clean(process.env.PAYSTACK_MONTHLY_PLAN_CODE) ||
      ""
    );
  }

  return (
    clean(process.env.PAYSTACK_WEEKLY_PLAN_CODE) ||
    clean(process.env.PAYSTACK_PRO_PLAN_CODE) ||
    ""
  );
}

/* =========================================================
   CONFIG VALIDATION
========================================================= */

function validateConfiguration(res) {
  const secretKey = clean(process.env.PAYSTACK_SECRET_KEY);

  if (!secretKey) {
    return send(res, 500, {
      success: false,
      error: "PAYSTACK_SECRET_KEY is not configured."
    });
  }

  return null;
}

/* =========================================================
   PAYSTACK REQUEST
========================================================= */

async function paystackRequest(
  path,
  secretKey,
  options = {}
) {
  const fetchOptions = {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    }
  };

  if (options.body !== undefined) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(
    `${PAYSTACK_API}${path}`,
    fetchOptions
  );

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    data
  };
}

/* =========================================================
   REDIS REST COMMAND
========================================================= */

async function redisCommand(
  redis,
  command
) {
  const response = await fetch(redis.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${redis.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Redis request failed: ${response.status} ${text}`
    );
  }

  const data = await response.json();

  return data?.result ?? null;
}

/* =========================================================
   PENDING PAYMENT KEYS
========================================================= */

function pendingKey(reference) {
  return `obitrend:paystack:pending:${reference}`;
}

function fulfilledKey(reference) {
  return `obitrend:paystack:fulfilled:${reference}`;
}

/* =========================================================
   SAVE PENDING PAYMENT
========================================================= */

async function savePendingPayment(
  redis,
  reference,
  userId,
  email,
  plan
) {
  const payload = JSON.stringify({
    reference,
    userId,
    email,
    plan: plan.key,
    tier: plan.tier,
    amount: plan.amount,
    currency: plan.currency,
    interval: plan.interval,
    createdAt: Math.floor(Date.now() / 1000)
  });

  await redisCommand(redis, [
    "SET",
    pendingKey(reference),
    payload,
    "EX",
    86400
  ]);
}

/* =========================================================
   GET PENDING PAYMENT
========================================================= */

async function getPendingPayment(
  redis,
  reference
) {
  const value = await redisCommand(
    redis,
    ["GET", pendingKey(reference)]
  );

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/* =========================================================
   MARK PAYMENT FULFILLED
========================================================= */

async function markFulfilled(
  redis,
  reference,
  userId,
  plan
) {
  const payload = JSON.stringify({
    reference,
    userId,
    plan: plan.key,
    tier: plan.tier,
    fulfilledAt: Math.floor(Date.now() / 1000)
  });

  await redisCommand(redis, [
    "SET",
    fulfilledKey(reference),
    payload,
    "EX",
    31536000
  ]);
}

/* =========================================================
   CHECK IF PAYMENT WAS ALREADY FULFILLED
========================================================= */

async function wasFulfilled(
  redis,
  reference
) {
  const value = await redisCommand(
    redis,
    ["GET", fulfilledKey(reference)]
  );

  return Boolean(value);
}

/* =========================================================
   VERIFY PAYSTACK PLAN
========================================================= */

async function verifyPaystackPlan(
  secretKey,
  planCode,
  expectedPlan
) {
  const result = await paystackRequest(
    `/plan/${encodeURIComponent(planCode)}`,
    secretKey
  );

  if (!result.ok || !result.data?.status) {
    return {
      valid: false,
      error:
        result.data?.message ||
        "Unable to verify the Paystack Pro plan."
    };
  }

  const plan = result.data?.data;

  if (!plan) {
    return {
      valid: false,
      error: "Paystack returned no plan information."
    };
  }

  const amount = Number(plan.amount);
  const currency = upper(plan.currency);
  const interval = lower(plan.interval);

  if (amount !== expectedPlan.amount) {
    return {
      valid: false,
      error:
        `Paystack plan amount mismatch. ` +
        `Expected ${expectedPlan.amount}, received ${amount}.`
    };
  }

  if (currency !== expectedPlan.currency) {
    return {
      valid: false,
      error:
        `Paystack plan currency mismatch. ` +
        `Expected ${expectedPlan.currency}, received ${currency}.`
    };
  }

  if (interval !== expectedPlan.interval) {
    return {
      valid: false,
      error:
        `Paystack plan interval mismatch. ` +
        `Expected ${expectedPlan.interval}, received ${interval}.`
    };
  }

  return {
    valid: true,
    plan
  };
}

/* =========================================================
   INITIALIZE PAYMENT
========================================================= */

async function initializePayment(
  req,
  res,
  secretKey,
  redis
) {
  const auth = await getAuthenticatedUser(req);

  if (!auth.ok) {
    return send(res, auth.status, {
      success: false,
      error: auth.error
    });
  }

  const userId = clean(auth.user?.id);
  const email = lower(auth.user?.email);

  if (!userId || !email) {
    return send(res, 401, {
      success: false,
      error: "Your OBITREND login session is invalid."
    });
  }

  const requestedPlan =
    req.body?.plan ||
    req.body?.planKey ||
    req.query?.plan ||
    "PRO_WEEKLY";

  const plan = getPlan(requestedPlan);
  const planCode = getPlanCode(plan);

  if (!planCode) {
    return send(res, 500, {
      success: false,
      error:
        plan.key === "PRO_MONTHLY"
          ? "PAYSTACK_MONTHLY_PLAN_CODE is not configured."
          : "PAYSTACK_WEEKLY_PLAN_CODE is not configured."
    });
  }

  /*
  ---------------------------------------------------------
   Verify the configured plan before accepting payments.
  ---------------------------------------------------------
  */

  const planCheck = await verifyPaystackPlan(
    secretKey,
    planCode,
    plan
  );

  if (!planCheck.valid) {
    return send(res, 500, {
      success: false,
      error: planCheck.error
    });
  }

  /*
  ---------------------------------------------------------
   Initialize directly from the server.

   Paystack's plan code controls the subscription amount
   and interval.
  ---------------------------------------------------------
  */

  const reference =
    `OBI_${userId.slice(0, 8)}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 10)}`;

  const callbackUrl =
    `${getAppUrl()}/?payment=complete`;

  const payment = await paystackRequest(
    "/transaction/initialize",
    secretKey,
    {
      method: "POST",
      body: {
        email,
        amount: String(plan.amount),
        currency: plan.currency,
        plan: planCode,
        reference,
        callback_url: callbackUrl,
        metadata: {
          product: "OBITREND_AI_FASHION_CREATOR",
          plan: plan.key,
          tier: plan.tier,
          user_id: userId
        }
      }
    }
  );

  if (
    !payment.ok ||
    !payment.data?.status ||
    !payment.data?.data
  ) {
    console.error(
      "Paystack initialization failed:",
      payment.data
    );

    return send(res, 502, {
      success: false,
      error:
        payment.data?.message ||
        "Unable to initialize your Paystack payment."
    });
  }

  const paymentData = payment.data.data;

  if (!paymentData.reference) {
    return send(res, 502, {
      success: false,
      error:
        "Paystack did not return a payment reference."
    });
  }

  /*
  ---------------------------------------------------------
   Bind the payment reference to the authenticated account.
  ---------------------------------------------------------
  */

  await savePendingPayment(
    redis,
    paymentData.reference,
    userId,
    email,
    plan
  );

  return send(res, 200, {
    success: true,
    action: "initialize",
    plan: plan.key,
    planTier: plan.tier,
    planName: plan.name,
    amount: plan.amount,
    currency: plan.currency,
    interval: plan.interval,
    authorizationUrl:
      paymentData.authorization_url,
    accessCode:
      paymentData.access_code,
    reference:
      paymentData.reference
  });
}

/* =========================================================
   VERIFY PAYMENT
========================================================= */

async function verifyPayment(
  req,
  res,
  secretKey,
  redis
) {
  const auth = await getAuthenticatedUser(req);

  if (!auth.ok) {
    return send(res, auth.status, {
      success: false,
      error: auth.error
    });
  }

  const authenticatedUserId =
    clean(auth.user?.id);

  const authenticatedEmail =
    lower(auth.user?.email);

  const reference =
    clean(
      req.query?.reference ||
      req.body?.reference
    );

  if (!reference) {
    return send(res, 400, {
      success: false,
      error: "Payment reference is required."
    });
  }

  /*
  ---------------------------------------------------------
   Prevent duplicate fulfillment.
  ---------------------------------------------------------
  */

  const alreadyFulfilled =
    await wasFulfilled(
      redis,
      reference
    );

  if (alreadyFulfilled) {
    const pending =
      await getPendingPayment(
        redis,
        reference
      );

    return send(res, 200, {
      success: true,
      verified: true,
      alreadyFulfilled: true,
      proActive: true,
      plan:
        pending?.plan ||
        "PRO_WEEKLY",
      planTier:
        pending?.tier ||
        "standard",
      message:
        "This OBITREND payment has already been applied."
    });
  }

  /*
  ---------------------------------------------------------
   Find the server-created pending payment.

   This prevents a browser from choosing another user's
   payment reference or changing the plan after checkout.
  ---------------------------------------------------------
  */

  const pending =
    await getPendingPayment(
      redis,
      reference
    );

  if (!pending) {
    return send(res, 400, {
      success: false,
      error:
        "This payment reference was not created by the current OBITREND account."
    });
  }

  if (
    clean(pending.userId) !==
    authenticatedUserId
  ) {
    return send(res, 403, {
      success: false,
      error:
        "This payment belongs to another OBITREND account."
    });
  }

  if (
    lower(pending.email) !==
    authenticatedEmail
  ) {
    return send(res, 403, {
      success: false,
      error:
        "The payment email does not match your OBITREND account."
    });
  }

  const plan =
    pending.plan === "PRO_MONTHLY"
      ? PLANS.PRO_MONTHLY
      : PLANS.PRO_WEEKLY;

  const planCode =
    getPlanCode(plan);

  if (!planCode) {
    return send(res, 500, {
      success: false,
      error:
        plan.key === "PRO_MONTHLY"
          ? "PAYSTACK_MONTHLY_PLAN_CODE is not configured."
          : "PAYSTACK_WEEKLY_PLAN_CODE is not configured."
    });
  }

  /*
  ---------------------------------------------------------
   Verify the Paystack transaction.
  ---------------------------------------------------------
  */

  const verification =
    await paystackRequest(
      `/transaction/verify/${encodeURIComponent(reference)}`,
      secretKey
    );

  if (
    !verification.ok ||
    !verification.data?.status
  ) {
    console.error(
      "Paystack verification request failed:",
      verification.data
    );

    return send(res, 502, {
      success: false,
      error:
        verification.data?.message ||
        "Unable to verify your Paystack payment."
    });
  }

  const transaction =
    verification.data?.data;

  if (!transaction) {
    return send(res, 502, {
      success: false,
      error:
        "Paystack returned no transaction information."
    });
  }

  /*
  ---------------------------------------------------------
   Payment MUST be successful.
  ---------------------------------------------------------
  */

  if (
    lower(transaction.status) !==
    "success"
  ) {
    return send(res, 402, {
      success: false,
      verified: false,
      paymentStatus:
        transaction.status ||
        "unknown",
      error:
        "The Paystack payment has not been completed successfully."
    });
  }

  /*
  ---------------------------------------------------------
   Confirm reference.
  ---------------------------------------------------------
  */

  if (
    clean(transaction.reference) !==
    reference
  ) {
    return send(res, 400, {
      success: false,
      error:
        "Paystack transaction reference mismatch."
    });
  }

  /*
  ---------------------------------------------------------
   Confirm currency.
  ---------------------------------------------------------
  */

  if (
    upper(transaction.currency) !==
    plan.currency
  ) {
    return send(res, 400, {
      success: false,
      error:
        "The Paystack payment currency does not match the selected Pro plan."
    });
  }

  /*
  ---------------------------------------------------------
   Confirm amount.

   Paystack may expose both amount and requested_amount.
   The requested amount is preferred when available.
  ---------------------------------------------------------
  */

  const requestedAmount =
    Number(transaction.requested_amount);

  const paidAmount =
    Number(transaction.amount);

  const verifiedAmount =
    Number.isFinite(requestedAmount) &&
    requestedAmount > 0
      ? requestedAmount
      : paidAmount;

  if (
    verifiedAmount !==
    plan.amount
  ) {
    return send(res, 400, {
      success: false,
      error:
        "The Paystack payment amount does not match the selected OBITREND Pro plan."
    });
  }

  /*
  ---------------------------------------------------------
   Confirm the customer email.
  ---------------------------------------------------------
  */

  const transactionEmail =
    lower(
      transaction.customer?.email ||
      transaction.email
    );

  if (
    transactionEmail &&
    transactionEmail !==
      authenticatedEmail
  ) {
    return send(res, 403, {
      success: false,
      error:
        "The Paystack customer email does not match your OBITREND account."
    });
  }

  /*
  ---------------------------------------------------------
   Activate Pro.

   IMPORTANT:
   The updated credits.js will receive the plan key so
   Weekly and Monthly have different entitlements.
  ---------------------------------------------------------
  */

  const activation =
    await activatePro(
      authenticatedUserId,
      authenticatedEmail,
      reference,
      redis,
      plan.key
    );

  /*
  ---------------------------------------------------------
   Mark reference fulfilled AFTER successful activation.
  ---------------------------------------------------------
  */

  await markFulfilled(
    redis,
    reference,
    authenticatedUserId,
    plan
  );

  /*
  ---------------------------------------------------------
   Remove pending payment record.
  ---------------------------------------------------------
  */

  try {
    await redisCommand(
      redis,
      [
        "DEL",
        pendingKey(reference)
      ]
    );
  } catch (error) {
    console.error(
      "Unable to delete pending payment:",
      error
    );
  }

  return send(res, 200, {
    success: true,
    verified: true,
    alreadyFulfilled: false,

    proActive: true,

    plan: plan.key,

    planTier: plan.tier,

    planName: plan.name,

    interval: plan.interval,

    amount: plan.amount,

    currency: plan.currency,

    expiresAt:
      activation?.expiresAt ??
      null,

    proCredits:
      activation?.proCredits ??
      activation?.proCreditsRemaining ??
      null,

    reference,

    message:
      plan.key === "PRO_MONTHLY"
        ? "OBITREND Full Pro is now active."
        : "OBITREND Standard Pro is now active."
  });
}

/* =========================================================
   MAIN VERCEL HANDLER
========================================================= */

export default async function handler(
  req,
  res
) {
  res.setHeader(
    "Cache-Control",
    "no-store, max-age=0"
  );

  res.setHeader(
    "X-Content-Type-Options",
    "nosniff"
  );

  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader(
      "Allow",
      "GET, POST"
    );

    return send(res, 405, {
      success: false,
      error: "Method not allowed."
    });
  }

  const configError =
    validateConfiguration(res);

  if (configError) {
    return configError;
  }

  const redis =
    getRedisConfig();

  if (
    !redis?.url ||
    !redis?.token
  ) {
    return send(res, 500, {
      success: false,
      error:
        "Redis environment variables are missing in Vercel."
    });
  }

  const secretKey =
    clean(
      process.env.PAYSTACK_SECRET_KEY
    );

  try {
    /*
    -------------------------------------------------------
     GET with reference = VERIFY
    -------------------------------------------------------
    */

    if (
      req.method === "GET" &&
      req.query?.reference
    ) {
      return await verifyPayment(
        req,
        res,
        secretKey,
        redis
      );
    }

    /*
    -------------------------------------------------------
     POST = INITIALIZE PAYMENT
    -------------------------------------------------------
    */

    if (req.method === "POST") {
      return await initializePayment(
        req,
        res,
        secretKey,
        redis
      );
    }

    /*
    -------------------------------------------------------
     GET without reference
    -------------------------------------------------------
    */

    return send(res, 400, {
      success: false,
      error:
        "A payment reference is required for verification."
    });
  } catch (error) {
    console.error(
      "OBITREND Paystack API error:",
      error
    );

    return send(res, 500, {
      success: false,
      error:
        "OBITREND could not complete the payment operation. Please try again."
    });
  }
}
