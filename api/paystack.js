// api/paystack.js
// OBITREND PRO — PAYSTACK PAYMENT API
// ₦15,000 / WEEK

import {
  activatePro,
  getProStatus,
  getRedisConfig
} from "./credits.js";

const PAYSTACK_API = "https://api.paystack.co";

const PRO_AMOUNT = 1500000; // ₦15,000 in kobo
const PRO_CURRENCY = "NGN";
const PRO_INTERVAL = "weekly";

function send(res, status, body) {
  return res.status(status).json(body);
}

/* =========================================================
   ALWAYS CONVERT ERRORS TO TEXT
========================================================= */

function errorMessage(error, fallback) {
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  if (error?.message) {
    return String(error.message);
  }

  if (error?.error) {
    return String(error.error);
  }

  if (error?.data?.message) {
    return String(error.data.message);
  }

  return fallback;
}

/* =========================================================
   ENVIRONMENT
========================================================= */

function getSecretKey() {
  return String(
    process.env.PAYSTACK_SECRET_KEY ||
    process.env.PAYSTACK_SECRET ||
    ""
  ).trim();
}

function getPlanCode() {
  return String(
    process.env.PAYSTACK_PRO_PLAN_CODE ||
    ""
  ).trim();
}

/* =========================================================
   CLEAN VALUES
========================================================= */

function cleanReference(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._=-]/g, "");
}

function cleanUserId(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 100);
}

function cleanEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

/* =========================================================
   CREATE REFERENCE
========================================================= */

function createReference() {
  return (
    "OBITREND-" +
    Date.now().toString(36) +
    "-" +
    Math.random()
      .toString(36)
      .slice(2, 10)
  );
}

/* =========================================================
   ORIGIN
========================================================= */

function getOrigin(req) {
  const host =
    req.headers?.["x-forwarded-host"] ||
    req.headers?.host ||
    "obitrend.vercel.app";

  const proto =
    req.headers?.["x-forwarded-proto"] ||
    "https";

  return `${proto}://${host}`;
}

/* =========================================================
   PAYSTACK REQUEST
========================================================= */

