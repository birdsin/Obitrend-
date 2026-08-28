// api/paystack.js
// OBITREND PRO — SECURE PAYSTACK PAYMENT API
// ₦15,000 / WEEK
//
// Flow:
// 1. User must be authenticated with Supabase.
// 2. Server creates the Paystack transaction.
// 3. Paystack processes payment.
// 4. Frontend returns with the Paystack reference.
// 5. Frontend calls this API with the Supabase access token.
// 6. Server verifies payment directly with Paystack.
// 7. Server activates OBITREND PRO in Redis.
//
// IMPORTANT:
// Never put PAYSTACK_SECRET_KEY in index.html.

import {
  activatePro,
  getProStatus,
  getRedisConfig
} from "./credits.js";

const PAYSTACK_API = "https://api.paystack.co";

const PRO_AMOUNT = 1500000; // ₦15,000 = 1,500,000 kobo
const PRO_CURRENCY = "NGN";

/* =========================================================
   RESPONSE
========================================================= */

function send(res, status, data) {
  return res.status(status).json(data);
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
  )
    .trim()
    .replace(/\/+$/, "");
}

function getSupabaseKey() {
  return String(
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ""
  ).trim();
}

/*
 * IMPORTANT:
 * Set this in Vercel:
 *
 * APP_URL=https://obitrend.vercel.app
 *
 * This prevents Paystack from returning users
 * to a random Vercel preview deployment.
 */
function getAppUrl() {
  return String(
    process.env.APP_URL ||
    "https://obitrend.vercel.app"
  )
    .trim()
    .replace(/\/+$/, "");
}

/* =========================================================
   CLEAN VALUES
========================================================= */

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

function cleanReference(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._=-]/g, "")
    .slice(0, 200);
}

/* =========================================================
   ERROR
========================================================= */

function errorMessage(error, fallback) {
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  if (error?.message) {
    return String(error.message);
  }

  if (error?.data?.message) {
    return String(error.data.message);
  }

  if (error?.error) {
    return String(error.error);
  }

  return fallback;
}

/* =========================================================
   BEARER TOKEN
========================================================= */

function getBearerToken(req) {
  const header =
    req.headers?.authorization ||
    req.headers?.Authorization ||
    "";

  if (!header) {
    return "";
  }

  const match =
    String(header).match(/^Bearer\s+(.+)$/i);

  return match
    ? match[1].trim()
    : "";
}

/* =========================================================
   SUPABASE AUTH
========================================================= */

async function getAuthenticatedUser(req) {
  const token = getBearerToken(req);

  if (!token) {
    return {
      ok: false,
      status: 401,
      error:
        "Your OBITREND login session is missing. Please sign in again."
    };
  }

  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = getSupabaseKey();

  if (!supabaseUrl || !supabaseKey) {
    console.error(
      "Missing Supabase environment variables."
    );

    return {
      ok: false,
      status: 500,
      error:
        "Supabase authentication is not configured on the server."
    };
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/auth/v1/user`,
      {
        method: "GET",

        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${token}`,
          Accept: "application/json"
        }
      }
    );

    let data = null;

    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok || !data?.id) {
      console.warn(
        "Supabase user verification failed:",
        response.status,
        data
      );

      return {
        ok: false,
        status: 401,
        error:
          "Your OBITREND login session is invalid or expired. Please sign in again."
      };
    }

    const userId = cleanUserId(data.id);
    const email = cleanEmail(data.email);

    if (!userId || userId.length < 8) {
      return {
        ok: false,
        status: 401,
        error:
          "Invalid Supabase user account."
      };
    }

    if (!email || !email.includes("@")) {
      return {
        ok: false,
        status: 401,
        error:
          "Your account does not have a valid email address."
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
      "Supabase authentication error:",
      error
    );

    return {
      ok: false,
      status: 502,
      error:
        "Unable to verify your OBITREND account right now."
    };
  }
}

