/*
=========================================================
OBITREND AI VIDEO PAYSTACK WEBHOOK
=========================================================

VIDEO PAYMENTS ONLY

₦5,000  = 5 seconds
₦10,000 = 10 seconds
₦15,000 = 15 seconds
₦20,000 = 20 seconds

SECURITY:
- Verifies Paystack webhook signature
- Retrieves transaction directly from Paystack
- Verifies transaction is successful
- Verifies currency is NGN
- Verifies exact amount
- Verifies authenticated OBITREND user ID
- Verifies video package
- Prevents duplicate fulfillment
- Adds video seconds only after verification

DOES NOT:
- Modify image credits
- Activate Fashion Pro
- Activate Campaign Pro
- Use free credits

=========================================================
*/

import crypto from "crypto";

import {
  getRedisConfig
} from "../lib/credits.js";

import {
  getVideoPackage,
  addVideoSeconds
} from "../lib/video-credits.js";


/* =======================================================
   RESPONSE
======================================================= */

function json(res, status, body) {

  res.statusCode = status;

  res.setHeader(
    "Content-Type",
    "application/json"
  );

  res.setHeader(
    "Cache-Control",
    "no-store"
  );

  return res.end(
    JSON.stringify(body)
  );
}


/* =======================================================
   READ RAW REQUEST BODY
======================================================= */

async function readRawBody(req) {

  if (
    typeof req.body === "string"
  ) {
    return req.body;
  }

  return await new Promise(
    (resolve, reject) => {

      let raw = "";

      req.on(
        "data",
        chunk => {
          raw += chunk;
        }
      );

      req.on(
        "end",
        () => resolve(raw)
      );

      req.on(
        "error",
        reject
      );

    }
  );
}


/* =======================================================
   PAYSTACK REQUEST
======================================================= */

async function paystackRequest(path) {

  const secret =
    process.env.PAYSTACK_SECRET_KEY ||
    process.env.PAYSTACK_SECRET;

  if (!secret) {
    throw new Error(
      "Paystack configuration is unavailable."
    );
  }

  const response =
    await fetch(
      `https://api.paystack.co${path}`,
      {
        method: "GET",

        headers: {
          Authorization:
            `Bearer ${secret}`,

          "Content-Type":
            "application/json"
        }
      }
    );

  const data =
    await response.json();

  return {
    ok: response.ok,
    status: response.status,
    data
  };
}


/* =======================================================
   VERIFY PAYSTACK SIGNATURE
======================================================= */

function verifySignature(
  rawBody,
  signature
) {

  const secret =
    process.env.PAYSTACK_SECRET_KEY ||
    process.env.PAYSTACK_SECRET;

  if (!secret || !signature) {
    return false;
  }

  const expected =
    crypto
      .createHmac(
        "sha512",
        secret
      )
      .update(rawBody)
      .digest("hex");

  try {

    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature)
    );

  } catch {

    return false;
  }
}


/* =======================================================
   MAIN HANDLER
======================================================= */

