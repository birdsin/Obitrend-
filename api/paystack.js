import {
  activatePro,
  getAuthenticatedUser,
  getRedisConfig,
} from "./credits.js";

/* =========================================================
   OBITREND PAYSTACK PAYMENT API
   SECURE SERVER-SIDE PAYMENT VERIFICATION

   SECURITY RULES
   ---------------------------------------------------------
   - Client can choose ONLY the plan
   - Server controls amount
   - Server controls credits
   - Server controls duration
   - Server controls tier
   - Server controls currency
   - Server uses authenticated Supabase user
   - Credits are NEVER added before Paystack verification
   - Each Paystack reference can be redeemed only once
========================================================= */

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "1mb",
    },
  },
};

const PAYSTACK_API = "https://api.paystack.co";

const APP_URL =
  process.env.APP_URL ||
  "https://obitrend.vercel.app";

const CURRENCY = "NGN";

/* =========================================================
   SERVER-CONTROLLED PLANS
========================================================= */

const PLANS = {
  PRO_4_DAY: {
    name: "4 Days",
    amount: 1000000,
    credits: 5,
    durationDays: 4,
    tier: "pro",
  },

  PRO_8_DAY: {
    name: "8 Days",
    amount: 2000000,
    credits: 10,
    durationDays: 8,
    tier: "pro",
  },

  PRO_14_DAY: {
    name: "14 Days",
    amount: 3000000,
    credits: 15,
    durationDays: 14,
    tier: "pro",
  },

  PRO_MONTHLY: {
    name: "Monthly",
    amount: 6000000,
    credits: 30,
    durationDays: 30,
    tier: "pro",
  },
};

/* =========================================================
   HELPERS
========================================================= */

function json(res, status, data) {
  return res.status(status).json(data);
}

function clean(value, max = 200) {
  if (
    value === undefined ||
    value === null
  ) {
    return "";
  }

  return String(value)
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, max);
}

function normalizePlan(value) {
  return clean(value, 50).toUpperCase();
}

function normalizeEmail(email) {
  return clean(email, 320).toLowerCase();
}

function getPlan(plan) {
  const key = normalizePlan(plan);

  return {
    key,
    config: PLANS[key] || null,
  };
}

function createReference(planKey) {
  const timestamp = Date.now();

  const random = Math.random()
    .toString(36)
    .slice(2, 12)
    .toUpperCase();

  return `OBITREND-${planKey}-${timestamp}-${random}`;
}

function extractPlanFromReference(reference) {
  const match = String(reference || "").match(
    /^OBITREND-(PRO_4_DAY|PRO_8_DAY|PRO_14_DAY|PRO_MONTHLY)-/
  );

  return match ? match[1] : null;
}

function safePaymentError() {
  return "Payment could not be verified. No credits were added.";
}

/* =========================================================
   PAYSTACK API REQUEST
========================================================= */

async function paystackRequest(path, options = {}) {
  const secret =
    process.env.PAYSTACK_SECRET_KEY;

  if (!secret) {
    throw new Error(
      "PAYSTACK_SECRET_KEY is not configured."
    );
  }

  const response = await fetch(
    `${PAYSTACK_API}${path}`,
    {
      ...options,

      headers: {
        Authorization:
          `Bearer ${secret}`,

        "Content-Type":
          "application/json",

        ...(options.headers || {}),
      },
    }
  );

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(
      data?.message ||
      "Paystack request failed."
    );
  }

  if (
    data &&
    data.status === false
  ) {
    throw new Error(
      data.message ||
      "Paystack request failed."
    );
  }

  return data;
}

/* =========================================================
   INITIALIZE PAYMENT
========================================================= */

async function initializePayment(
  email,
  planKey,
  plan
) {
  const reference =
    createReference(planKey);

  const callbackUrl =
    `${APP_URL}/?payment=success&reference=${encodeURIComponent(
      reference
    )}`;

  const payload = {
    email,

    amount:
      plan.amount,

    currency:
      CURRENCY,

    reference,

    callback_url:
      callbackUrl,

    metadata: {
      app:
        "OBITREND",

      product:
        "OBITREND AI Fashion Creator",

      plan:
        planKey,

      plan_name:
        plan.name,

      credits:
        plan.credits,

      duration_days:
        plan.durationDays,

      tier:
        plan.tier,

      customer_email:
        email,
    },
  };

  const result =
    await paystackRequest(
      "/transaction/initialize",
      {
        method: "POST",

        body:
          JSON.stringify(payload),
      }
    );

  if (
    !result?.status ||
    !result?.data?.authorization_url ||
    !result?.data?.reference
  ) {
    throw new Error(
      "Paystack returned an invalid payment initialization response."
    );
  }

  if (
    result.data.reference !==
    reference
  ) {
    throw new Error(
      "Paystack reference validation failed."
    );
  }

  return {
    authorizationUrl:
      result.data.authorization_url,

    accessCode:
      result.data.access_code ||
      null,

    reference:
      result.data.reference,

    plan:
      planKey,

    planName:
      plan.name,

    amount:
      plan.amount,

    currency:
      CURRENCY,

    credits:
      plan.credits,

    durationDays:
      plan.durationDays,
  };
}

