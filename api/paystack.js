/*
===========================================================
OBITREND PAYSTACK PRO BACKEND
===========================================================

PRO PLAN:
₦15,000 / WEEK

Required Vercel Environment Variables:

PAYSTACK_SECRET_KEY
PAYSTACK_PRO_PLAN_CODE

IMPORTANT:
Never put PAYSTACK_SECRET_KEY inside index.html.

The frontend calls:

POST /api/paystack

This backend:
1. Reads the secret key from Vercel.
2. Reads the plan code from Vercel.
3. Confirms the plan exists on the same Paystack integration.
4. Confirms it is NGN / ₦15,000 / weekly.
5. Initializes the recurring Paystack transaction.
6. Returns authorization_url to the frontend.
7. Can verify completed transactions.

===========================================================
*/

const PAYSTACK_API = "https://api.paystack.co";

const EXPECTED_AMOUNT = 1500000; // ₦15,000 in kobo
const EXPECTED_CURRENCY = "NGN";
const EXPECTED_INTERVAL = "weekly";


/* =========================================================
   RESPONSE HELPER
========================================================= */

function send(res, status, data) {
  return res.status(status).json(data);
}


/* =========================================================
   GET PAYSTACK CONFIG
========================================================= */

function getConfig() {

  const secretKey =
    process.env.PAYSTACK_SECRET_KEY;

  const planCode =
    process.env.PAYSTACK_PRO_PLAN_CODE;

  return {
    secretKey,
    planCode
  };
}


/* =========================================================
   PAYSTACK REQUEST HELPER
========================================================= */

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
        Authorization:
          `Bearer ${secretKey}`,

        "Content-Type":
          "application/json",

        ...(options.headers || {})
      }
    }
  );


  let data;

  try {

    data =
      await response.json();

  } catch {

    data = {
      status: false,
      message:
        "Paystack returned an invalid response."
    };

  }


  return {
    response,
    data
  };
}


/* =========================================================
   CHECK ENVIRONMENT VARIABLES
========================================================= */

function checkEnvironment(res) {

  const {
    secretKey,
    planCode
  } = getConfig();


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


/* =========================================================
   VERIFY THAT THE PLAN REALLY EXISTS
========================================================= */

async function verifyProPlan(
  secretKey,
  planCode
) {

  const {
    response,
    data
  } = await paystackRequest(

    `/plan/${encodeURIComponent(planCode)}`,

    {
      method: "GET"
    },

    secretKey

  );


  if (
    !response.ok ||
    !data.status ||
    !data.data
  ) {

    return {

      valid: false,

      error:
        data.message ||
        "Paystack could not find the OBITREND Pro plan."

    };

  }


  const plan =
    data.data;


  /*
    Confirm the plan belongs to the expected
    OBITREND configuration.
  */

  const amount =
    Number(plan.amount);

  const currency =
    String(
      plan.currency || ""
    ).toUpperCase();

  const interval =
    String(
      plan.interval || ""
    ).toLowerCase();


  if (
    amount !== EXPECTED_AMOUNT ||
    currency !== EXPECTED_CURRENCY ||
    interval !== EXPECTED_INTERVAL
  ) {

    return {

      valid: false,

      error:
        "The Paystack plan exists, but its amount, currency, or interval does not match OBITREND Pro.",

      details: {

        planCode:
          plan.plan_code,

        amount:
          amount,

        expectedAmount:
          EXPECTED_AMOUNT,

        currency:
          currency,

        expectedCurrency:
          EXPECTED_CURRENCY,

        interval:
          interval,

        expectedInterval:
          EXPECTED_INTERVAL

      }

    };

  }


  return {

    valid: true,

    plan

  };
}


/* =========================================================
   CREATE CHECKOUT
========================================================= */

async function initializeProPayment(
  email,
  secretKey,
  planCode,
  req
) {

  /*
    Determine the customer's return URL.

    Your OBITREND frontend can handle:

    ?payment=success&reference=XXXX
  */

  const host =
    req.headers.host ||
    "obitrend.vercel.app";

  const protocol =
    req.headers["x-forwarded-proto"] ||
    "https";


  const callbackUrl =
    `${protocol}://${host}/?payment=success`;


  /*
    Paystack officially supports creating a subscription
    by adding the plan code to transaction initialization.

    The plan amount takes precedence over the supplied
    transaction amount.
  */

  const payload = {

    email:

      email,

    amount:

      EXPECTED_AMOUNT,

    currency:

      EXPECTED_CURRENCY,

    plan:

      planCode,

    callback_url:

      callbackUrl,

    metadata: {

      product:
        "OBITREND_PRO",

      product_name:
        "OBITREND AI Fashion Creator Pro",

      plan_name:
        "OBITREND Pro Weekly 15000",

      plan_code:
        planCode,

      amount:
        15000,

      currency:
        "NGN",

      interval:
        "weekly"

    }

  };


  const {
    response,
    data
  } = await paystackRequest(

    "/transaction/initialize",

    {
      method: "POST",

      body:
        JSON.stringify(payload)

    },

    secretKey

  );


  if (
    !response.ok ||
    !data.status ||
    !data.data
  ) {

    console.error(
      "OBITREND Paystack initialization failed:",
      data
    );


    return {

      success: false,

      error:
        data.message ||
        "Paystack could not start the OBITREND Pro payment."

    };

  }


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
        "Paystack did not return a checkout URL."

    };

  }


  return {

    success: true,

    authorization_url:
      authorizationUrl,

    reference:
      reference,

    access_code:
      accessCode,

    plan_code:
      planCode,

    amount:
      15000,

    currency:
      "NGN",

    interval:
      "weekly"

  };
}


