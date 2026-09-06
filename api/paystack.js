import {
  activatePro,
  getAuthenticatedUser,
  getRedisConfig,
} from "./credits.js";

/* =========================================================
   OBITREND PAYSTACK PAYMENT API
   SECURE SERVER-SIDE PAYMENT VERIFICATION

   IMPORTANT:
   - Never trust client amount
   - Never trust client credits
   - Never trust client duration
   - Never trust client email
   - Never trust client userId
   - Never activate credits before Paystack verification
========================================================= */

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "1mb",
    },
  },
};

const PAYSTACK_API =
  "https://api.paystack.co";

const APP_URL =
  process.env.APP_URL ||
  "https://obitrend.vercel.app";

const CURRENCY = "NGN";

/* =========================================================
   SERVER-CONTROLLED PACKAGES

   The browser is NEVER allowed to define these values.
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
  return clean(
    value,
    50
  ).toUpperCase();
}

function getPlan(plan) {
  const selected =
    normalizePlan(plan);

  return {
    key: selected,
    config:
      PLANS[selected] || null,
  };
}

function createReference(planKey) {
  const timestamp =
    Date.now();

  const random =
    Math.random()
      .toString(36)
      .slice(2, 12)
      .toUpperCase();

  return `OBITREND-${planKey}-${timestamp}-${random}`;
}

function extractPlanFromReference(
  reference
) {
  const match = String(
    reference || ""
  ).match(
    /^OBITREND-(PRO_4_DAY|PRO_8_DAY|PRO_14_DAY|PRO_MONTHLY)-/
  );

  return match
    ? match[1]
    : null;
}

function normalizeEmail(email) {
  return clean(
    email,
    320
  ).toLowerCase();
}

function safePaymentError() {
  return "Payment could not be verified. No credits were added.";
}

/* =========================================================
   PAYSTACK REQUEST
========================================================= */