/* =========================================================
   VERIFY PAYSTACK TRANSACTION
========================================================= */

async function verifyTransaction(
  reference,
  authenticatedEmail
) {
  const cleanReference =
    clean(reference, 150);

  if (!cleanReference) {
    throw new Error(
      "Payment reference is required."
    );
  }

  const planKey =
    extractPlanFromReference(
      cleanReference
    );

  if (!planKey) {
    throw new Error(
      "Invalid OBITREND payment reference."
    );
  }

  const plan =
    PLANS[planKey];

  if (!plan) {
    throw new Error(
      "Invalid OBITREND payment package."
    );
  }

  const result =
    await paystackRequest(
      `/transaction/verify/${encodeURIComponent(
        cleanReference
      )}`,
      {
        method: "GET",
      }
    );

  const transaction =
    result?.data;

  if (!transaction) {
    throw new Error(
      "Paystack returned no transaction data."
    );
  }

  /* -------------------------------------------------------
     PAYMENT STATUS
  ------------------------------------------------------- */

  if (
    String(
      transaction.status || ""
    ).toLowerCase() !==
    "success"
  ) {
    throw new Error(
      "Payment has not been completed."
    );
  }

  /* -------------------------------------------------------
     EXACT REFERENCE
  ------------------------------------------------------- */

  if (
    String(
      transaction.reference || ""
    ) !== cleanReference
  ) {
    throw new Error(
      "Payment reference mismatch."
    );
  }

  /* -------------------------------------------------------
     EXACT CURRENCY
  ------------------------------------------------------- */

  if (
    String(
      transaction.currency || ""
    ).toUpperCase() !==
    CURRENCY
  ) {
    throw new Error(
      "Payment currency mismatch."
    );
  }

  /* -------------------------------------------------------
     EXACT AMOUNT
  ------------------------------------------------------- */

  const paidAmount =
    Number(transaction.amount);

  if (
    !Number.isSafeInteger(
      paidAmount
    ) ||
    paidAmount !==
    plan.amount
  ) {
    throw new Error(
      "Payment amount does not match the selected package."
    );
  }

  /* -------------------------------------------------------
     AUTHENTICATED CUSTOMER EMAIL
  ------------------------------------------------------- */

  const paidEmail =
    normalizeEmail(
      transaction.customer?.email ||
      transaction.metadata?.customer_email ||
      ""
    );

  const authenticatedEmailNormalized =
    normalizeEmail(
      authenticatedEmail
    );

  if (
    !paidEmail ||
    !authenticatedEmailNormalized ||
    paidEmail !==
    authenticatedEmailNormalized
  ) {
    throw new Error(
      "Payment customer does not match the signed-in account."
    );
  }

  /* -------------------------------------------------------
     METADATA VALIDATION
  ------------------------------------------------------- */

  let metadata =
    transaction.metadata ||
    {};

  if (
    typeof metadata ===
    "string"
  ) {
    try {
      metadata =
        JSON.parse(metadata);
    } catch {
      metadata = {};
    }
  }

  if (
    metadata.plan &&
    normalizePlan(
      metadata.plan
    ) !== planKey
  ) {
    throw new Error(
      "Payment package metadata mismatch."
    );
  }

  if (
    metadata.credits !==
    undefined &&
    Number(
      metadata.credits
    ) !==
    plan.credits
  ) {
    throw new Error(
      "Payment credit metadata mismatch."
    );
  }

  if (
    metadata.duration_days !==
    undefined &&
    Number(
      metadata.duration_days
    ) !==
    plan.durationDays
  ) {
    throw new Error(
      "Payment duration metadata mismatch."
    );
  }

  if (
    metadata.tier &&
    clean(
      metadata.tier
    ).toLowerCase() !==
    plan.tier
  ) {
    throw new Error(
      "Payment tier metadata mismatch."
    );
  }

  return {
    reference:
      cleanReference,

    planKey,

    plan,

    transaction,
  };
}

/* =========================================================
   CLAIM PAYMENT REFERENCE
========================================================= */

