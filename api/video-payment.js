import { createClient } from "@supabase/supabase-js";

import {
  getAuthenticatedUser,
  getProStatus,
  getRedisConfig,
} from "../lib/credits.js";

const PAYSTACK_API = "https://api.paystack.co";

const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const PAYSTACK_SECRET_KEY =
  process.env.PAYSTACK_SECRET_KEY;

const APP_URL =
  process.env.OBITREND_APP_URL ||
  "https://obitrend.vercel.app";

const VIDEO_PACKAGES = Object.freeze({
  5: {
    durationSeconds: 5,
    amount: 800000,
    name: "OBITREND 5 Second Video",
  },

  10: {
    durationSeconds: 10,
    amount: 1600000,
    name: "OBITREND 10 Second Video",
  },
});

function send(res, status, body) {
  return res.status(status).json(body);
}

function clean(value) {
  return String(value ?? "").trim();
}

function supabaseServiceClient() {
  if (
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw new Error(
      "Supabase server configuration is missing."
    );
  }

  return createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

async function paystackRequest(
  path,
  options = {}
) {
  const response = await fetch(
    `${PAYSTACK_API}${path}`,
    {
      method: options.method || "GET",

      headers: {
        Authorization:
          `Bearer ${PAYSTACK_SECRET_KEY}`,

        "Content-Type":
          "application/json",

        Accept:
          "application/json",
      },

      body:
        options.body === undefined
          ? undefined
          : JSON.stringify(options.body),
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
    data,
  };
}

async function verifyPaystack(reference) {
  const response = await fetch(
    `${PAYSTACK_API}/transaction/verify/${encodeURIComponent(
      reference
    )}`,
    {
      method: "GET",

      headers: {
        Authorization:
          `Bearer ${PAYSTACK_SECRET_KEY}`,

        Accept:
          "application/json",
      },
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
    data,
  };
}

async function authenticateAndCheckPro(
  req,
  res
) {
  const auth =
    await getAuthenticatedUser(req);

  if (!auth.ok) {
    send(res, auth.status, {
      success: false,
      error: auth.error,
    });

    return null;
  }

  const redis =
    getRedisConfig();

  const proStatus =
    await getProStatus(
      auth.user.id,
      redis
    );

  if (!proStatus.active) {
    send(res, 403, {
      success: false,
      proRequired: true,
      error:
        "Video purchases are available to OBITREND Pro users only.",
    });

    return null;
  }

  return auth;
}

async function initializeVideoPayment(
  req,
  res,
  auth,
  body
) {
  const duration =
    Number(body.duration);

  const packageInfo =
    VIDEO_PACKAGES[duration];

  if (!packageInfo) {
    return send(res, 400, {
      success: false,
      error:
        "Video duration must be 5 or 10 seconds.",
    });
  }

  const reference =
    `OBITREND-VIDEO-${duration}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)
      .toUpperCase()}`;

  const supabase =
    supabaseServiceClient();

  const {
    error: insertError,
  } = await supabase
    .from("video_credit_purchases")
    .insert({
      user_id:
        auth.user.id,

      reference,

      duration_seconds:
        packageInfo.durationSeconds,

      amount:
        packageInfo.amount,

      currency:
        "NGN",

      credits:
        1,

      status:
        "pending",
    });

  if (insertError) {
    console.error(
      "OBITREND video purchase insert error:",
      insertError.message
    );

    return send(res, 500, {
      success: false,
      error:
        "Unable to create the video purchase.",
    });
  }

  const result =
    await paystackRequest(
      "/transaction/initialize",
      {
        method: "POST",

        body: {
          email:
            auth.user.email,

          amount:
            String(
              packageInfo.amount
            ),

          currency:
            "NGN",

          reference,

          callback_url:
            `${APP_URL.replace(
              /\/+$/,
              ""
            )}/`,

          metadata: {
            product:
              "OBITREND_VIDEO",

            duration_seconds:
              packageInfo.durationSeconds,

            video_name:
              packageInfo.name,

            amount:
              packageInfo.amount,

            credits:
              1,

            user_id:
              auth.user.id,
          },
        },
      }
    );

  if (
    !result.ok ||
    !result.data?.status ||
    !result.data?.data?.authorization_url
  ) {
    await supabase
      .from("video_credit_purchases")
      .update({
        status:
          "failed",
      })
      .eq(
        "reference",
        reference
      )
      .eq(
        "user_id",
        auth.user.id
      );

    return send(res, 502, {
      success: false,
      error:
        result.data?.message ||
        "Unable to open the secure Paystack payment page.",
    });
  }

  return send(res, 200, {
    success: true,

    authorization_url:
      result.data.data.authorization_url,

    reference:
      result.data.data.reference ||
      reference,

    duration:
      packageInfo.durationSeconds,

    amount:
      packageInfo.amount,

    currency:
      "NGN",

    credits:
      1,
  });
}

async function verifyVideoPayment(
  req,
  res,
  auth,
  body
) {
  const reference =
    clean(body.reference);

  if (!reference) {
    return send(res, 400, {
      success: false,
      error:
        "Payment reference is required.",
    });
  }

  const supabase =
    supabaseServiceClient();

  const {
    data: purchase,
    error: purchaseError,
  } = await supabase
    .from("video_credit_purchases")
    .select(
      "id,user_id,reference,duration_seconds,amount,currency,credits,status,completed_at"
    )
    .eq(
      "reference",
      reference
    )
    .eq(
      "user_id",
      auth.user.id
    )
    .maybeSingle();

  if (purchaseError) {
    console.error(
      "OBITREND video purchase lookup error:",
      purchaseError.message
    );

    return send(res, 500, {
      success: false,
      error:
        "Unable to find the video purchase.",
    });
  }

  if (!purchase) {
    return send(res, 404, {
      success: false,
      error:
        "Video payment record was not found.",
    });
  }

  if (
    purchase.status === "paid"
  ) {
    return send(res, 200, {
      success: true,
      alreadyCompleted: true,
      duration:
        purchase.duration_seconds,
      creditsAdded: 0,
      message:
        "This video payment has already been credited.",
    });
  }

  if (
    purchase.status !== "pending"
  ) {
    return send(res, 400, {
      success: false,
      error:
        "This video payment cannot be completed.",
    });
  }

  const verification =
    await verifyPaystack(
      reference
    );

  if (
    !verification.ok ||
    !verification.data?.status ||
    !verification.data?.data
  ) {
    return send(res, 400, {
      success: false,
      error:
        verification.data?.message ||
        "Paystack could not verify this payment.",
    });
  }

  const transaction =
    verification.data.data;

  if (
    String(
      transaction.status || ""
    ).toLowerCase() !== "success"
  ) {
    return send(res, 400, {
      success: false,
      paid: false,
      error:
        "The Paystack payment has not been completed.",
    });
  }

  if (
    clean(transaction.reference) !==
    purchase.reference
  ) {
    return send(res, 400, {
      success: false,
      error:
        "Payment reference verification failed.",
    });
  }

  if (
    String(
      transaction.currency || ""
    ).toUpperCase() !== "NGN"
  ) {
    return send(res, 400, {
      success: false,
      error:
        "Invalid payment currency.",
    });
  }

  const paidAmount =
    Number(transaction.amount);

  const expectedAmount =
    Number(purchase.amount);

  if (
    !Number.isFinite(paidAmount) ||
    paidAmount !== expectedAmount
  ) {
    return send(res, 400, {
      success: false,
      error:
        "The payment amount does not match the video purchase.",
    });
  }

  const paidEmail =
    clean(
      transaction.customer?.email
    ).toLowerCase();

  const accountEmail =
    clean(
      auth.user.email
    ).toLowerCase();

  if (
    !paidEmail ||
    paidEmail !== accountEmail
  ) {
    return send(res, 400, {
      success: false,
      error:
        "The payment email does not match your OBITREND account.",
    });
  }

  const validPackage =
    (
      purchase.duration_seconds === 5 &&
      purchase.amount === 800000
    ) ||
    (
      purchase.duration_seconds === 10 &&
      purchase.amount === 1600000
    );

  if (!validPackage) {
    return send(res, 400, {
      success: false,
      error:
        "Invalid OBITREND video package.",
    });
  }

  const {
    data: fulfillment,
    error: fulfillmentError,
  } = await supabase.rpc(
    "complete_video_purchase",
    {
      purchase_reference:
        purchase.reference,
    }
  );

  if (fulfillmentError) {
    console.error(
      "OBITREND video credit fulfillment error:",
      fulfillmentError.message
    );

    return send(res, 500, {
      success: false,
      error:
        "Payment was verified but the video credit could not be added.",
    });
  }

  const result =
    Array.isArray(fulfillment)
      ? fulfillment[0]
      : fulfillment;

  if (!result?.success) {
    return send(res, 500, {
      success: false,
      error:
        "Payment was verified but the video credit could not be added.",
    });
  }

  return send(res, 200, {
    success: true,

    paid: true,

    alreadyCompleted:
      Boolean(
        result.already_completed
      ),

    duration:
      Number(
        result.duration_seconds ||
        purchase.duration_seconds
      ),

    creditsAdded:
      Number(
        result.credits_added || 0
      ),

    message:
      result.already_completed
        ? "Video payment already credited."
        : "Video credit added successfully.",
  });
}

export default async function handler(
  req,
  res
) {
  if (req.method !== "POST") {
    return send(res, 405, {
      success: false,
      error:
        "Method not allowed.",
    });
  }

  if (!PAYSTACK_SECRET_KEY) {
    return send(res, 500, {
      success: false,
      error:
        "PAYSTACK_SECRET_KEY is not configured.",
    });
  }

  try {
    const auth =
      await authenticateAndCheckPro(
        req,
        res
      );

    if (!auth) {
      return;
    }

    const body =
      req.body || {};

    const action =
      clean(body.action)
        .toLowerCase();

    if (
      action === "verify" ||
      (
        body.reference &&
        body.duration == null
      )
    ) {
      return await verifyVideoPayment(
        req,
        res,
        auth,
        body
      );
    }

    return await initializeVideoPayment(
      req,
      res,
      auth,
      body
    );

  } catch (error) {
    console.error(
      "OBITREND video payment error:",
      error?.message || error
    );

    return send(res, 500, {
      success: false,
      error:
        "Unable to process the video payment right now.",
    });
  }
}
