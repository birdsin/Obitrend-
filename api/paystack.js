import { createClient } from "@supabase/supabase-js";

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
} from "../video-credits.js";

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
  // Legacy weekly package — kept server-side so already-paid
  // ₦15,000 weekly transactions can still be verified and fulfilled.
  PRO_WEEKLY: {
    amount: 1500000,
    durationDays: 7,
    durationSeconds: 7 * 24 * 60 * 60,
    credits: 20,
    tier: "standard",
    name: "OBITREND Weekly Standard Pro"
  },
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

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) return null;

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

async function createPaymentHandoff(redis, reference, userId, email, product, plan) {
  const token = crypto.randomBytes(32).toString("hex");
  const key = `obitrend:paystack:handoff:${token}`;
  await redisCommand(redis, "SET", [
    key,
    JSON.stringify({
      reference,
      userId,
      email: cleanString(email).toLowerCase(),
      product,
      plan
    }),
    "EX",
    "86400"
  ]);
  return token;
}

async function getPaymentHandoff(redis, token) {
  const cleanToken = cleanString(token);
  if (!cleanToken) return null;
  const key = `obitrend:paystack:handoff:${cleanToken}`;
  const raw = await redisCommand(redis, "GET", [key]);
  if (!raw) return null;
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

async function consumePaymentHandoff(redis, token) {
  const cleanToken = cleanString(token);
  if (!cleanToken) return false;
  const key = `obitrend:paystack:handoff:${cleanToken}`;
  try {
    const result = await redisCommand(redis, "DEL", [key]);
    return Number(result) > 0 || result === true;
  } catch {
    return false;
  }
}

function addHandoffToCallback(callbackUrl, token) {
  const separator = callbackUrl.includes("?") ? "&" : "?";
  return `${callbackUrl}${separator}obitrend_handoff=${encodeURIComponent(token)}`;
}

async function createRecoveryLink(email, redirectTo) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Supabase authentication service is unavailable.");
  const result = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: cleanString(email).toLowerCase(),
    options: { redirectTo }
  });
  if (result.error || !result.data?.properties?.action_link) {
    throw result.error || new Error("Unable to restore the OBITREND session.");
  }
  return result.data.properties.action_link;
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

function getSafeCallbackUrl(req, suffix = "/") {
  const host = cleanString(
    req?.headers?.["x-forwarded-host"] ||
    req?.headers?.host
  ).split(",")[0].trim();

  const protocol = cleanString(
    req?.headers?.["x-forwarded-proto"] || "https"
  ).split(",")[0].trim() || "https";

  const allowedPreview =
    /^obitrend-[a-z0-9-]+-birdsins-projects\.vercel\.app$/i.test(host);

  if (
    host === "obitrend.vercel.app" ||
    allowedPreview
  ) {
    return `${protocol}://${host}${suffix}`;
  }

  return getAppUrl() + suffix;
}

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