async function claimPaymentReference(
  redis,
  reference,
  userId
) {
  const key =
    `obitrend:paystack:redeemed:${reference}`;

  const result =
    await redis.set(
      key,
      userId,
      {
        nx: true,
        ex: 31536000,
      }
    );

  return {
    claimed:
      result === "OK",

    key,
  };
}

/* =========================================================
   GET REDEEMED REFERENCE OWNER
========================================================= */

async function getRedeemedOwner(
  redis,
  reference
) {
  const key =
    `obitrend:paystack:redeemed:${reference}`;

  return await redis.get(key);
}

/* =========================================================
   RELEASE PAYMENT CLAIM
========================================================= */

async function releasePaymentReference(
  redis,
  reference,
  userId
) {
  const key =
    `obitrend:paystack:redeemed:${reference}`;

  try {
    const owner =
      await redis.get(key);

    if (
      owner &&
      owner === userId
    ) {
      await redis.del(key);
    }
  } catch (error) {
    console.error(
      "OBITREND: failed to release Paystack redemption lock:",
      error
    );
  }
}

/* =========================================================
   ACTIVATE VERIFIED PAYMENT
========================================================= */

async function activateVerifiedPayment({
  redis,
  userId,
  email,
  verified,
}) {
  const {
    reference,
    planKey,
    plan,
  } = verified;

  /* -------------------------------------------------------
     CLAIM REFERENCE FIRST
  ------------------------------------------------------- */

  const claim =
    await claimPaymentReference(
      redis,
      reference,
      userId
    );

  /* -------------------------------------------------------
     REFERENCE ALREADY USED
  ------------------------------------------------------- */

  if (!claim.claimed) {
    const owner =
      await getRedeemedOwner(
        redis,
        reference
      );

    if (
      owner &&
      owner !== userId
    ) {
      throw new Error(
        "This payment reference belongs to another account."
      );
    }

    /*
     * Same authenticated user.
     *
     * Do NOT grant credits again.
     */
    return {
      alreadyActivated:
        true,

      reference,

      plan:
        planKey,

      planName:
        plan.name,

      credits:
        plan.credits,

      durationDays:
        plan.durationDays,

      amount:
        plan.amount,

      currency:
        CURRENCY,

      expiresAt:
        null,
    };
  }

  /* -------------------------------------------------------
     ACTIVATE EXACT VERIFIED PACKAGE
  ------------------------------------------------------- */

  try {
    const activation =
      await activatePro(
        userId,
        {
          email,

          reference,

          selectedPlan:
            planKey,

          credits:
            plan.credits,

          durationDays:
            plan.durationDays,

          tier:
            plan.tier,

          amount:
            plan.amount,

          currency:
            CURRENCY,
        },
        redis
      );

    if (
      !activation?.ok
    ) {
      throw new Error(
        "OBITREND paid package activation failed."
      );
    }

    return {
      alreadyActivated:
        false,

      reference,

      plan:
        planKey,

      planName:
        plan.name,

      credits:
        plan.credits,

      durationDays:
        plan.durationDays,

      amount:
        plan.amount,

      currency:
        CURRENCY,

      expiresAt:
        activation.expiresAt ||
        null,
    };
  } catch (error) {
    await releasePaymentReference(
      redis,
      reference,
      userId
    );

    throw error;
  }
}

/* =========================================================
   AUTHENTICATED USER
========================================================= */

async function requireUser(req) {
  const auth =
    await getAuthenticatedUser(
      req
    );

  const user =
    auth?.user;

  if (!user?.id) {
    throw new Error(
      "Authentication required."
    );
  }

  return user;
}

/* =========================================================
   GET HANDLER
========================================================= */

