/*
============================================================
OBITREND AI FASHION CREATOR
PAYSTACK PRO SUBSCRIPTION BACKEND
============================================================

PRO PLAN:
₦15,000 / WEEK

REQUIRED VERCEL ENVIRONMENT VARIABLES:

PAYSTACK_SECRET_KEY
PAYSTACK_PRO_PLAN_CODE

PAYSTACK_PRO_PLAN_CODE may contain:
- the Paystack plan code, e.g. PLN_xxxxxxxxx
OR
- the Paystack numeric plan ID

The backend automatically retrieves the real Paystack
plan_code before initializing the subscription.

IMPORTANT:
Never put PAYSTACK_SECRET_KEY in index.html or frontend code.
============================================================
*/

const PAYSTACK_API = "https://api.paystack.co";

/*
============================================================
OBITREND PLAN SETTINGS
============================================================
*/

const EXPECTED_AMOUNT = 1500000; // ₦15,000 in kobo
const EXPECTED_CURRENCY = "NGN";
const EXPECTED_INTERVAL = "weekly";

/*
============================================================
SAFE JSON RESPONSE
============================================================
*/

function send(res, status, data) {
  return res.status(status).json(data);
}

/*
============================================================
READ VERCEL ENVIRONMENT VARIABLES
============================================================
*/

function getConfig() {
  const secretKey =
    String(process.env.PAYSTACK_SECRET_KEY || "").trim();

  const planCode =
    String(process.env.PAYSTACK_PRO_PLAN_CODE || "").trim();

  const appUrl =
    String(
      process.env.OBITREND_APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://obitrend.vercel.app"
    ).trim();

  return {
    secretKey,
    planCode,
    appUrl
  };
}

/*
============================================================
PAYSTACK API REQUEST HELPER
============================================================
*/

async function paystackRequest(
  endpoint,
  options = {},
  secretKey
) {
  const response = await fetch(
    `${PAYSTACK_API}${endpoint}`,
    {
      ...options,

      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    }
  );

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = {
      status: false,
      message: "Paystack returned an invalid response."
    };
  }

  return {
    response,
    data
  };
}

/*
============================================================
VALIDATE SERVER CONFIGURATION
============================================================
*/

function validateConfig(res, secretKey, planCode) {
  if (!secretKey) {
    return send(res, 500, {
      success: false,
      error:
        "PAYSTACK_SECRET_KEY is missing in Vercel Environment Variables."
    });
  }

  if (!planCode) {
    return send(res, 500, {
      success: false,
      error:
        "PAYSTACK_PRO_PLAN_CODE is missing in Vercel Environment Variables."
    });
  }

  return null;
}

/*
============================================================
GET PLAN FROM PAYSTACK

The environment variable may contain either:
- PLN_xxxxxxxxx
- numeric Paystack plan ID

We retrieve the plan first and always use the real
plan.plan_code when creating the subscription.
============================================================
*/

async function getPaystackPlan(secretKey, configuredPlan) {
  const cleanPlan = String(configuredPlan || "").trim();

  if (!cleanPlan) {
    return {
      success: false,
      error: "Paystack Pro plan code is empty."
    };
  }

  const encodedPlan =
    encodeURIComponent(cleanPlan);

  const {
    response,
    data
  } = await paystackRequest(
    `/plan/${encodedPlan}`,
    {
      method: "GET"
    },
    secretKey
  );

  if (
    !response.ok ||
    !data ||
    data.status !== true ||
    !data.data
  ) {
    return {
      success: false,

      error:
        data?.message ||
        "Paystack could not find the OBITREND Pro plan.",

      configuredPlan: cleanPlan
    };
  }

  const plan = data.data;

  const actualPlanCode =
    String(plan.plan_code || "").trim();

  if (!actualPlanCode) {
    return {
      success: false,
      error:
        "Paystack returned the plan, but no plan_code was found."
    };
  }

  return {
    success: true,
    plan
  };
}

