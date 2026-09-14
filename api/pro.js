/**
 * =========================================================
 * OBITREND PRO ENTITLEMENT API
 * =========================================================
 *
 * SECURE PAYSTACK PAYMENT VERIFICATION
 * + SUPABASE AUTHENTICATION
 * + WEEKLY / MONTHLY PRO DETECTION
 * + SAME CREDIT SYSTEM USED BY credits.js
 *
 * PAYSTACK ENVIRONMENT VARIABLES:
 *
 * REQUIRED:
 *
 * PAYSTACK_SECRET_KEY
 * PAYSTACK_WEEKLY_PLAN_CODE
 * PAYSTACK_MONTHLY_PLAN_CODE
 *
 * REDIS:
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
 * PAYSTACK_EXPECTED_CURRENCY
 *
 * PAYSTACK_WEEKLY_EXPECTED_AMOUNT
 * PAYSTACK_WEEKLY_EXPECTED_INTERVAL
 *
 * PAYSTACK_MONTHLY_EXPECTED_AMOUNT
 * PAYSTACK_MONTHLY_EXPECTED_INTERVAL
 *
 * DEFAULTS:
 *
 * WEEKLY:
 * ₦15,000
 * 20 credits
 * 7 days
 *
 * MONTHLY:
 * ₦60,000
 * 30 credits
 * 30 credits
 *
 * IMPORTANT:
 *
 * The browser NEVER decides which Pro plan a user receives.
 *
 * Paystack's verified plan/amount/interval determines the
 * server-side OBITREND plan.
 * =========================================================
 */

import {
  getRedisConfig,
  getAuthenticatedUser,
  activatePro,
  getProStatus,
} from "../lib/credits.js";


/* =========================================================
   PAYSTACK
========================================================= */

const PAYSTACK_API =
  "https://api.paystack.co";


/* =========================================================
   DEFAULTS
========================================================= */

const DEFAULT_CURRENCY =
  "NGN";


const DEFAULT_WEEKLY_AMOUNT =
  1500000;


const DEFAULT_WEEKLY_INTERVAL =
  "weekly";


const DEFAULT_MONTHLY_AMOUNT =
  6000000;


const DEFAULT_MONTHLY_INTERVAL =
  "monthly";


/*
 * Idempotency protection.
 *
 * A successful Paystack reference should never be allowed
 * to repeatedly grant Pro credits.
 *
 * 90 days is deliberately longer than the weekly plan and
 * monthly plan durations.
 */
const PROCESSED_REFERENCE_TTL =
  90 * 24 * 60 * 60;


/*
 * Short lock used while one payment is being processed.
 */
const PROCESSING_REFERENCE_TTL =
  120;


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
   BASIC HELPERS
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


function safeNumber(
  value,
  fallback = 0
) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}


/* =========================================================
   PLAN CONFIGURATION
========================================================= */

