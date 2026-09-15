import crypto from "crypto";

import {
  activatePro,
  getAuthenticatedUser,
  getProStatus,
  getRedisConfig
} from "../lib/credits.js";

import {
  getVideoPackage,
  getVideoStatus,
  addVideoSeconds
} from "../lib/video-credits.js";

/*
=========================================================
OBITREND PAYSTACK PAYMENT SYSTEM
=========================================================

ONE PAYSTACK ENDPOINT

/api/paystack

Handles:

1. Pro payment initialization
2. Pro payment callback verification
3. Pro payment webhook fulfillment
4. Video payment initialization
5. Video payment callback verification
6. Video payment webhook fulfillment

PRODUCTS:

PRO
---------------------------------------------------------
₦10,000 = 4 days  = 5 credits
₦20,000 = 8 days  = 10 credits
₦30,000 = 14 days = 15 credits
₦60,000 = 30 days = 30 credits / Full Pro

VIDEO
---------------------------------------------------------
₦5,000  = 5 seconds
₦10,000 = 10 seconds
₦15,000 = 15 seconds
₦20,000 = 20 seconds

IMPORTANT:

- Paystack webhook does NOT use Supabase authentication.
- Paystack webhook is authenticated by x-paystack-signature.
- Normal app requests still require Supabase authentication.
- Payment references are protected against duplicate fulfillment.
- Amounts are verified server-side.
- Currency is verified server-side.
- Product metadata is verified server-side.
=========================================================
*/

export const config = {
  api: {
    bodyParser: false
  }
};

const PAYSTACK_BASE = "https://api.paystack.co";

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
VIDEO PACKAGES
=========================================================
*/

const VIDEO_PACKAGES = {
  VIDEO_5_SEC: {
    amount: 500000,
    seconds: 5,
    name: "OBITREND Video 5 Seconds"
  },

  VIDEO_10_SEC: {
    amount: 1000000,
    seconds: 10,
    name: "OBITREND Video 10 Seconds"
  },

  VIDEO_15_SEC: {
    amount: 1500000,
    seconds: 15,
    name: "OBITREND Video 15 Seconds"
  },

  VIDEO_20_SEC: {
    amount: 2000000,
    seconds: 20,
    name: "OBITREND Video 20 Seconds"
  }
};

/*
=========================================================
JSON RESPONSE
=========================================================
*/

function json(res, status, data) {
  return res.status(status).json(data);
}

/*
=========================================================
STRING HELPERS
=========================================================
*/

function cleanString(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return cleanString(value).toUpperCase();
}

/*
=========================================================
APP URL
=========================================================
*/

function getAppUrl() {
  const value =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL ||
    "https://obitrend.vercel.app";

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value.replace(/\/+$/, "");
  }

  return `https://${value}`.replace(/\/+$/, "");
}

/*
=========================================================
PAYSTACK SECRET
=========================================================
*/

function getPaystackSecret() {
  const secret =
    process.env.PAYSTACK_SECRET_KEY ||
    process.env.PAYSTACK_SECRET ||
    "";

  if (!secret) {
    throw new Error("Paystack secret key is not configured.");
  }

  return secret;
}

/*
=========================================================
PRO PACKAGE LOOKUP
=========================================================
*/

function getPackage(plan) {
  const requested = upper(plan);

  return PRO_PACKAGES[requested] || null;
}

/*
=========================================================
PRO PACKAGE BY AMOUNT
=========================================================
*/

function packageFromAmount(amount) {
  const numericAmount = Number(amount);

  for (const [id, pkg] of Object.entries(PRO_PACKAGES)) {
    if (pkg.amount === numericAmount) {
      return {
        id,
        ...pkg
      };
    }
  }

  return null;
}

/*
=========================================================
VIDEO PACKAGE BY AMOUNT
=========================================================
*/

function videoPackageFromAmount(amount) {
  const numericAmount = Number(amount);

  for (const [id, pkg] of Object.entries(VIDEO_PACKAGES)) {
    if (pkg.amount === numericAmount) {
      return {
        id,
        ...pkg
      };
    }
  }

  return null;
}

/*
=========================================================
REDIS COMMAND
=========================================================
*/

