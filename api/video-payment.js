import { createClient } from "@supabase/supabase-js";
import {
  getAuthenticatedUser,
  getProStatus,
  getRedisConfig,
} from "./credits.js";

const PAYSTACK_API = "https://api.paystack.co";

const SUPABASE_URL = process.env.SUPABASE_URL;
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return send(res, 405, {
      success: false,
      error: "Method not allowed.",
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
    // ------------------------------------------------
    // AUTHENTICATE USER
    // ------------------------------------------------

    const auth =
      await getAuthenticatedUser(req);

    if (!auth.ok) {
      return send(res, auth.status, {
        success: false,
        error: auth.error,
      });
    }

    // ------------------------------------------------
    // VIDEO IS PRO-ONLY
    // ------------------------------------------------

    const redis =
      getRedisConfig();

    const proStatus =
      await getProStatus(
        auth.user.id,
        redis
      );

    if (!proStatus.active) {
      return send(res, 403, {
        success: false,
        proRequired: true,
        error:
          "Video purchases are available to OBITREND Pro users only.",
      });
    }

    // ------------------------------------------------
    // GET DURATION
    // ------------------------------------------------

    const body = req.body || {};

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

    // ------------------------------------------------
    // SERVER-CONTROLLED REFERENCE
    // ------------------------------------------------

    const reference =
      `OBITREND-VIDEO-${duration}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)
        .toUpperCase()}`;

    // ------------------------------------------------
    // CREATE PENDING PURCHASE
    // ------------------------------------------------

    const supabase =
      supabaseServiceClient();

    const {
      error: insertError,
    } = await supabase
      .from("video_credit_purchases")
      .insert({
        user_id: auth.user.id,

        reference,

        duration_seconds:
          packageInfo.durationSeconds,

        amount:
          packageInfo.amount,

        currency: "NGN",

        credits: 1,

        status: "pending",
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

    // ------------------------------------------------
    // INITIALIZE PAYSTACK
    // ------------------------------------------------

    const result =
      await paystackRequest(
        "/transaction/initialize",
        {
          method: "POST",

          body: {
            email:
              auth.user.email,

            amount:
              String(packageInfo.amount),

            currency: "NGN",

            reference,

            callback_url:
              `${APP_URL.replace(/\/+$/, "")}/`,

            metadata: {
              product:
                "OBITREND_VIDEO",

              duration_seconds:
                packageInfo.durationSeconds,

              video_name:
                packageInfo.name,

              amount:
                packageInfo.amount,

              credits: 1,

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
          status: "failed",
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

    // ------------------------------------------------
    // RETURN PAYMENT URL
    // ------------------------------------------------

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

      currency: "NGN",

      credits: 1,
    });

  } catch (error) {
    console.error(
      "OBITREND video payment error:",
      error?.message || error
    );

    return send(res, 500, {
      success: false,
      error:
        "Unable to start video payment right now.",
    });
  }
}
