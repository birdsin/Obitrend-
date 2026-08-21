/*
===========================================================
 OBITREND PRO — PAYSTACK PAYMENT API
===========================================================

OBITREND PRO:
NGN 15,000 / WEEK

REQUIRED VERCEL ENVIRONMENT VARIABLES:

PAYSTACK_SECRET_KEY
PAYSTACK_PRO_PLAN_CODE

OPTIONAL:

OBITREND_APP_URL
PAYSTACK_EXPECTED_AMOUNT
PAYSTACK_EXPECTED_CURRENCY
PAYSTACK_EXPECTED_INTERVAL

IMPORTANT:

The customer may pay more than NGN 15,000 because Paystack
can add transaction fees.

Example:

Plan price:       NGN 15,000
Customer charged: NGN 15,329.95

Therefore verification checks:

requested_amount = 1,500,000 kobo

instead of requiring:

amount = 1,500,000 kobo

===========================================================
*/

const PAYSTACK_API = "https://api.paystack.co";

const DEFAULT_APP_URL =
  "https://obitrend.vercel.app";

const DEFAULT_EXPECTED_AMOUNT =
  1500000; // NGN 15,000 in kobo

const DEFAULT_EXPECTED_CURRENCY =
  "NGN";

const DEFAULT_EXPECTED_INTERVAL =
  "weekly";


/* =========================================================
   BASIC HELPERS
========================================================= */

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
  return res
    .status(statusCode)
    .json(data);
}


/* =========================================================
   CONFIGURATION
========================================================= */