async function redisCommand(redis, command, args = []) {
  if (!redis) {
    throw new Error("Redis configuration is unavailable.");
  }

  const url =
    redis.url ||
    redis.restUrl ||
    redis.endpoint ||
    redis.host;

  const token =
    redis.token ||
    redis.restToken ||
    redis.password;

  if (!url || !token) {
    throw new Error("Redis configuration is incomplete.");
  }

  const response = await fetch(url, {
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
      `Redis command failed: ${response.status}`
    );
  }

  return data;
}

/*
=========================================================
SHARED PAYMENT CLAIM

THIS KEY IS USED FOR BOTH:

PRO WEBHOOK
VIDEO WEBHOOK
PRO CALLBACK
VIDEO CALLBACK

This prevents the same Paystack transaction from
delivering value twice.
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
      "31536000"
    ]
  );

  return (
    result === "OK" ||
    result === true ||
    result === 1
  );
}

/*
=========================================================
RELEASE PAYMENT CLAIM
=========================================================
*/

async function releasePaymentClaim(redis, reference) {
  try {
    const key =
      `obitrend:paystack:redeemed:${reference}`;

    await redisCommand(
      redis,
      "DEL",
      [key]
    );
  } catch {
    /*
      Do not replace the original payment error
      with a Redis cleanup error.
    */
  }
}

/*
=========================================================
PAYSTACK API REQUEST
=========================================================
*/

async function paystackRequest(path, options = {}) {
  const secret = getPaystackSecret();

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

  if (!response.ok) {
    throw new Error(
      data?.message ||
      `Paystack request failed: ${response.status}`
    );
  }

  return data;
}

/*
=========================================================
RAW REQUEST BODY

Needed because Paystack webhook signature must be
calculated against the original raw request body.
=========================================================
*/

async function readRawBody(req) {
  if (
    Buffer.isBuffer(req.body)
  ) {
    return req.body;
  }

  if (
    typeof req.body === "string"
  ) {
    return Buffer.from(req.body);
  }

  const chunks = [];

  for await (const chunk of req) {
    chunks.push(
      Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk)
    );
  }

  return Buffer.concat(chunks);
}

/*
=========================================================
PARSE JSON BODY
=========================================================
*/

function parseJsonBody(rawBody) {
  if (!rawBody) {
    return {};
  }

  if (Buffer.isBuffer(rawBody)) {
    const text = rawBody.toString("utf8").trim();

    if (!text) {
      return {};
    }

    return JSON.parse(text);
  }

  if (typeof rawBody === "string") {
    const text = rawBody.trim();

    if (!text) {
      return {};
    }

    return JSON.parse(text);
  }

  if (
    typeof rawBody === "object"
  ) {
    return rawBody;
  }

  return {};
}

/*
=========================================================
GET HEADER SAFELY
=========================================================
*/