/*
============================================================
VERIFY OBITREND PRO PLAN

This protects the application from accidentally using
a wrong plan, wrong price, wrong currency or wrong interval.
============================================================
*/

async function verifyProPlan(
  secretKey,
  configuredPlan
) {
  const result =
    await getPaystackPlan(
      secretKey,
      configuredPlan
    );

  if (!result.success) {
    return {
      valid: false,
      error: result.error
    };
  }

  const plan = result.plan;

  const amount =
    Number(plan.amount);

  const currency =
    String(plan.currency || "")
      .trim()
      .toUpperCase();

  const interval =
    String(plan.interval || "")
      .trim()
      .toLowerCase();

  const actualPlanCode =
    String(plan.plan_code || "").trim();

  /*
  ----------------------------------------------------------
  CHECK PLAN AMOUNT
  ----------------------------------------------------------
  */

  if (amount !== EXPECTED_AMOUNT) {
    return {
      valid: false,

      error:
        "The Paystack Pro plan exists, but its amount does not match OBITREND.",

      details: {
        planCode: actualPlanCode,
        actualAmount: amount,
        expectedAmount: EXPECTED_AMOUNT
      }
    };
  }

  /*
  ----------------------------------------------------------
  CHECK CURRENCY
  ----------------------------------------------------------
  */

  if (currency !== EXPECTED_CURRENCY) {
    return {
      valid: false,

      error:
        "The Paystack Pro plan currency does not match OBITREND.",

      details: {
        planCode: actualPlanCode,
        actualCurrency: currency,
        expectedCurrency: EXPECTED_CURRENCY
      }
    };
  }

  /*
  ----------------------------------------------------------
  CHECK BILLING INTERVAL
  ----------------------------------------------------------
  */

  if (interval !== EXPECTED_INTERVAL) {
    return {
      valid: false,

      error:
        "The Paystack Pro plan interval does not match OBITREND.",

      details: {
        planCode: actualPlanCode,
        actualInterval: interval,
        expectedInterval: EXPECTED_INTERVAL
      }
    };
  }

  return {
    valid: true,
    plan
  };
}

/*
============================================================
CREATE PRO CHECKOUT
============================================================
*/