function getConfig() {

  const secretKey =
    cleanString(
      process.env.PAYSTACK_SECRET_KEY
    );

  const planCode =
    cleanString(
      process.env.PAYSTACK_PRO_PLAN_CODE
    );

  const appUrl =
    cleanString(
      process.env.OBITREND_APP_URL
    ) ||
    DEFAULT_APP_URL;

  const amountRaw =
    cleanString(
      process.env.PAYSTACK_EXPECTED_AMOUNT
    );

  const expectedAmount =
    amountRaw &&
    Number.isFinite(Number(amountRaw))
      ? Number(amountRaw)
      : DEFAULT_EXPECTED_AMOUNT;

  const expectedCurrency =
    cleanString(
      process.env.PAYSTACK_EXPECTED_CURRENCY
    ) ||
    DEFAULT_EXPECTED_CURRENCY;

  const expectedInterval =
    cleanString(
      process.env.PAYSTACK_EXPECTED_INTERVAL
    ) ||
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


/* =========================================================
   CONFIG VALIDATION
========================================================= */

function validateConfig(res, config) {

  if (!config.secretKey) {

    return send(res, 500, {
      success: false,
      error:
        "PAYSTACK_SECRET_KEY is not configured."
    });
  }

  if (!config.planCode) {

    return send(res, 500, {
      success: false,
      error:
        "PAYSTACK_PRO_PLAN_CODE is not configured."
    });
  }

  return null;
}


/* =========================================================
   PAYSTACK API REQUEST
========================================================= */

async function paystackRequest(
  path,
  secretKey,
  options = {}
) {

  const requestOptions = {
    method:
      options.method || "GET",

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
    options.body !== undefined
  ) {

    requestOptions.body =
      JSON.stringify(
        options.body
      );
  }

  const response =
    await fetch(
      `${PAYSTACK_API}${path}`,
      requestOptions
    );

  let data = null;

  try {

    data =
      await response.json();

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
   VERIFY PAYSTACK PLAN
========================================================= */

async function verifyProPlan(
  secretKey,
  planCode,
  expectedAmount,
  expectedCurrency,
  expectedInterval
) {

  const result =
    await paystackRequest(
      `/plan/${encodeURIComponent(
        planCode
      )}`,
      secretKey
    );

  if (
    !result.ok ||
    !result.data?.status
  ) {

    return {
      valid: false,

      error:
        result.data?.message ||
        "Unable to verify the OBITREND Pro Paystack plan."
    };
  }

  const plan =
    result.data.data;

  if (!plan) {

    return {
      valid: false,

      error:
        "Paystack returned no plan information."
    };
  }


  /* PLAN CODE */

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


  /* PLAN AMOUNT */

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

  if (
    planAmount !== expectedAmount
  ) {

    return {
      valid: false,

      error:
        "The Paystack Pro plan amount does not match the OBITREND Pro price.",

      details: {
        expectedAmount,
        paystackPlanAmount:
          planAmount
      }
    };
  }


  /* CURRENCY */

  if (
    cleanString(plan.currency) &&
    lower(plan.currency) !==
      lower(expectedCurrency)
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


  /* INTERVAL */

  if (
    cleanString(plan.interval) &&
    lower(plan.interval) !==
      lower(expectedInterval)
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


/* =========================================================
   VERIFY TRANSACTION
========================================================= */

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

      error:
        "Payment reference is required."
    };
  }


  /* VERIFY WITH PAYSTACK */

  const result =
    await paystackRequest(
      `/transaction/verify/${encodeURIComponent(
        cleanReference
      )}`,
      secretKey
    );


  if (
    !result.ok ||
    !result.data?.status
  ) {

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


  /* PAYMENT STATUS */

  const transactionStatus =
    lower(transaction.status);

  if (
    transactionStatus !== "success"
  ) {

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


  /* CURRENCY */

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


  /*
  =========================================================
  IMPORTANT AMOUNT CHECK

  Your transaction showed:

  requested_amount:
  NGN 15,000

  amount:
  NGN 15,329.95

  The difference is Paystack's transaction fee.

  Therefore requested_amount is checked first.
  =========================================================
  */

  const actualAmount =
    Number(transaction.amount);

  const requestedAmount =
    Number(
      transaction.requested_amount
    );

  const hasRequestedAmount =
    Number.isFinite(
      requestedAmount
    ) &&
    requestedAmount > 0;


  if (
    hasRequestedAmount
  ) {

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

    /*
    Older Paystack responses may not contain
    requested_amount.

    In that case use amount as fallback.
    */

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
          "Payment amount could not be verified.",

        details: {
          expectedAmount,

          actualAmount
        }
      };
    }
  }


  /* VERIFY PLAN */

  const planVerification =
    await verifyProPlan(
      secretKey,
      planCode,
      expectedAmount,
      expectedCurrency,
      expectedInterval
    );


  if (
    !planVerification.valid
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
        planVerification.error
    };
  }


  /*
  =========================================================
  CHECK TRANSACTION PLAN CODE
  =========================================================
  */

  let transactionPlanCode =
    "";


  if (
    typeof transaction.plan ===
    "string"
  ) {

    transactionPlanCode =
      cleanString(
        transaction.plan
      );
  }


  if (
    transaction.plan &&
    typeof transaction.plan ===
      "object"
  ) {

    transactionPlanCode =
      cleanString(
        transaction.plan.plan_code ||
        transaction.plan.planCode ||
        transaction.plan.code ||
        ""
      );
  }


  /*
  Some Paystack responses return an empty
  plan object even when the transaction was
  initialized using a plan.

  Therefore only reject when Paystack actually
  gives us a plan code and it is wrong.
  */

  if (
    transactionPlanCode &&
    transactionPlanCode !==
      planCode
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


  /* CUSTOMER */

  const email =
    cleanString(
      transaction.customer?.email ||
      transaction.email ||
      ""
    );


  const customerCode =
    cleanString(
      transaction.customer?.customer_code ||
      transaction.customer?.customerCode ||
      ""
    );


  /* PAYMENT DATE */

  const paidAt =
    transaction.paid_at ||
    transaction.paidAt ||
    transaction.transaction_date ||
    transaction.created_at ||
    transaction.createdAt ||
    null;


  /* SUCCESS */

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

    authorization:
      transaction.authorization ||
      null,

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


/* =========================================================
   INITIALIZE PRO PAYMENT
========================================================= */

async function initializeProPayment(
  email,
  secretKey,
  planCode,
  expectedAmount,
  expectedCurrency,
  expectedInterval,
  appUrl
) {

  const cleanEmail =
    cleanString(email)
      .toLowerCase();


  if (!cleanEmail) {

    return {
      success: false,

      error:
        "Email address is required."
    };
  }


  /* EMAIL VALIDATION */

  const emailPattern =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (
    !emailPattern.test(
      cleanEmail
    )
  ) {

    return {
      success: false,

      error:
        "Please provide a valid email address."
    };
  }


  /* VERIFY PLAN FIRST */

  const planVerification =
    await verifyProPlan(
      secretKey,
      planCode,
      expectedAmount,
      expectedCurrency,
      expectedInterval
    );


  if (
    !planVerification.valid
  ) {

    return {
      success: false,

      planFound: false,

      error:
        planVerification.error
    };
  }


  /*
  =========================================================
  UNIQUE PAYSTACK REFERENCE

  Only alphanumeric characters and -, ., =
  are used.
  =========================================================
  */

  const reference =
    `OBITREND-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;


  /* CALLBACK */

const callbackUrl =
`${appUrl.replace(/\/+$/, "")}/?payment=success&reference=${encodeURIComponent(reference)}`;


  /*
  =========================================================
  INITIALIZE PAYSTACK

  Paystack's plan code creates the subscription.
  =========================================================
  */

  const result =
    await paystackRequest(
      "/transaction/initialize",
      secretKey,
      {
        method: "POST",

        body: {

          email:
            cleanEmail,

          amount:
            String(expectedAmount),

          currency:
            expectedCurrency,

          reference,

          plan:
            planCode,

          callback_url:
            callbackUrl,

          metadata:
            JSON.stringify({
              product:
                "OBITREND Pro",

              plan:
                "weekly",

              plan_code:
                planCode,

              expected_amount:
                expectedAmount
            })
        }
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
        "Paystack could not initialize the payment.",

      details:
        result.data || null
    };
  }


  const data =
    result.data.data || {};


  const authorizationUrl =
    cleanString(
      data.authorization_url ||
      data.authorizationUrl ||
      ""
    );


  const accessCode =
    cleanString(
      data.access_code ||
      data.accessCode ||
      ""
    );


  const returnedReference =
    cleanString(
      data.reference ||
      reference
    );


  if (!authorizationUrl) {

    return {
      success: false,

      error:
        "Paystack did not return a payment URL.",

      details:
        result.data
    };
  }


  return {

    success: true,

    message:
      "OBITREND Pro payment initialized.",

    authorization_url:
      authorizationUrl,

    access_code:
      accessCode || null,

    reference:
      returnedReference,

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


/* =========================================================
   GET HANDLER
========================================================= */

async function handleGet(
  req,
  res
) {

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


  /*
  =========================================================
  VERIFY PAYMENT
  =========================================================
  */

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


  /*
  =========================================================
  PLAN CHECK
  =========================================================
  */

  if (
    action === "plan"
  ) {

    const result =
      await verifyProPlan(
        config.secretKey,

        config.planCode,

        config.expectedAmount,

        config.expectedCurrency,

        config.expectedInterval
      );


    if (
      !result.valid
    ) {

      return send(
        res,
        400,
        {
          success: false,

          planFound: false,

          error:
            result.error
        }
      );
    }


    return send(
      res,
      200,
      {

        success: true,

        planFound: true,

        proPlan: {

          name:
            result.plan.name,

          planCode:
            result.plan.plan_code,

          amount:
            Number(
              result.plan.amount
            ),

          currency:
            result.plan.currency,

          interval:
            result.plan.interval,

          description:
            result.plan.description ||
            null
        }
      }
    );
  }


  /*
  =========================================================
  CONFIG CHECK
  =========================================================
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
            config.secretKey
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
      }
    );
  }


  /*
  =========================================================
  DEFAULT GET
  =========================================================
  */

  return send(
    res,
    200,
    {

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
    }
  );
}


/* =========================================================
   POST HANDLER
========================================================= */

async function handlePost(
  req,
  res
) {

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


  /*
  =========================================================
  READ REQUEST BODY
  =========================================================
  */

  let body =
    req.body || {};


  if (
    typeof body === "string"
  ) {

    try {

      body =
        JSON.parse(body);

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
  =========================================================
  EMAIL
  =========================================================
  */

  const email =
    cleanString(
      body.email ||
      body.customer_email ||
      ""
    ).toLowerCase();


  if (!email) {

    return send(
      res,
      400,
      {

        success: false,

        error:
          "Email address is required."
      }
    );
  }


  /*
  =========================================================
  INITIALIZE PAYMENT
  =========================================================
  */

  const payment =
    await initializeProPayment(

      email,

      config.secretKey,

      config.planCode,

      config.expectedAmount,

      config.expectedCurrency,

      config.expectedInterval,

      config.appUrl
    );


  if (
    !payment.success
  ) {

    return send(
      res,
      400,
      payment
    );
  }


  /*
  =========================================================
  RETURN PAYMENT URL
  =========================================================
  */

  return send(
    res,
    200,
    {

      success: true,

      message:
        payment.message,

      authorization_url:
        payment.authorization_url,

      access_code:
        payment.access_code,

      reference:
        payment.reference,

      plan_code:
        payment.plan_code,

      amount:
        payment.amount,

      currency:
        payment.currency,

      interval:
        payment.interval
    }
  );
}


/* =========================================================
   MAIN VERCEL HANDLER
========================================================= */

export default async function handler(
  req,
  res
) {

  /*
  =========================================================
  CORS
  =========================================================
  */

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


  /*
  =========================================================
  PREFLIGHT
  =========================================================
  */

  if (
    req.method === "OPTIONS"
  ) {

    return res
      .status(204)
      .end();
  }


  /*
  =========================================================
  GET
  =========================================================
  */

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

      return send(
        res,
        500,
        {

          success: false,

          error:
            error?.message ||
            "Unexpected Paystack server error."
        }
      );
    }
  }


  /*
  =========================================================
  POST
  =========================================================
  */

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

      return send(
        res,
        500,
        {

          success: false,

          error:
            error?.message ||
            "Unexpected Paystack server error."
        }
      );
    }
  }


  /*
  =========================================================
  UNSUPPORTED METHOD
  =========================================================
  */

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
}
