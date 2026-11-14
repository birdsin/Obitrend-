import crypto from "crypto";

import {
  activatePro,
  getAuthenticatedUser,
  getPlanConfig,
  getRedisConfig
} from "../lib/credits.js";

export const config = {
  api: {
    bodyParser: false
  }
};

const SANDBOX_BASE = "https://sandbox.monnify.com";
const LIVE_BASE = "https://api.monnify.com";
const ORDER_TTL_SECONDS = 60 * 60 * 24;

function clean(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function send(res, status, body) {
  return res.status(status).json(body);
}

function getMonnifyConfig() {
  const apiKey = clean(process.env.MONNIFY_API_KEY);
  const secretKey = clean(process.env.MONNIFY_SECRET_KEY);
  const contractCode = clean(process.env.MONNIFY_CONTRACT_CODE);
  const mode = upper(process.env.MONNIFY_ENV || "SANDBOX");
  const baseUrl = mode === "LIVE" ? LIVE_BASE : SANDBOX_BASE;

  if (!apiKey || !secretKey || !contractCode) {
    throw new Error("Monnify is not configured. Add MONNIFY_API_KEY, MONNIFY_SECRET_KEY and MONNIFY_CONTRACT_CODE to the staging environment.");
  }

  if (mode !== "LIVE" && mode !== "SANDBOX") {
    throw new Error("MONNIFY_ENV must be SANDBOX or LIVE.");
  }

  return { apiKey, secretKey, contractCode, mode, baseUrl };
}

async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body);
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function parseBody(raw) {
  if (!raw?.length) return {};
  return JSON.parse(raw.toString("utf8"));
}

function safeEqual(leftValue, rightValue) {
  const left = Buffer.from(clean(leftValue), "utf8");
  const right = Buffer.from(clean(rightValue), "utf8");
  if (!left.length || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function verifyWebhookSignature(rawBody, signature, secretKey) {
  if (!signature) return false;
  const expected = crypto
    .createHmac("sha512", secretKey)
    .update(rawBody)
    .digest("hex");
  return safeEqual(expected, signature);
}

function getRequestOrigin(req) {
  const host = clean(req.headers?.["x-forwarded-host"] || req.headers?.host)
    .split(",")[0]
    .trim()
    .toLowerCase();
  const protocol = clean(req.headers?.["x-forwarded-proto"] || "https")
    .split(",")[0]
    .trim() || "https";

  const allowed =
    host === "obitrend.com" ||
    host === "www.obitrend.com" ||
    host === "obitrend.vercel.app" ||
    /^obitrend-[a-z0-9-]+-birdsins-projects\.vercel\.app$/i.test(host);

  return allowed ? `${protocol}://${host}` : "https://obitrend.com";
}

async function redisCommand(redis, command, args = []) {
  const url = clean(redis?.url).replace(/\/+$/, "");
  const token = clean(redis?.token);
  if (!url || !token) throw new Error("OBITREND payment storage is unavailable.");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([command, ...args])
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || data?.error) {
    throw new Error(data?.error || "OBITREND payment storage request failed.");
  }
  return data?.result;
}

async function saveOrder(redis, reference, order) {
  await redisCommand(redis, "SET", [
    `obitrend:monnify:order:${reference}`,
    JSON.stringify(order),
    "EX",
    String(ORDER_TTL_SECONDS)
  ]);
}

async function getOrder(redis, reference) {
  const raw = await redisCommand(redis, "GET", [
    `obitrend:monnify:order:${reference}`
  ]);
  if (!raw) return null;
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

async function monnifyRequest(path, options = {}) {
  const cfg = getMonnifyConfig();

  const response = await fetch(`${cfg.baseUrl}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || data?.requestSuccessful === false) {
    throw new Error(
      data?.responseMessage ||
      data?.message ||
      `Monnify request failed (${response.status}).`
    );
  }
  return data;
}

async function getAccessToken() {
  const cfg = getMonnifyConfig();
  const credentials = Buffer.from(
    `${cfg.apiKey}:${cfg.secretKey}`
  ).toString("base64");

  const result = await monnifyRequest("/api/v1/auth/login", {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}` },
    body: JSON.stringify({})
  });

  const token = clean(result?.responseBody?.accessToken);
  if (!token) throw new Error("Monnify did not return an access token.");
  return token;
}