async function paystackRequest(
  path,
  options = {}
) {
  const secretKey = getSecretKey();

  if (!secretKey) {
    throw new Error(
      "PAYSTACK_SECRET_KEY is missing in Vercel."
    );
  }

  const response = await fetch(
    `${PAYSTACK_API}${path}`,
    {
      ...options,

      headers: {
        Authorization:
          `Bearer ${secretKey}`,

        "Content-Type":
          "application/json",

        Accept:
          "application/json",

        ...(options.headers || {})
      }
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

/* =========================================================
   VERIFY PAYSTACK PLAN
========================================================= */

async function verifyPlan() {
  const planCode = getPlanCode();

  /*
   * If no plan code is configured,
   * allow normal one-time payment verification.
   */
  if (!planCode) {
    return {
      valid: true,
      plan: null
    };
  }

  const result =
    await paystackRequest(
      `/plan/${encodeURIComponent(planCode)}`,
      {
        method: "GET"
      }
    );

  if (
    !result.ok ||
    !result.data?.status
  ) {
    return {
      valid: false,
      error: errorMessage(
        result.data,
        "Unable to verify the OBITREND Pro Paystack plan."
      )
    };
  }

  const plan =
    result.data?.data || null;

  if (!plan) {
    return {
      valid: false,
      error:
        "Paystack returned no Pro plan information."
    };
  }

  const returnedPlanCode =
    String(
      plan.plan_code ||
      plan.planCode ||
      ""
    ).trim();

  if (
    returnedPlanCode &&
    returnedPlanCode !== planCode
  ) {
    return {
      valid: false,
      error:
        "The Paystack Pro plan code does not match."
    };
  }

  const planAmount =
    Number(plan.amount);

  if (
    !Number.isFinite(planAmount) ||
    planAmount !== PRO_AMOUNT
  ) {
    return {
      valid: false,
      error:
        "The Paystack Pro plan amount does not match ₦15,000."
    };
  }

  const planCurrency =
    String(
      plan.currency || ""
    ).toUpperCase();

  if (
    planCurrency &&
    planCurrency !== PRO_CURRENCY
  ) {
    return {
      valid: false,
      error:
        "The Paystack Pro plan currency does not match NGN."
    };
  }

  const interval =
    String(
      plan.interval || ""
    ).toLowerCase();

  if (
    interval &&
    interval !== PRO_INTERVAL
  ) {
    return {
      valid: false,
      error:
        "The Paystack Pro plan is not configured as weekly."
    };
  }

  return {
    valid: true,
    plan
  };
}

/* =========================================================
   POST — START PAYMENT
========================================================= */

async function startPayment(req, res) {
  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body || {};

    const email =
      cleanEmail(body.email);

    const userId =
      cleanUserId(
        body.userId ||
        body.obitrendUserId
      );

    if (
      !email ||
      !email.includes("@") ||
      !email.includes(".")
    ) {
      return send(res, 400, {
        success: false,
        error:
          "Please provide a valid email address."
      });
    }

    if (
      !userId ||
      userId.length < 8
    ) {
      return send(res, 400, {
        success: false,
        error:
          "A valid OBITREND user ID is required."
      });
    }

    const reference =
      createReference();

    const planCode =
      getPlanCode();

    const callbackUrl =
      `${getOrigin(req)}/`;

    const payload = {
      email,

      currency:
        PRO_CURRENCY,

      reference,

      callback_url:
        callbackUrl,

      metadata: {
        product:
          "OBITREND PRO",

        plan:
          "WEEKLY",

        userId,

        email,

        reference
      }
    };

    /*
     * If a Paystack plan code exists,
     * use the recurring weekly plan.
     */
    if (planCode) {
      payload.plan =
        planCode;
    } else {
      /*
       * Otherwise use a ₦15,000 payment.
       */
      payload.amount =
        PRO_AMOUNT;
    }

    const result =
      await paystackRequest(
        "/transaction/initialize",
        {
          method: "POST",

          body:
            JSON.stringify(payload)
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

      return send(res, 400, {
        success: false,
        error: errorMessage(
          result.data,
          "Unable to initialize Paystack payment."
        )
      });
    }

    const payment =
      result.data?.data || {};

    const paymentReference =
      cleanReference(
        payment.reference
      );

    const authorizationUrl =
      String(
        payment.authorization_url || ""
      ).trim();

    if (!authorizationUrl) {
      return send(res, 502, {
        success: false,
        error:
          "Paystack did not return a payment URL."
      });
    }

    if (
      !paymentReference ||
      paymentReference !== reference
    ) {
      return send(res, 502, {
        success: false,
        error:
          "Paystack transaction reference mismatch."
      });
    }

    return send(res, 200, {
      success: true,
      paid: false,

      reference:
        paymentReference,

      payment_reference:
        paymentReference,

      authorization_url:
        authorizationUrl,

      paymentUrl:
        authorizationUrl,

      email,

      userId,

      amount:
        PRO_AMOUNT,

      currency:
        PRO_CURRENCY,

      plan:
        planCode ||
        "₦15,000 WEEKLY"
    });

  } catch (error) {
    console.error(
      "OBITREND Paystack initialization error:",
      error
    );

    return send(res, 500, {
      success: false,
      error: errorMessage(
        error,
        "Paystack initialization failed."
      )
    });
  }
}

/* =========================================================
   GET — VERIFY PAYMENT
========================================================= */

async function verifyPayment(req, res) {
  try {
    const url =
      new URL(
        req.url,
        getOrigin(req)
      );

    const reference =
      cleanReference(
        url.searchParams.get(
          "reference"
        ) ||
        url.searchParams.get(
          "trxref"
        ) ||
        url.searchParams.get(
          "ref"
        ) ||
        url.searchParams.get(
          "transaction_reference"
        ) ||
        ""
      );

    if (!reference) {
      return send(res, 400, {
        success: false,
        paid: false,
        error:
          "Transaction reference is required."
      });
    }

    console.log(
      "OBITREND verifying Paystack:",
      reference
    );

    const result =
      await paystackRequest(
        `/transaction/verify/${encodeURIComponent(
          reference
        )}`,
        {
          method: "GET"
        }
      );

    if (
      !result.ok ||
      !result.data?.status
    ) {
      return send(res, 400, {
        success: false,
        paid: false,
        reference,
        error: errorMessage(
          result.data,
          "Paystack could not verify this transaction."
        )
      });
    }

    const transaction =
      result.data?.data || {};

    const transactionReference =
      cleanReference(
        transaction.reference
      );

    if (
      !transactionReference ||
      transactionReference !== reference
    ) {
      return send(res, 400, {
        success: false,
        paid: false,
        reference,
        error:
          "Paystack transaction reference mismatch."
      });
    }

    /* =====================================================
       PAYMENT STATUS
    ===================================================== */

    const transactionStatus =
      String(
        transaction.status || ""
      ).toLowerCase();

    if (
      transactionStatus !==
      "success"
    ) {
      return send(res, 200, {
        success: true,
        paid: false,
        reference,

        status:
          transaction.status ||
          "unknown",

        amount:
          Number(
            transaction.amount || 0
          ),

        error:
          "Payment has not been completed successfully."
      });
    }

    /* =====================================================
       AMOUNT
    ===================================================== */

    const amount =
      Number(
        transaction.amount || 0
      );

    if (
      amount !== PRO_AMOUNT
    ) {
      return send(res, 400, {
        success: false,
        paid: false,
        reference,

        amount,

        expectedAmount:
          PRO_AMOUNT,

        error:
          "The verified payment amount does not match ₦15,000."
      });
    }

    /* =====================================================
       CURRENCY
    ===================================================== */

    const currency =
      String(
        transaction.currency || ""
      ).toUpperCase();

    if (
      currency !== PRO_CURRENCY
    ) {
      return send(res, 400, {
        success: false,
        paid: false,
        reference,

        currency,

        error:
          "Payment currency is not NGN."
      });
    }

    /* =====================================================
       PLAN
    ===================================================== */

    const planResult =
      await verifyPlan();

    if (!planResult.valid) {
      return send(res, 400, {
        success: false,
        paid: false,
        reference,

        error:
          errorMessage(
            planResult.error,
            "OBITREND Pro plan verification failed."
          )
      });
    }

    /* =====================================================
       METADATA
    ===================================================== */

    const metadata =
      transaction.metadata &&
      typeof transaction.metadata === "object"
        ? transaction.metadata
        : {};

    const userId =
      cleanUserId(
        metadata.userId ||
        metadata.obitrendUserId
      );

    if (
      !userId ||
      userId.length < 8
    ) {
      return send(res, 400, {
        success: false,
        paid: false,
        reference,

        error:
          "This payment is not linked to a valid OBITREND account."
      });
    }

    /* =====================================================
       CUSTOMER EMAIL
    ===================================================== */

    const customerEmail =
      cleanEmail(
        transaction.customer?.email ||
        metadata.email ||
        ""
      );

    /* =====================================================
       REDIS
    ===================================================== */

    const redis =
      getRedisConfig();

    if (
      !redis?.url ||
      !redis?.token
    ) {
      return send(res, 500, {
        success: false,
        paid: false,
        reference,

        error:
          "OBITREND Redis configuration is missing."
      });
    }

    /* =====================================================
       CHECK EXISTING PRO
    ===================================================== */

    try {
      const existingPro =
        await getProStatus(
          userId,
          redis
        );

      if (
        existingPro?.active
      ) {
        return send(res, 200, {
          success: true,
          paid: true,
          proActive: true,
          alreadyActive: true,

          reference,

          userId,

          email:
            customerEmail,

          amount,

          currency,

          status:
            transaction.status,

          paidAt:
            transaction.paid_at ||
            null,

          proExpiresAt:
            existingPro.expiresAt
        });
      }
    } catch (statusError) {
      console.warn(
        "Existing Pro status check failed:",
        statusError
      );
    }

    /* =====================================================
       ACTIVATE PRO
    ===================================================== */

    const pro =
      await activatePro(
        userId,
        customerEmail,
        transactionReference,
        redis
      );

    console.log(
      "OBITREND PRO ACTIVATED:",
      {
        userId,
        reference:
          transactionReference,
        email:
          customerEmail,
        amount,
        currency,
        expiresAt:
          pro?.expiresAt
      }
    );

    return send(res, 200, {
      success: true,

      paid: true,

      proActive: true,

      reference:
        transactionReference,

      userId,

      email:
        customerEmail,

      amount,

      currency,

      status:
        transaction.status,

      paidAt:
        transaction.paid_at ||
        null,

      proExpiresAt:
        pro?.expiresAt || null
    });

  } catch (error) {
    console.error(
      "OBITREND Paystack verification error:",
      error
    );

    return send(res, 500, {
      success: false,
      paid: false,

      error:
        errorMessage(
          error,
          "Payment verification failed."
        )
    });
  }
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
    "https://obitrend.vercel.app"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept"
  );

  if (
    req.method === "OPTIONS"
  ) {
    return res
      .status(200)
      .end();
  }

  if (
    req.method === "POST"
  ) {
    return startPayment(
      req,
      res
    );
  }

  if (
    req.method === "GET"
  ) {
    return verifyPayment(
      req,
      res
    );
  }

  return send(res, 405, {
    success: false,
    error:
      "Method not allowed."
  });
}