function getHeader(req, name) {
  const value =
    req.headers?.[name] ??
    req.headers?.[name.toLowerCase()] ??
    req.headers?.[name.toUpperCase()];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

/*
=========================================================
VERIFY PAYSTACK WEBHOOK SIGNATURE
=========================================================
*/

function verifyPaystackSignature(rawBody, signature) {
  const secret = getPaystackSecret();

  const provided = cleanString(signature);

  if (!provided) {
    return false;
  }

  const expected = crypto
    .createHmac("sha512", secret)
    .update(rawBody)
    .digest("hex");

  const expectedBuffer =
    Buffer.from(expected, "utf8");

  const providedBuffer =
    Buffer.from(provided, "utf8");

  if (
    expectedBuffer.length !==
    providedBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    expectedBuffer,
    providedBuffer
  );
}

/*
=========================================================
INITIALIZE PRO PAYMENT
=========================================================
*/

async function initializePayment(
  email,
  plan,
  userId
) {
  const requestedPlan = upper(plan);

  const packageInfo =
    getPackage(requestedPlan);

  if (!packageInfo) {
    throw new Error(
      "Invalid Pro package selected."
    );
  }

  const normalizedEmail =
    cleanString(email).toLowerCase();

  if (!normalizedEmail) {
    throw new Error(
      "A valid email address is required."
    );
  }

  const reference =
    `OBI_${requestedPlan}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 10)
      .toUpperCase()}`;

  const callbackUrl =
    `${getAppUrl()}/`;

  const metadata = {
    product: "OBITREND_PRO",
    package: requestedPlan,
    package_name: packageInfo.name,
    credits: packageInfo.credits,
    duration_days: packageInfo.durationDays,
    duration_seconds: packageInfo.durationSeconds,
    tier: packageInfo.tier,
    obitrend_user_id: userId,
    user_id: userId,
    obitrend_email: normalizedEmail,
    source: "OBITREND_AI_FASHION_CREATOR"
  };

  const result =
    await paystackRequest(
      "/transaction/initialize",
      {
        method: "POST",
        body: JSON.stringify({
          email: normalizedEmail,
          amount: packageInfo.amount,
          currency: "NGN",
          reference,
          metadata,
          channels: [
            "card",
            "bank",
            "ussd",
            "qr",
            "mobile_money",
            "bank_transfer"
          ],
          callback_url: callbackUrl
        })
      }
    );

  if (
    !result?.status ||
    !result?.data
  ) {
    throw new Error(
      result?.message ||
      "Paystack could not initialize the payment."
    );
  }

  return {
    status: true,

    authorization_url:
      result.data.authorization_url,

    authorizationUrl:
      result.data.authorization_url,

    access_code:
      result.data.access_code,

    accessCode:
      result.data.access_code,

    reference:
      result.data.reference ||
      reference,

    plan: requestedPlan,

    package: requestedPlan,

    amount: packageInfo.amount,

    credits: packageInfo.credits,

    durationDays:
      packageInfo.durationDays,

    durationSeconds:
      packageInfo.durationSeconds,

    tier:
      packageInfo.tier,

    product: "OBITREND_PRO"
  };
}

/*
=========================================================
INITIALIZE VIDEO PAYMENT
=========================================================
*/

async function initializeVideoPayment(
  email,
  plan,
  userId
) {
  const requestedPlan = upper(plan);

  let packageInfo =
    null;

  try {
    packageInfo =
      getVideoPackage(requestedPlan);
  } catch {
    packageInfo = null;
  }

  /*
    Fallback to the local package table so this
    endpoint remains stable even if video-credits.js
    changes its lookup behavior.
  */
  if (!packageInfo) {
    const local =
      VIDEO_PACKAGES[requestedPlan];

    if (local) {
      packageInfo = {
        id: requestedPlan,
        ...local
      };
    }
  }

  if (!packageInfo) {
    throw new Error(
      "Invalid Video package selected."
    );
  }

  const normalizedEmail =
    cleanString(email).toLowerCase();

  if (!normalizedEmail) {
    throw new Error(
      "A valid email address is required."
    );
  }

  const reference =
    `OBI_VIDEO_${requestedPlan}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 10)
      .toUpperCase()}`;

  const callbackUrl =
    `${getAppUrl()}/?obitrend_video_payment=return`;

  const metadata = {
    product: "OBITREND_VIDEO",
    package: packageInfo.id || requestedPlan,
    package_name:
      packageInfo.name ||
      `OBITREND Video ${packageInfo.seconds} Seconds`,
    video_seconds: Number(packageInfo.seconds),
    amount: Number(packageInfo.amount),
    currency: "NGN",
    obitrend_user_id: userId,
    user_id: userId,
    obitrend_email: normalizedEmail,
    source: "OBITREND_AI_VIDEO_STUDIO"
  };

  const result =
    await paystackRequest(
      "/transaction/initialize",
      {
        method: "POST",
        body: JSON.stringify({
          email: normalizedEmail,
          amount: Number(packageInfo.amount),
          currency: "NGN",
          reference,
          metadata,
          channels: [
            "card",
            "bank",
            "ussd",
            "qr",
            "mobile_money",
            "bank_transfer"
          ],
          callback_url: callbackUrl
        })
      }
    );

  if (
    !result?.status ||
    !result?.data
  ) {
    throw new Error(
      result?.message ||
      "Paystack could not initialize the video payment."
    );
  }

  return {
    status: true,

    authorization_url:
      result.data.authorization_url,

    authorizationUrl:
      result.data.authorization_url,

    access_code:
      result.data.access_code,

    accessCode:
      result.data.access_code,

    reference:
      result.data.reference ||
      reference,

    plan: requestedPlan,

    package:
      packageInfo.id ||
      requestedPlan,

    amount:
      Number(packageInfo.amount),

    video_seconds:
      Number(packageInfo.seconds),

    seconds:
      Number(packageInfo.seconds),

    product: "OBITREND_VIDEO"
  };
}

/*
=========================================================
VERIFY TRANSACTION DIRECTLY WITH PAYSTACK
=========================================================
*/

async function verifyTransactionWithPaystack(
  reference
) {
  const normalizedReference =
    cleanString(reference);

  if (!normalizedReference) {
    throw new Error(
      "Payment reference is missing."
    );
  }

  const result =
    await paystackRequest(
      `/transaction/verify/${encodeURIComponent(
        normalizedReference
      )}`,
      {
        method: "GET"
      }
    );

  const transaction =
    result?.data;

  if (!transaction) {
    throw new Error(
      "Paystack transaction data was not returned."
    );
  }

  if (
    upper(transaction.status) !==
    "SUCCESS"
  ) {
    throw new Error(
      "Payment has not been completed successfully."
    );
  }

  if (
    upper(transaction.currency) !==
    "NGN"
  ) {
    throw new Error(
      "Payment currency is not NGN."
    );
  }

  const amount =
    Number(transaction.amount);

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    throw new Error(
      "Invalid Paystack payment amount."
    );
  }

  const metadata =
    transaction.metadata &&
    typeof transaction.metadata === "object"
      ? transaction.metadata
      : {};

  const customerEmail =
    cleanString(
      transaction.customer?.email
    ).toLowerCase();

  const metadataEmail =
    cleanString(
      metadata.obitrend_email ||
      metadata.email
    ).toLowerCase();

  const metadataUserId =
    cleanString(
      metadata.obitrend_user_id ||
      metadata.user_id
    );

  const product =
    upper(metadata.product);

  /*
  -------------------------------------------------------
  PRODUCT DETECTION
  -------------------------------------------------------
  */

  let detectedProduct = product;

  if (
    detectedProduct !==
      "OBITREND_PRO" &&
    detectedProduct !==
      "OBITREND_VIDEO"
  ) {
    /*
      Older/legacy Pro transactions can still be
      recognized by their exact amount.
    */
    if (packageFromAmount(amount)) {
      detectedProduct = "OBITREND_PRO";
    } else if (
      videoPackageFromAmount(amount)
    ) {
      detectedProduct = "OBITREND_VIDEO";
    }
  }

  if (
    detectedProduct !==
      "OBITREND_PRO" &&
    detectedProduct !==
      "OBITREND_VIDEO"
  ) {
    throw new Error(
      "This Paystack transaction is not a supported OBITREND product."
    );
  }

  /*
  -------------------------------------------------------
  PRO VALIDATION
  -------------------------------------------------------
  */

  if (
    detectedProduct ===
    "OBITREND_PRO"
  ) {
    const packageInfo =
      packageFromAmount(amount);

    if (!packageInfo) {
      throw new Error(
        "The Pro payment amount does not match an active OBITREND Pro package."
      );
    }

    if (
      metadata.package &&
      upper(metadata.package) !==
        upper(packageInfo.id)
    ) {
      throw new Error(
        "The Pro package does not match the payment amount."
      );
    }

    if (
      metadata.amount !== undefined &&
      Number(metadata.amount) !==
        amount
    ) {
      throw new Error(
        "The Pro metadata amount does not match the transaction amount."
      );
    }

    if (
      metadataUserId &&
      !metadataUserId
    ) {
      throw new Error(
        "Invalid OBITREND user metadata."
      );
    }

    return {
      product:
        "OBITREND_PRO",

      reference:
        cleanString(
          transaction.reference
        ) ||
        normalizedReference,

      amount,

      currency:
        upper(transaction.currency),

      email:
        customerEmail ||
        metadataEmail,

      metadata,

      userId:
        metadataUserId,

      plan:
        packageInfo.id,

      package:
        packageInfo,

      transaction
    };
  }

  /*
  -------------------------------------------------------
  VIDEO VALIDATION
  -------------------------------------------------------
  */

  const videoInfo =
    videoPackageFromAmount(amount);

  if (!videoInfo) {
    throw new Error(
      "The Video payment amount does not match an active OBITREND Video package."
    );
  }

  if (
    metadata.package &&
    upper(metadata.package) !==
      upper(videoInfo.id)
  ) {
    throw new Error(
      "The Video package does not match the payment amount."
    );
  }

  if (
    metadata.amount !== undefined &&
    Number(metadata.amount) !==
      amount
  ) {
    throw new Error(
      "The Video metadata amount does not match the transaction amount."
    );
  }

  if (
    metadata.video_seconds !== undefined &&
    Number(metadata.video_seconds) !==
      Number(videoInfo.seconds)
  ) {
    throw new Error(
      "The Video seconds metadata does not match the package."
    );
  }

  return {
    product:
      "OBITREND_VIDEO",

    reference:
      cleanString(
        transaction.reference
      ) ||
      normalizedReference,

    amount,

    currency:
      upper(transaction.currency),

    email:
      customerEmail ||
      metadataEmail,

    metadata,

    userId:
      metadataUserId,

    plan:
      videoInfo.id,

    package:
      videoInfo,

    transaction
  };
}