async function initializeProPayment(
  email,
  secretKey,
  plan,
  req
) {
  /*
  ----------------------------------------------------------
  DETERMINE CALLBACK URL
  ----------------------------------------------------------
  */

  const configuredAppUrl =
    String(
      process.env.OBITREND_APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      ""
    ).trim();

  const host =
    req?.headers?.host ||
    "obitrend.vercel.app";

  const forwardedProtocol =
    req?.headers?.["x-forwarded-proto"] ||
    "https";

  let appUrl =
    configuredAppUrl;

  if (!appUrl) {
    appUrl =
      `${forwardedProtocol}://${host}`;
  }

  appUrl =
    appUrl.replace(/\/+$/, "");

  const callbackUrl =
  `${protocol}://${host}/?payment=success&reference=`;

  /*
  ----------------------------------------------------------
  USE PAYSTACK'S REAL PLAN CODE
  ----------------------------------------------------------
  */

  const actualPlanCode =
    String(plan.plan_code || "").trim();

  if (!actualPlanCode) {
    return {
      success: false,
      error:
        "The Paystack plan has no valid plan_code."
    };
  }

  /*
  ----------------------------------------------------------
  PAYLOAD
  ----------------------------------------------------------

  Paystack uses the plan amount when plan is supplied.
  We still provide the amount in the correct subunit.
  ----------------------------------------------------------
  */

  const payload = {
    email,

    amount:
      String(EXPECTED_AMOUNT),

    currency:
      EXPECTED_CURRENCY,

    plan:
      actualPlanCode,

    callback_url:
      callbackUrl,

    metadata: {
      product:
        "OBITREND_PRO",

      product_name:
        "OBITREND AI Fashion Creator Pro",

      plan_name:
        String(plan.name || "OBITREND Pro Weekly 15000"),

      plan_code:
        actualPlanCode,

      amount:
        EXPECTED_AMOUNT,

      currency:
        EXPECTED_CURRENCY,

      interval:
        EXPECTED_INTERVAL
    }
  };

  /*
  ----------------------------------------------------------
  INITIALIZE PAYSTACK TRANSACTION
  ----------------------------------------------------------
  */

  const {
    response,
    data
  } =
    await paystackRequest(
      "/transaction/initialize",
      {
        method: "POST",

        body:
          JSON.stringify(payload)
      },
      secretKey
    );

  /*
  ----------------------------------------------------------
  HANDLE PAYSTACK FAILURE
  ----------------------------------------------------------
  */

  if (
    !response.ok ||
    !data ||
    data.status !== true ||
    !data.data
  ) {
    console.error(
      "OBITREND Paystack initialization failed:",
      data
    );

    return {
      success: false,

      error:
        data?.message ||
        "Paystack could not initialize the OBITREND Pro payment.",

      paystackStatus:
        response.status
    };
  }

  /*
  ----------------------------------------------------------
  EXTRACT CHECKOUT INFORMATION
  ----------------------------------------------------------
  */

  const authorizationUrl =
    data.data.authorization_url;

  const reference =
    data.data.reference;

  const accessCode =
    data.data.access_code;

  if (!authorizationUrl) {
    return {
      success: false,

      error:
        "Paystack initialized the transaction but did not return a checkout URL."
    };
  }

  /*
  ----------------------------------------------------------
  SUCCESS
  ----------------------------------------------------------
  */

  return {
    success: true,

    authorization_url:
      authorizationUrl,

    reference:
      reference || null,

    access_code:
      accessCode || null,

    plan_code:
      actualPlanCode,

    amount:
      EXPECTED_AMOUNT,

    currency:
      EXPECTED_CURRENCY,

    interval:
      EXPECTED_INTERVAL
  };
}

/*
============================================================
VERIFY COMPLETED PAYMENT
============================================================
*/

async function verifyTransaction(
  reference,
  secretKey
) {
  const cleanReference =
    String(reference || "").trim();

  if (!cleanReference) {
    return {
      success: false,
      paid: false,
      error:
        "Payment reference is required."
    };
  }

  const encodedReference =
    encodeURIComponent(cleanReference);

  const {
    response,
    data
  } =
    await paystackRequest(
      `/transaction/verify/${encodedReference}`,
      {
        method: "GET"
      },
      secretKey
    );

  if (
    !response.ok ||
    !data ||
    data.status !== true ||
    !data.data
  ) {
    return {
      success: false,
      paid: false,

      error:
        data?.message ||
        "Paystack could not verify this transaction.",

      reference:
        cleanReference
    };
  }

  const transaction =
    data.data;

  /*
  ----------------------------------------------------------
  PAYMENT MUST BE SUCCESSFUL
  ----------------------------------------------------------
  */

  const status =
    String(transaction.status || "")
      .trim()
      .toLowerCase();

  if (status !== "success") {
    return {
      success: false,

      paid: false,

      status,

      reference:
        transaction.reference ||
        cleanReference,

      error:
        "Payment has not been completed successfully."
    };
  }

  /*
  ----------------------------------------------------------
  VERIFY CURRENCY
  ----------------------------------------------------------
  */

  const currency =
    String(transaction.currency || "")
      .trim()
      .toUpperCase();

  if (currency !== EXPECTED_CURRENCY) {
    return {
      success: false,

      paid: false,

      error:
        "Payment currency does not match OBITREND Pro.",

      reference:
        transaction.reference ||
        cleanReference
    };
  }

  /*
  ----------------------------------------------------------
  VERIFY AMOUNT
  ----------------------------------------------------------

  Paystack returns NGN amounts in kobo.
  ----------------------------------------------------------
  */

  const actualAmount =
    Number(transaction.amount);

  if (actualAmount !== EXPECTED_AMOUNT) {
    return {
      success: false,

      paid: false,

      error:
        "Payment amount does not match the OBITREND Pro price.",

      details: {
        expectedAmount:
          EXPECTED_AMOUNT,

        actualAmount:
          actualAmount,

        currency:
          currency
      },

      reference:
        transaction.reference ||
        cleanReference
    };
  }

  /*
  ----------------------------------------------------------
  SUCCESSFUL PAYMENT
  ----------------------------------------------------------
  */

  return {
    success: true,

    paid: true,

    pro: true,

    reference:
      transaction.reference ||
      cleanReference,

    status:
      transaction.status,

    amount:
      actualAmount,

    currency:
      currency,

    email:
      transaction.customer?.email ||
      null,

    customerCode:
      transaction.customer?.customer_code ||
      null,

    paidAt:
      transaction.paid_at ||
      null,

    authorization:
      transaction.authorization ||
      null
  };
}

