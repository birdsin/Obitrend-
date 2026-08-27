// api/paystack.js
// OBITREND PRO — PAYSTACK PAYMENT API
// ₦15,000 / WEEK
//
// SECURITY:
// - Supabase Auth identifies the real user.
// - Browser-supplied userId/email are NOT trusted.
// - Paystack secret key stays server-side.
// - Payment is verified before Pro is activated.

import {
  activatePro,
  getProStatus,
  getRedisConfig
} from "./credits.js";

const PAYSTACK_API = "https://api.paystack.co";

const PRO_AMOUNT = 1500000; // ₦15,000 in kobo
const PRO_CURRENCY = "NGN";
const PRO_INTERVAL = "weekly";

/* =========================================================
   RESPONSE
========================================================= */

function send(res, status, body) {
  return res.status(status).json(body);
}

/* =========================================================
   ERROR MESSAGE
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

function getSupabaseUrl() {
  return String(
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ""
  ).trim().replace(/\/+$/, "");
}

function getSupabasePublishableKey() {
  return String(
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
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
   AUTHORIZATION HEADER
========================================================= */

function getBearerToken(req) {
  const header =
    req.headers?.authorization ||
    req.headers?.Authorization ||
    "";

  if (
    typeof header !== "string" ||
    !header.trim()
  ) {
    return "";
  }

  const match =
    header.match(
      /^Bearer\s+(.+)$/i
    );

  return match
    ? match[1].trim()
    : "";
}

/* =========================================================
   SUPABASE AUTH
========================================================= */

/*
 * Verify the access token against Supabase Auth.
 *
 * We intentionally do NOT trust:
 * - body.userId
 * - body.obitrendUserId
 * - body.email
 *
 * The authenticated Supabase user is the source of truth.
 */