/*
=========================================================
VERIFY TRANSACTION FOR AUTHENTICATED USER
=========================================================
*/

async function verifyTransaction(
  reference,
  authUser
) {
  const verified =
    await verifyTransactionWithPaystack(
      reference
    );

  if (
    !verified.userId
  ) {
    throw new Error(
      "This payment is not linked to an OBITREND account."
    );
  }

  if (
    verified.userId !==
    authUser.id
  ) {
    throw new Error(
      "This payment belongs to a different OBITREND account."
    );
  }

  const authenticatedEmail =
    cleanString(
      authUser.email
    ).toLowerCase();

  if (
    authenticatedEmail &&
    verified.email &&
    authenticatedEmail !==
      verified.email
  ) {
    throw new Error(
      "The Paystack payment email does not match the authenticated OBITREND account."
    );
  }

  return verified;
}

/*
=========================================================
FULFILL PRO PAYMENT
=========================================================
*/

async function fulfillProPayment(
  verified,
  redis
) {
  if (
    !verified.userId
  ) {
    throw new Error(
      "Pro payment does not contain a valid OBITREND user ID."
    );
  }

  if (
    !verified.plan ||
    !PRO_PACKAGES[verified.plan]
  ) {
    throw new Error(
      "Invalid Pro package during fulfillment."
    );
  }

  const claimed =
    await claimPaymentReference(
      redis,
      verified.reference
    );

  if (!claimed) {
    const status =
      await getProStatus(
        verified.userId,
        redis
      );

    return {
      success: true,
      duplicate: true,
      product: "OBITREND_PRO",
      reference:
        verified.reference,
      status
    };
  }

  try {
    const activated =
      await activatePro(
        verified.userId,
        verified.email ||
          cleanString(
            verified.metadata
              ?.obitrend_email
          ),
        verified.reference,
        redis,
        verified.plan
      );

    return {
      success: true,
      duplicate: false,
      product: "OBITREND_PRO",
      reference:
        verified.reference,
      plan:
        verified.plan,
      status:
        activated
    };
  } catch (error) {
    await releasePaymentClaim(
      redis,
      verified.reference
    );

    throw error;
  }
}

