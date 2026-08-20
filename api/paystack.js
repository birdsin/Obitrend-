/*
===========================================================
 OBITREND PRO — PAYSTACK PAYMENT API
===========================================================

Environment variables required:

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
Paystack may charge the customer more than the plan amount
because of transaction fees.

Example:
Plan price       = NGN 15,000
Customer charged = NGN 15,329.95

The payment verification therefore checks the Paystack
requested_amount / configured plan amount instead of
rejecting the transaction because of Paystack fees.
===========================================================
*/

const PAYSTACK_API = "https://api.paystack.co";

const DEFAULT_APP_URL = "https://obitrend.vercel.app";

const DEFAULT_EXPECTED_AMOUNT = 1500000; // NGN 15,000 in kobo
const DEFAULT_EXPECTED_CURRENCY = "NGN";
const DEFAULT_EXPECTED_INTERVAL = "weekly";


// =========================================================
// BASIC HELPERS
// =========================================================

function cleanString(value) {
  return String(value ?? "").trim();
}


function lower(value) {
  return cleanString(value).toLowerCase();
}
function upper(value) {
  return cleanString(value).toUpperCase();
}

function send(res, statusCode, data) {
  return res.status(statusCode).json(data);
}


function getConfig() {
  const secretKey = cleanString(
    process.env.PAYSTACK_SECRET_KEY
  );

  const planCode = cleanString(
    process.env.PAYSTACK_PRO_PLAN_CODE
  );

  const appUrl =
    cleanString(process.env.OBITREND_APP_URL) ||
    DEFAULT_APP_URL;

  const expectedAmountRaw =
    cleanString(process.env.PAYSTACK_EXPECTED_AMOUNT);

  const expectedAmount =
    expectedAmountRaw &&
    Number.isFinite(Number(expectedAmountRaw))
      ? Number(expectedAmountRaw)
      : DEFAULT_EXPECTED_AMOUNT;

  const expectedCurrency =
    cleanString(process.env.PAYSTACK_EXPECTED_CURRENCY) ||
    DEFAULT_EXPECTED_CURRENCY;

  const expectedInterval =
    cleanString(process.env.PAYSTACK_EXPECTED_INTERVAL) ||
    DEFAULT_EXPECTED_INTERVAL;

  return {
    secretKey,
    planCode,
    appUrl,
    expectedAmount,
    expectedCurrency,
    expectedInterval
  };
}


function validateConfig(res, config) {
  if (!config.secretKey) {
    return send(res, 500, {
      success: false,
      error: "PAYSTACK_SECRET_KEY is not configured."
    });
  }

  if (!config.planCode) {
    return send(res, 500, {
      success: false,
      error: "PAYSTACK_PRO_PLAN_CODE is not configured."
    });
  }

  return null;
}


// =========================================================
// PAYSTACK REQUEST
// =========================================================