/* =========================================================
   VERIFY PAYMENT
========================================================= */

async function verifyTransaction(
  reference,
  secretKey
) {

  const {
    response,
    data
  } = await paystackRequest(

    `/transaction/verify/${encodeURIComponent(reference)}`,

    {
      method: "GET"
    },

    secretKey

  );


  if (
    !response.ok ||
    !data.status ||
    !data.data
  ) {

    return {

      success: false,

      paid: false,

      error:
        data.message ||
        "Paystack could not verify this transaction."

    };

  }


  const transaction =
    data.data;


  /*
    Payment must be successful.
  */

  if (
    transaction.status !==
    "success"
  ) {

    return {

      success: false,

      paid: false,

      status:
        transaction.status,

      reference:
        transaction.reference,

      error:
        "Payment has not been completed successfully."

    };

  }


  /*
    Verify currency.
  */

  if (
    String(
      transaction.currency || ""
    ).toUpperCase()
    !== EXPECTED_CURRENCY
  ) {

    return {

      success: false,

      paid: false,

      error:
        "Payment currency does not match OBITREND Pro."

    };

  }


  /*
    Verify amount.

    Paystack stores NGN amounts in kobo.
  */

  const actualAmount =
    Number(
      transaction.amount || 0
    );


  if (
    actualAmount !==
    EXPECTED_AMOUNT
  ) {

    return {

      success: false,

      paid: false,

      error:
        "Payment amount does not match the OBITREND Pro plan.",

      expectedAmount:
        EXPECTED_AMOUNT,

      actualAmount:
        actualAmount

    };

  }


  /*
    Successful payment.
  */

  return {

    success: true,

    paid: true,

    pro: true,

    reference:
      transaction.reference,

    status:
      transaction.status,

    amount:
      actualAmount,

    currency:
      transaction.currency,

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


/* =========================================================
   MAIN VERCEL HANDLER
========================================================= */

export default async function handler(
  req,
  res
) {

  /*
    Allow GET and POST.
  */

  if (
    req.method !== "GET" &&
    req.method !== "POST"
  ) {

    return send(res, 405, {

      success: false,

      error:
        "Method not allowed."

    });

  }


  /*
    Check Vercel variables.
  */

  const environmentError =
    checkEnvironment(res);


  if (environmentError) {

    return environmentError;

  }


  const {
    secretKey,
    planCode
  } = getConfig();


  try {


    /* =====================================================
       GET = VERIFY PAYMENT OR CHECK PLAN
    ===================================================== */

    if (
      req.method === "GET"
    ) {

      const url =
        new URL(
          req.url,
          "https://obitrend.vercel.app"
        );


      const reference =
        req.query?.reference ||
        url.searchParams.get(
          "reference"
        ) ||
        url.searchParams.get(
          "trxref"
        );


      /*
        If a reference exists,
        verify the payment.
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
        No reference:
        verify the Paystack plan.

        This gives us a direct diagnostic endpoint:

        /api/paystack

        It confirms whether the Vercel secret key
        can actually see the plan.
      */

      const planResult =
        await verifyProPlan(
          secretKey,
          planCode
        );


      if (!planResult.valid) {

        return send(res, 400, {

          success: false,

          planFound: false,

          error:
            planResult.error,

          /*
            Safe diagnostic information only.
            NEVER return the secret key.
          */

          planCode:
            planCode

        });

      }


      return send(res, 200, {

        success: true,

        planFound: true,

        proPlan: {

          name:
            planResult.plan.name,

          planCode:
            planResult.plan.plan_code,

          amount:
            planResult.plan.amount,

          currency:
            planResult.plan.currency,

          interval:
            planResult.plan.interval

        }

      });

    }


    /* =====================================================
       POST = START PRO SUBSCRIPTION
    ===================================================== */

    if (
      req.method === "POST"
    ) {

      const body =
        req.body || {};


      const email =
        String(
          body.email || ""
        ).trim().toLowerCase();


      /*
        Basic email validation.
      */

      if (!email) {

        return send(res, 400, {

          success: false,

          error:
            "Email address is required."

        });

      }


      if (
        !email.includes("@") ||
        !email.includes(".")
      ) {

        return send(res, 400, {

          success: false,

          error:
            "Please provide a valid email address."

        });

      }


      /*
        CRITICAL:

        Before initialization, directly ask Paystack
        whether the Vercel plan code exists.

        This prevents the old mysterious
        "Plan not found" problem.
      */

      const planResult =
        await verifyProPlan(
          secretKey,
          planCode
        );


      if (!planResult.valid) {

        console.error(
          "OBITREND PRO PLAN ERROR:",
          planResult
        );


        return send(res, 400, {

          success: false,

          planFound: false,

          error:
            planResult.error,

          planCode:
            planCode

        });

      }


      /*
        Initialize recurring Paystack checkout.
      */

      const payment =
        await initializeProPayment(
          email,
          secretKey,
          planCode,
          req
        );


      if (!payment.success) {

        return send(res, 400, payment);

      }


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


  } catch (error) {

    console.error(
      "OBITREND PAYSTACK SERVER ERROR:",
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
