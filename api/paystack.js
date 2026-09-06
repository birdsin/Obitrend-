/* =========================================================
   OBITREND AI FASHION CREATOR
   SECURE PAYSTACK PRO PAYMENT API
   =========================================================

   PLANS

   ₦10,000  → 4 Days  → 5 Credits
   ₦20,000  → 8 Days  → 10 Credits
   ₦30,000  → 14 Days → 15 Credits
   ₦60,000  → 30 Days → 30 Credits

   IMPORTANT:
   - Prices are server controlled.
   - User ID comes from authenticated Supabase session.
   - Email comes from authenticated Supabase session.
   - Paystack verifies the real transaction.
   - Pro activates only after successful verification.
   - A successful reference can only activate once.
   ========================================================= */

import {
  activatePro,
  getAuthenticatedUser,
  getRedisConfig
} from "./credits.js";


/* =========================================================
   CONFIG
========================================================= */

const PAYSTACK_API = "https://api.paystack.co";

const DEFAULT_APP_URL =
  "https://obitrend.vercel.app";

const CURRENCY = "NGN";


/* =========================================================
   FIXED OBITREND PRO PACKAGES
========================================================= */

const PACKAGES = Object.freeze({

  PRO_4_DAY: {
    amount: 1000000,
    seconds: 4 * 24 * 60 * 60,
    credits: 5,
    tier: "standard",
    name: "OBITREND 4 Day Pro"
  },

  PRO_8_DAY: {
    amount: 2000000,
    seconds: 8 * 24 * 60 * 60,
    credits: 10,
    tier: "standard",
    name: "OBITREND 8 Day Pro"
  },

  PRO_14_DAY: {
    amount: 3000000,
    seconds: 14 * 24 * 60 * 60,
    credits: 15,
    tier: "standard",
    name: "OBITREND 14 Day Pro"
  },

  PRO_MONTHLY: {
    amount: 6000000,
    seconds: 30 * 24 * 60 * 60,
    credits: 30,
    tier: "full",
    name: "OBITREND Monthly Full Pro"
  }

});


/* =========================================================
   HELPERS
========================================================= */

function clean(value) {
  return String(value ?? "").trim();
}


function upper(value) {
  return clean(value).toUpperCase();
}


function send(res, status, data) {
  return res.status(status).json(data);
}


function getPackage(plan) {
  return PACKAGES[upper(plan)] || null;
}


function getConfig() {

  return {
    secretKey:
      clean(process.env.PAYSTACK_SECRET_KEY),

    appUrl:
      clean(process.env.OBITREND_APP_URL) ||
      DEFAULT_APP_URL
  };

}


/* =========================================================
   PAYSTACK REQUEST
========================================================= */

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
        options.body === undefined
          ? undefined
          : JSON.stringify(options.body)
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
   REDIS PAYMENT REFERENCE LOCK
=========================================================

   This prevents the same successful Paystack reference
   from granting Pro credits repeatedly.

   SET NX means:
   - first verification → accepted
   - repeated verification → rejected
========================================================= */

function redeemedReferenceKey(reference) {

  const safeReference = clean(reference)
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 160);

  return `obitrend:paystack:redeemed:${safeReference}`;

}


async function redisCommand(
  redis,
  command
) {

  if (!redis?.url || !redis?.token) {
    throw new Error(
      "Redis environment variables are missing."
    );
  }


  const response = await fetch(
    `${redis.url.replace(/\/+$/, "")}/${command
      .map(encodeURIComponent)
      .join("/")}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${redis.token}`
      }
    }
  );


  let data = null;

  try {
    data = await response.json();
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
      "Unable to update OBITREND payment records."
    );

  }


  return data.result;

}


/* =========================================================
   INITIALIZE PAYSTACK PAYMENT
========================================================= */

