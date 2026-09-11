import { createClient } from "@supabase/supabase-js";
import {
  getAuthenticatedUser,
  getProStatus,
  getRedisConfig,
} from "./credits.js";

const PAYSTACK_API =
  "https://api.paystack.co";

const PAYSTACK_SECRET_KEY =
  process.env.PAYSTACK_SECRET_KEY;

const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

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
        Accept: "application/json",
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
    // PAYMENT REFERENCE
    // ------------------------------------------------

    const body = req.body || {};

    const reference =
      clean(body.reference);

    if (!reference) {
      return send(res, 400, {
        success: false,
        error:
          "Payment reference is required.",
      });
    }

    // ------------------------------------------------
    // SUPABASE
    // ------------------------------------------------

    const supabase =
      supabaseServiceClient();

    // ------------------------------------------------
    // FIND PURCHASE
    // IMPORTANT:
    // CLIENT DOES NOT CONTROL THE PRICE OR DURATION.
    // ------------------------------------------------

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

    // ------------------------------------------------
    // ALREADY PAID
    // ------------------------------------------------

    if (purchase.status === "paid") {
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

    // ------------------------------------------------
    // ONLY PENDING PAYMENTS CAN BE COMPLETED
    // ------------------------------------------------

    if (purchase.status !== "pending") {
      return send(res, 400, {
        success: false,
        error:
          "This video payment cannot be completed.",
      });
    }

    // ------------------------------------------------
    // VERIFY DIRECTLY WITH PAYSTACK
    // ------------------------------------------------

    const verification =
      await verifyPaystack(reference);

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

    // ------------------------------------------------
    // PAYMENT STATUS
    // ------------------------------------------------

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

    // ------------------------------------------------
    // VERIFY REFERENCE
    // ------------------------------------------------

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

    // ------------------------------------------------
    // VERIFY CURRENCY
    // ------------------------------------------------

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

    // ------------------------------------------------
    // VERIFY AMOUNT
    // SERVER DATABASE AMOUNT IS AUTHORITATIVE
    // ------------------------------------------------

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

    // ------------------------------------------------
    // VERIFY CUSTOMER EMAIL
    // ------------------------------------------------

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

    // ------------------------------------------------
    // VERIFY VIDEO PACKAGE
    // ------------------------------------------------

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

    // ------------------------------------------------
    // ATOMICALLY ADD VIDEO CREDIT
    // ------------------------------------------------

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

    // ------------------------------------------------
    // SUCCESS
    // ------------------------------------------------

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

  } catch (error) {
    console.error(
      "OBITREND video payment verification error:",
      error?.message || error
    );

    return send(res, 500, {
      success: false,
      error:
        "Unable to verify the video payment right now.",
    });
  }
}