async function initializeMonnifyPayment({ email, plan, userId, req, redis }) {
  const selectedPlan = upper(plan);
  const packageInfo = getPlanConfig(selectedPlan);

  if (!packageInfo) throw new Error("Invalid OBITREND Pro package selected.");

  const amountKobo = Number(packageInfo.amount);
  const amountNaira = amountKobo / 100;

  if (!Number.isSafeInteger(amountKobo) || amountKobo <= 0 || !Number.isFinite(amountNaira)) {
    throw new Error("Invalid OBITREND package amount.");
  }

  const paymentReference = `OBI-MNFY-${Date.now()}-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
  const origin = getRequestOrigin(req);
  const redirectUrl = `${origin}/api/monnify?paymentReference=${encodeURIComponent(paymentReference)}`;

  const order = {
    provider: "MONNIFY",
    product: "OBITREND_PRO",
    paymentReference,
    userId,
    email,
    plan: selectedPlan,
    amount: amountNaira,
    currency: "NGN",
    createdAt: new Date().toISOString()
  };

  await saveOrder(redis, paymentReference, order);

  const token = await getAccessToken();
  const cfg = getMonnifyConfig();

  try {
    const result = await monnifyRequest("/api/v1/merchant/transactions/init-transaction", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        amount: amountNaira,
        customerName: email.split("@")[0],
        customerEmail: email,
        paymentReference,
        paymentDescription: `${packageInfo.name} - OBITREND AI Fashion Creator`,
        currencyCode: "NGN",
        contractCode: cfg.contractCode,
        redirectUrl,
        paymentMethods: ["CARD", "ACCOUNT_TRANSFER", "USSD"],
        metadata: {
          product: "OBITREND_PRO",
          package: selectedPlan,
          obitrend_user_id: userId,
          obitrend_email: email
        }
      })
    });

    const body = result?.responseBody || {};
    const checkoutUrl = clean(body.checkoutUrl);
    if (!checkoutUrl) throw new Error("Monnify did not return a checkout URL.");

    return {
      ok: true,
      authorization_url: checkoutUrl,
      checkoutUrl,
      reference: paymentReference,
      paymentReference,
      provider: "MONNIFY",
      product: "OBITREND_PRO",
      plan: selectedPlan,
      amount: amountNaira,
      currency: "NGN"
    };
  } catch (error) {
    await redisCommand(redis, "DEL", [
      `obitrend:monnify:order:${paymentReference}`
    ]).catch(() => null);
    throw error;
  }
}

async function verifyAndFulfill(paymentReference, redis) {
  const reference = clean(paymentReference);
  if (!reference) throw new Error("Monnify payment reference is missing.");

  let order = await getOrder(redis, reference);

  const token = await getAccessToken();
  const result = await monnifyRequest(
    `/api/v2/merchant/transactions/query?paymentReference=${encodeURIComponent(reference)}`,
    { method: "GET", headers: { Authorization: `Bearer ${token}` } }
  );

  const transaction = result?.responseBody || {};
  if (upper(transaction.paymentStatus) !== "PAID") {
    throw new Error("Monnify payment is not confirmed as PAID.");
  }
  if (clean(transaction.paymentReference) !== reference) {
    throw new Error("Monnify payment reference verification failed.");
  }
  if (upper(transaction.currencyCode || transaction.currency) !== "NGN") {
    throw new Error("Monnify payment currency is not NGN.");
  }

  // If the short-lived Redis order record is missing, recover only from
  // metadata returned by Monnify's authenticated transaction-status API.
  // Never infer a user or plan from browser input or the payment amount alone.
  if (!order) {
    const metadata = transaction.metaData || transaction.metadata || {};
    const metadataPlan = upper(metadata.package || metadata.plan);
    const metadataUserId = clean(metadata.obitrend_user_id || metadata.userId);
    const metadataEmail = clean(
      metadata.obitrend_email ||
      transaction.customerDTO?.email ||
      transaction.customer?.email ||
      transaction.customerEmail
    ).toLowerCase();
    const metadataProduct = upper(metadata.product);

    if (
      metadataProduct !== "OBITREND_PRO" ||
      !metadataUserId ||
      !metadataEmail ||
      !getPlanConfig(metadataPlan)
    ) {
      throw new Error("Verified Monnify transaction is missing valid OBITREND order metadata.");
    }

    order = {
      provider: "MONNIFY",
      product: "OBITREND_PRO",
      paymentReference: reference,
      userId: metadataUserId,
      email: metadataEmail,
      plan: metadataPlan,
      amount: Number(getPlanConfig(metadataPlan).amount) / 100,
      currency: "NGN",
      recoveredFromMonnify: true
    };
  }

  if (order.provider !== "MONNIFY" || order.product !== "OBITREND_PRO") {
    throw new Error("This Monnify payment reference is not linked to an OBITREND purchase.");
  }

  const paidAmount = Number(transaction.amountPaid ?? transaction.totalPayable);
  if (!Number.isFinite(paidAmount) || paidAmount < Number(order.amount)) {
    throw new Error("Monnify payment amount is below the selected OBITREND package.");
  }

  const paidEmail = clean(
    transaction.customerDTO?.email ||
    transaction.customer?.email ||
    transaction.customerEmail
  ).toLowerCase();
  if (paidEmail && paidEmail !== clean(order.email).toLowerCase()) {
    throw new Error("Monnify customer email does not match this OBITREND purchase.");
  }

  // Persist a recovered order so webhook retries and future callbacks use
  // the same verified order data. activatePro remains idempotent by reference.
  if (order.recoveredFromMonnify) {
    await saveOrder(redis, reference, order);
  }

  const activated = await activatePro(
    order.userId,
    order.email,
    reference,
    redis,
    order.plan
  );

  return {
    ok: true,
    duplicate: Boolean(activated?.duplicate),
    reference,
    plan: order.plan,
    amount: paidAmount,
    creditsAdded: Number(activated?.creditsAdded || 0)
  };
}

async function handleWebhook(req, res, rawBody, redis) {
  const cfg = getMonnifyConfig();
  const signature = clean(
    req.headers?.["monnify-signature"] ||
    req.headers?.["Monnify-Signature"]
  );

  if (cfg.mode === "LIVE" && !verifyWebhookSignature(rawBody, signature, cfg.secretKey)) {
    return send(res, 401, { ok: false, error: "Invalid Monnify webhook signature." });
  }

  let event;
  try {
    event = parseBody(rawBody);
  } catch {
    return send(res, 400, { ok: false, error: "Invalid webhook payload." });
  }

  if (
    !["SUCCESSFUL_TRANSACTION", "SUCCESSFUL_COLLECTION"].includes(upper(event?.eventType))
  ) {
    return send(res, 200, { ok: true, ignored: true });
  }

  const reference = clean(event?.eventData?.paymentReference);
  if (!reference) return send(res, 200, { ok: true, ignored: true });

  try {
    await verifyAndFulfill(reference, redis);
    return send(res, 200, { ok: true, processed: true });
  } catch (error) {
    console.error("OBITREND MONNIFY webhook fulfillment pending:", error?.message || error);
    // Ask Monnify to retry if server-side verification or fulfillment failed.
    return send(res, 500, { ok: false });
  }
}

export default async function handler(req, res) {
  try {
    const redis = getRedisConfig();

    if (req.method === "GET") {
      const reference = clean(req.query?.paymentReference);
      if (!reference) return send(res, 400, { ok: false, error: "Payment reference is required." });

      try {
        await verifyAndFulfill(reference, redis);
        return res.redirect(302, `${getRequestOrigin(req)}/studio/?monnify=success`);
      } catch (error) {
        console.error("OBITREND MONNIFY callback verification pending:", error?.message || error);
        return res.redirect(302, `${getRequestOrigin(req)}/studio/?monnify=pending`);
      }
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return send(res, 405, { ok: false, error: "Method not allowed." });
    }

    const rawBody = await readRawBody(req);
    const isWebhook = Boolean(
      req.headers?.["monnify-signature"] ||
      req.headers?.["Monnify-Signature"] ||
      clean(req.query?.webhook) === "1"
    );

    if (isWebhook) {
      return handleWebhook(req, res, rawBody, redis);
    }

    const auth = await getAuthenticatedUser(req);
    if (!auth?.ok || !auth.user?.id) {
      return send(res, auth?.status || 401, {
        ok: false,
        error: auth?.error || "Please sign in to continue."
      });
    }

    let body;
    try {
      body = parseBody(rawBody);
    } catch {
      return send(res, 400, { ok: false, error: "Invalid request body." });
    }

    const email = clean(body?.email).toLowerCase();
    const plan = upper(body?.plan || body?.package);
    const authenticatedEmail = clean(auth.user.email).toLowerCase();

    if (!email || email !== authenticatedEmail) {
      return send(res, 400, {
        ok: false,
        error: "Payment email must match your authenticated OBITREND account."
      });
    }

    const result = await initializeMonnifyPayment({
      email,
      plan,
      userId: auth.user.id,
      req,
      redis
    });

    return send(res, 200, result);
  } catch (error) {
    console.error("OBITREND MONNIFY API ERROR:", error?.message || error);
    return send(res, 500, {
      ok: false,
      error: clean(error?.message) || "Unable to process Monnify payment."
    });
  }
}