/*
=========================================================
FULFILL VIDEO PAYMENT
=========================================================
*/

async function fulfillVideoPayment(
  verified,
  redis
) {
  if (
    !verified.userId
  ) {
    throw new Error(
      "Video payment does not contain a valid OBITREND user ID."
    );
  }

  const packageId =
    verified.package?.id ||
    verified.plan;

  const packageInfo =
    getVideoPackage(packageId);

  if (!packageInfo) {
    throw new Error(
      "Invalid Video package during fulfillment."
    );
  }

  if (
    Number(packageInfo.amount) !==
    Number(verified.amount)
  ) {
    throw new Error(
      "Video payment amount verification failed."
    );
  }

  const claimed =
    await claimPaymentReference(
      redis,
      verified.reference
    );

  if (!claimed) {
    const status =
      await getVideoStatus(
        verified.userId,
        redis
      );

    return {
      success: true,
      duplicate: true,
      product: "OBITREND_VIDEO",
      reference:
        verified.reference,
      status
    };
  }

  try {
    const result =
      await addVideoSeconds({
        userId:
          verified.userId,

        email:
          verified.email ||
          cleanString(
            verified.metadata
              ?.obitrend_email
          ),

        reference:
          verified.reference,

        packageId,

        redis
      });

    const status =
      await getVideoStatus(
        verified.userId,
        redis
      );

    return {
      success: true,
      duplicate: false,
      product: "OBITREND_VIDEO",
      reference:
        verified.reference,
      package:
        packageId,
      seconds:
        Number(packageInfo.seconds),
      result,
      status
    };
  } catch (error) {
    await releasePaymentClaim(
      redis,
      verified.reference
    );

    throw error;
  }
}