/* =========================================================
   PAYSTACK API
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
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
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
   REFERENCE
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
   CORS
========================================================= */

function setCors(req, res) {
  const requestOrigin =
    req.headers?.origin || "";

  const allowedProduction =
    getAppUrl();

  /*
   * Production is always allowed.
   *
   * The current Vercel origin is also allowed
   * so testing does not immediately fail.
   */
  const allowed =
    requestOrigin === allowedProduction ||
    requestOrigin.endsWith(".vercel.app");

  if (allowed) {
    res.setHeader(
      "Access-Control-Allow-Origin",
      requestOrigin || allowedProduction
    );
  } else {
    res.setHeader(
      "Access-Control-Allow-Origin",
      allowedProduction
    );
  }

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

  res.setHeader(
    "Vary",
    "Origin"
  );
}

/* =========================================================
   START PAYMENT
========================================================= */

async function startPayment(req, res) {
  try {
    const auth =
      await getAuthenticatedUser(req);

    if (!auth.ok) {
      return send(
        res,
        auth.status,
        {
          success: false,
          error: auth.error
        }
      );
    }

    const userId =
      auth.user.id;

    const email =
      auth.user.email;

    const reference =
      createReference();

    const planCode =
      getPlanCode();

    /*
     * IMPORTANT:
     *
     * Paystack returns the customer to the
     * main OBITREND application.
     *
     * The frontend must then read ?reference=
     * and call /api/paystack with the Supabase
     * Bearer token.
     */
    const callbackUrl =
      getAppUrl();

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
     * If PAYSTACK_PRO_PLAN_CODE exists,
     * Paystack creates a subscription.
     */
    if (planCode) {
      payload.plan =
        planCode;
    } else {
      /*
       * Without a plan code,
       * use one-time ₦15,000 payment.
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
        "Paystack initialize failed:",
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
              "Unable to start Paystack payment."
            )
        }
      );
    }

    const payment =
      result.data?.data || {};

    const authorizationUrl =
      String(
        payment.authorization_url || ""
      ).trim();

    const paymentReference =
      cleanReference(
        payment.reference
      );

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
      paymentReference !== reference
    ) {
      return send(
        res,
        502,
        {
          success: false,
          error:
            "Paystack returned an invalid transaction reference."
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

        authorization_url:
          authorizationUrl,

        paymentUrl:
          authorizationUrl,

        userId,

        email,

        amount:
          PRO_AMOUNT,

        currency:
          PRO_CURRENCY,

        plan:
          planCode ||
          null
      }
    );

  } catch (error) {
    console.error(
      "OBITREND payment initialization error:",
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
            "Payment initialization failed."
          )
      }
    );
  }
}

/* =========================================================
   VERIFY PAYMENT
========================================================= */

async function verifyPayment(req, res) {
  try {
    /*
     * FIRST:
     * Verify the logged-in Supabase user.
     */
    const auth =
      await getAuthenticatedUser(req);

    if (!auth.ok) {
      return send(
        res,
        auth.status,
        {
          success: false,
          paid: false,
          proActive: false,
          error: auth.error
        }
      );
    }

    const authenticatedUserId =
      auth.user.id;

    const authenticatedEmail =
      auth.user.email;

    /*
     * Get Paystack reference.
     */
    const url =
      new URL(
        req.url,
        getAppUrl()
      );

    const reference =
      cleanReference(
        url.searchParams.get("reference") ||
        url.searchParams.get("trxref") ||
        url.searchParams.get("ref") ||
        ""
      );

    if (!reference) {
      return send(
        res,
        400,
        {
          success: false,
          paid: false,
          proActive: false,
          error:
            "Paystack transaction reference is missing."
        }
      );
    }

    console.log(
      "OBITREND verifying payment:",
      reference
    );

    /*
     * VERIFY DIRECTLY WITH PAYSTACK.
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
      console.error(
        "Paystack verification failed:",
        result.data
      );

      return send(
        res,
        400,
        {
          success: false,
          paid: false,
          proActive: false,
          reference,
          error:
            errorMessage(
              result.data,
              "Paystack could not verify this payment."
            )
        }
      );
    }

    const transaction =
      result.data?.data || {};

    /*
     * Verify reference.
     */
    const transactionReference =
      cleanReference(
        transaction.reference
      );

    if (
      transactionReference !==
      reference
    ) {
      return send(
        res,
        400,
        {
          success: false,
          paid: false,
          proActive: false,
          reference,
          error:
            "Transaction reference mismatch."
        }
      );
    }

    /*
     * Verify SUCCESS status.
     */
    const transactionStatus =
      String(
        transaction.status || ""
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
          proActive: false,
          reference,
          status:
            transaction.status ||
            "unknown",
          error:
            "Payment has not been completed successfully."
        }
      );
    }

    /*
     * Verify amount.
     */
    const amount =
      Number(
        transaction.amount || 0
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
          proActive: false,
          reference,
          amount,
          expectedAmount:
            PRO_AMOUNT,
          error:
            "Payment amount does not match ₦15,000."
        }
      );
    }

    /*
     * Verify currency.
     */
    const currency =
      String(
        transaction.currency || ""
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
          proActive: false,
          reference,
          currency,
          error:
            "Payment currency is not NGN."
        }
      );
    }

    /*
     * Read metadata.
     */
    let metadata =
      transaction.metadata;

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
      !metadata ||
      typeof metadata !==
        "object"
    ) {
      metadata = {};
    }

    /*
     * Verify the payment belongs
     * to the logged-in OBITREND account.
     */
    const transactionUserId =
      cleanUserId(
        metadata.userId
      );

    if (
      !transactionUserId
    ) {
      return send(
        res,
        400,
        {
          success: false,
          paid: false,
          proActive: false,
          reference,
          error:
            "This payment is not linked to an OBITREND account."
        }
      );
    }

    if (
      transactionUserId !==
      authenticatedUserId
    ) {
      return send(
        res,
        403,
        {
          success: false,
          paid: false,
          proActive: false,
          reference,
          error:
            "This payment belongs to a different OBITREND account."
        }
      );
    }

    /*
     * Verify payment email.
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
      return send(
        res,
        403,
        {
          success: false,
          paid: false,
          proActive: false,
          reference,
          error:
            "The payment email does not match your OBITREND account."
        }
      );
    }

    /*
     * Redis.
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
          proActive: false,
          reference,
          error:
            "OBITREND Redis configuration is missing."
        }
      );
    }

    /*
     * Check existing Pro.
     */
    try {
      const existing =
        await getProStatus(
          authenticatedUserId,
          redis
        );

      if (
        existing?.active
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
              authenticatedEmail,
            amount,
            currency,
            status:
              transaction.status,
            paidAt:
              transaction.paid_at ||
              null,
            proExpiresAt:
              existing.expiresAt
          }
        );
      }
    } catch (error) {
      console.warn(
        "Existing Pro check failed:",
        error
      );
    }

    /*
     * ACTIVATE PRO.
     */
    const pro =
      await activatePro(
        authenticatedUserId,
        authenticatedEmail,
        transactionReference,
        redis
      );

    console.log(
      "OBITREND PRO ACTIVATED",
      {
        userId:
          authenticatedUserId,
        email:
          authenticatedEmail,
        reference:
          transactionReference,
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
          authenticatedEmail,

        amount,

        currency,

        status:
          transaction.status,

        paidAt:
          transaction.paid_at ||
          null,

        proExpiresAt:
          pro?.expiresAt ||
          null,

        message:
          "OBITREND Pro activated successfully."
      }
    );

  } catch (error) {
    console.error(
      "OBITREND payment verification error:",
      error
    );

    return send(
      res,
      500,
      {
        success: false,
        paid: false,
        proActive: false,
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

export default async function handler(req, res) {
  setCors(req, res);

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
