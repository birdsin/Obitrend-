/*
===========================================================
OBITREND PRO — PAYSTACK PAYMENT API
===========================================================

Required Vercel variables:
PAYSTACK_SECRET_KEY
PAYSTACK_PRO_PLAN_CODE

Optional:
OBITREND_APP_URL
PAYSTACK_EXPECTED_AMOUNT
PAYSTACK_EXPECTED_CURRENCY
PAYSTACK_EXPECTED_INTERVAL

OBITREND Pro:
NGN 15,000 / week

IMPORTANT:
Paystack can charge the customer more than the plan price because
of transaction fees. Verification therefore uses requested_amount
when available, and falls back to amount - fees.
===========================================================
*/

import {
  activatePro,
  getAuthenticatedUser,
  getRedisConfig
} from "./credits.js";

const PAYSTACK_API = "https://api.paystack.co";
const DEFAULT_APP_URL = "https://obitrend.vercel.app";
const DEFAULT_AMOUNT = 1500000; // ₦15,000 in kobo
const DEFAULT_CURRENCY = "NGN";
const DEFAULT_INTERVAL = "weekly";
const DEFAULT_MONTHLY_AMOUNT = 4500000; // ₦45,000 in kobo
const DEFAULT_MONTHLY_INTERVAL = "monthly";

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

function config() {
  return {
    secretKey: clean(process.env.PAYSTACK_SECRET_KEY),
    planCode:
      clean(process.env.PAYSTACK_PRO_PLAN_CODE) ||
      "PLN_sd2ggtyt2egdre",
    appUrl:
      clean(process.env.OBITREND_APP_URL) ||
      DEFAULT_APP_URL,
    expectedAmount:
      Number.isFinite(Number(process.env.PAYSTACK_EXPECTED_AMOUNT))
        ? Number(process.env.PAYSTACK_EXPECTED_AMOUNT)
        : DEFAULT_AMOUNT,
    expectedCurrency:
      clean(process.env.PAYSTACK_EXPECTED_CURRENCY) ||
      DEFAULT_CURRENCY,
    expectedInterval:
      clean(process.env.PAYSTACK_EXPECTED_INTERVAL) ||
      DEFAULT_INTERVAL,
    monthlyAmount:
      Number.isFinite(Number(process.env.PAYSTACK_MONTHLY_EXPECTED_AMOUNT))
        ? Number(process.env.PAYSTACK_MONTHLY_EXPECTED_AMOUNT)
        : DEFAULT_MONTHLY_AMOUNT,
    monthlyInterval:
      clean(process.env.PAYSTACK_MONTHLY_EXPECTED_INTERVAL) ||
      DEFAULT_MONTHLY_INTERVAL,
    monthlyPlanCode:
      clean(process.env.PAYSTACK_MONTHLY_PLAN_CODE)
  };
}

function validate(res, cfg) {
  if (!cfg.secretKey) {
    return send(res, 500, {
      success: false,
      error: "PAYSTACK_SECRET_KEY is not configured."
    });
  }

  if (!cfg.planCode) {
    return send(res, 500, {
      success: false,
      error: "PAYSTACK_PRO_PLAN_CODE is not configured."
    });
  }

  return null;
}