/*
============================================================
GET REQUEST HANDLER
============================================================

Supported:

GET /api/paystack?reference=XXXX

Verifies a payment.

GET /api/paystack?action=plan

Checks the configured Pro plan.

GET /api/paystack?action=config

Returns safe diagnostic information only.
NO SECRET KEY IS EVER RETURNED.
============================================================
*/

async function handleGet(req, res) {
  const {
    secretKey,
    planCode
  } = getConfig();

  const configError =
    validateConfig(
      res,
      secretKey,
      planCode
    );

  if (configError) {
    return configError;
  }

  const url =
    new URL(
      req.url,
      "https://obitrend.vercel.app"
    );

  const reference =
    String(
      url.searchParams.get("reference") || ""
    ).trim();

  const action =
    String(
      url.searchParams.get("action") || ""
    ).trim().toLowerCase();

  /*
  ----------------------------------------------------------
  VERIFY PAYMENT
  ----------------------------------------------------------
  */

  if (reference) {
    const result =
      await verifyTransaction(
        reference,
        secretKey
      );

    return send(
      res,
      result.success ? 200 : 400,
      result
    );
  }

  /*
  ----------------------------------------------------------
  PLAN DIAGNOSTIC
  ----------------------------------------------------------
  */

  if (action === "plan") {
    const result =
      await verifyProPlan(
        secretKey,
        planCode
      );

    if (!result.valid) {
      return send(res, 400, {
        success: false,

        planFound: false,

        error:
          result.error
      });
    }

    return send(res, 200, {
      success: true,

      planFound: true,

      proPlan: {
        name:
          result.plan.name,

        planCode:
          result.plan.plan_code,

        amount:
          Number(result.plan.amount),

        currency:
          result.plan.currency,

        interval:
          result.plan.interval
      }
    });
  }

  /*
  ----------------------------------------------------------
  SAFE CONFIG DIAGNOSTIC
  ----------------------------------------------------------
  */

  if (action === "config") {
    return send(res, 200, {
      success: true,

      secretKeyConfigured:
        Boolean(secretKey),

      planConfigured:
        Boolean(planCode),

      planLooksLikePaystackCode:
        /^PLN_/i.test(planCode),

      configuredPlanType:
        /^\d+$/.test(planCode)
          ? "numeric_plan_id"
          : /^PLN_/i.test(planCode)
            ? "plan_code"
            : "unknown",

      expectedAmount:
        EXPECTED_AMOUNT,

      expectedCurrency:
        EXPECTED_CURRENCY,

      expectedInterval:
        EXPECTED_INTERVAL
    });
  }

  /*
  ----------------------------------------------------------
  DEFAULT GET RESPONSE
  ----------------------------------------------------------
  */

  return send(res, 200, {
    success: true,

    service:
      "OBITREND Paystack Pro",

    status:
      "ready",

    endpoints: {
      verify:
        "/api/paystack?reference=PAYSTACK_REFERENCE",

      planCheck:
        "/api/paystack?action=plan",

      configCheck:
        "/api/paystack?action=config"
    }
  });
}