/*
=========================================================
FULFILL ANY VERIFIED OBITREND PAYMENT
=========================================================
*/

async function fulfillVerifiedPayment(
  verified,
  redis
) {
  if (
    verified.product ===
    "OBITREND_PRO"
  ) {
    return fulfillProPayment(
      verified,
      redis
    );
  }

  if (
    verified.product ===
    "OBITREND_VIDEO"
  ) {
    return fulfillVideoPayment(
      verified,
      redis
    );
  }

  throw new Error(
    "Unsupported OBITREND payment product."
  );
}

/*
=========================================================
HANDLE PRO / VIDEO PAYMENT INITIALIZATION
=========================================================
*/

async function handlePost(
  req,
  res,
  authUser,
  body
) {
  const requestedPlan =
    upper(
      body?.plan ||
      body?.package ||
      body?.packageId
    );

  const product =
    upper(
      body?.product ||
      body?.paymentProduct
    );

  const email =
    cleanString(
      body?.email
    ).toLowerCase();

  if (!email) {
    return json(
      res,
      400,
      {
        ok: false,
        error:
          "Email is required."
      }
    );
  }

  const authenticatedEmail =
    cleanString(
      authUser.email
    ).toLowerCase();

  if (
    authenticatedEmail &&
    email !==
      authenticatedEmail
  ) {
    return json(
      res,
      400,
      {
        ok: false,
        error:
          "Payment email must match your authenticated OBITREND account."
      }
    );
  }

  /*
  -------------------------------------------------------
  VIDEO
  -------------------------------------------------------
  */

  const isVideo =
    product ===
      "OBITREND_VIDEO" ||
    requestedPlan.startsWith(
      "VIDEO_"
    );

  if (isVideo) {
    const result =
      await initializeVideoPayment(
        authenticatedEmail ||
          email,
        requestedPlan,
        authUser.id
      );

    return json(
      res,
      200,
      {
        ok: true,
        ...result,
        data: result
      }
    );
  }

  /*
  -------------------------------------------------------
  PRO
  -------------------------------------------------------
  */

  const result =
    await initializePayment(
      authenticatedEmail ||
        email,
      requestedPlan,
      authUser.id
    );

  return json(
    res,
    200,
    {
      ok: true,
      ...result,
      data: result
    }
  );
}

/*
=========================================================
HANDLE AUTHENTICATED CALLBACK

Works for BOTH Pro and Video.
=========================================================
*/

async function handleGet(
  req,
  res,
  authUser,
  redis
) {
  const query =
    req.query || {};

  const reference =
    cleanString(
      query.reference ||
      query.trxref ||
      query.trx_ref
    );

  if (!reference) {
    return json(
      res,
      400,
      {
        ok: false,
        error:
          "Payment reference is missing."
      }
    );
  }

  const verified =
    await verifyTransaction(
      reference,
      authUser
    );

  const result =
    await fulfillVerifiedPayment(
      verified,
      redis
    );

  return json(
    res,
    200,
    {
      ok: true,
      ...result
    }
  );
}

/*
=========================================================
PAYSTACK WEBHOOK HANDLER
=========================================================

IMPORTANT:

Paystack does NOT send a Supabase access token.

Therefore this branch MUST execute before
getAuthenticatedUser().
=========================================================
*/

