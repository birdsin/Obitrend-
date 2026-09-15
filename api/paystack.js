import {
  activatePro,
  getAuthenticatedUser,
  getProStatus,
  getRedisConfig
} from "../lib/credits.js";

/*
=========================================================
OBITREND AI FASHION CREATOR
PAYSTACK PRO PAYMENT API
=========================================================

PACKAGES

₦10,000 → 4 Days → 5 Credits → Standard
₦20,000 → 8 Days → 10 Credits → Standard
₦30,000 → 14 Days → 15 Credits → Standard
₦60,000 → 30 Days → 30 Credits → Full

IMPORTANT
- Payment is verified directly with Paystack.
- User email must match the authenticated account.
- Payment metadata contains the Supabase user ID.
- Payment references are protected against duplicate activation.
- Already-claimed payments return the REAL current Pro status.
=========================================================
*/

const PAYSTACK_BASE =
  "https://api.paystack.co";

/*
=========================================================
PRO PACKAGES
=========================================================
*/

const PRO_PACKAGES = {
  PRO_4_DAY: {
    amount: 1000000,
    durationDays: 4,
    durationSeconds: 4 * 24 * 60 * 60,
    credits: 5,
    tier: "standard",
    name: "OBITREND 4 Day Pro"
  },

  PRO_8_DAY: {
    amount: 2000000,
    durationDays: 8,
    durationSeconds: 8 * 24 * 60 * 60,
    credits: 10,
    tier: "standard",
    name: "OBITREND 8 Day Pro"
  },

  PRO_14_DAY: {
    amount: 3000000,
    durationDays: 14,
    durationSeconds: 14 * 24 * 60 * 60,
    credits: 15,
    tier: "standard",
    name: "OBITREND 14 Day Pro"
  },

  PRO_MONTHLY: {
    amount: 6000000,
    durationDays: 30,
    durationSeconds: 30 * 24 * 60 * 60,
    credits: 30,
    tier: "full",
    name: "OBITREND Monthly Full Pro"
  }
};

/*
=========================================================
HELPERS
=========================================================
*/

function json(res, status, data) {
  res.status(status).json(data);
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return cleanString(value).toUpperCase();
}

function getAppUrl(req) {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.VERCEL_URL ||
    "";

  if (configured) {
    if (configured.startsWith("http://") || configured.startsWith("https://")) {
      return configured.replace(/\/+$/, "");
    }

    return `https://${configured}`.replace(/\/+$/, "");
  }

  const host =
    req.headers?.["x-forwarded-host"] ||
    req.headers?.host ||
    "";

  const protocol =
    req.headers?.["x-forwarded-proto"] ||
    "https";

  if (host) {
    return `${protocol}://${host}`.replace(/\/+$/, "");
  }

  return "";
}

function getPaystackSecret() {
  const key =
    process.env.PAYSTACK_SECRET_KEY ||
    process.env.PAYSTACK_SECRET ||
    "";

  return cleanString(key);
}

/*
=========================================================
PACKAGE RESOLUTION
=========================================================
*/

function getPackage(plan) {
  const key = upper(plan);

  return PRO_PACKAGES[key] || null;
}

function packageFromAmount(amount) {
  const numericAmount = Number(amount);

  for (const [plan, info] of Object.entries(PRO_PACKAGES)) {
    if (numericAmount === info.amount) {
      return {
        plan,
        ...info
      };
    }
  }

  return null;
}

/*
=========================================================
REDIS REST CLIENT
=========================================================
*/

async function redisCommand(redis, command, args = []) {
  if (!redis) {
    throw new Error("Redis configuration is missing.");
  }

  const baseUrl =
    redis.url ||
    redis.restUrl ||
    redis.redisUrl ||
    "";

  const token =
    redis.token ||
    redis.restToken ||
    redis.redisToken ||
    "";

  if (!baseUrl || !token) {
    throw new Error("Redis URL or token is missing.");
  }

  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([command, ...args])
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(
      typeof data === "string"
        ? data
        : data?.error ||
          data?.message ||
          "Redis request failed."
    );
  }

  return data?.result ?? data;
}

/*
=========================================================
PAYMENT REFERENCE CLAIM
=========================================================

SET NX prevents the same Paystack reference from being
activated twice through the direct verification endpoint.
=========================================================
*/

async function claimPaymentReference(redis, reference) {
  const key =
    `obitrend:paystack:redeemed:${reference}`;

  const result = await redisCommand(
    redis,
    "SET",
    [
      key,
      "1",
      "NX",
      "EX",
      "86400"
    ]
  );

  return result === "OK";
}