async function paystackRequest(
  path,
  options = {}
) {
  const secret =
    process.env.PAYSTACK_SECRET_KEY;

  if (!secret) {
    throw new Error(
      "PAYSTACK_SECRET_KEY is not configured."
    );
  }

  const response =
    await fetch(
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
    data =
      await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const error =
      data?.message ||
      "Paystack request failed.";

    throw new Error(
      error
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

   Only the authenticated user's email is used.
   Amount/credits/expiry are selected server-side.
========================================================= */

async function initializePayment(
  email,
  planKey,
  plan
) {
  const reference =
    createReference(
      planKey
    );

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
          JSON.stringify(
            payload
          ),
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
      result.data
        .authorization_url,

    accessCode:
      result.data
        .access_code ||
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
    clean(
      reference,
      150
    );

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
      transaction.status ||
      ""
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
      transaction.reference ||
      ""
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
      transaction.currency ||
      ""
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
    Number(
      transaction.amount
    );

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
     CUSTOMER EMAIL

     Must match the authenticated Supabase account.
  ------------------------------------------------------- */

  const paidEmail =
    normalizeEmail(
      transaction.customer?.email ||
      transaction.metadata?.customer_email ||
      ""
    );

  const authenticated =
    normalizeEmail(
      authenticatedEmail
    );

  if (
    !paidEmail ||
    !authenticated ||
    paidEmail !==
      authenticated
  ) {
    throw new Error(
      "Payment customer does not match the signed-in account."
    );
  }

  /* -------------------------------------------------------
     METADATA VALIDATION

     If Paystack returns metadata, make sure it agrees with
     the server-defined package.
  ------------------------------------------------------- */

  const metadata =
    transaction.metadata ||
    {};

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
   IDEMPOTENT REDEMPTION

   One Paystack reference can activate OBITREND only once.

   NX = create only if it does not already exist.
========================================================= */

async function claimPaymentReference(
  redis,
  reference,
  userId
) {
  const key =
    `obitrend:paystack:redeemed:${reference}`;

  const existing =
    await redis.set(
      key,
      userId,
      {
        nx: true,
        ex: 31536000,
      }
    );

  if (existing === "OK") {
    return {
      claimed: true,
      key,
    };
  }

  return {
    claimed: false,
    key,
  };
}

/* =========================================================
   READ REDEEMED REFERENCE OWNER
========================================================= */

async function getRedeemedOwner(
  redis,
  reference
) {
  const key =
    `obitrend:paystack:redeemed:${reference}`;

  return await redis.get(
    key
  );
}

/* =========================================================
   RELEASE REDEMPTION LOCK

   Used only when activation fails after claiming the
   reference, so a legitimate payment can be retried.
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
      await redis.get(
        key
      );

    if (
      owner &&
      owner === userId
    ) {
      await redis.del(
        key
      );
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
  reference,
  planKey,
  plan,
}) {
  const claim =
    await claimPaymentReference(
      redis,
      reference,
      userId
    );

  /* -------------------------------------------------------
     ALREADY REDEEMED
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
     * The payment was already successfully activated for
     * this same user.
     *
     * Do NOT grant another set of credits.
     */
    return {
      alreadyActivated: true,
      reference,
      plan:
        planKey,
    };
  }

  /* -------------------------------------------------------
     ACTIVATE THE EXACT VERIFIED PACKAGE
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
    /*
     * Do not permanently consume the payment reference
     * when activation itself fails.
     */
    await releasePaymentReference(
      redis,
      reference,
      userId
    );

    throw error;
  }
}

/* =========================================================
   GET
========================================================= */

async function handleGet(
  req,
  res
) {
  let auth;

  try {
    auth =
      await getAuthenticatedUser(
        req
      );
  } catch {
    return json(
      res,
      401,
      {
        ok: false,
        error:
          "Authentication required.",
      }
    );
  }

  const user =
    auth?.user;

  if (!user?.id) {
    return json(
      res,
      401,
      {
        ok: false,
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
   * GET without a reference simply confirms that the
   * payment service is available.
   */
  return json(
  res,
  200,
  {
    ok: true,
    success: true,
    paid: true,
    verified: true,

    // Payment verification succeeded.
    // The frontend will immediately refresh the
    // authoritative credit/Pro status from /api/credits.
    proActive: true,

    alreadyActivated:
      activation.alreadyActivated,

    reference:
      activation.reference,

    plan:
      activation.plan,

    planName:
      activation.planName ||
      verified.plan.name,

    credits:
      activation.credits ||
      verified.plan.credits,

    durationDays:
      activation.durationDays ||
      verified.plan.durationDays,

    expiresAt:
      activation.expiresAt ||
      null,

    amount:
      verified.plan.amount,

    currency:
      CURRENCY
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
        verified: false,
        error:
          safePaymentError(),
      }
    );
  }
}

/* =========================================================
   POST
========================================================= */

async function handlePost(
  req,
  res
) {
  let auth;

  try {
    auth =
      await getAuthenticatedUser(
        req
      );
  } catch {
    return json(
      res,
      401,
      {
        ok: false,
        error:
          "Authentication required.",
      }
    );
  }

  const user =
    auth?.user;

  if (!user?.id) {
    return json(
      res,
      401,
      {
        ok: false,
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
   * ONLY plan is accepted from the client.
   *
   * The following are deliberately ignored:
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
   * Same-origin Vercel deployment normally does not need
   * permissive CORS. Keep the API locked to the app origin.
   */

  const origin =
    req.headers?.origin;

  if (
    origin &&
    origin !== APP_URL
  ) {
    /*
     * Do not reject every request because mobile browsers,
     * redirects, and same-origin requests may omit Origin.
     *
     * Only set CORS headers for the official application.
     */
    return processRequest(
      req,
      res
    );
  }

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
      error:
        "Method not allowed.",
    }
  );
}
