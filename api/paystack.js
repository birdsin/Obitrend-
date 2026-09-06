/* =========================================================
   OBITREND FRESH PRO PAYMENT API
   FOUR FIXED PACKAGES
   ========================================================= */

import {
  activatePro,
  getAuthenticatedUser,
  getRedisConfig
} from "./credits.js";

const PAYSTACK_API =
  "https://api.paystack.co";

const DEFAULT_APP_URL =
  "https://obitrend.vercel.app";

const CURRENCY = "NGN";

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

function clean(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function send(res, status, data) {
  return res.status(status).json(data);
}

function config() {
  return {
    secretKey:
      clean(
        process.env.PAYSTACK_SECRET_KEY
      ),

    appUrl:
      clean(
        process.env.OBITREND_APP_URL
      ) ||
      DEFAULT_APP_URL
  };
}

async function paystack(
  path,
  secretKey,
  options = {}
) {
  const response =
    await fetch(
      `${PAYSTACK_API}${path}`,
      {
        method:
          options.method || "GET",

        headers: {
          Authorization:
            `Bearer ${secretKey}`,

          "Content-Type":
            "application/json",

          Accept:
            "application/json"
        },

        body:
          options.body === undefined
            ? undefined
            : JSON.stringify(
                options.body
              )
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
    ok: response.ok,
    status: response.status,
    data
  };
}

function getPackage(plan) {
  return (
    PACKAGES[
      upper(plan)
    ] || null
  );
}

async function initializePayment(
  email,
  plan,
  cfg
) {
  const packageInfo =
    getPackage(plan);

  if (!packageInfo) {
    return {
      success: false,
      error:
        "Invalid OBITREND Pro package."
    };
  }

  const cleanEmail =
    clean(email)
      .toLowerCase();

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/
      .test(cleanEmail)
  ) {
    return {
      success: false,
      error:
        "Please provide a valid email address."
    };
  }

  const reference =
    `OBITREND-${upper(plan)}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;

  const payload = {
    email: cleanEmail,

    amount:
      String(
        packageInfo.amount
      ),

    currency:
      CURRENCY,

    reference,

    callback_url:
      `${cfg.appUrl.replace(
        /\/+$/,
        ""
      )}/`,

    metadata: {
      product:
        "OBITREND_PRO",

      package:
        upper(plan),

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
    await paystack(
      "/transaction/initialize",
      cfg.secretKey,
      {
        method: "POST",
        body: payload
      }
    );

  if (
    !result.ok ||
    !result.data?.status ||
    !result.data?.data
      ?.authorization_url
  ) {
    return {
      success: false,
      error:
        result.data?.message ||
        "Unable to initialize the OBITREND payment."
    };
  }

  return {
    success: true,

    authorization_url:
      result.data.data
        .authorization_url,

    reference:
      result.data.data
        .reference ||
      reference,

    access_code:
      result.data.data
        .access_code ||
      null,

    product_plan:
      upper(plan),

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

  const result =
    await paystack(
      `/transaction/verify/${encodeURIComponent(
        ref
      )}`,
      cfg.secretKey
    );

  if (
    !result.ok ||
    !result.data?.status ||
    !result.data?.data
  ) {
    return {
      success: false,
      paid: false,
      reference: ref,
      error:
        result.data?.message ||
        "Paystack could not verify the payment."
    };
  }

  const tx =
    result.data.data;

  if (
    upper(tx.status) !==
    "SUCCESS"
  ) {
    return {
      success: false,
      paid: false,
      reference:
        tx.reference || ref,
      error:
        "Payment has not been completed successfully."
    };
  }

  if (
    upper(tx.currency) !==
    CURRENCY
  ) {
    return {
      success: false,
      paid: false,
      reference:
        tx.reference || ref,
      error:
        "Payment currency does not match OBITREND."
    };
  }

  const match =
    ref.match(
      /^OBITREND-(PRO_4_DAY|PRO_8_DAY|PRO_14_DAY|PRO_MONTHLY)-/i
    );

  const plan =
    match
      ? upper(match[1])
      : "";

  const packageInfo =
    getPackage(plan);

  if (!packageInfo) {
    return {
      success: false,
      paid: false,
      reference:
        tx.reference || ref,
      error:
        "This payment is not a valid OBITREND Pro package."
    };
  }

  const requestedAmount =
    Number(
      tx.requested_amount
    );

  const actualAmount =
    Number(tx.amount);

  if (
    !Number.isFinite(
      requestedAmount
    ) ||
    requestedAmount !==
      packageInfo.amount
  ) {
    return {
      success: false,
      paid: false,
      reference:
        tx.reference || ref,
      error:
        "The payment amount does not match the selected OBITREND Pro package."
    };
  }

  if (
    !Number.isFinite(
      actualAmount
    ) ||
    actualAmount !==
      packageInfo.amount
  ) {
    return {
      success: false,
      paid: false,
      reference:
        tx.reference || ref,
      error:
        "The verified payment amount does not match the OBITREND Pro package."
    };
  }

  const email =
    clean(
      tx.customer?.email ||
      tx.email
    ).toLowerCase();

  if (
    authenticatedEmail &&
    email &&
    email !==
      clean(
        authenticatedEmail
      ).toLowerCase()
  ) {
    return {
      success: false,
      paid: false,
      reference:
        tx.reference || ref,
      error:
        "This payment belongs to a different OBITREND account."
    };
  }

  return {
    success: true,
    paid: true,

    reference:
      tx.reference || ref,

    status:
      tx.status,

    amount:
      actualAmount,

    requestedAmount:
      requestedAmount,

    currency:
      tx.currency,

    email,

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

async function handleGet(
  req,
  res
) {
  const cfg =
    config();

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
      url.searchParams.get(
        "reference"
      ) ||
      url.searchParams.get(
        "trxref"
      ) ||
      url.searchParams.get(
        "ref"
      )
    );

  if (!reference) {
    return send(
      res,
      200,
      {
        success: true,
        service:
          "OBITREND Pro Payments",
        status: "ready"
      }
    );
  }

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

  const redis =
    getRedisConfig();

  if (
    !redis.url ||
    !redis.token
  ) {
    return send(
      res,
      500,
      {
        success: false,
        paid: true,
        error:
          "Redis environment variables are missing."
      }
    );
  }

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
      proActivated: true,
      proActive:
        activated.active,
      proCredits:
        activated.proCredits,
      proExpiresAt:
        activated.expiresAt,
      plan:
        activated.plan,
      planTier:
        activated.planTier
    }
  );
}

async function handlePost(
  req,
  res
) {
  const cfg =
    config();

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

  let body =
    req.body || {};

  if (
    typeof body ===
    "string"
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

  const plan =
    upper(body.plan);

  if (
    !getPackage(plan)
  ) {
    return send(
      res,
      400,
      {
        success: false,
        error:
          "Invalid OBITREND Pro package."
      }
    );
  }

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
    req.method ===
    "OPTIONS"
  ) {
    return res
      .status(204)
      .end();
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

  if (
    req.method ===
    "POST"
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