export default async function handler(
  req,
  res
) {

  /*
  -------------------------------------------------------
  Paystack sends POST webhooks.
  -------------------------------------------------------
  */

  if (req.method !== "POST") {

    return json(
      res,
      405,
      {
        ok: false,
        error:
          "Video webhook is unavailable."
      }
    );
  }


  try {

    /*
    =====================================================
    1. READ RAW BODY
    =====================================================
    */

    const rawBody =
      await readRawBody(req);


    /*
    =====================================================
    2. VERIFY SIGNATURE
    =====================================================
    */

    const signature =
      req.headers?.[
        "x-paystack-signature"
      ] ||
      req.headers?.[
        "X-Paystack-Signature"
      ];


    if (
      !verifySignature(
        rawBody,
        signature
      )
    ) {

      console.warn(
        "OBITREND VIDEO WEBHOOK: invalid signature"
      );

      return json(
        res,
        401,
        {
          ok: false,
          error:
            "Webhook verification failed."
        }
      );
    }


    /*
    =====================================================
    3. PARSE EVENT
    =====================================================
    */

    let event;

    try {

      event =
        JSON.parse(rawBody);

    } catch {

      return json(
        res,
        400,
        {
          ok: false,
          error:
            "Invalid webhook request."
        }
      );
    }


    /*
    =====================================================
    4. ONLY PROCESS SUCCESSFUL CHARGES
    =====================================================
    */

    if (
      event?.event !==
      "charge.success"
    ) {

      /*
      Acknowledge other Paystack events.
      They do not add video seconds.
      */

      return json(
        res,
        200,
        {
          ok: true,
          ignored: true
        }
      );
    }


    /*
    =====================================================
    5. GET REFERENCE
    =====================================================
    */

    const reference =
      String(
        event?.data?.reference ||
        ""
      ).trim();


    if (!reference) {

      return json(
        res,
        400,
        {
          ok: false,
          error:
            "Payment reference is unavailable."
        }
      );
    }


    /*
    =====================================================
    6. VERIFY TRANSACTION DIRECTLY WITH PAYSTACK
    =====================================================

    Never trust the webhook payload alone for digital
    value delivery.
    =====================================================
    */

    const verification =
      await paystackRequest(
        `/transaction/verify/${encodeURIComponent(
          reference
        )}`
      );


    if (
      !verification.ok ||
      !verification.data?.status ||
      !verification.data?.data
    ) {

      return json(
        res,
        502,
        {
          ok: false,
          error:
            "Payment verification is temporarily unavailable."
        }
      );
    }


    const transaction =
      verification.data.data;


    /*
    =====================================================
    7. PAYMENT STATUS
    =====================================================
    */

    if (
      transaction.status !==
      "success"
    ) {

      return json(
        res,
        200,
        {
          ok: true,
          ignored: true
        }
      );
    }


    /*
    =====================================================
    8. VERIFY CURRENCY
    =====================================================
    */

    if (
      String(
        transaction.currency ||
        ""
      ).toUpperCase() !== "NGN"
    ) {

      console.warn(
        "OBITREND VIDEO WEBHOOK: invalid currency",
        reference
      );

      return json(
        res,
        400,
        {
          ok: false,
          error:
            "Payment currency could not be verified."
        }
      );
    }


    /*
    =====================================================
    9. READ METADATA
    =====================================================
    */

    const metadata =
      transaction.metadata ||
      event?.data?.metadata ||
      {};


    const userId =
      String(
        metadata.obitrend_user_id ||
        metadata.user_id ||
        ""
      ).trim();


    const packageId =
      String(
        metadata.package ||
        ""
      ).trim();


    /*
    =====================================================
    10. USER MUST EXIST
    =====================================================
    */

    if (!userId) {

      console.warn(
        "OBITREND VIDEO WEBHOOK: missing user",
        reference
      );

      return json(
        res,
        400,
        {
          ok: false,
          error:
            "Video account could not be identified."
        }
      );
    }


    /*
    =====================================================
    11. VALIDATE PACKAGE
    =====================================================
    */

    const packageInfo =
      getVideoPackage(
        packageId
      );


    if (!packageInfo) {

      console.warn(
        "OBITREND VIDEO WEBHOOK: invalid package",
        reference
      );

      return json(
        res,
        400,
        {
          ok: false,
          error:
            "Video package could not be verified."
        }
      );
    }


    /*
    =====================================================
    12. VERIFY EXACT AMOUNT
    =====================================================
    */

    const paidAmount =
      Number(
        transaction.amount
      );


    if (
      !Number.isFinite(paidAmount) ||
      paidAmount !==
      Number(packageInfo.amount)
    ) {

      console.warn(
        "OBITREND VIDEO WEBHOOK: amount mismatch",
        {
          reference,
          paidAmount,
          expected:
            packageInfo.amount
        }
      );

      return json(
        res,
        400,
        {
          ok: false,
          error:
            "Payment amount could not be verified."
        }
      );
    }


    /*
    =====================================================
    13. VERIFY METADATA AMOUNT IF PRESENT
    =====================================================
    */

    if (
      metadata.amount !== undefined &&
      Number(metadata.amount) !==
      Number(packageInfo.amount)
    ) {

      return json(
        res,
        400,
        {
          ok: false,
          error:
            "Payment details could not be verified."
        }
      );
    }


    /*
    =====================================================
    14. VERIFY METADATA SECONDS IF PRESENT
    =====================================================
    */

    if (
      metadata.video_seconds !== undefined &&
      Number(metadata.video_seconds) !==
      Number(packageInfo.seconds)
    ) {

      return json(
        res,
        400,
        {
          ok: false,
          error:
            "Video package details could not be verified."
        }
      );
    }


    /*
    =====================================================
    15. REDIS
    =====================================================
    */

    const redis =
      await getRedisConfig();


    if (!redis) {

      return json(
        res,
        503,
        {
          ok: false,
          error:
            "Video wallet is temporarily unavailable."
        }
      );
    }


    /*
    =====================================================
    16. ADD VIDEO SECONDS
    =====================================================

    addVideoSeconds() protects the reference against
    duplicate fulfillment.
    =====================================================
    */

    const result =
      await addVideoSeconds({
        userId,
        email:
          transaction.customer?.email ||
          metadata.obitrend_email ||
          "",
        reference,
        packageId,
        redis
      });


    if (!result?.ok) {

      console.error(
        "OBITREND VIDEO WEBHOOK: fulfillment failed",
        result?.error
      );

      return json(
        res,
        500,
        {
          ok: false,
          error:
            "Video payment was verified but the video balance could not be updated yet."
        }
      );
    }


    /*
    =====================================================
    17. SUCCESS
    =====================================================
    */

    return json(
      res,
      200,
      {

        ok: true,

        product:
          "OBITREND_VIDEO",

        reference,

        package:
          packageInfo.id,

        added:
          result.added || 0,

        seconds:
          result.seconds || 0,

        duplicate:
          result.duplicate || false

      }
    );


  } catch (error) {

    console.error(
      "OBITREND VIDEO WEBHOOK:",
      error?.message || error
    );

    return json(
      res,
      500,
      {
        ok: false,
        error:
          "Video payment could not be completed right now."
      }
    );

  }

}
