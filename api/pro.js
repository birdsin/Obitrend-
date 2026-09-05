/**
 * =========================================================
 * OBITREND PRO ENTITLEMENT API
 * =========================================================
 *
 * Paystack payment verification + Supabase authentication
 * + the SAME Pro credit system used by credits.js.
 *
 * REQUIRED VERCEL ENVIRONMENT VARIABLES:
 *
 * PAYSTACK_SECRET_KEY
 * PAYSTACK_PRO_PLAN_CODE
 *
 * AND ONE OF:
 *
 * KV_REST_API_URL
 * KV_REST_API_TOKEN
 *
 * OR:
 *
 * UPSTASH_REDIS_REST_URL
 * UPSTASH_REDIS_REST_TOKEN
 *
 * OPTIONAL:
 *
 * PAYSTACK_EXPECTED_AMOUNT
 * PAYSTACK_EXPECTED_CURRENCY
 * PAYSTACK_EXPECTED_INTERVAL
 *
 * DEFAULT:
 *
 * ₦15,000 weekly
 * 20 Pro credits
 * 7 days
 * =========================================================
 */

import {
  getRedisConfig,
  getAuthenticatedUser,
  activatePro,
  getProStatus,
} from "./credits.js";


/* =========================================================
   CONFIG
========================================================= */

const PAYSTACK_API =
  "https://api.paystack.co";

const DEFAULT_EXPECTED_AMOUNT =
  1500000;

const DEFAULT_EXPECTED_CURRENCY =
  "NGN";

const DEFAULT_EXPECTED_INTERVAL =
  "weekly";


/* =========================================================
   RESPONSE
========================================================= */

function send(
  res,
  status,
  data
) {
  return res
    .status(status)
    .json(data);
}


/* =========================================================
   HELPERS
========================================================= */

function clean(
  value,
  fallback = ""
) {
  if (
    value === undefined ||
    value === null
  ) {
    return fallback;
  }

  return String(value)
    .trim()
    .slice(0, 500);
}


function upper(value) {
  return clean(value)
    .toUpperCase();
}


function lower(value) {
  return clean(value)
    .toLowerCase();
}


/* =========================================================
   CONFIG
========================================================= */

function getConfig() {

  const redis =
    getRedisConfig();

  const paystackSecretKey =
    clean(
      process.env.PAYSTACK_SECRET_KEY
    );

  const planCode =
    clean(
      process.env.PAYSTACK_PRO_PLAN_CODE
    );

  const amountRaw =
    clean(
      process.env.PAYSTACK_EXPECTED_AMOUNT
    );

  const expectedAmount =
    amountRaw &&
    Number.isFinite(
      Number(amountRaw)
    )
      ? Number(amountRaw)
      : DEFAULT_EXPECTED_AMOUNT;

  const expectedCurrency =
    clean(
      process.env.PAYSTACK_EXPECTED_CURRENCY,
      DEFAULT_EXPECTED_CURRENCY
    );

  const expectedInterval =
    clean(
      process.env.PAYSTACK_EXPECTED_INTERVAL,
      DEFAULT_EXPECTED_INTERVAL
    );

  return {
    redis,
    paystackSecretKey,
    planCode,
    expectedAmount,
    expectedCurrency,
    expectedInterval,
  };
}


/* =========================================================
   PAYSTACK REQUEST
========================================================= */