function getConfig() {

  const redis =
    getRedisConfig();


  const paystackSecretKey =
    clean(
      process.env.PAYSTACK_SECRET_KEY
    );


  /*
   * NEW CORRECT PLAN VARIABLES
   */

  const weeklyPlanCode =
    clean(
      process.env.PAYSTACK_WEEKLY_PLAN_CODE
    );


  const monthlyPlanCode =
    clean(
      process.env.PAYSTACK_MONTHLY_PLAN_CODE
    );


  /*
   * Backwards compatibility only.
   *
   * The old PAYSTACK_PRO_PLAN_CODE is NOT used to decide
   * Monthly vs Weekly.
   *
   * If the new weekly variable is missing, the old variable
   * may temporarily act as the weekly code.
   */

  const legacyPlanCode =
    clean(
      process.env.PAYSTACK_PRO_PLAN_CODE
    );


  const finalWeeklyPlanCode =
    weeklyPlanCode ||
    legacyPlanCode;


  const currency =
    clean(
      process.env.PAYSTACK_EXPECTED_CURRENCY,
      DEFAULT_CURRENCY
    );


  /*
   * WEEKLY
   */

  const weeklyAmountRaw =
    clean(
      process.env.PAYSTACK_WEEKLY_EXPECTED_AMOUNT
    );


  const legacyAmountRaw =
    clean(
      process.env.PAYSTACK_EXPECTED_AMOUNT
    );


  const weeklyAmount =
    weeklyAmountRaw &&
    Number.isFinite(
      Number(weeklyAmountRaw)
    )
      ? Number(weeklyAmountRaw)
      : legacyAmountRaw &&
        Number.isFinite(
          Number(legacyAmountRaw)
        )
        ? Number(legacyAmountRaw)
        : DEFAULT_WEEKLY_AMOUNT;


  const weeklyInterval =
    clean(
      process.env.PAYSTACK_WEEKLY_EXPECTED_INTERVAL,
      clean(
        process.env.PAYSTACK_EXPECTED_INTERVAL,
        DEFAULT_WEEKLY_INTERVAL
      )
    );


  /*
   * MONTHLY
   */

  const monthlyAmountRaw =
    clean(
      process.env.PAYSTACK_MONTHLY_EXPECTED_AMOUNT
    );


  const monthlyAmount =
    monthlyAmountRaw &&
    Number.isFinite(
      Number(monthlyAmountRaw)
    )
      ? Number(monthlyAmountRaw)
      : DEFAULT_MONTHLY_AMOUNT;


  const monthlyInterval =
    clean(
      process.env.PAYSTACK_MONTHLY_EXPECTED_INTERVAL,
      DEFAULT_MONTHLY_INTERVAL
    );


  return {

    redis,

    paystackSecretKey,

    currency,

    weekly: {
      planCode:
        finalWeeklyPlanCode,

      amount:
        weeklyAmount,

      interval:
        weeklyInterval,

      obitrendPlan:
        "PRO_WEEKLY",
    },

    monthly: {
      planCode:
        monthlyPlanCode,

      amount:
        monthlyAmount,

      interval:
        monthlyInterval,

      obitrendPlan:
        "PRO_MONTHLY",
    },
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
   REDIS REQUEST
========================================================= */

async function redisCommand(
  redis,
  command
) {

  if (
    !redis?.url ||
    !redis?.token
  ) {
    throw new Error(
      "Redis configuration unavailable."
    );
  }


  const response =
    await fetch(
      `${redis.url}/${command
        .map(
          encodeURIComponent
        )
        .join("/")}`,
      {
        method: "GET",

        headers: {
          Authorization:
            `Bearer ${redis.token}`,
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


  if (
    !response.ok ||
    !data ||
    data.error
  ) {

    throw new Error(
      data?.error ||
      "Redis request failed."
    );
  }


  return data.result;
}


/* =========================================================
   PAYMENT REFERENCE KEYS
========================================================= */

function processedReferenceKey(
  userId,
  reference
) {

  return (
    `obitrend:payment:processed:` +
    `${userId}:` +
    `${reference}`
  );
}


function processingReferenceKey(
  userId,
  reference
) {

  return (
    `obitrend:payment:processing:` +
    `${userId}:` +
    `${reference}`
  );
}


/* =========================================================
   READ STORED PRO REFERENCE
========================================================= */

async function getStoredProReference(
  userId,
  redis
) {

  try {

    const result =
      await redisCommand(
        redis,
        [
          "GET",
          `obitrend:pro:reference:${userId}`,
        ]
      );


    return clean(result);

  } catch {

    return "";
  }
}


/* =========================================================
   CHECK PROCESSED PAYMENT
========================================================= */

async function isProcessedPayment(
  userId,
  reference,
  redis
) {

  try {

    const result =
      await redisCommand(
        redis,
        [
          "GET",
          processedReferenceKey(
            userId,
            reference
          ),
        ]
      );


    return Boolean(
      clean(result)
    );

  } catch {

    return false;
  }
}


/* =========================================================
   CLAIM PROCESSING LOCK
========================================================= */

async function claimProcessingLock(
  userId,
  reference,
  redis
) {

  try {

    const result =
      await redisCommand(
        redis,
        [
          "SET",
          processingReferenceKey(
            userId,
            reference
          ),
          "processing",
          "NX",
          "EX",
          String(
            PROCESSING_REFERENCE_TTL
          ),
        ]
      );


    return (
      result === "OK" ||
      result === true ||
      result === 1
    );

  } catch (error) {

    console.error(
      "OBITREND payment lock error:",
      error
    );

    /*
     * Do not silently bypass Redis idempotency.
     */
    throw new Error(
      "Payment protection service is temporarily unavailable."
    );
  }
}


/* =========================================================
   RELEASE PROCESSING LOCK
========================================================= */

async function releaseProcessingLock(
  userId,
  reference,
  redis
) {

  try {

    await redisCommand(
      redis,
      [
        "DEL",
        processingReferenceKey(
          userId,
          reference
        ),
      ]
    );

  } catch (error) {

    console.error(
      "OBITREND payment lock release error:",
      error
    );
  }
}


/* =========================================================
   MARK PAYMENT PROCESSED
========================================================= */

async function markPaymentProcessed(
  userId,
  reference,
  plan,
  redis
) {

  await redisCommand(
    redis,
    [
      "SET",
      processedReferenceKey(
        userId,
        reference
      ),
      plan,
      "EX",
      String(
        PROCESSED_REFERENCE_TTL
      ),
    ]
  );
}


/* =========================================================
   VERIFY PAYSTACK PLAN
========================================================= */

async function verifyPaystackPlan(
  planConfig,
  config
) {

  if (
    !planConfig?.planCode
  ) {

    return {
      valid: false,

      error:
        "This OBITREND Paystack plan code is missing.",
    };
  }


  const result =
    await paystackRequest(
      `/plan/${encodeURIComponent(
        planConfig.planCode
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
        "Unable to verify the Paystack plan.",
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


  /*
   * PLAN CODE
   */

  const returnedPlanCode =
    clean(
      plan.plan_code ||
      plan.planCode ||
      ""
    );


  if (
    returnedPlanCode !==
    planConfig.planCode
  ) {

    return {
      valid: false,

      error:
        "The Paystack plan code does not match OBITREND.",
    };
  }


  /*
   * AMOUNT
   */

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
        "Paystack returned an invalid plan amount.",
    };
  }


  if (
    planAmount !==
    Number(planConfig.amount)
  ) {

    return {
      valid: false,

      error:
        "The Paystack plan amount does not match the OBITREND plan.",
    };
  }


  /*
   * CURRENCY
   */

  if (
    upper(plan.currency) !==
    upper(config.currency)
  ) {

    return {
      valid: false,

      error:
        "The Paystack plan currency does not match OBITREND.",
    };
  }


  /*
   * INTERVAL
   */

  if (
    lower(plan.interval) !==
    lower(planConfig.interval)
  ) {

    return {
      valid: false,

      error:
        "The Paystack plan interval does not match OBITREND.",
    };
  }


  return {

    valid: true,

    plan,
  };
}


/* =========================================================
   VERIFY BOTH OBITREND PAYSTACK PLANS
========================================================= */

async function verifyAllPlans(
  config
) {

  const weeklyResult =
    await verifyPaystackPlan(
      config.weekly,
      config
    );


  if (
    !weeklyResult.valid
  ) {

    return {
      valid: false,

      error:
        `Weekly Pro configuration error: ` +
        `${weeklyResult.error}`,
    };
  }


  const monthlyResult =
    await verifyPaystackPlan(
      config.monthly,
      config
    );


  if (
    !monthlyResult.valid
  ) {

    return {
      valid: false,

      error:
        `Monthly Pro configuration error: ` +
        `${monthlyResult.error}`,
    };
  }


  return {

    valid: true,

    weekly: weeklyResult.plan,

    monthly: monthlyResult.plan,
  };
}


/* =========================================================
   GET TRANSACTION PLAN CODE
========================================================= */

function getTransactionPlanCode(
  transaction
) {

  if (
    typeof transaction?.plan ===
    "string"
  ) {

    return clean(
      transaction.plan
    );
  }


  if (
    transaction?.plan &&
    typeof transaction.plan ===
      "object"
  ) {

    return clean(
      transaction.plan.plan_code ||
      transaction.plan.planCode ||
      transaction.plan.code ||
      ""
    );
  }


  /*
   * Newer Paystack responses may expose plan_object.
   */

  if (
    transaction?.plan_object &&
    typeof transaction.plan_object ===
      "object"
  ) {

    return clean(
      transaction.plan_object.plan_code ||
      transaction.plan_object.planCode ||
      transaction.plan_object.code ||
      ""
    );
  }


  return "";
}


/* =========================================================
   DETERMINE WHICH OBITREND PLAN WAS PAID FOR
========================================================= */

function determinePaidPlan(
  transaction,
  config,
  weeklyPlan,
  monthlyPlan
) {

  const transactionPlanCode =
    getTransactionPlanCode(
      transaction
    );


  /*
   * BEST CASE:
   *
   * Paystack tells us the exact plan code.
   */

  if (
    transactionPlanCode
  ) {

    if (
      transactionPlanCode ===
      config.weekly.planCode
    ) {

      return {
        ok: true,

        plan:
          "PRO_WEEKLY",

        planCode:
          config.weekly.planCode,

        planData:
          weeklyPlan,
      };
    }


    if (
      transactionPlanCode ===
      config.monthly.planCode
    ) {

      return {
        ok: true,

        plan:
          "PRO_MONTHLY",

        planCode:
          config.monthly.planCode,

        planData:
          monthlyPlan,
      };
    }


    return {
      ok: false,

      error:
        "This Paystack payment belongs to an unknown plan.",
    };
  }


  /*
   * FALLBACK:
   *
   * Some Paystack transaction responses can have plan:null.
   *
   * In that case identify the plan from the verified
   * amount + currency + interval.
   */

  const amount =
    Number(
      transaction.amount
    );


  const requestedAmount =
    Number(
      transaction.requested_amount
    );


  const effectiveAmount =
    Number.isFinite(amount) &&
    amount > 0
      ? amount
      : requestedAmount;


  const currency =
    upper(
      transaction.currency
    );


  const weeklyMatches =
    effectiveAmount ===
      Number(config.weekly.amount) &&
    currency ===
      upper(config.currency);


  const monthlyMatches =
    effectiveAmount ===
      Number(config.monthly.amount) &&
    currency ===
      upper(config.currency);


  if (
    weeklyMatches &&
    !monthlyMatches
  ) {

    return {
      ok: true,

      plan:
        "PRO_WEEKLY",

      planCode:
        config.weekly.planCode,

      planData:
        weeklyPlan,
    };
  }


  if (
    monthlyMatches &&
    !weeklyMatches
  ) {

    return {
      ok: true,

      plan:
        "PRO_MONTHLY",

      planCode:
        config.monthly.planCode,

      planData:
        monthlyPlan,
    };
  }


  return {
    ok: false,

    error:
      "The Paystack payment could not be matched to a valid OBITREND Pro plan.",
  };
}


/* =========================================================
   VERIFY TRANSACTION
========================================================= */

async function verifyTransaction(
  reference,
  config,
  expectedEmail
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
      config.currency
    )
  ) {

    return {
      success: false,

      paid: false,

      reference:
        transaction.reference ||
        safeReference,

      error:
        "Payment currency does not match OBITREND.",
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


  const hasActualAmount =
    Number.isFinite(
      actualAmount
    ) &&
    actualAmount > 0;


  const hasRequestedAmount =
    Number.isFinite(
      requestedAmount
    ) &&
    requestedAmount > 0;


  if (
    !hasActualAmount
  ) {

    return {
      success: false,

      paid: false,

      reference:
        transaction.reference ||
        safeReference,

      error:
        "Paystack returned an invalid payment amount.",
    };
  }


  /*
   * IMPORTANT:
   *
   * We do NOT compare the amount against only the weekly
   * amount anymore.
   *
   * Weekly and Monthly are matched separately below.
   */


  /* =====================================================
     VERIFY BOTH PAYSTACK PLANS
  ===================================================== */

  const plans =
    await verifyAllPlans(
      config
    );


  if (
    !plans.valid
  ) {

    return {
      success: false,

      paid: false,

      reference:
        transaction.reference ||
        safeReference,

      error:
        plans.error,
    };
  }


  /* =====================================================
     DETERMINE PAID PLAN
  ===================================================== */

  const paidPlan =
    determinePaidPlan(
      transaction,
      config,
      plans.weekly,
      plans.monthly
    );


  if (
    !paidPlan.ok
  ) {

    return {
      success: false,

      paid: false,

      reference:
        transaction.reference ||
        safeReference,

      error:
        paidPlan.error,
    };
  }


  /* =====================================================
     EXACT AMOUNT VALIDATION
  ===================================================== */

  if (
    actualAmount !==
    Number(
      paidPlan.plan ===
        "PRO_MONTHLY"
        ? config.monthly.amount
        : config.weekly.amount
    )
  ) {

    return {
      success: false,

      paid: false,

      reference:
        transaction.reference ||
        safeReference,

      error:
        "The payment amount does not match the verified OBITREND plan.",
    };
  }


  /*
   * If Paystack provides requested_amount, make sure it
   * isn't trying to hide a different requested amount.
   */

  if (
    hasRequestedAmount &&
    requestedAmount !== actualAmount
  ) {

    /*
     * Subscription-plan transactions can have Paystack
     * response differences depending on initialization.
     *
     * We only reject if requested amount is neither the
     * selected plan amount nor zero.
     */

    const selectedAmount =
      paidPlan.plan ===
        "PRO_MONTHLY"
        ? Number(config.monthly.amount)
        : Number(config.weekly.amount);


    if (
      requestedAmount !==
      selectedAmount
    ) {

      return {
        success: false,

        paid: false,

        reference:
          transaction.reference ||
          safeReference,

        error:
          "The requested payment amount does not match the verified OBITREND plan.",
      };
    }
  }


  /* =====================================================
     CUSTOMER EMAIL
  ===================================================== */

  const paymentEmail =
    clean(
      transaction.customer?.email ||
      transaction.email ||
      ""
    ).toLowerCase();


  const userEmail =
    clean(
      expectedEmail
    ).toLowerCase();


  if (
    !paymentEmail ||
    !paymentEmail.includes("@")
  ) {

    return {
      success: false,

      paid: false,

      reference:
        transaction.reference ||
        safeReference,

      error:
        "Paystack did not return a valid customer email.",
    };
  }


  /*
   * PAYMENT MUST BELONG TO THE AUTHENTICATED OBITREND
   * ACCOUNT.
   */

  if (
    userEmail &&
    paymentEmail !== userEmail
  ) {

    return {
      success: false,

      paid: false,

      reference:
        transaction.reference ||
        safeReference,

      error:
        "This payment email does not match the signed-in OBITREND account.",
    };
  }


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
        : actualAmount,

    currency:
      transaction.currency,

    email:
      paymentEmail,

    paidAt:
      transaction.paid_at ||
      transaction.paidAt ||
      transaction.transaction_date ||
      transaction.created_at ||
      transaction.createdAt ||
      null,

    plan:
      paidPlan.plan,

    planCode:
      paidPlan.planCode,

    planName:
      paidPlan.planData?.name ||
      (
        paidPlan.plan ===
          "PRO_MONTHLY"
          ? "OBITREND Monthly Pro"
          : "OBITREND Weekly Pro"
      ),

    interval:
      paidPlan.planData?.interval ||
      (
        paidPlan.plan ===
          "PRO_MONTHLY"
          ? config.monthly.interval
          : config.weekly.interval
      ),
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


  const isMonthly =
    pro.active === true &&
    upper(pro.plan) ===
      "PRO_MONTHLY";


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

      /*
       * SERVER-SIDE MONTHLY ENTITLEMENT
       */

      monthlyPro:
        isMonthly,

      fullPro:
        isMonthly,

      advancedFeatures:
        isMonthly,

      advancedCamera:
        isMonthly,

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
  userId,
  userEmail
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
     CHECK EXISTING ACTIVATION FIRST
  ===================================================== */

  const storedReference =
    await getStoredProReference(
      userId,
      config.redis
    );


  if (
    storedReference &&
    storedReference ===
      reference
  ) {

    const existingStatus =
      await getProStatus(
        userId,
        config.redis
      );


    return send(
      res,
      200,
      {

        success: true,

        pro: true,

        active:
          existingStatus.active,

        alreadyProcessed:
          true,

        reference,

        expiresAt:
          existingStatus.expiresAt,

        proExpiresAt:
          existingStatus.expiresAt,

        proCredits:
          existingStatus.proCredits,

        proCreditsTotal:
          existingStatus.proCreditsTotal,

        credits:
          existingStatus.proCredits,

        total:
          existingStatus.proCreditsTotal,

        plan:
          existingStatus.plan,

        interval:
          existingStatus.interval,

        monthlyPro:
          upper(
            existingStatus.plan
          ) === "PRO_MONTHLY",

        message:
          "OBITREND Pro payment was already activated.",
      }
    );
  }


  /* =====================================================
     CHECK LONG-TERM PROCESSED PAYMENT RECORD
  ===================================================== */

  const processed =
    await isProcessedPayment(
      userId,
      reference,
      config.redis
    );


  if (
    processed
  ) {

    const existingStatus =
      await getProStatus(
        userId,
        config.redis
      );


    return send(
      res,
      200,
      {

        success: true,

        pro:
          existingStatus.active,

        active:
          existingStatus.active,

        alreadyProcessed:
          true,

        reference,

        expiresAt:
          existingStatus.expiresAt,

        proExpiresAt:
          existingStatus.expiresAt,

        proCredits:
          existingStatus.proCredits,

        proCreditsTotal:
          existingStatus.proCreditsTotal,

        credits:
          existingStatus.proCredits,

        total:
          existingStatus.proCreditsTotal,

        plan:
          existingStatus.plan,

        interval:
          existingStatus.interval,

        monthlyPro:
          upper(
            existingStatus.plan
          ) === "PRO_MONTHLY",

        message:
          "This Paystack payment has already been processed.",
      }
    );
  }


  /* =====================================================
     VERIFY PAYMENT DIRECTLY WITH PAYSTACK
  ===================================================== */

  const payment =
    await verifyTransaction(
      reference,
      config,
      userEmail
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
     CLAIM SHORT PROCESSING LOCK
  ===================================================== */

  const lockAcquired =
    await claimProcessingLock(
      userId,
      payment.reference,
      config.redis
    );


  if (
    !lockAcquired
  ) {

    return send(
      res,
      409,
      {

        success: false,

        pro: false,

        processing: true,

        reference:
          payment.reference,

        error:
          "This payment is already being processed. Please wait a moment and check your Pro status again.",
      }
    );
  }


  try {

    /* ===================================================
       ACTIVATE CORRECT SERVER-SIDE PLAN
    =================================================== */

    const result =
      await activatePro(
        userId,

        payment.email,

        payment.reference,

        config.redis,

        payment.plan
      );


    /* ===================================================
       MARK REFERENCE AS PROCESSED
    =================================================== */

    await markPaymentProcessed(
      userId,
      payment.reference,
      payment.plan,
      config.redis
    );


    /* ===================================================
       READ FINAL SERVER-SIDE STATUS
    =================================================== */

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


    const monthlyPro =
      status.active === true &&
      upper(status.plan) ===
        "PRO_MONTHLY";


    return send(
      res,
      200,
      {

        success: true,

        ok: true,

        pro: true,

        active:
          status.active,

        alreadyProcessed:
          false,

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

        monthlyPro,

        fullPro:
          monthlyPro,

        advancedFeatures:
          monthlyPro,

        advancedCamera:
          monthlyPro,

        result,

        message:
          monthlyPro
            ? "OBITREND Monthly Pro payment verified and activated successfully."
            : "OBITREND Weekly Pro payment verified and activated successfully.",
      }
    );

  } catch (error) {

    /*
     * IMPORTANT:
     *
     * Do NOT mark the payment processed if activation failed.
     *
     * The user can safely retry verification.
     */

    console.error(
      "OBITREND Pro activation error:",
      error
    );


    return send(
      res,
      500,
      {

        success: false,

        pro: false,

        reference:
          payment.reference,

        error:
          "Payment was verified, but Pro activation could not be completed. Please retry verification.",
      }
    );

  } finally {

    await releaseProcessingLock(
      userId,
      payment.reference,
      config.redis
    );
  }
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
     REDIS VALIDATION
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


  /* =====================================================
     PAYSTACK SECRET
  ===================================================== */

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


  /* =====================================================
     WEEKLY PLAN CODE
  ===================================================== */

  if (
    !config.weekly.planCode
  ) {

    return send(
      res,
      500,
      {

        success: false,

        error:
          "PAYSTACK_WEEKLY_PLAN_CODE is missing in Vercel.",
      }
    );
  }


  /* =====================================================
     MONTHLY PLAN CODE
  ===================================================== */

  if (
    !config.monthly.planCode
  ) {

    return send(
      res,
      500,
      {

        success: false,

        error:
          "PAYSTACK_MONTHLY_PLAN_CODE is missing in Vercel.",
      }
    );
  }


  try {

    /* ===================================================
       AUTHENTICATE REAL SUPABASE USER
    =================================================== */

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


    const userEmail =
      clean(
        auth.user.email
      ).toLowerCase();


    /* ===================================================
       GET
    =================================================== */

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


    /* ===================================================
       POST
    =================================================== */

    if (
      req.method === "POST"
    ) {

      return await handlePost(
        req,
        res,
        config,
        userId,
        userEmail
      );
    }


    /* ===================================================
       METHOD NOT ALLOWED
    =================================================== */

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