async function paystack(path, secretKey, options = {}) {
  const response = await fetch(`${PAYSTACK_API}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body:
      options.body !== undefined
        ? JSON.stringify(options.body)
        : undefined
  });

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

/*
-----------------------------------------------------------
VERIFY CONFIGURED PAYSTACK PLAN
-----------------------------------------------------------
*/
async function verifyPlan(cfg) {
  const result = await paystack(
    `/plan/${encodeURIComponent(cfg.planCode)}`,
    cfg.secretKey
  );

  if (!result.ok || !result.data?.status) {
    return {
      valid: false,
      error:
        result.data?.message ||
        "Unable to verify the OBITREND Pro Paystack plan."
    };
  }

  const plan = result.data.data;

  if (!plan) {
    return {
      valid: false,
      error: "Paystack returned no plan information."
    };
  }

  const amount = Number(plan.amount);
  const currency = upper(plan.currency);
  const interval = lower(plan.interval);

  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      valid: false,
      error: "Paystack returned an invalid plan amount."
    };
  }

  if (amount !== cfg.expectedAmount) {
    return {
      valid: false,
      error:
        "The Paystack plan amount does not match the OBITREND Pro price.",
      details: {
        expectedAmount,
        paystackPlanAmount: amount
      }
    };
  }

  if (
    currency &&
    currency !== upper(cfg.expectedCurrency)
  ) {
    return {
      valid: false,
      error: "The Paystack plan currency does not match OBITREND."
    };
  }

  if (
    interval &&
    interval !== lower(cfg.expectedInterval)
  ) {
    return {
      valid: false,
      error: "The Paystack plan interval does not match OBITREND."
    };
  }

  return {
    valid: true,
    plan
  };
}

/*
-----------------------------------------------------------
VERIFY A SUCCESSFUL TRANSACTION
-----------------------------------------------------------
*/
async function verifyTransaction(reference, cfg, authenticatedEmail = "") {
  const ref = clean(reference);
  const isMonthly = /-PRO_MONTHLY-/i.test(ref);
  const expectedAmount = isMonthly ? cfg.monthlyAmount : cfg.expectedAmount;
  const expectedInterval = isMonthly ? cfg.monthlyInterval : cfg.expectedInterval;
  const expectedPlanCode = isMonthly ? cfg.monthlyPlanCode : cfg.planCode;
  const durationSeconds = isMonthly ? 30 * 24 * 60 * 60 : 7 * 24 * 60 * 60;

  if (!ref) {
    return {
      success: false,
      paid: false,
      error: "Payment reference is required."
    };
  }

  const result = await paystack(
    `/transaction/verify/${encodeURIComponent(ref)}`,
    cfg.secretKey
  );

  if (!result.ok || !result.data?.status) {
    return {
      success: false,
      paid: false,
      reference: ref,
      error:
        result.data?.message ||
        "Paystack could not verify the payment."
    };
  }

  const tx = result.data.data;

  if (!tx) {
    return {
      success: false,
      paid: false,
      reference: ref,
      error: "Paystack returned no transaction data."
    };
  }

  if (lower(tx.status) !== "success") {
    return {
      success: false,
      paid: false,
      status: tx.status,
      reference: tx.reference || ref,
      error: "Payment has not been completed successfully."
    };
  }

  if (upper(tx.currency) !== upper(cfg.expectedCurrency)) {
    return {
      success: false,
      paid: false,
      status: tx.status,
      reference: tx.reference || ref,
      error: "Payment currency does not match OBITREND Pro."
    };
  }

  /*
  Paystack's verify response includes requested_amount.
  Example:
    requested_amount = 1,500,000
    amount           = 1,532,995

  The extra amount can be transaction fees.
  */
  const actualAmount = Number(tx.amount);
  const requestedAmount = Number(tx.requested_amount);
  const fees = Number(tx.fees);

  let verifiedAmount = false;

  if (
    Number.isFinite(requestedAmount) &&
    requestedAmount > 0
  ) {
    verifiedAmount =
      requestedAmount === expectedAmount;
  } else if (
    Number.isFinite(actualAmount) &&
    Number.isFinite(fees)
  ) {
    verifiedAmount =
      actualAmount - fees === expectedAmount;
  } else {
    verifiedAmount =
      actualAmount === expectedAmount;
  }

  if (!verifiedAmount) {
    return {
      success: false,
      paid: false,
      status: tx.status,
      reference: tx.reference || ref,
      error:
        "Payment amount could not be verified against the OBITREND Pro price.",
      details: {
        expectedAmount,
        requestedAmount:
          Number.isFinite(requestedAmount)
            ? requestedAmount
            : null,
        chargedAmount:
          Number.isFinite(actualAmount)
            ? actualAmount
            : null,
        fees:
          Number.isFinite(fees)
            ? fees
            : null
      }
    };
  }

  /*
  If Paystack returns a plan code, make sure it matches.
  Some Paystack responses return plan as an object, some may
  expose the plan through plan_object.
  */
  let transactionPlanCode = "";

  if (typeof tx.plan === "string") {
    transactionPlanCode = clean(tx.plan);
  } else if (tx.plan && typeof tx.plan === "object") {
    transactionPlanCode = clean(
      tx.plan.plan_code ||
      tx.plan.planCode ||
      tx.plan.code ||
      ""
    );
  }

  if (!transactionPlanCode && tx.plan_object) {
    transactionPlanCode = clean(
      tx.plan_object.plan_code ||
      tx.plan_object.planCode ||
      tx.plan_object.code ||
      ""
    );
  }

  if (
    transactionPlanCode &&
    expectedPlanCode &&
    transactionPlanCode !== expectedPlanCode
  ) {
    return {
      success: false,
      paid: false,
      status: tx.status,
      reference: tx.reference || ref,
      error:
        "The successful payment is not for the configured OBITREND Pro plan."
    };
  }

  const email = clean(
    tx.customer?.email ||
    tx.email ||
    ""
  );


  if (
    authenticatedEmail &&
    email &&
    email.toLowerCase() !== authenticatedEmail.toLowerCase()
  ) {
    return {
      success: false,
      paid: false,
      reference: tx.reference || ref,
      error: "This payment belongs to a different OBITREND account."
    };
  }

  const customerCode = clean(
    tx.customer?.customer_code ||
    tx.customer?.customerCode ||
    ""
  );

  return {
    success: true,
    paid: true,
    pro: true,

    reference: tx.reference || ref,
    status: tx.status,

    amount: actualAmount,
    requestedAmount:
      Number.isFinite(requestedAmount)
        ? requestedAmount
        : expectedAmount,

    currency: tx.currency,
    fees:
      Number.isFinite(fees)
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

    authorization: tx.authorization || null,

    planCode: expectedPlanCode || null,
    planName: isMonthly ? "OBITREND Full Pro Monthly" : "OBITREND Standard Pro Weekly",
    interval: expectedInterval,
    durationSeconds,

    message:
      "OBITREND Pro payment verified successfully."
  };
}

/*
-----------------------------------------------------------
INITIALIZE PAYMENT
-----------------------------------------------------------
*/
async function initializePayment(email, cfg, plan = "PRO_WEEKLY") {
  const cleanEmail = clean(email).toLowerCase();

  if (!cleanEmail) {
    return {
      success: false,
      error: "Email address is required."
    };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return {
      success: false,
      error: "Please provide a valid email address."
    };
  }

  const isMonthly = upper(plan) === "PRO_MONTHLY";
  const amount = isMonthly ? cfg.monthlyAmount : cfg.expectedAmount;
  const interval = isMonthly ? cfg.monthlyInterval : cfg.expectedInterval;
  const planCode = isMonthly ? cfg.monthlyPlanCode : cfg.planCode;

  if (!isMonthly) {
    const planCheck = await verifyPlan(cfg);
    if (!planCheck.valid) {
      return {
        success: false,
        planFound: false,
        error: planCheck.error
      };
    }
  }

  const reference =
    `OBITREND-${isMonthly ? "PRO_MONTHLY" : "PRO_WEEKLY"}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;

  const callbackUrl =
    `${cfg.appUrl.replace(/\/+$/, "")}/`;

  const payload = {
    email: cleanEmail,
    amount: String(amount),
    currency: cfg.expectedCurrency,
    reference,
    callback_url: callbackUrl,

    metadata: {
      product: "OBITREND_PRO",
      plan: isMonthly ? "OBITREND Full Pro Monthly" : "OBITREND Standard Pro Weekly",
      plan_code: planCode || "",
      interval,
      source: "OBITREND_AI_FASHION_CREATOR"
    }
  };

  if (planCode) payload.plan = planCode;

  const result = await paystack(
    "/transaction/initialize",
    cfg.secretKey,
    {
      method: "POST",
      body: payload
    }
  );

  if (!result.ok || !result.data?.status) {
    return {
      success: false,
      error:
        result.data?.message ||
        "Unable to initialize Paystack payment."
    };
  }

  const data = result.data.data;

  if (!data?.authorization_url) {
    return {
      success: false,
      error: "Paystack did not return a payment URL."
    };
  }

  /*
  Return authorization_url at the TOP LEVEL because the
  OBITREND index.html reads data.authorization_url.
  */
  return {
    success: true,
    message: "OBITREND Pro payment initialized.",

    authorization_url:
      data.authorization_url,

    reference:
      data.reference || reference,

    access_code:
      data.access_code || null,

    plan_code: planCode || null,
    amount,
    currency: cfg.expectedCurrency,
    interval,
    product_plan: isMonthly ? "PRO_MONTHLY" : "PRO_WEEKLY"
  };
}

/*
-----------------------------------------------------------
GET
-----------------------------------------------------------
Supports:
?reference=...
?trxref=...
?transaction=...
?transaction_reference=...
?action=plan
?action=config
*/
async function handleGet(req, res) {
  const cfg = config();

  const configError = validate(res, cfg);
  if (configError) return configError;

  const url = new URL(
    req.url,
    cfg.appUrl
  );

  const reference =
    clean(
      url.searchParams.get("reference") ||
      url.searchParams.get("trxref") ||
      url.searchParams.get("transaction") ||
      url.searchParams.get("transaction_reference") ||
      ""
    );

  const action =
    lower(url.searchParams.get("action") || "");

  if (reference) {
    const auth = await getAuthenticatedUser(req);
    if (!auth.ok) {
      return send(res, auth.status, {
        success: false,
        paid: false,
        error: auth.error
      });
    }

    const result =
      await verifyTransaction(reference, cfg, auth.user.email);

    if (!result.success) {
      return send(res, 400, result);
    }

    try {
      const redis = getRedisConfig();
      if (!redis.url || !redis.token) {
        return send(res, 500, {
          success: false,
          paid: false,
          error: "Redis environment variables are missing."
        });
      }

      await activatePro(
        auth.user.id,
        auth.user.email,
        result.reference,
        redis,
        result.durationSeconds
      );

      return send(res, 200, {
        ...result,
        proActivated: true,
        accountUserId: auth.user.id
      });
    } catch (activationError) {
      console.error("OBITREND PRO ACTIVATION ERROR:", activationError);
      return send(res, 500, {
        success: false,
        paid: true,
        proActivated: false,
        reference: result.reference,
        error: "Payment was successful, but Pro activation could not be completed. Please refresh and verify again."
      });
    }
  }

  if (action === "plan") {
    const result = await verifyPlan(cfg);

    if (!result.valid) {
      return send(res, 400, {
        success: false,
        planFound: false,
        error: result.error
      });
    }

    return send(res, 200, {
      success: true,
      planFound: true,
      proPlan: {
        name: result.plan.name,
        planCode:
          result.plan.plan_code || cfg.planCode,
        amount: Number(result.plan.amount),
        currency: result.plan.currency,
        interval: result.plan.interval,
        description:
          result.plan.description || null
      }
    });
  }

  if (action === "config") {
    return send(res, 200, {
      success: true,
      service: "OBITREND Paystack Pro",
      status: "ready",
      secretKeyConfigured: Boolean(cfg.secretKey),
      planConfigured: Boolean(cfg.planCode),
      expectedAmount: cfg.expectedAmount,
      expectedCurrency: cfg.expectedCurrency,
      expectedInterval: cfg.expectedInterval,
      monthlyAmount: cfg.monthlyAmount,
      monthlyCurrency: cfg.expectedCurrency,
      monthlyInterval: cfg.monthlyInterval,
      monthlyPlanConfigured: Boolean(cfg.monthlyPlanCode),
      appUrl: cfg.appUrl
    });
  }

  return send(res, 200, {
    success: true,
    service: "OBITREND Paystack Pro",
    status: "ready",
    endpoints: {
      verify: "/api/paystack?reference=PAYSTACK_REFERENCE",
      planCheck: "/api/paystack?action=plan",
      configCheck: "/api/paystack?action=config"
    }
  });
}

/*
-----------------------------------------------------------
POST
-----------------------------------------------------------
*/
async function handlePost(req, res) {
  const cfg = config();

  const configError = validate(res, cfg);
  if (configError) return configError;

  let body = req.body || {};

  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return send(res, 400, {
        success: false,
        error: "Request body contains invalid JSON."
      });
    }
  }

  const auth = await getAuthenticatedUser(req);
  if (!auth.ok) {
    return send(res, auth.status, {
      success: false,
      error: auth.error
    });
  }

  const email = clean(auth.user.email).toLowerCase();

  const requestedPlan = upper(body.plan || "PRO_WEEKLY");
  if (!["PRO_WEEKLY", "PRO_MONTHLY"].includes(requestedPlan)) {
    return send(res, 400, {
      success: false,
      error: "Invalid OBITREND Pro plan."
    });
  }

  const payment =
    await initializePayment(email, cfg, requestedPlan);

  return send(
    res,
    payment.success ? 200 : 400,
    payment
  );
}

/*
-----------------------------------------------------------
VERCEL HANDLER
-----------------------------------------------------------
*/
export default async function handler(req, res) {
  res.setHeader(
    "Access-Control-Allow-Origin",
    process.env.OBITREND_APP_URL || DEFAULT_APP_URL
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept"
  );

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    if (req.method === "GET") {
      return await handleGet(req, res);
    }

    if (req.method === "POST") {
      return await handlePost(req, res);
    }

    res.setHeader(
      "Allow",
      "GET, POST, OPTIONS"
    );

    return send(res, 405, {
      success: false,
      error: "Method not allowed."
    });
  } catch (error) {
    console.error(
      "OBITREND PAYSTACK ERROR:",
      error
    );

    return send(res, 500, {
      success: false,
      error:
        error?.message ||
        "Unexpected Paystack server error."
    });
  }
}