async function handleGet(
  req,
  res
) {
  let user;

  try {
    user =
      await requireUser(req);
  } catch {
    return json(
      res,
      401,
      {
        ok: false,

        success: false,

        verified: false,

        error:
          "Authentication required.",
      }
    );
  }

  const reference =
    clean(
      req.query?.reference ||
      "",
      150
    );

  /*
   * No payment reference:
   * return service information only.
   *
   * IMPORTANT:
   * Never say "paid: true" here.
   */

  if (!reference) {
    return json(
      res,
      200,
      {
        ok: true,

        success: true,

        verified: false,

        paymentRequired:
          true,

        plans:
          Object.entries(
            PLANS
          ).map(
            ([key, plan]) => ({
              plan: key,

              name:
                plan.name,

              amount:
                plan.amount,

              currency:
                CURRENCY,

              credits:
                plan.credits,

              durationDays:
                plan.durationDays,
            })
          ),
      }
    );
  }

  let redis;

  try {
    redis =
      getRedisConfig();
  } catch (error) {
    console.error(
      "OBITREND Redis configuration error:",
      error
    );

    return json(
      res,
      503,
      {
        ok: false,

        success: false,

        verified: false,

        error:
          "Payment service is temporarily unavailable.",
      }
    );
  }

  try {
    const email =
      normalizeEmail(
        user.email
      );

    if (!email) {
      throw new Error(
        "Your authenticated account email is required."
      );
    }

    /*
     * STEP 1
     * Verify directly with Paystack.
     */
    const verified =
      await verifyTransaction(
        reference,
        email
      );

    /*
     * STEP 2
     * Activate only after Paystack verification succeeds.
     */
    const activation =
      await activateVerifiedPayment({
        redis,

        userId:
          user.id,

        email,

        verified,
      });

    /*
     * STEP 3
     * Tell frontend payment verification succeeded.
     *
     * The frontend then calls /api/credits.
     * /api/credits remains the authoritative source
     * for the user's current Pro status and balance.
     */
    return json(
      res,
      200,
      {
        ok: true,

        success: true,

        paid: true,

        verified: true,

        proActive: true,

        alreadyActivated:
          activation.alreadyActivated,

        reference:
          activation.reference,

        plan:
          activation.plan,

        planName:
          activation.planName,

        credits:
          activation.credits,

        durationDays:
          activation.durationDays,

        expiresAt:
          activation.expiresAt ||
          null,

        amount:
          verified.plan.amount,

        currency:
          CURRENCY,
      }
    );
  } catch (error) {
    console.error(
      "OBITREND Paystack verification error:",
      error
    );

    return json(
      res,
      400,
      {
        ok: false,

        success: false,

        paid: false,

        verified: false,

        error:
          safePaymentError(),
      }
    );
  }
}

/* =========================================================
   POST HANDLER
========================================================= */

async function handlePost(
  req,
  res
) {
  let user;

  try {
    user =
      await requireUser(req);
  } catch {
    return json(
      res,
      401,
      {
        ok: false,

        success: false,

        error:
          "Authentication required.",
      }
    );
  }

  const body =
    req.body &&
    typeof req.body ===
      "object"
      ? req.body
      : {};

  /*
   * ONLY body.plan is trusted from the browser.
   *
   * These are deliberately ignored:
   *
   * body.userId
   * body.email
   * body.amount
   * body.credits
   * body.duration
   * body.durationDays
   * body.tier
   * body.currency
   */

  const selected =
    getPlan(
      body.plan
    );

  if (!selected.config) {
    return json(
      res,
      400,
      {
        ok: false,

        success: false,

        error:
          "Invalid payment plan.",
      }
    );
  }

  let redis;

  try {
    redis =
      getRedisConfig();
  } catch (error) {
    console.error(
      "OBITREND Redis configuration error:",
      error
    );

    return json(
      res,
      503,
      {
        ok: false,

        success: false,

        error:
          "Payment service is temporarily unavailable.",
      }
    );
  }

  try {
    const email =
      normalizeEmail(
        user.email
      );

    if (!email) {
      return json(
        res,
        400,
        {
          ok: false,

          success: false,

          error:
            "Your account email is required before payment.",
        }
      );
    }

    const payment =
      await initializePayment(
        email,

        selected.key,

        selected.config
      );

    return json(
      res,
      200,
      {
        ok: true,

        success: true,

        authorization_url:
          payment.authorizationUrl,

        authorizationUrl:
          payment.authorizationUrl,

        access_code:
          payment.accessCode,

        reference:
          payment.reference,

        plan:
          payment.plan,

        planName:
          payment.planName,

        amount:
          payment.amount,

        currency:
          payment.currency,

        credits:
          payment.credits,

        durationDays:
          payment.durationDays,
      }
    );
  } catch (error) {
    console.error(
      "OBITREND Paystack initialization error:",
      error
    );

    return json(
      res,
      500,
      {
        ok: false,

        success: false,

        error:
          "Unable to initialize payment. Please try again.",
      }
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
  /*
   * Same-origin Vercel API.
   *
   * We intentionally do not add permissive CORS headers.
   */

  return processRequest(
    req,
    res
  );
}

/* =========================================================
   REQUEST ROUTER
========================================================= */

async function processRequest(
  req,
  res
) {
  if (
    req.method ===
    "POST"
  ) {
    return handlePost(
      req,
      res
    );
  }

  if (
    req.method ===
    "GET"
  ) {
    return handleGet(
      req,
      res
    );
  }

  res.setHeader(
    "Allow",
    "GET, POST"
  );

  return json(
    res,
    405,
    {
      ok: false,

      success: false,

      error:
        "Method not allowed.",
    }
  );
}