async function releasePaymentClaim(redis, reference) {
  const key =
    `obitrend:paystack:redeemed:${reference}`;

  try {
    await redisCommand(
      redis,
      "DEL",
      [key]
    );
  } catch {
    /*
     Do not hide the original activation error.
    */
  }
}

/*
=========================================================
PAYSTACK REQUEST
=========================================================
*/

async function paystackRequest(path, options = {}) {
  const secret = getPaystackSecret();

  if (!secret) {
    throw new Error(
      "PAYSTACK_SECRET_KEY is not configured."
    );
  }

  const response = await fetch(
    `${PAYSTACK_BASE}${path}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    }
  );

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = {
      message: text
    };
  }

  if (!response.ok || data?.status === false) {
    throw new Error(
      data?.message ||
      "Paystack request failed."
    );
  }

  return data;
}

/*
=========================================================
INITIALIZE PAYMENT
=========================================================
*/

async function initializePayment(
  email,
  plan,
  cfg,
  userId
) {
  const requestedPlan = upper(plan);
  const packageInfo = getPackage(requestedPlan);

  if (!packageInfo) {
    throw new Error(
      "Invalid OBITREND Pro package."
    );
  }

  if (!userId) {
    throw new Error(
      "Authenticated user ID is missing."
    );
  }

  const reference =
    `OBI_${requestedPlan}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 10)
      .toUpperCase()}`;

  const appUrl =
    cfg.appUrl ||
    "";

  const callbackUrl =
    appUrl
      ? `${appUrl}/`
      : undefined;

  const metadata = {
    product:
      "OBITREND_PRO",

    package:
      requestedPlan,

    package_name:
      packageInfo.name,

    credits:
      packageInfo.credits,

    duration_days:
      packageInfo.durationDays,

    duration_seconds:
      packageInfo.durationSeconds,

    tier:
      packageInfo.tier,

    /*
     IMPORTANT:
     This allows the webhook to identify the exact
     Supabase user who started the payment.
    */
    obitrend_user_id:
      userId,

    user_id:
      userId,

    source:
      "OBITREND_AI_FASHION_CREATOR"
  };

  const payload = {
    email: cleanString(email).toLowerCase(),

    amount:
      packageInfo.amount,

    currency:
      "NGN",

    reference,

    metadata,

    channels: [
      "card",
      "bank",
      "ussd",
      "qr",
      "mobile_money",
      "bank_transfer"
    ]
  };

  if (callbackUrl) {
    payload.callback_url =
      callbackUrl;
  }

  const result =
    await paystackRequest(
      "/transaction/initialize",
      {
        method: "POST",
        body: JSON.stringify(payload)
      }
    );

  if (
    !result?.data?.authorization_url ||
    !result?.data?.reference
  ) {
    throw new Error(
      "Paystack did not return a valid payment authorization."
    );
  }

  return {
    ok: true,

    authorizationUrl:
      result.data.authorization_url,

    accessCode:
      result.data.access_code,

    reference:
      result.data.reference,

    plan:
      requestedPlan,

    package:
      packageInfo.name,

    amount:
      packageInfo.amount,

    credits:
      packageInfo.credits,

    durationDays:
      packageInfo.durationDays,

    tier:
      packageInfo.tier
  };
}

/*
=========================================================
VERIFY PAYSTACK TRANSACTION
=========================================================
*/

async function verifyTransaction(
  reference,
  authUser
) {
  const cleanReference =
    cleanString(reference);

  if (!cleanReference) {
    throw new Error(
      "Payment reference is missing."
    );
  }

  const result =
    await paystackRequest(
      `/transaction/verify/${encodeURIComponent(
        cleanReference
      )}`,
      {
        method: "GET"
      }
    );

  const transaction =
    result?.data;

  if (!transaction) {
    throw new Error(
      "Paystack returned no transaction data."
    );
  }

  /*
  =======================================================
  PAYMENT STATUS
  =======================================================
  */

  if (
    transaction.status !== "success"
  ) {
    throw new Error(
      `Payment is not successful. Current status: ${
        transaction.status || "unknown"
      }`
    );
  }

  /*
  =======================================================
  CURRENCY
  =======================================================
  */

  if (
    upper(transaction.currency) !== "NGN"
  ) {
    throw new Error(
      "Payment currency is not NGN."
    );
  }

  /*
  =======================================================
  EMAIL PROTECTION
  =======================================================
  */

  const authenticatedEmail =
    cleanString(
      authUser?.email
    ).toLowerCase();

  const paystackEmail =
    cleanString(
      transaction?.customer?.email
    ).toLowerCase();

  if (
    !authenticatedEmail ||
    !paystackEmail ||
    authenticatedEmail !== paystackEmail
  ) {
    throw new Error(
      "Payment email does not match the authenticated OBITREND account."
    );
  }

  /*
  =======================================================
  AMOUNT
  =======================================================
  */

  const actualAmount =
    Number(transaction.amount);

  if (
    !Number.isFinite(actualAmount) ||
    actualAmount <= 0
  ) {
    throw new Error(
      "Invalid Paystack transaction amount."
    );
  }

  /*
  =======================================================
  METADATA
  =======================================================
  */

  const metadata =
    transaction.metadata || {};

  let metadataPlan =
    upper(
      metadata.package ||
      metadata.plan ||
      ""
    );

  /*
  =======================================================
  RESOLVE PACKAGE BY AMOUNT

  The amount is authoritative for these fixed OBITREND
  packages.
  =======================================================
  */

  const amountPackage =
    packageFromAmount(actualAmount);

  if (!amountPackage) {
    throw new Error(
      `Unsupported OBITREND payment amount: ₦${(
        actualAmount / 100
      ).toLocaleString()}`
    );
  }

  const resolvedPlan =
    amountPackage.plan;

  /*
  =======================================================
  METADATA PACKAGE CHECK
  =======================================================

  If metadata contains a package, it must agree with
  the actual amount.
  =======================================================
  */

  if (
    metadataPlan &&
    metadataPlan !== resolvedPlan
  ) {
    throw new Error(
      "Payment package does not match the paid amount."
    );
  }

  metadataPlan =
    resolvedPlan;

  /*
  =======================================================
  USER ID PROTECTION
  =======================================================
  */

  const metadataUserId =
    cleanString(
      metadata.obitrend_user_id ||
      metadata.user_id ||
      metadata.userId ||
      ""
    );

  /*
  If Paystack metadata contains a user ID, make sure
  it belongs to the authenticated account.
  */
  if (
    metadataUserId &&
    metadataUserId !== authUser.id
  ) {
    throw new Error(
      "Payment user does not match the authenticated OBITREND account."
    );
  }

  /*
  =======================================================
  FINAL PACKAGE
  =======================================================
  */

  const packageInfo =
    getPackage(metadataPlan);

  if (!packageInfo) {
    throw new Error(
      "Unable to determine OBITREND Pro package."
    );
  }

  /*
  =======================================================
  FINAL AMOUNT CHECK
  =======================================================
  */

  if (
    actualAmount !==
    packageInfo.amount
  ) {
    throw new Error(
      "Payment amount does not match the selected Pro package."
    );
  }

  return {
    ok: true,

    reference:
      cleanReference,

    plan:
      resolvedPlan,

    amount:
      actualAmount,

    currency:
      "NGN",

    email:
      paystackEmail,

    metadata,

    package:
      packageInfo.name,

    credits:
      packageInfo.credits,

    durationDays:
      packageInfo.durationDays,

    durationSeconds:
      packageInfo.durationSeconds,

    tier:
      packageInfo.tier,

    transaction
  };
}

/*
=========================================================
ACTIVATE VERIFIED PAYMENT
=========================================================
*/

async function activateVerifiedPayment(
  authUser,
  verified,
  redis
) {
  const reference =
    verified.reference;

  /*
  =======================================================
  CLAIM PAYMENT REFERENCE
  =======================================================
  */

  const claimed =
    await claimPaymentReference(
      redis,
      reference
    );

  /*
  =======================================================
  ALREADY CLAIMED

  Do NOT manufacture a fake balance.

  Read the actual Redis Pro status instead.
  =======================================================
  */

  if (!claimed) {
    const current =
      await getProStatus(
        authUser.id,
        redis
      );

    return {
      ok: true,

      alreadyActivated: true,

      reference,

      proActive:
        !!current?.active,

      active:
        !!current?.active,

      plan:
        current?.plan ||
        null,

      proCredits:
        Number(
          current?.proCredits ??
          current?.proCreditsRemaining ??
          0
        ),

      proCreditsRemaining:
        Number(
          current?.proCreditsRemaining ??
          current?.proCredits ??
          0
        ),

      proCreditsTotal:
        Number(
          current?.proCreditsTotal ??
          0
        ),

      expiresAt:
        current?.expiresAt ??
        null,

      secondsRemaining:
        Number(
          current?.secondsRemaining ??
          0
        ),

      tier:
        current?.tier ||
        (
          verified.tier
        ),

      package:
        verified.package,

      message:
        current?.active
          ? "Payment has already been activated."
          : "Payment reference was already processed."
    };
  }

  /*
  =======================================================
  ACTIVATE PRO
  =======================================================
  */

  try {
    const activated =
      await activatePro(
        authUser.id,
        authUser.email,
        reference,
        redis,
        verified.plan
      );

    return {
      ok: true,

      alreadyActivated: false,

      reference,

      proActive:
        true,

      active:
        true,

      plan:
        activated?.plan ||
        verified.plan,

      package:
        verified.package,

      proCredits:
        Number(
          activated?.proCredits ??
          verified.credits
        ),

      proCreditsRemaining:
        Number(
          activated?.proCreditsRemaining ??
          activated?.proCredits ??
          verified.credits
        ),

      proCreditsTotal:
        Number(
          activated?.proCreditsTotal ??
          verified.credits
        ),

      credits:
        Number(
          activated?.proCredits ??
          verified.credits
        ),

      expiresAt:
        activated?.expiresAt ??
        null,

      durationSeconds:
        Number(
          activated?.durationSeconds ??
          verified.durationSeconds
        ),

      durationDays:
        verified.durationDays,

      tier:
        activated?.tier ||
        verified.tier,

      message:
        "OBITREND Pro activated successfully."
    };
  } catch (error) {
    /*
    If activation fails, release the claim so the same
    successful payment can safely be retried.
    */

    await releasePaymentClaim(
      redis,
      reference
    );

    throw error;
  }
}

/*
=========================================================
POST
=========================================================

Creates a Paystack payment.
=========================================================
*/

async function handlePost(
  req,
  res,
  authUser,
  cfg
) {
  const body =
    req.body || {};

  const requestedPlan =
    upper(
      body.plan ||
      body.package ||
      ""
    );

  const packageInfo =
    getPackage(requestedPlan);

  if (!packageInfo) {
    return json(
      res,
      400,
      {
        ok: false,
        error:
          "Invalid Pro package.",
        availablePlans:
          Object.keys(
            PRO_PACKAGES
          )
      }
    );
  }

  const email =
    cleanString(
      body.email ||
      authUser.email
    ).toLowerCase();

  /*
  Never allow the frontend to choose an email different
  from the authenticated OBITREND account.
  */

  if (
    email !==
    cleanString(
      authUser.email
    ).toLowerCase()
  ) {
    return json(
      res,
      403,
      {
        ok: false,
        error:
          "Payment email must match the authenticated OBITREND account."
      }
    );
  }

  const payment =
    await initializePayment(
      email,
      requestedPlan,
      cfg,
      authUser.id
    );

  return json(
    res,
    200,
    payment
  );
}

/*
=========================================================
GET
=========================================================

Verifies a Paystack payment reference and activates Pro.
=========================================================
*/

async function handleGet(
  req,
  res,
  authUser,
  redis
) {
  const reference =
    cleanString(
      req.query?.reference ||
      req.query?.trxref ||
      req.query?.trx_ref ||
      ""
    );

  if (!reference) {
    return json(
      res,
      400,
      {
        ok: false,
        error:
          "Payment reference is required."
      }
    );
  }

  const verified =
    await verifyTransaction(
      reference,
      authUser
    );

  const activated =
    await activateVerifiedPayment(
      authUser,
      verified,
      redis
    );

  return json(
    res,
    200,
    activated
  );
}

/*
=========================================================
MAIN HANDLER
=========================================================
*/

export default async function handler(
  req,
  res
) {
  try {
    /*
    -----------------------------------------------------
    METHOD
    -----------------------------------------------------
    */

    if (
      req.method !== "POST" &&
      req.method !== "GET"
    ) {
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
            "Method not allowed."
        }
      );
    }

    /*
    -----------------------------------------------------
    AUTHENTICATION
    -----------------------------------------------------
    */

    const auth =
      await getAuthenticatedUser(req);

    if (
      !auth?.ok ||
      !auth?.user?.id
    ) {
      return json(
        res,
        401,
        {
          ok: false,
          error:
            "Authentication required."
        }
      );
    }

    const authUser =
      auth.user;

    /*
    -----------------------------------------------------
    REDIS
    -----------------------------------------------------
    */

    const redis =
      await getRedisConfig();

    if (!redis) {
      return json(
        res,
        500,
        {
          ok: false,
          error:
            "Redis configuration is unavailable."
        }
      );
    }

    /*
    -----------------------------------------------------
    APP URL
    -----------------------------------------------------
    */

    const appUrl =
      getAppUrl(req);

    const cfg = {
      appUrl
    };

    /*
    -----------------------------------------------------
    POST
    -----------------------------------------------------
    */

    if (
      req.method === "POST"
    ) {
      return await handlePost(
        req,
        res,
        authUser,
        cfg
      );
    }

    /*
    -----------------------------------------------------
    GET
    -----------------------------------------------------
    */

    return await handleGet(
      req,
      res,
      authUser,
      redis
    );

  } catch (error) {
    console.error(
      "OBITREND PAYSTACK ERROR:",
      error
    );

    return json(
      res,
      500,
      {
        ok: false,
        error:
          error?.message ||
          "Payment processing failed."
      }
    );
  }
}