/*
============================================================
POST REQUEST HANDLER
============================================================

POST /api/paystack

Body:

{
  "email": "customer@example.com"
}

This creates the recurring Pro checkout.
============================================================
*/

async function handlePost(req, res) {
  const {
    secretKey,
    planCode
  } = getConfig();

  const configError =
    validateConfig(
      res,
      secretKey,
      planCode
    );

  if (configError) {
    return configError;
  }

  /*
  ----------------------------------------------------------
  READ BODY
  ----------------------------------------------------------
  */

  let body =
    req.body || {};

  if (typeof body === "string") {
    try {
      body =
        JSON.parse(body);
    } catch {
      return send(res, 400, {
        success: false,

        error:
          "Request body contains invalid JSON."
      });
    }
  }

  /*
  ----------------------------------------------------------
  EMAIL
  ----------------------------------------------------------
  */

  const email =
    String(
      body.email || ""
    )
      .trim()
      .toLowerCase();

  /*
  ----------------------------------------------------------
  BASIC EMAIL VALIDATION
  ----------------------------------------------------------
  */

  if (!email) {
    return send(res, 400, {
      success: false,

      error:
        "Email address is required."
    });
  }

  const emailPattern =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(email)) {
    return send(res, 400, {
      success: false,

      error:
        "Please provide a valid email address."
    });
  }

  /*
  ----------------------------------------------------------
  VERIFY REAL PAYSTACK PLAN
  ----------------------------------------------------------
  */

  const planResult =
    await verifyProPlan(
      secretKey,
      planCode
    );

  if (!planResult.valid) {
    console.error(
      "OBITREND PRO PLAN ERROR:",
      planResult.error
    );

    return send(res, 400, {
      success: false,

      planFound: false,

      error:
        planResult.error,

      configuredPlan:
        planCode,

      expected: {
        amount:
          EXPECTED_AMOUNT,

        currency:
          EXPECTED_CURRENCY,

        interval:
          EXPECTED_INTERVAL
      }
    });
  }

  /*
  ----------------------------------------------------------
  INITIALIZE PAYMENT
  ----------------------------------------------------------
  */

  const payment =
    await initializeProPayment(
      email,
      secretKey,
      planResult.plan,
      req
    );

  if (!payment.success) {
    return send(
      res,
      400,
      payment
    );
  }

  /*
  ----------------------------------------------------------
  SUCCESS RESPONSE
  ----------------------------------------------------------
  */

  return send(res, 200, {
    success: true,

    message:
      "OBITREND Pro payment initialized.",

    authorization_url:
      payment.authorization_url,

    reference:
      payment.reference,

    access_code:
      payment.access_code,

    plan_code:
      payment.plan_code,

    amount:
      payment.amount,

    currency:
      payment.currency,

    interval:
      payment.interval
  });
}

/*
============================================================
MAIN VERCEL HANDLER
============================================================
*/

export default async function handler(
  req,
  res
) {
  /*
  ----------------------------------------------------------
  CORS
  ----------------------------------------------------------
  */

  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  /*
  ----------------------------------------------------------
  PREFLIGHT
  ----------------------------------------------------------
  */

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  /*
  ----------------------------------------------------------
  GET
  ----------------------------------------------------------
  */

  if (req.method === "GET") {
    try {
      return await handleGet(
        req,
        res
      );
    } catch (error) {
      console.error(
        "OBITREND PAYSTACK GET ERROR:",
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

  /*
  ----------------------------------------------------------
  POST
  ----------------------------------------------------------
  */

  if (req.method === "POST") {
    try {
      return await handlePost(
        req,
        res
      );
    } catch (error) {
      console.error(
        "OBITREND PAYSTACK POST ERROR:",
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

  /*
  ----------------------------------------------------------
  UNSUPPORTED METHOD
  ----------------------------------------------------------
  */

  res.setHeader(
    "Allow",
    "GET, POST, OPTIONS"
  );

  return send(res, 405, {
    success: false,

    error:
      "Method not allowed."
  });
}