async function paystackRequest(
  path,
  secretKey
) {

  const response =
    await fetch(
      `${PAYSTACK_API}${path}`,
      {
        method: "GET",

        headers: {
          Authorization:
            `Bearer ${secretKey}`,

          Accept:
            "application/json",
        },
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

    data,
  };
}


/* =========================================================
   VERIFY PAYSTACK PLAN
========================================================= */

async function verifyPlan(
  config
) {

  const result =
    await paystackRequest(
      `/plan/${encodeURIComponent(
        config.planCode
      )}`,
      config.paystackSecretKey
    );

  if (
    !result.ok ||
    !result.data?.status
  ) {
    return {
      valid: false,

      error:
        result.data?.message ||
        "Unable to verify the OBITREND Pro plan.",
    };
  }

  const plan =
    result.data.data;

  if (!plan) {
    return {
      valid: false,

      error:
        "Paystack returned no plan information.",
    };
  }


  /* PLAN CODE */

  const returnedPlanCode =
    clean(
      plan.plan_code ||
      plan.planCode ||
      ""
    );

  if (
    returnedPlanCode &&
    returnedPlanCode !==
      config.planCode
  ) {
    return {
      valid: false,

      error:
        "The Paystack Pro plan code does not match.",
    };
  }


  /* AMOUNT */

  const planAmount =
    Number(
      plan.amount
    );

  if (
    !Number.isFinite(
      planAmount
    ) ||
    planAmount <= 0
  ) {
    return {
      valid: false,

      error:
        "Paystack returned an invalid Pro plan amount.",
    };
  }

  if (
    planAmount !==
    config.expectedAmount
  ) {
    return {
      valid: false,

      error:
        "The Paystack Pro plan amount does not match OBITREND Pro.",
    };
  }


  /* CURRENCY */

  if (
    clean(plan.currency) &&
    upper(plan.currency) !==
      upper(
        config.expectedCurrency
      )
  ) {
    return {
      valid: false,

      error:
        "The Paystack Pro plan currency does not match OBITREND.",
    };
  }


  /* INTERVAL */

  if (
    clean(plan.interval) &&
    lower(plan.interval) !==
      lower(
        config.expectedInterval
      )
  ) {
    return {
      valid: false,

      error:
        "The Paystack Pro plan interval does not match OBITREND.",
    };
  }


  return {
    valid: true,
    plan,
  };
}


/* =========================================================
   VERIFY TRANSACTION
========================================================= */

async function verifyTransaction(
  reference,
  config
) {

  const safeReference =
    clean(reference);

  if (!safeReference) {
    return {
      success: false,
      paid: false,

      error:
        "A Paystack payment reference is required.",
    };
  }


  const result =
    await paystackRequest(
      `/transaction/verify/${encodeURIComponent(
        safeReference
      )}`,
      config.paystackSecretKey
    );


  if (
    !result.ok ||
    !result.data?.status
  ) {
    return {
      success: false,
      paid: false,

      error:
        result.data?.message ||
        "Paystack could not verify the payment.",
    };
  }


  const transaction =
    result.data.data;

  if (!transaction) {
    return {
      success: false,
      paid: false,

      error:
        "Paystack returned no transaction data.",
    };
  }


  /* =====================================================
     PAYMENT STATUS
  ===================================================== */

  if (
    lower(
      transaction.status
    ) !== "success"
  ) {
    return {
      success: false,
      paid: false,

      reference:
        transaction.reference ||
        safeReference,

      status:
        transaction.status,

      error:
        "Payment has not been completed successfully.",
    };
  }


  /* =====================================================
     CURRENCY
  ===================================================== */

  if (
    upper(
      transaction.currency
    ) !==
    upper(
      config.expectedCurrency
    )
  ) {
    return {
      success: false,
      paid: false,

      reference:
        transaction.reference ||
        safeReference,

      error:
        "Payment currency does not match OBITREND Pro.",
    };
  }


  /* =====================================================
     AMOUNT
  ===================================================== */

  const actualAmount =
    Number(
      transaction.amount
    );

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
      config.expectedAmount
    ) {
      return {
        success: false,
        paid: false,

        reference:
          transaction.reference ||
          safeReference,

        error:
          "Payment amount does not match OBITREND Pro.",
      };
    }

  } else {

    if (
      actualAmount !==
      config.expectedAmount
    ) {
      return {
        success: false,
        paid: false,

        reference:
          transaction.reference ||
          safeReference,

        error:
          "Payment amount could not be verified.",
      };
    }
  }


  /* =====================================================
     VERIFY PLAN
  ===================================================== */

  const planResult =
    await verifyPlan(
      config
    );

  if (
    !planResult.valid
  ) {
    return {
      success: false,
      paid: false,

      reference:
        transaction.reference ||
        safeReference,

      error:
        planResult.error ||
        "The OBITREND Pro plan could not be verified.",
    };
  }


  /* =====================================================
     TRANSACTION PLAN
  ===================================================== */

  let transactionPlanCode =
    "";


  if (
    typeof transaction.plan ===
    "string"
  ) {
    transactionPlanCode =
      clean(
        transaction.plan
      );
  }


  if (
    transaction.plan &&
    typeof transaction.plan ===
      "object"
  ) {
    transactionPlanCode =
      clean(
        transaction.plan.plan_code ||
        transaction.plan.planCode ||
        transaction.plan.code ||
        ""
      );
  }


  if (
    transactionPlanCode &&
    transactionPlanCode !==
      config.planCode
  ) {
    return {
      success: false,
      paid: false,

      reference:
        transaction.reference ||
        safeReference,

      error:
        "This payment is not for the configured OBITREND Pro plan.",
    };
  }


  /* =====================================================
     CUSTOMER EMAIL
  ===================================================== */

  const email =
    clean(
      transaction.customer?.email ||
      transaction.email ||
      ""
    ).toLowerCase();


  /* =====================================================
     RETURN VERIFIED PAYMENT
  ===================================================== */

  return {

    success: true,

    paid: true,

    pro: true,

    reference:
      transaction.reference ||
      safeReference,

    status:
      transaction.status,

    amount:
      actualAmount,

    requestedAmount:
      hasRequestedAmount
        ? requestedAmount
        : config.expectedAmount,

    currency:
      transaction.currency,

    email,

    paidAt:
      transaction.paid_at ||
      transaction.paidAt ||
      transaction.transaction_date ||
      transaction.created_at ||
      transaction.createdAt ||
      null,

    planCode:
      config.planCode,

    planName:
      planResult.plan?.name ||
      "OBITREND Pro",

    interval:
      planResult.plan?.interval ||
      config.expectedInterval,
  };
}