async function paystackRequest(
  path,
  secretKey,
  options = {}
) {
  const response = await fetch(
    `${PAYSTACK_API}${path}`,
    {
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
    }
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


// =========================================================
// PLAN VERIFICATION
// =========================================================

async function verifyProPlan(
  secretKey,
  planCode,
  expectedAmount,
  expectedCurrency,
  expectedInterval
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


  // -------------------------------------------------------
  // PLAN CODE
  // -------------------------------------------------------

  const returnedPlanCode =
    cleanString(
      plan.plan_code ||
      plan.planCode ||
      ""
    );

  if (
    returnedPlanCode &&
    returnedPlanCode !== planCode
  ) {
    return {
      valid: false,
      error:
        "The configured Paystack plan code does not match the Paystack plan."
    };
  }


  // -------------------------------------------------------
  // PLAN AMOUNT
  // -------------------------------------------------------

  const planAmount =
    Number(plan.amount);

  if (
    !Number.isFinite(planAmount) ||
    planAmount <= 0
  ) {
    return {
      valid: false,
      error:
        "Paystack returned an invalid Pro plan amount."
    };
  }


  if (planAmount !== expectedAmount) {
    return {
      valid: false,

      error:
        "The Paystack Pro plan amount does not match the OBITREND Pro price.",

      details: {
        expectedAmount,
        paystackPlanAmount: planAmount
      }
    };
  }


  // -------------------------------------------------------
  // CURRENCY
  // -------------------------------------------------------

  const planCurrency =
    lower(plan.currency);

  if (
    planCurrency &&
    planCurrency !== lower(expectedCurrency)
  ) {
    return {
      valid: false,

      error:
        "The Paystack Pro plan currency does not match OBITREND.",

      details: {
        expectedCurrency,
        paystackPlanCurrency:
          plan.currency
      }
    };
  }


  // -------------------------------------------------------
  // INTERVAL
  // -------------------------------------------------------

  const planInterval =
    lower(plan.interval);

  if (
    planInterval &&
    planInterval !== lower(expectedInterval)
  ) {
    return {
      valid: false,

      error:
        "The Paystack Pro plan interval does not match OBITREND.",

      details: {
        expectedInterval,
        paystackPlanInterval:
          plan.interval
      }
    };
  }


  return {
    valid: true,
    plan
  };
}


// =========================================================
// TRANSACTION VERIFICATION
// =========================================================

async function verifyTransaction(
  reference,
  secretKey,
  expectedAmount,
  expectedCurrency,
  expectedInterval,
  planCode
) {
  const cleanReference =
    cleanString(reference);

  if (!cleanReference) {
    return {
      success: false,
      paid: false,
      error: "Payment reference is required."
    };
  }


  // -------------------------------------------------------
  // VERIFY TRANSACTION WITH PAYSTACK
  // -------------------------------------------------------

  const result = await paystackRequest(
    `/transaction/verify/${encodeURIComponent(
      cleanReference
    )}`,
    secretKey
  );


  if (!result.ok || !result.data?.status) {
    return {
      success: false,
      paid: false,

      reference:
        cleanReference,

      error:
        result.data?.message ||
        "Paystack could not verify the payment."
    };
  }


  const transaction =
    result.data.data;


  if (!transaction) {
    return {
      success: false,
      paid: false,

      reference:
        cleanReference,

      error:
        "Paystack returned no transaction data."
    };
  }


  // -------------------------------------------------------
  // TRANSACTION STATUS
  // -------------------------------------------------------

  const status =
    lower(transaction.status);

  if (status !== "success") {
    return {
      success: false,
      paid: false,

      status:
        transaction.status,

      reference:
        transaction.reference ||
        cleanReference,

      error:
        "Payment has not been completed successfully."
    };
  }


  // -------------------------------------------------------
  // CURRENCY
  // -------------------------------------------------------

  const transactionCurrency =
    upper(transaction.currency);

  if (
    transactionCurrency !==
    upper(expectedCurrency)
  ) {
    return {
      success: false,
      paid: false,

      reference:
        transaction.reference ||
        cleanReference,

      status:
        transaction.status,

      error:
        "Payment currency does not match OBITREND Pro.",

      details: {
        expectedCurrency,
        actualCurrency:
          transaction.currency
      }
    };
  }


  // -------------------------------------------------------
  // IMPORTANT AMOUNT LOGIC
  // -------------------------------------------------------
  //
  // Paystack can charge the customer transaction fees.
  //
  // Example:
  //
  // requested_amount = 1,500,000 kobo
  // amount           = 1,532,995 kobo
  //
  // Therefore:
  //
  // DO NOT require transaction.amount === 1,500,000
  //
  // Instead:
  //
  // 1. requested_amount must equal the product price
  // 2. OR, on older responses where requested_amount is
  //    unavailable, amount must equal the product price
  //
  // -------------------------------------------------------

  const actualAmount =
    Number(transaction.amount);

  const requestedAmount =
    Number(transaction.requested_amount);


  const hasRequestedAmount =
    Number.isFinite(requestedAmount) &&
    requestedAmount > 0;


  if (hasRequestedAmount) {

    if (
      requestedAmount !==
      expectedAmount
    ) {
      return {
        success: false,
        paid: false,

        reference:
          transaction.reference ||
          cleanReference,

        status:
          transaction.status,

        error:
          "Payment amount does not match the OBITREND Pro price.",

        details: {
          expectedAmount,
          requestedAmount,
          customerChargedAmount:
            actualAmount
        }
      };
    }

  } else {

    // Fallback for older Paystack responses.

    if (
      actualAmount !==
      expectedAmount
    ) {
      return {
        success: false,
        paid: false,

        reference:
          transaction.reference ||
          cleanReference,

        status:
          transaction.status,

        error:
          "Payment amount could not be verified against the OBITREND Pro price.",

        details: {
          expectedAmount,
          actualAmount
        }
      };
    }
  }


  // -------------------------------------------------------
  // VERIFY THE PLAN
  // -------------------------------------------------------

  const planVerification =
    await verifyProPlan(
      secretKey,
      planCode,
      expectedAmount,
      expectedCurrency,
      expectedInterval
    );


  if (!planVerification.valid) {
    return {
      success: false,
      paid: false,

      reference:
        transaction.reference ||
        cleanReference,

      status:
        transaction.status,

      error:
        planVerification.error
    };
  }


  // -------------------------------------------------------
  // VERIFY TRANSACTION PLAN CODE WHEN AVAILABLE
  // -------------------------------------------------------

  let transactionPlanCode = "";


  if (
    typeof transaction.plan === "string"
  ) {
    transactionPlanCode =
      cleanString(transaction.plan);
  }


  if (
    transaction.plan &&
    typeof transaction.plan === "object"
  ) {
    transactionPlanCode =
      cleanString(
        transaction.plan.plan_code ||
        transaction.plan.planCode ||
        transaction.plan.code ||
        ""
      );
  }


  if (
    transactionPlanCode &&
    transactionPlanCode !== planCode
  ) {
    return {
      success: false,
      paid: false,

      reference:
        transaction.reference ||
        cleanReference,

      status:
        transaction.status,

      error:
        "The successful payment is not for the configured OBITREND Pro plan."
    };
  }


  // -------------------------------------------------------
  // CUSTOMER EMAIL
  // -------------------------------------------------------

  const email =
    cleanString(
      transaction.customer?.email ||
      transaction.email ||
      ""
    );


  // -------------------------------------------------------
  // CUSTOMER CODE
  // -------------------------------------------------------

  const customerCode =
    cleanString(
      transaction.customer?.customer_code ||
      transaction.customer?.customerCode ||
      ""
    );


  // -------------------------------------------------------
  // PAID AT
  // -------------------------------------------------------

  const paidAt =
    transaction.paid_at ||
    transaction.paidAt ||
    transaction.transaction_date ||
    transaction.created_at ||
    transaction.createdAt ||
    null;


  // -------------------------------------------------------
  // AUTHORIZATION
  // -------------------------------------------------------

  const authorization =
    transaction.authorization ||
    null;


  // -------------------------------------------------------
  // SUCCESS
  // -------------------------------------------------------

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

    requestedAmount:
      hasRequestedAmount
        ? requestedAmount
        : expectedAmount,

    currency:
      transaction.currency,

    email,

    customerCode,

    paidAt,

    authorization,

    planCode,

    planName:
      planVerification.plan?.name ||
      "OBITREND Pro",

    interval:
      planVerification.plan?.interval ||
      expectedInterval,

    message:
      "OBITREND Pro payment verified successfully."
  };
}


// =========================================================
// INITIALIZE PRO PAYMENT
// =========================================================

async function initializeProPayment(
  email,
  secretKey,
  planCode,
  expectedAmount,
  expectedCurrency,
  expectedInterval,
  appUrl,
  req
) {
  const cleanEmail =
    cleanString(email).toLowerCase();


  if (!cleanEmail) {
    return {
      success: false,
      error: "Email address is required."
    };
  }


  // -------------------------------------------------------
  // EMAIL VALIDATION
  // -------------------------------------------------------

  const emailPattern =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(cleanEmail)) {
    return {
      success: false,
      error:
        "Please provide a valid email address."
    };
  }


  // -------------------------------------------------------
  // VERIFY PLAN BEFORE INITIALIZING
  // -------------------------------------------------------

  const planVerification =
    await verifyProPlan(
      secretKey,
      planCode,
      expectedAmount,
      expectedCurrency,
      expectedInterval
    );


  if (!planVerification.valid) {
    return {
      success: false,
      planFound: false,

      error:
        planVerification.error
    };
  }


  // -------------------------------------------------------
  // UNIQUE REFERENCE
  // -------------------------------------------------------

  const reference =
    `OBITREND-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;


  // -------------------------------------------------------
  // CALLBACK URL
  // -------------------------------------------------------

  const callbackUrl =
    `${appUrl.replace(/\/+$/, "")}/`;


  // -------------------------------------------------------
  // INITIALIZE PAYSTACK
  // -------------------------------------------------------
  //
  // Paystack's subscription flow uses the plan code.
  // The plan amount takes precedence over the amount.
  //
  // -------------------------------------------------------

  const payload = {

    email:
      cleanEmail,

    amount:
      String(expectedAmount),

    currency:
      expectedCurrency,

    plan:
      planCode,

    reference,

    callback_url:
      callbackUrl,

    metadata: {
      product:
        "OBITREND_PRO",

      plan:
        "OBITREND Pro Weekly",

      plan_code:
        planCode,

      interval:
        expectedInterval,

      source:
        "OBITREND_AI_FASHION_CREATOR",

      app_url:
        appUrl
    }
  };


  const result =
    await paystackRequest(
      "/transaction/initialize",
      secretKey,
      {
        method: "POST",
        body: payload
      }
    );


  if (
    !result.ok ||
    !result.data?.status
  ) {
    return {
      success: false,

      error:
        result.data?.message ||
        "Unable to initialize Paystack payment."
    };
  }


  const data =
    result.data.data;


  if (!data) {
    return {
      success: false,

      error:
        "Paystack returned an invalid payment response."
    };
  }


  const authorizationUrl =
    data.authorization_url ||
    data.authorizationUrl ||
    "";


  if (!authorizationUrl) {
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
      authorizationUrl,

    reference:
      data.reference ||
      reference,

    access_code:
      data.access_code ||
      null,

    plan_code:
      planCode,

    amount:
      expectedAmount,

    currency:
      expectedCurrency,

    interval:
      planVerification.plan?.interval ||
      expectedInterval
  };
}


// =========================================================
// GET HANDLER
// =========================================================

async function handleGet(req, res) {

  const config =
    getConfig();


  const configError =
    validateConfig(
      res,
      config
    );


  if (configError) {
    return configError;
  }


  const url =
    new URL(
      req.url,
      config.appUrl
    );


  const reference =
    cleanString(
      url.searchParams.get(
        "reference"
      ) || ""
    );


  const action =
    lower(
      url.searchParams.get(
        "action"
      ) || ""
    );


  // =======================================================
  // VERIFY PAYMENT
  // =======================================================

  if (reference) {

    const result =
      await verifyTransaction(
        reference,
        config.secretKey,
        config.expectedAmount,
        config.expectedCurrency,
        config.expectedInterval,
        config.planCode
      );


    return send(
      res,
      result.success
        ? 200
        : 400,
      result
    );
  }


  // =======================================================
  // PLAN DIAGNOSTIC
  // =======================================================

  if (action === "plan") {

    const result =
      await verifyProPlan(
        config.secretKey,
        config.planCode,
        config.expectedAmount,
        config.expectedCurrency,
        config.expectedInterval
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
          result.plan.interval,

        description:
          result.plan.description ||
          null
      }
    });
  }


  // =======================================================
  // SAFE CONFIG DIAGNOSTIC
  // =======================================================

  if (action === "config") {

    return send(res, 200, {

      success: true,

      service:
        "OBITREND Paystack Pro",

      status:
        "ready",

      secretKeyConfigured:
        Boolean(
          config.secretKey
        ),

      planConfigured:
        Boolean(
          config.planCode
        ),

      planCodeConfigured:
        Boolean(
          config.planCode
        ),

      expectedAmount:
        config.expectedAmount,

      expectedCurrency:
        config.expectedCurrency,

      expectedInterval:
        config.expectedInterval,

      appUrl:
        config.appUrl
    });
  }


  // =======================================================
  // DEFAULT GET RESPONSE
  // =======================================================

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


// =========================================================
// POST HANDLER
// =========================================================

async function handlePost(req, res) {

  const config =
    getConfig();


  const configError =
    validateConfig(
      res,
      config
    );


  if (configError) {
    return configError;
  }


  // -------------------------------------------------------
  // READ BODY
  // -------------------------------------------------------

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


  // -------------------------------------------------------
  // EMAIL
  // -------------------------------------------------------

  const email =
    cleanString(
      body.email ||
      body.customer_email ||
      ""
    ).toLowerCase();


  if (!email) {

    return send(res, 400, {

      success: false,

      error:
        "Email address is required."
    });
  }


  // -------------------------------------------------------
  // INITIALIZE PAYMENT
  // -------------------------------------------------------

  const payment =
    await initializeProPayment(
      email,
      config.secretKey,
      config.planCode,
      config.expectedAmount,
      config.expectedCurrency,
      config.expectedInterval,
      config.appUrl,
      req
    );


  if (!payment.success) {

    return send(
      res,
      400,
      payment
    );
  }


  // -------------------------------------------------------
  // SUCCESS RESPONSE
  // -------------------------------------------------------

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


// =========================================================
// VERCEL MAIN HANDLER
// =========================================================

export default async function handler(
  req,
  res
) {

  // -------------------------------------------------------
  // CORS
  // -------------------------------------------------------

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
    "Content-Type, Accept"
  );


  // -------------------------------------------------------
  // PREFLIGHT
  // -------------------------------------------------------

  if (
    req.method === "OPTIONS"
  ) {
    return res
      .status(204)
      .end();
  }


  // -------------------------------------------------------
  // GET
  // -------------------------------------------------------

  if (
    req.method === "GET"
  ) {

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


  // -------------------------------------------------------
  // POST
  // -------------------------------------------------------

  if (
    req.method === "POST"
  ) {

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


  // -------------------------------------------------------
  // UNSUPPORTED METHOD
  // -------------------------------------------------------

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