async function handleWebhook(
  req,
  res,
  rawBody,
  redis
) {
  const signature =
    getHeader(
      req,
      "x-paystack-signature"
    );

  if (
    !verifyPaystackSignature(
      rawBody,
      signature
    )
  ) {
    return json(
      res,
      401,
      {
        ok: false,
        error:
          "Invalid Paystack webhook signature."
      }
    );
  }

  let event;

  try {
    event =
      parseJsonBody(rawBody);
  } catch {
    return json(
      res,
      400,
      {
        ok: false,
        error:
          "Invalid webhook payload."
      }
    );
  }

  const eventName =
    upper(event?.event);

  /*
  -------------------------------------------------------
  Ignore events we do not need.
  Return 200 so Paystack does not keep retrying them.
  -------------------------------------------------------
  */

  if (
    eventName !==
    "CHARGE.SUCCESS"
  ) {
    return json(
      res,
      200,
      {
        ok: true,
        ignored: true,
        event:
          event?.event || null
      }
    );
  }

  const webhookReference =
    cleanString(
      event?.data?.reference
    );

  if (!webhookReference) {
    return json(
      res,
      400,
      {
        ok: false,
        error:
          "Webhook payment reference is missing."
      }
    );
  }

  /*
  -------------------------------------------------------
  ALWAYS VERIFY THE TRANSACTION DIRECTLY WITH PAYSTACK
  -------------------------------------------------------
  */

  const verified =
    await verifyTransactionWithPaystack(
      webhookReference
    );

  /*
  -------------------------------------------------------
  MAKE SURE PAYSTACK REFERENCE MATCHES
  -------------------------------------------------------
  */

  if (
    cleanString(
      verified.reference
    ) !==
    webhookReference
  ) {
    return json(
      res,
      400,
      {
        ok: false,
        error:
          "Paystack reference verification failed."
      }
    );
  }

  /*
  -------------------------------------------------------
  FULFILL PRODUCT
  -------------------------------------------------------
  */

  const result =
    await fulfillVerifiedPayment(
      verified,
      redis
    );

  /*
  -------------------------------------------------------
  PAYSTACK NEEDS HTTP 200
  -------------------------------------------------------
  */

  return json(
    res,
    200,
    {
      ok: true,
      webhook: true,
      event:
        event?.event,
      ...result
    }
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
    =====================================================
    METHOD CHECK
    =====================================================
    */

    if (
      req.method !== "GET" &&
      req.method !== "POST"
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
    =====================================================
    REDIS
    =====================================================
    */

    const redis =
      await getRedisConfig();

    if (!redis) {
      throw new Error(
        "Redis configuration is unavailable."
      );
    }

    /*
    =====================================================
    POST
    =====================================================
    */

    if (
      req.method === "POST"
    ) {
      /*
      ---------------------------------------------------
      Read raw body once.
      ---------------------------------------------------
      */

      const rawBody =
        await readRawBody(req);

      /*
      ---------------------------------------------------
      WEBHOOK DETECTION

      Paystack supplies x-paystack-signature.
      ---------------------------------------------------
      */

      const signature =
        getHeader(
          req,
          "x-paystack-signature"
        );

      if (
        cleanString(signature)
      ) {
        return await handleWebhook(
          req,
          res,
          rawBody,
          redis
        );
      }

      /*
      ---------------------------------------------------
      NORMAL APP PAYMENT INITIALIZATION
      ---------------------------------------------------
      */

      let body;

      try {
        body =
          parseJsonBody(rawBody);
      } catch {
        return json(
          res,
          400,
          {
            ok: false,
            error:
              "Invalid request body."
          }
        );
      }

      const auth =
        await getAuthenticatedUser(
          req
        );

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

      return await handlePost(
        req,
        res,
        auth.user,
        body
      );
    }

    /*
    =====================================================
    GET

    Used for Paystack callback verification.
    =====================================================
    */

    if (
      req.method === "GET"
    ) {
      const auth =
        await getAuthenticatedUser(
          req
        );

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

      return await handleGet(
        req,
        res,
        auth.user,
        redis
      );
    }

    return json(
      res,
      405,
      {
        ok: false,
        error:
          "Method not allowed."
      }
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