/* =========================================================
   GET STATUS
========================================================= */

async function handleGet(
  req,
  res,
  config,
  userId
) {

  const pro =
    await getProStatus(
      userId,
      config.redis
    );

  const now =
    Math.floor(
      Date.now() / 1000
    );

  let secondsRemaining =
    null;

  if (
    pro.expiresAt !== null &&
    pro.expiresAt !== undefined
  ) {
    secondsRemaining =
      Math.max(
        0,
        Number(
          pro.expiresAt
        ) - now
      );
  }


  return send(
    res,
    200,
    {
      success: true,

      proActive:
        pro.active,

      pro:
        pro.active,

      active:
        pro.active,

      expiresAt:
        pro.expiresAt,

      proExpiresAt:
        pro.expiresAt,

      proSecondsRemaining:
        secondsRemaining,

      proCredits:
        pro.proCredits,

      proCreditsTotal:
        pro.proCreditsTotal,

      credits:
        pro.proCredits,

      total:
        pro.proCreditsTotal,

      plan:
        pro.plan ||
        null,

      interval:
        pro.interval ||
        null,

      upgradeRequired:
        !pro.active ||
        pro.proCredits <= 0,
    }
  );
}


/* =========================================================
   POST — VERIFY + ACTIVATE
========================================================= */