async function initializePayment(
  email,
  plan,
  cfg
) {

  const selectedPlan = upper(plan);

  const packageInfo =
    getPackage(selectedPlan);


  if (!packageInfo) {

    return {
      success: false,
      error:
        "Please select a valid OBITREND Pro package."
    };

  }


  const cleanEmail =
    clean(email).toLowerCase();


  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      cleanEmail
    )
  ) {

    return {
      success: false,
      error:
        "Please provide a valid email address."
    };

  }


  /*
   * The reference itself records the exact
   * package selected by the server.
   */

  const reference =
    `OBITREND-${selectedPlan}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;


  const payload = {

    email: cleanEmail,

    /*
     * Paystack expects the amount in kobo.
     *
     * ₦10,000 = 1,000,000 kobo
     * ₦20,000 = 2,000,000 kobo
     * ₦30,000 = 3,000,000 kobo
     * ₦60,000 = 6,000,000 kobo
     */

    amount:
      String(packageInfo.amount),

    currency:
      CURRENCY,

    reference,

    callback_url:
      `${cfg.appUrl.replace(/\/+$/, "")}/`,

    metadata: {

      product:
        "OBITREND_PRO",

      package:
        selectedPlan,

      package_name:
        packageInfo.name,

      credits:
        packageInfo.credits,

      duration_seconds:
        packageInfo.seconds,

      tier:
        packageInfo.tier,

      source:
        "OBITREND_AI_FASHION_CREATOR"

    }

  };


  const result =
    await paystackRequest(
      "/transaction/initialize",
      cfg.secretKey,
      {
        method: "POST",
        body: payload
      }
    );


  if (
    !result.ok ||
    result.data?.status !== true ||
    !result.data?.data?.authorization_url
  ) {

    return {
      success: false,
      error:
        result.data?.message ||
        "Unable to start the OBITREND payment."
    };

  }


  const payment =
    result.data.data;


  return {

    success: true,

    authorization_url:
      payment.authorization_url,

    reference:
      payment.reference || reference,

    access_code:
      payment.access_code || null,

    product_plan:
      selectedPlan,

    packageName:
      packageInfo.name,

    amount:
      packageInfo.amount,

    currency:
      CURRENCY,

    credits:
      packageInfo.credits,

    durationSeconds:
      packageInfo.seconds,

    planTier:
      packageInfo.tier

  };

}


/* =========================================================
   VERIFY PAYSTACK TRANSACTION
========================================================= */

async function verifyTransaction(
  reference,
  authenticatedEmail,
  cfg
) {

  const ref =
    clean(reference);


  if (!ref) {

    return {
      success: false,
      paid: false,
      error:
        "Payment reference is required."
    };

  }


  /*
   * Only references created by OBITREND
   * are allowed to activate an OBITREND plan.
   */

  const referenceMatch =
    ref.match(
      /^OBITREND-(PRO_4_DAY|PRO_8_DAY|PRO_14_DAY|PRO_MONTHLY)-/i
    );


  if (!referenceMatch) {

    return {
      success: false,
      paid: false,
      error:
        "This payment is not a valid OBITREND Pro payment."
    };

  }


  const plan =
    upper(referenceMatch[1]);


  const packageInfo =
    getPackage(plan);


  if (!packageInfo) {

    return {
      success: false,
      paid: false,
      error:
        "This OBITREND Pro package is not valid."
    };

  }


  /*
   * Ask Paystack directly.
   */

  const result =
    await paystackRequest(
      `/transaction/verify/${encodeURIComponent(ref)}`,
      cfg.secretKey
    );


  if (
    !result.ok ||
    result.data?.status !== true ||
    !result.data?.data
  ) {

    return {
      success: false,
      paid: false,
      reference: ref,
      error:
        result.data?.message ||
        "Paystack could not verify this payment."
    };

  }


  const tx =
    result.data.data;


  /* =======================================================
     TRANSACTION REFERENCE MUST MATCH
  ======================================================= */

  const verifiedReference =
    clean(tx.reference);


  if (
    !verifiedReference ||
    verifiedReference !== ref
  ) {

    return {
      success: false,
      paid: false,
      reference: ref,
      error:
        "The Paystack transaction reference could not be confirmed."
    };

  }


  /* =======================================================
     PAYMENT MUST BE SUCCESSFUL
  ======================================================= */

  if (
    upper(tx.status) !== "SUCCESS"
  ) {

    return {
      success: false,
      paid: false,
      reference: verifiedReference,
      error:
        "Payment has not been completed successfully."
    };

  }


  /* =======================================================
     CURRENCY MUST BE NGN
  ======================================================= */

  if (
    upper(tx.currency) !== CURRENCY
  ) {

    return {
      success: false,
      paid: false,
      reference: verifiedReference,
      error:
        "Payment currency does not match OBITREND."
    };

  }


  /* =======================================================
     EXACT PAYMENT AMOUNT
  ======================================================= */

  const actualAmount =
    Number(tx.amount);


  const requestedAmount =
    Number(tx.requested_amount);


  const amountIsCorrect =
    Number.isFinite(actualAmount) &&
    actualAmount === packageInfo.amount;


  if (!amountIsCorrect) {

    return {
      success: false,
      paid: false,
      reference: verifiedReference,
      error:
        "The payment amount does not match the selected OBITREND Pro package."
    };

  }


  /*
   * If Paystack provides requested_amount,
   * it must also agree with the package.
   */

  if (
    Number.isFinite(requestedAmount) &&
    requestedAmount !== packageInfo.amount
  ) {

    return {
      success: false,
      paid: false,
      reference: verifiedReference,
      error:
        "The requested payment amount does not match the selected OBITREND Pro package."
    };

  }


  /* =======================================================
     PAYMENT OWNER
  ======================================================= */

  const paymentEmail =
    clean(
      tx.customer?.email ||
      tx.email
    ).toLowerCase();


  const accountEmail =
    clean(
      authenticatedEmail
    ).toLowerCase();


  if (
    !paymentEmail ||
    !accountEmail ||
    paymentEmail !== accountEmail
  ) {

    return {
      success: false,
      paid: false,
      reference: verifiedReference,
      error:
        "This payment belongs to a different OBITREND account."
    };

  }


  /* =======================================================
     RETURN VERIFIED PACKAGE
  ======================================================= */

  return {

    success: true,

    paid: true,

    reference:
      verifiedReference,

    status:
      tx.status,

    amount:
      actualAmount,

    requestedAmount:
      Number.isFinite(requestedAmount)
        ? requestedAmount
        : packageInfo.amount,

    currency:
      CURRENCY,

    email:
      paymentEmail,

    plan,

    planName:
      packageInfo.name,

    credits:
      packageInfo.credits,

    durationSeconds:
      packageInfo.seconds,

    planTier:
      packageInfo.tier

  };

}


/* =========================================================
   VERIFY RETURNED PAYMENT
========================================================= */

async function handleGet(
  req,
  res
) {

  const cfg =
    getConfig();


  if (!cfg.secretKey) {

    return send(
      res,
      500,
      {
        success: false,
        error:
          "PAYSTACK_SECRET_KEY is not configured."
      }
    );

  }


  const url =
    new URL(
      req.url,
      cfg.appUrl
    );


  const reference =
    clean(
      url.searchParams.get("reference") ||
      url.searchParams.get("trxref") ||
      url.searchParams.get("ref")
    );


  /*
   * GET without a reference simply confirms
   * that the payment service exists.
   */

  if (!reference) {

    return send(
      res,
      200,
      {
        success: true,
        service:
          "OBITREND Pro Payments",
        status:
          "ready"
      }
    );

  }


  /* =======================================================
     AUTHENTICATE USER
  ======================================================= */

  const auth =
    await getAuthenticatedUser(req);


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


  /* =======================================================
     VERIFY REAL PAYSTACK PAYMENT
  ======================================================= */

  const result =
    await verifyTransaction(
      reference,
      auth.user.email,
      cfg
    );


  if (!result.success) {

    return send(
      res,
      400,
      result
    );

  }


  /* =======================================================
     REDIS
  ======================================================= */

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
        paid: true,
        error:
          "OBITREND payment storage is not configured."
      }
    );

  }


  /* =======================================================
     PREVENT DOUBLE ACTIVATION
  ======================================================= */

  const redemptionKey =
    redeemedReferenceKey(
      result.reference
    );


  let redemptionCreated = false;


  try {

    const redemption =
      await redisCommand(
        redis,
        [
          "SET",
          redemptionKey,
          auth.user.id,
          "NX",
          "EX",
          "31536000"
        ]
      );


    redemptionCreated =
      String(redemption || "").toUpperCase() ===
      "OK";


  } catch {

    return send(
      res,
      500,
      {
        success: false,
        paid: true,
        error:
          "OBITREND could not secure this payment confirmation. Please try again."
      }
    );

  }


  /*
   * This exact reference has already
   * activated an account.
   */

  if (!redemptionCreated) {

    return send(
      res,
      200,
      {
        success: true,
        paid: true,
        alreadyActivated: true,
        proActivated: true,
        proActive: true,
        reference:
          result.reference,
        plan:
          result.plan,
        planName:
          result.planName,
        credits:
          result.credits,
        durationSeconds:
          result.durationSeconds,
        planTier:
          result.planTier,
        accountUserId:
          auth.user.id
      }
    );

  }


  /* =======================================================
     ACTIVATE EXACT PAID PACKAGE
  ======================================================= */

  try {

    const activated =
      await activatePro(
        auth.user.id,
        auth.user.email,
        result.reference,
        redis,
        result.durationSeconds,
        result.credits,
        result.plan
      );


    return send(
      res,
      200,
      {

        ...result,

        proActivated:
          true,

        proActive:
          true,

        alreadyActivated:
          false,

        accountUserId:
          auth.user.id,

        expiresAt:
          activated?.expiresAt ||
          null

      }
    );


  } catch (error) {

    /*
     * If activation fails, remove the redemption lock
     * so the verified payment can safely be retried.
     */

    try {

      await redisCommand(
        redis,
        [
          "DEL",
          redemptionKey
        ]
      );

    } catch {
      /* Keep the original activation error. */
    }


    console.error(
      "OBITREND Pro activation failed:",
      error
    );


    return send(
      res,
      500,
      {
        success: false,
        paid: true,
        error:
          "Your payment was verified, but OBITREND could not activate Pro yet. Please try again."
      }
    );

  }

}


/* =========================================================
   START PAYMENT
========================================================= */

async function handlePost(
  req,
  res
) {

  const cfg =
    getConfig();


  if (!cfg.secretKey) {

    return send(
      res,
      500,
      {
        success: false,
        error:
          "PAYSTACK_SECRET_KEY is not configured."
      }
    );

  }


  /* =======================================================
     AUTHENTICATE USER
  ======================================================= */

  const auth =
    await getAuthenticatedUser(req);


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


  /* =======================================================
     READ REQUEST
  ======================================================= */

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
            "Invalid payment request."
        }
      );

    }

  }


  /*
   * ONLY the plan is accepted from the client.
   *
   * We deliberately ignore:
   * - userId
   * - email
   * - amount
   * - credits
   * - duration
   * - tier
   *
   * Those values are controlled by the server.
   */

  const plan =
    upper(body.plan);


  const packageInfo =
    getPackage(plan);


  if (!packageInfo) {

    return send(
      res,
      400,
      {
        success: false,
        error:
          "Please select a valid OBITREND Pro package."
      }
    );

  }


  /* =======================================================
     START PAYSTACK
  ======================================================= */

  const payment =
    await initializePayment(
      auth.user.email,
      plan,
      cfg
    );


  return send(
    res,
    payment.success
      ? 200
      : 400,
    payment
  );

}


/* =========================================================
   MAIN API HANDLER
========================================================= */

export default async function handler(
  req,
  res
) {

  res.setHeader(
    "Access-Control-Allow-Origin",
    process.env.OBITREND_APP_URL ||
      DEFAULT_APP_URL
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Authorization"
  );


  if (
    req.method === "OPTIONS"
  ) {

    return res
      .status(204)
      .end();

  }


  if (
    req.method === "GET"
  ) {

    return handleGet(
      req,
      res
    );

  }


  if (
    req.method === "POST"
  ) {

    return handlePost(
      req,
      res
    );

  }


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