function isPaystackTestMode() {
  const secret =
    process.env.PAYSTACK_SECRET_KEY ||
    process.env.PAYSTACK_SECRET ||
    "";

  return /^sk_test_/i.test(secret);
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

  return data?.result;
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
  userId,
  callbackUrl,
  redis
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

  const safeReferencePlan =
  requestedPlan.replace(/[^A-Z0-9.-]/g, "-");

const reference =
  `OBI-${safeReferencePlan}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)
    .toUpperCase()}`;

  const handoff = await createPaymentHandoff(redis, reference, userId, normalizedEmail, "OBITREND_PRO", requestedPlan);

  const paymentCallbackUrl = addHandoffToCallback(
    callbackUrl || getAppUrl() + "/api/paystack",
    handoff
  );

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
          callback_url: paymentCallbackUrl
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

    handoff,
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
  userId,
  callbackUrl,
  redis
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

  const safeReferencePlan =
  requestedPlan.replace(/[^A-Z0-9.-]/g, "-");

const reference =
  `OBI-${safeReferencePlan}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)
    .toUpperCase()}`;

  const handoff = await createPaymentHandoff(redis, reference, userId, normalizedEmail, "OBITREND_VIDEO", requestedPlan);

  const paymentCallbackUrl = addHandoffToCallback(
    callbackUrl || getAppUrl() + "/api/paystack",
    handoff
  );

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
          callback_url: paymentCallbackUrl
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
    /*
      Paystack can add its checkout processing fee when the
      customer bears the fee. In that case transaction.amount
      can be higher than the OBITREND package base amount.

      For new OBITREND payments, the server-created package
      metadata identifies the package and the transaction must
      be at least that package's base amount. For legacy
      transactions without package metadata, keep the exact
      amount check.
    */
    let packageInfo = null;

    if (metadata.package) {
      packageInfo = getPackage(metadata.package);

      if (!packageInfo) {
        throw new Error(
          "The Pro package is not a valid OBITREND Pro package."
        );
      }

      if (amount < Number(packageInfo.amount)) {
        throw new Error(
          "The Paystack payment amount is below the selected OBITREND Pro package amount."
        );
      }
    } else {
      packageInfo = packageFromAmount(amount);

      if (!packageInfo) {
        throw new Error(
          "The Pro payment amount does not match an active OBITREND Pro package."
        );
      }
    }

    if (
      metadata.amount !== undefined &&
      Number(metadata.amount) > 0 &&
      Number(metadata.amount) !== amount &&
      !metadata.package
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

  /*
    VIDEO VALIDATION

    For new OBITREND video payments, the package is created
    server-side before Paystack checkout and stored in metadata.
    Paystack may report a transaction amount higher than the
    package base amount when checkout/payment fees are included.

    Therefore:
      - metadata.package identifies the server-created package;
      - the transaction amount must be AT LEAST the package amount;
      - metadata.amount may equal the package base amount even when
        Paystack's final transaction amount is higher;
      - legacy transactions without package metadata still use the
        exact amount lookup.
  */
  let videoInfo = null;

  if (metadata.package) {
    try {
      videoInfo = getVideoPackage(metadata.package);
    } catch {
      videoInfo = null;
    }

    if (!videoInfo) {
      const localVideoPackage =
        VIDEO_PACKAGES[upper(metadata.package)];

      if (localVideoPackage) {
        videoInfo = {
          id: upper(metadata.package),
          ...localVideoPackage
        };
      }
    }

    if (!videoInfo) {
      throw new Error(
        "The Video package is not a valid active OBITREND Video package."
      );
    }

    const packageAmount =
      Number(videoInfo.amount);

    if (
      !Number.isFinite(packageAmount) ||
      amount < packageAmount
    ) {
      throw new Error(
        "The Video payment amount is below the selected OBITREND Video package amount."
      );
    }

    if (
      metadata.amount !== undefined &&
      Number(metadata.amount) > 0 &&
      Number(metadata.amount) !== packageAmount
    ) {
      throw new Error(
        "The Video metadata amount does not match the selected package."
      );
    }
  } else {
    videoInfo =
      videoPackageFromAmount(amount);

    if (!videoInfo) {
      throw new Error(
        "The Video payment amount does not match an active OBITREND Video package."
      );
    }
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
  if (!verified.userId) {
    throw new Error("Pro payment does not contain a valid OBITREND user ID.");
  }

  /*
    Resolve the package from every trusted server-side field.
    Older successful Paystack transactions may not have the
    normalized plan field, while new transactions carry the
    package in metadata. Never trust a browser-supplied package
    at fulfillment time.
  */
  const fulfillmentPlan =
    upper(
      verified.plan ||
      verified.package?.id ||
      verified.metadata?.package
    );

  const fulfillmentPackage =
    getPackage(fulfillmentPlan);

  if (!fulfillmentPackage) {
    throw new Error("Invalid Pro package during fulfillment.");
  }

  /*
    The credit wallet itself is now the idempotency boundary.
    This is intentionally not claimed in a separate Redis key
    before activation, because a separate claim could become stuck
    after a successful Paystack payment but before credits were
    delivered.
  */
  const activated = await activatePro(
    verified.userId,
    verified.email || cleanString(verified.metadata?.obitrend_email),
    verified.reference,
    redis,
    fulfillmentPlan
  );

  return {
    success: true,
    duplicate: Boolean(activated?.duplicate),
    product: "OBITREND_PRO",
    reference: verified.reference,
    plan: fulfillmentPlan,
    creditsAdded: Number(activated?.creditsAdded || 0),
    status: activated
  };
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
  if (!verified.userId) {
    throw new Error("Video payment does not contain a valid OBITREND user ID.");
  }

  const packageId = verified.package?.id || verified.plan;
  const packageInfo = getVideoPackage(packageId);

  if (!packageInfo) {
    throw new Error("Invalid Video package during fulfillment.");
  }

  if (Number(packageInfo.amount) !== Number(verified.amount)) {
    throw new Error("Video payment amount verification failed.");
  }

  const result = await addVideoSeconds({
    userId: verified.userId,
    email: verified.email || cleanString(verified.metadata?.obitrend_email),
    reference: verified.reference,
    packageId,
    redis
  });

  if (!result?.ok) {
    throw new Error(result?.error || "Video credit delivery failed.");
  }

  const status = await getVideoStatus(verified.userId, redis);

  return {
    success: true,
    duplicate: Boolean(result?.duplicate),
    product: "OBITREND_VIDEO",
    reference: verified.reference,
    package: packageId,
    seconds: Number(packageInfo.seconds),
    creditsAdded: Number(result?.added || 0),
    result,
    status
  };
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
  /*
    TEST MODE SAFETY:
    Paystack test transactions must never change the
    production OBITREND credit wallet or Pro balance.
    They may still complete the Paystack test checkout
    so the payment flow can be tested safely.
  */
  if (isPaystackTestMode()) {
    return {
      success: true,
      testMode: true,
      credited: false,
      creditsAdded: 0,
      message:
        "Paystack TEST payment verified. No production OBITREND credits were added."
    };
  }

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
        authUser.id,
        getSafeCallbackUrl(req, "/api/paystack"),
        await getRedisConfig()
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
      authUser.id,
      getSafeCallbackUrl(req, "/api/paystack"),
      await getRedisConfig()
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
RECONCILE RECENT PAYMENTS
=========================================================
Uses Paystack as the source of truth to recover a payment
whose browser callback/handoff was lost. Only transactions
belonging to the authenticated OBITREND user are considered.
Fulfillment remains idempotent at the wallet level.
=========================================================
*/
async function reconcileRecentPayments(authUser, redis, requestedProduct) {
  const product = upper(requestedProduct);
  const email = cleanString(authUser?.email).toLowerCase();
  const userId = cleanString(authUser?.id);

  if (!userId) {
    throw new Error("Authenticated OBITREND user ID is unavailable.");
  }

  /*
    SECURITY RULE:
    A single reconciliation request may fulfill AT MOST ONE
    Paystack transaction.

    This prevents a lost browser callback from causing one
    recovery action to sweep through several historical
    successful payments and add multiple packages at once.

    Each individual Paystack reference remains idempotent at
    the wallet level, so retrying the same payment is safe.
  */
  const result = await paystackRequest(
    "/transaction?perPage=100&page=1",
    { method: "GET" }
  );

  const transactions = Array.isArray(result?.data)
    ? result.data
    : [];

  const allCandidates = transactions
    .filter((tx) => {
      if (upper(tx?.status) !== "SUCCESS") return false;

      const metadata =
        tx?.metadata && typeof tx.metadata === "object"
          ? tx.metadata
          : {};

      const txUserId = cleanString(
        metadata.obitrend_user_id || metadata.user_id
      );

      const txEmail = cleanString(
        tx?.customer?.email ||
        metadata.obitrend_email ||
        metadata.email
      ).toLowerCase();

      const txProduct = upper(metadata.product);

      /*
        New OBITREND payments carry explicit product metadata.
        Do not identify a payment by amount alone because some
        Pro and Video prices share the same NGN amount.
      */
      if (txUserId !== userId) return false;
      if (email && txEmail && txEmail !== email) return false;

      if (
        product !== "OBITREND_VIDEO" &&
        product !== "OBITREND_PRO"
      ) {
        return false;
      }

      if (txProduct !== product) return false;

      return true;
    })
    .sort((a, b) => {
      const aTime = new Date(a?.paid_at || a?.created_at || 0).getTime();
      const bTime = new Date(b?.paid_at || b?.created_at || 0).getTime();
      return bTime - aTime;
    });

  /*
    Only the newest matching transaction is considered.
    A second successful purchase must be a separate payment
    and therefore a separate reconciliation request.
  */
  const candidates = allCandidates.slice(0, 1);

  let recovered = 0;
  let alreadyDelivered = 0;

  for (const tx of candidates) {
    const reference = cleanString(tx?.reference);
    if (!reference) continue;

    try {
      const verified = await verifyTransactionWithPaystack(reference);

      if (String(verified.userId) !== userId) continue;
      if (product && verified.product !== product) continue;

      const fulfillment = await fulfillVerifiedPayment(
        verified,
        redis
      );

      if (fulfillment?.duplicate) {
        alreadyDelivered += 1;
      } else {
        recovered += 1;
      }
    } catch (error) {
      console.error(
        "OBITREND payment reconciliation skipped transaction:",
        reference,
        error?.message || error
      );
    }
  }

  return {
    success: true,
    recovered,
    alreadyDelivered,
    checked: candidates.length
  };
}

/*
=========================================================
HANDLE AUTHENTICATED CALLBACK

Works for BOTH Pro and Video.
=========================================================
*/

async function handlePaymentHandoff(req, res, redis) {
  const token = cleanString(req?.query?.obitrend_handoff);
  const reference = cleanString(
    req?.query?.reference ||
    req?.query?.trxref ||
    req?.query?.trx_ref
  );

  if (!token && !reference) {
    return null;
  }

  const handoff = token
    ? await getPaymentHandoff(redis, token)
    : null;

  /*
    Paystack's Redirect API always appends the transaction reference
    to the callback URL. The Redis handoff is an extra session bridge,
    not the source of truth for the payment.

    If the handoff is missing/expired, fall back to the Paystack
    reference and verify the transaction directly. This prevents a
    successful payment from being stranded because the temporary
    browser/session handoff disappeared.
  */
  if (!handoff?.reference || !handoff?.userId || !handoff?.email) {
    if (!reference) {
      return json(res, 400, {
        ok: false,
        error: "Payment session handoff is invalid or expired."
      });
    }

    const verified = await verifyTransactionWithPaystack(reference);

    if (!verified.userId) {
      return json(res, 400, {
        ok: false,
        error: "This payment is not linked to an OBITREND account."
      });
    }

    await fulfillVerifiedPayment(verified, redis);

    /*
      IMPORTANT:
      Never create a Supabase magic-link session during a
      Paystack callback. The callback can run in a separate
      browser context and a recovery link can switch the
      customer into a different OBITREND account.

      Payment ownership was already verified from the
      Paystack transaction + server-side handoff. Fulfill
      the payment server-side and return to the app without
      changing the customer's authentication session.
    */
    return res.redirect(
      302,
      getAppUrl() + "/?obitrend_payment=success"
    );
  }

  const verified = await verifyTransactionWithPaystack(handoff.reference);
  if (String(verified.userId) !== String(handoff.userId)) {
    return json(res, 403, {
      ok: false,
      error: "Payment account verification failed."
    });
  }

  await fulfillVerifiedPayment(verified, redis);

  /*
    Keep the handoff until the recovery redirect has been prepared.
    If recovery-link creation fails, the customer can retry the
    callback without losing the one-time handoff.
  */
  /*
    Do not create a recovery/magic link here.
    The payment callback must never replace the customer's
    existing Supabase session with the payment email account.
    The verified handoff already identifies the server-side
    account that receives the purchased value.
  */
  await consumePaymentHandoff(redis, token);

  return res.redirect(
    302,
    getAppUrl() + "/?obitrend_payment=success"
  );
}

async function handleGet(
  req,
  res,
  authUser,
  redis
) {
  const handoff = cleanString(req?.query?.obitrend_handoff);

  /*
  -------------------------------------------------------
  EXPLICIT PAYMENT RECONCILIATION
  -------------------------------------------------------
  This lets an authenticated customer recover a successful
  Paystack payment when the temporary browser handoff was
  lost. It does not accept a browser-supplied user ID.
  -------------------------------------------------------
  */
  const reconcile = upper(req?.query?.reconcile);
  if (reconcile === "VIDEO" || reconcile === "PRO" || reconcile === "ALL") {
    if (!authUser) {
      return json(res, 401, {
        ok: false,
        error: "Please sign in to reconcile your payment."
      });
    }

    const redis = await getRedisConfig();
    const product =
      reconcile === "VIDEO"
        ? "OBITREND_VIDEO"
        : reconcile === "PRO"
          ? "OBITREND_PRO"
          : "";

    const result = await reconcileRecentPayments(
      authUser,
      redis,
      product
    );

    return json(res, 200, {
      ok: true,
      reconciliation: result
    });
  }

  /*
  Authenticated users can return directly from Paystack with the
  handoff token still present. Previously the handoff was only
  processed when there was NO Supabase session, which meant a
  successful Paystack payment could return to the app without
  delivering the purchased Pro/video value.
  */
  if (handoff) {
    if (authUser) {
      const token = handoff;
      const handoffData = await getPaymentHandoff(redis, token);

      if (
        !handoffData?.reference ||
        !handoffData?.userId ||
        !handoffData?.email
      ) {
        /*
          The Paystack reference is the source of truth.
          If the temporary Redis handoff is missing, let the
          recovery handler verify the reference directly instead
          of returning a 400 to an already authenticated customer.
        */
        return handlePaymentHandoff(req, res, redis);
      }

      if (String(handoffData.userId) !== String(authUser.id)) {
        return json(res, 403, {
          ok: false,
          error: "Payment account verification failed."
        });
      }

      const verified = await verifyTransactionWithPaystack(
        handoffData.reference
      );

      if (String(verified.userId) !== String(authUser.id)) {
        return json(res, 403, {
          ok: false,
          error: "Payment account verification failed."
        });
      }

      await fulfillVerifiedPayment(verified, redis);

      // Consume the handoff only after successful verification and
      // fulfillment.
      await consumePaymentHandoff(redis, token);

      // Return the customer to the dashboard after the server has
      // delivered the purchased credits. The dashboard will read
      // the fresh server-side credit balance.
      return res.redirect(
        302,
        getAppUrl() + "/?obitrend_payment=success"
      );
    }

    return handlePaymentHandoff(req, res, redis);
  }

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

/*=========================================================
MAIN HANDLER
=========================================================*/

export default async function handler(
  req,
  res
) {
  try {

    /*
    =======================================================
    METHOD CHECK
    =======================================================
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
    =======================================================
    POST
    =======================================================
    
    IMPORTANT:
    
    Normal payment initialization does NOT require Redis.
    
    Paystack webhook POST requests DO require Redis,
    but they are handled separately below.
    =======================================================
    */

    if (
      req.method === "POST"
    ) {

      /*
      -------------------------------------------------------
      Read raw body once.
      -------------------------------------------------------
      */

      const rawBody =
        await readRawBody(req);

      /*
      -------------------------------------------------------
      WEBHOOK DETECTION
      
      Paystack supplies x-paystack-signature.
      -------------------------------------------------------
      */

      const signature =
        getHeader(
          req,
          "x-paystack-signature"
        );

      if (
        cleanString(signature)
      ) {

        /*
        -----------------------------------------------------
        Redis is required for webhook fulfillment only.
        -----------------------------------------------------
        */

        const redis =
          await getRedisConfig();

        if (!redis) {
          throw new Error(
            "Redis configuration is unavailable."
          );
        }

        return await handleWebhook(
          req,
          res,
          rawBody,
          redis
        );
      }

      /*
      -------------------------------------------------------
      NORMAL APP PAYMENT INITIALIZATION
      
      Redis is intentionally NOT loaded here.
      -------------------------------------------------------
      */

      let body;

      try {

        body =
          parseJsonBody(
            rawBody
          );

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

      /*
      -------------------------------------------------------
      AUTHENTICATE USER
      -------------------------------------------------------
      */

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

      /*
      -------------------------------------------------------
      INITIALIZE PAYMENT
      -------------------------------------------------------
      */

      return await handlePost(
        req,
        res,
        auth.user,
        body
      );
    }

    /*
    =======================================================
    GET
    =======================================================

    Paystack may return without a surviving Supabase session.
    A signed-in callback can use the authenticated account, while
    the one-time handoff can safely restore the payment first.
    =======================================================
    */

    const redis =
      await getRedisConfig();

    if (!redis) {
      throw new Error(
        "Redis configuration is unavailable."
      );
    }

    const handoffToken =
      cleanString(req?.query?.obitrend_handoff);

    /*
      IMPORTANT: process the one-time payment handoff BEFORE
      requiring Supabase authentication. The handoff was created
      server-side before checkout and contains the verified user ID.
      This prevents a lost browser session after Paystack checkout
      from causing a successful payment to be left uncredited.
    */
    const callbackReference = cleanString(
      req?.query?.reference ||
      req?.query?.trxref ||
      req?.query?.trx_ref
    );

    /*
      Paystack can return with the transaction reference even when
      the temporary Redis handoff is missing. Process that callback
      before requiring a Supabase session. The transaction itself is
      verified directly with Paystack and its server-side metadata
      determines the OBITREND account that receives the payment.
    */
    if (handoffToken || callbackReference) {
      return await handlePaymentHandoff(
        req,
        res,
        redis
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

    return await handleGet(
      req,
      res,
      auth.user,
      redis
    );

  } catch (error) {

    console.warn(
      "OBITREND Paystack:",
      error?.message ||
      error
    );

    return json(
      res,
      500,
      {
        ok: false,
        error:
          error?.message ||
          "Unable to process the Paystack request."
      }
    );
  }
}