async function getAuthenticatedUser(req) {
  const token =
    getBearerToken(req);

  if (!token) {
    return {
      ok: false,
      status: 401,
      error:
        "You must be logged in to upgrade to OBITREND Pro."
    };
  }

  const supabaseUrl =
    getSupabaseUrl();

  const publishableKey =
    getSupabasePublishableKey();

  if (
    !supabaseUrl ||
    !publishableKey
  ) {
    console.error(
      "Supabase environment variables are missing."
    );

    return {
      ok: false,
      status: 500,
      error:
        "Supabase authentication is not configured on the server."
    };
  }

  try {
    /*
     * Supabase Auth's /auth/v1/user endpoint
     * validates the supplied access token.
     */
    const response =
      await fetch(
        `${supabaseUrl}/auth/v1/user`,
        {
          method: "GET",

          headers: {
            apikey:
              publishableKey,

            Authorization:
              `Bearer ${token}`,

            Accept:
              "application/json"
          }
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
      !data?.id
    ) {
      console.warn(
        "Supabase authentication rejected:",
        response.status,
        data
      );

      return {
        ok: false,
        status: 401,
        error:
          "Your login session is invalid or expired. Please log in again."
      };
    }

    const userId =
      cleanUserId(
        data.id
      );

    const email =
      cleanEmail(
        data.email
      );

    if (
      !userId ||
      userId.length < 8
    ) {
      return {
        ok: false,
        status: 401,
        error:
          "Supabase returned an invalid user account."
      };
    }

    if (
      !email ||
      !email.includes("@")
    ) {
      return {
        ok: false,
        status: 401,
        error:
          "Your Supabase account does not have a valid email address."
      };
    }

    return {
      ok: true,

      user: {
        id: userId,
        email
      }
    };

  } catch (error) {
    console.error(
      "Supabase authentication request failed:",
      error
    );

    return {
      ok: false,
      status: 502,
      error:
        "Unable to verify your OBITREND login right now."
    };
  }
}

/* =========================================================
   PAYSTACK REQUEST
========================================================= */

async function paystackRequest(
  path,
  options = {}
) {
  const secretKey =
    getSecretKey();

  if (!secretKey) {
    throw new Error(
      "PAYSTACK_SECRET_KEY is missing in Vercel."
    );
  }

  const response =
    await fetch(
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

    data
  };
}

/* =========================================================
   VERIFY PAYSTACK PLAN
========================================================= */

async function verifyPlan() {
  const planCode =
    getPlanCode();

  /*
   * If no plan code is configured,
   * allow the one-time ₦15,000 payment flow.
   */
  if (!planCode) {
    return {
      valid: true,
      plan: null
    };
  }

  const result =
    await paystackRequest(
      `/plan/${encodeURIComponent(
        planCode
      )}`,
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
      error:
        errorMessage(
          result.data,
          "Unable to verify the OBITREND Pro Paystack plan."
        )
    };
  }

  const plan =
    result.data?.data ||
    null;

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
    Number(
      plan.amount
    );

  if (
    !Number.isFinite(
      planAmount
    ) ||
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
      plan.currency ||
      ""
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
      plan.interval ||
      ""
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

async function startPayment(
  req,
  res
) {
  try {
    /*
     * STEP 1:
     * Verify the real logged-in Supabase user.
     */
    const auth =
      await getAuthenticatedUser(
        req
      );

    if (!auth.ok) {
      return send(
        res,
        auth.status,
        {
          success: false,
          error:
            auth.error
        }
      );
    }

    const userId =
      auth.user.id;

    const email =
      auth.user.email;

    /*
     * IMPORTANT:
     *
     * We intentionally ignore:
     *
     * body.email
     * body.userId
     * body.obitrendUserId
     *
     * The authenticated Supabase account
     * is the source of truth.
     */

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
       * Otherwise use a one-time
       * ₦15,000 payment.
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
            JSON.stringify(
              payload
            )
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

      return send(
        res,
        400,
        {
          success: false,
          error:
            errorMessage(
              result.data,
              "Unable to initialize Paystack payment."
            )
        }
      );
    }

    const payment =
      result.data?.data ||
      {};

    const paymentReference =
      cleanReference(
        payment.reference
      );

    const authorizationUrl =
      String(
        payment.authorization_url ||
        ""
      ).trim();

    if (!authorizationUrl) {
      return send(
        res,
        502,
        {
          success: false,
          error:
            "Paystack did not return a payment URL."
        }
      );
    }

    if (
      !paymentReference ||
      paymentReference !==
        reference
    ) {
      return send(
        res,
        502,
        {
          success: false,
          error:
            "Paystack transaction reference mismatch."
        }
      );
    }

    return send(
      res,
      200,
      {
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

        /*
         * Return the authenticated
         * account information only.
         */
        email,

        userId,

        amount:
          PRO_AMOUNT,

        currency:
          PRO_CURRENCY,

        plan:
          planCode ||
          "₦15,000 WEEKLY"
      }
    );

  } catch (error) {
    console.error(
      "OBITREND Paystack initialization error:",
      error
    );

    return send(
      res,
      500,
      {
        success: false,
        error:
          errorMessage(
            error,
            "Paystack initialization failed."
          )
      }
    );
  }
}

/* =========================================================
   GET — VERIFY PAYMENT
========================================================= */

async function verifyPayment(
  req,
  res
) {
  try {
    /*
     * STEP 1:
     * Verify the currently logged-in
     * Supabase account.
     */
    const auth =
      await getAuthenticatedUser(
        req
      );

    if (!auth.ok) {
      return send(
        res,
        auth.status,
        {
          success: false,
          paid: false,
          error:
            auth.error
        }
      );
    }

    const authenticatedUserId =
      auth.user.id;

    const authenticatedEmail =
      auth.user.email;

    /*
     * STEP 2:
     * Get Paystack reference.
     */
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
      return send(
        res,
        400,
        {
          success: false,
          paid: false,
          error:
            "Transaction reference is required."
        }
      );
    }

    console.log(
      "OBITREND verifying Paystack:",
      reference
    );

    /*
     * STEP 3:
     * Verify transaction directly
     * against Paystack.
     */
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
      return send(
        res,
        400,
        {
          success: false,
          paid: false,
          reference,

          error:
            errorMessage(
              result.data,
              "Paystack could not verify this transaction."
            )
        }
      );
    }

    const transaction =
      result.data?.data ||
      {};

    /*
     * STEP 4:
     * Verify reference.
     */
    const transactionReference =
      cleanReference(
        transaction.reference
      );

    if (
      !transactionReference ||
      transactionReference !==
        reference
    ) {
      return send(
        res,
        400,
        {
          success: false,
          paid: false,
          reference,

          error:
            "Paystack transaction reference mismatch."
        }
      );
    }

    /*
     * STEP 5:
     * Verify payment status.
     */
    const transactionStatus =
      String(
        transaction.status ||
        ""
      ).toLowerCase();

    if (
      transactionStatus !==
      "success"
    ) {
      return send(
        res,
        200,
        {
          success: true,

          paid: false,

          reference,

          status:
            transaction.status ||
            "unknown",

          amount:
            Number(
              transaction.amount ||
              0
            ),

          error:
            "Payment has not been completed successfully."
        }
      );
    }

    /*
     * STEP 6:
     * Verify amount.
     */
    const amount =
      Number(
        transaction.amount ||
        0
      );

    if (
      amount !==
      PRO_AMOUNT
    ) {
      return send(
        res,
        400,
        {
          success: false,
          paid: false,
          reference,

          amount,

          expectedAmount:
            PRO_AMOUNT,

          error:
            "The verified payment amount does not match ₦15,000."
        }
      );
    }

    /*
     * STEP 7:
     * Verify currency.
     */
    const currency =
      String(
        transaction.currency ||
        ""
      ).toUpperCase();

    if (
      currency !==
      PRO_CURRENCY
    ) {
      return send(
        res,
        400,
        {
          success: false,
          paid: false,
          reference,

          currency,

          error:
            "Payment currency is not NGN."
        }
      );
    }

    /*
     * STEP 8:
     * Verify Paystack plan if configured.
     */
    const planResult =
      await verifyPlan();

    if (
      !planResult.valid
    ) {
      return send(
        res,
        400,
        {
          success: false,
          paid: false,
          reference,

          error:
            errorMessage(
              planResult.error,
              "OBITREND Pro plan verification failed."
            )
        }
      );
    }

    /*
     * STEP 9:
     * Read Paystack metadata.
     */
    let metadata =
      transaction.metadata;

    /*
     * Paystack may return metadata
     * as an object or JSON string.
     */
    if (
      typeof metadata ===
      "string"
    ) {
      try {
        metadata =
          JSON.parse(
            metadata
          );
      } catch {
        metadata = {};
      }
    }

    if (
      !metadata ||
      typeof metadata !==
        "object"
    ) {
      metadata = {};
    }

    /*
     * STEP 10:
     * The user stored in the Paystack
     * transaction MUST be the same user
     * currently authenticated with Supabase.
     */
    const transactionUserId =
      cleanUserId(
        metadata.userId ||
        metadata.obitrendUserId
      );

    if (
      !transactionUserId ||
      transactionUserId.length < 8
    ) {
      return send(
        res,
        400,
        {
          success: false,
          paid: false,
          reference,

          error:
            "This payment is not linked to a valid OBITREND account."
        }
      );
    }

    if (
      transactionUserId !==
      authenticatedUserId
    ) {
      console.warn(
        "OBITREND payment/account mismatch:",
        {
          reference,
          transactionUserId,
          authenticatedUserId
        }
      );

      return send(
        res,
        403,
        {
          success: false,
          paid: false,
          reference,

          error:
            "This payment belongs to a different OBITREND account."
        }
      );
    }

    /*
     * STEP 11:
     * Customer email must also match
     * the authenticated account.
     */
    const customerEmail =
      cleanEmail(
        transaction.customer?.email ||
        metadata.email ||
        ""
      );

    if (
      customerEmail &&
      customerEmail !==
        authenticatedEmail
    ) {
      console.warn(
        "OBITREND payment/email mismatch:",
        {
          reference,
          customerEmail,
          authenticatedEmail
        }
      );

      return send(
        res,
        403,
        {
          success: false,
          paid: false,
          reference,

          error:
            "This payment email does not match your OBITREND account."
        }
      );
    }

    /*
     * Always use the authenticated
     * Supabase email for activation.
     */
    const activationEmail =
      authenticatedEmail;

    /*
     * STEP 12:
     * Redis configuration.
     */
    const redis =
      getRedisConfig();

    if (
      !redis?.url ||
      !redis?.token
    ) {
      return send(
        res,
        500,
        {
          success: false,
          paid: false,
          reference,

          error:
            "OBITREND Redis configuration is missing."
        }
      );
    }

    /*
     * STEP 13:
     * Prevent duplicate fulfillment.
     */
    try {
      const existingPro =
        await getProStatus(
          authenticatedUserId,
          redis
        );

      if (
        existingPro?.active
      ) {
        return send(
          res,
          200,
          {
            success: true,

            paid: true,

            proActive: true,

            alreadyActive: true,

            reference,

            userId:
              authenticatedUserId,

            email:
              activationEmail,

            amount,

            currency,

            status:
              transaction.status,

            paidAt:
              transaction.paid_at ||
              null,

            proExpiresAt:
              existingPro.expiresAt
          }
        );
      }

    } catch (statusError) {
      console.warn(
        "Existing Pro status check failed:",
        statusError
      );
    }

    /*
     * STEP 14:
     * Activate Pro for the VERIFIED
     * Supabase account.
     */
    const pro =
      await activatePro(
        authenticatedUserId,
        activationEmail,
        transactionReference,
        redis
      );

    console.log(
      "OBITREND PRO ACTIVATED:",
      {
        userId:
          authenticatedUserId,

        reference:
          transactionReference,

        email:
          activationEmail,

        amount,

        currency,

        expiresAt:
          pro?.expiresAt
      }
    );

    return send(
      res,
      200,
      {
        success: true,

        paid: true,

        proActive: true,

        reference:
          transactionReference,

        userId:
          authenticatedUserId,

        email:
          activationEmail,

        amount,

        currency,

        status:
          transaction.status,

        paidAt:
          transaction.paid_at ||
          null,

        proExpiresAt:
          pro?.expiresAt ||
          null
      }
    );

  } catch (error) {
    console.error(
      "OBITREND Paystack verification error:",
      error
    );

    return send(
      res,
      500,
      {
        success: false,

        paid: false,

        error:
          errorMessage(
            error,
            "Payment verification failed."
          )
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
    "Content-Type, Accept, Authorization"
  );

  res.setHeader(
    "Access-Control-Allow-Credentials",
    "true"
  );

  if (
    req.method ===
    "OPTIONS"
  ) {
    return res
      .status(200)
      .end();
  }

  if (
    req.method ===
    "POST"
  ) {
    return startPayment(
      req,
      res
    );
  }

  if (
    req.method ===
    "GET"
  ) {
    return verifyPayment(
      req,
      res
    );
  }

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