async function handlePost(
  req,
  res,
  config,
  userId
) {

  const reference =
    clean(
      req.body?.reference
    );

  if (!reference) {
    return send(
      res,
      400,
      {
        success: false,

        error:
          "A Paystack payment reference is required.",
      }
    );
  }


  /* =====================================================
     VERIFY PAYMENT DIRECTLY WITH PAYSTACK
  ===================================================== */

  const payment =
    await verifyTransaction(
      reference,
      config
    );


  if (
    !payment.success ||
    !payment.paid
  ) {
    return send(
      res,
      402,
      {
        success: false,

        pro: false,

        error:
          payment.error ||
          "Payment verification failed.",
      }
    );
  }


  /* =====================================================
     ACTIVATE THE SAME PRO SYSTEM USED BY credits.js
  ===================================================== */

  const result =
    await activatePro(
      userId,
      payment.email,
      payment.reference,
      config.redis,
      "weekly"
    );


  /* =====================================================
     READ FINAL SERVER-SIDE STATUS
  ===================================================== */

  const status =
    await getProStatus(
      userId,
      config.redis
    );


  const now =
    Math.floor(
      Date.now() / 1000
    );


  const secondsRemaining =
    status.expiresAt === null
      ? null
      : Math.max(
          0,
          Number(
            status.expiresAt
          ) - now
        );


  return send(
    res,
    200,
    {
      success: true,

      pro: true,

      active:
        status.active,

      reference:
        payment.reference,

      email:
        payment.email,

      expiresAt:
        status.expiresAt,

      proExpiresAt:
        status.expiresAt,

      proSecondsRemaining:
        secondsRemaining,

      proCredits:
        status.proCredits,

      proCreditsTotal:
        status.proCreditsTotal,

      credits:
        status.proCredits,

      total:
        status.proCreditsTotal,

      plan:
        status.plan,

      interval:
        status.interval,

      amount:
        payment.amount,

      requestedAmount:
        payment.requestedAmount,

      currency:
        payment.currency,

      planCode:
        payment.planCode,

      planName:
        payment.planName,

      message:
        result.alreadyProcessed
          ? "OBITREND Pro payment was already activated."
          : "OBITREND Pro payment verified and activated successfully.",
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

  const config =
    getConfig();


  /* =====================================================
     CONFIG VALIDATION
  ===================================================== */

  if (
    !config.redis?.url ||
    !config.redis?.token
  ) {
    return send(
      res,
      500,
      {
        success: false,

        error:
          "Redis environment variables are missing in Vercel.",
      }
    );
  }


  if (
    !config.paystackSecretKey
  ) {
    return send(
      res,
      500,
      {
        success: false,

        error:
          "PAYSTACK_SECRET_KEY is missing in Vercel.",
      }
    );
  }


  if (
    !config.planCode
  ) {
    return send(
      res,
      500,
      {
        success: false,

        error:
          "PAYSTACK_PRO_PLAN_CODE is missing in Vercel.",
      }
    );
  }


  try {

    /* =================================================
       AUTHENTICATE THE ACTUAL SUPABASE USER
    ================================================= */

    const auth =
      await getAuthenticatedUser(
        req
      );


    if (
      !auth?.ok ||
      !auth?.user?.id
    ) {
      return send(
        res,
        auth?.status || 401,
        {
          success: false,

          error:
            auth?.error ||
            "Please sign in again.",
        }
      );
    }


    const userId =
      auth.user.id;


    /* =================================================
       GET
    ================================================= */

    if (
      req.method === "GET"
    ) {
      return await handleGet(
        req,
        res,
        config,
        userId
      );
    }


    /* =================================================
       POST
    ================================================= */

    if (
      req.method === "POST"
    ) {
      return await handlePost(
        req,
        res,
        config,
        userId
      );
    }


    /* =================================================
       METHOD NOT ALLOWED
    ================================================= */

    res.setHeader(
      "Allow",
      "GET, POST"
    );

    return send(
      res,
      405,
      {
        success: false,

        error:
          "Method not allowed.",
      }
    );

  } catch (error) {

    console.error(
      "OBITREND Pro entitlement error:",
      error
    );

    return send(
      res,
      500,
      {
        success: false,

        error:
          "Unable to process OBITREND Pro entitlement right now.",
      }
    );
  }
}
