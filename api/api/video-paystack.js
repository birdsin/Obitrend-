/*
=========================================================
OBITREND AI VIDEO PAYSTACK
=========================================================

VIDEO PAYMENTS ONLY

₦5,000  = 5 seconds
₦10,000 = 10 seconds
₦15,000 = 15 seconds
₦20,000 = 20 seconds

IMPORTANT:
- Does NOT touch image credits
- Does NOT activate Fashion Pro
- Does NOT activate Campaign Pro
- Requires authenticated Supabase user
- Uses fixed server-side package prices
- Stores the authenticated user ID in Paystack metadata
- Video balance is delivered separately by the secure
  verification/webhook layer

=========================================================
*/

import {
  getAuthenticatedUser,
  getRedisConfig
} from "../lib/credits.js";

import {
  getVideoPackage
} from "../lib/video-credits.js";


/* =======================================================
   RESPONSE HELPER
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
   PAYSTACK REQUEST
======================================================= */

async function paystackRequest(path, options = {}) {

  const secret =
    process.env.PAYSTACK_SECRET_KEY ||
    process.env.PAYSTACK_SECRET;

  if (!secret) {
    throw new Error(
      "Paystack configuration is unavailable."
    );
  }

  const response = await fetch(
    `https://api.paystack.co${path}`,
    {
      ...options,

      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",

        ...(options.headers || {})
      }
    }
  );

  const data = await response.json();

  return {
    ok: response.ok,
    status: response.status,
    data
  };
}


/* =======================================================
   READ REQUEST BODY
======================================================= */

async function readBody(req) {

  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  return await new Promise((resolve, reject) => {

    let raw = "";

    req.on("data", chunk => {
      raw += chunk;
    });

    req.on("end", () => {

      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(
          new Error(
            "Invalid payment request."
          )
        );
      }

    });

    req.on("error", reject);

  });
}


/* =======================================================
   APPLICATION URL
======================================================= */

function getApplicationUrl(req) {

  const configured =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL;

  if (configured) {

    if (
      configured.startsWith("http://") ||
      configured.startsWith("https://")
    ) {
      return configured;
    }

    return `https://${configured}`;
  }

  const host =
    req.headers?.host ||
    req.headers?.["x-forwarded-host"];

  const protocol =
    req.headers?.["x-forwarded-proto"] ||
    "https";

  if (host) {
    return `${protocol}://${host}`;
  }

  return "https://obitrend.vercel.app";
}


/* =======================================================
   MAIN HANDLER
======================================================= */

export default async function handler(req, res) {

  /*
  -------------------------------------------------------
  Only POST is allowed.
  -------------------------------------------------------
  */

  if (req.method !== "POST") {

    return json(
      res,
      405,
      {
        ok: false,
        error:
          "This video payment request is unavailable."
      }
    );
  }


  try {

    /*
    =====================================================
    1. AUTHENTICATE USER
    =====================================================
    */

    const user =
      await getAuthenticatedUser(req);

    if (!user?.id) {

      return json(
        res,
        401,
        {
          ok: false,
          error:
            "Please sign in before purchasing video seconds."
        }
      );
    }


    /*
    =====================================================
    2. READ REQUEST
    =====================================================
    */

    const body =
      await readBody(req);

    const requestedPackage =
      String(
        body?.package ||
        body?.packageId ||
        ""
      ).trim();


    /*
    =====================================================
    3. VALIDATE PACKAGE
    =====================================================

    The browser cannot decide the price.

    The server chooses the real package.
    =====================================================
    */

    const packageInfo =
      getVideoPackage(
        requestedPackage
      );

    if (!packageInfo) {

      return json(
        res,
        400,
        {
          ok: false,
          error:
            "Please select a valid video package."
        }
      );
    }


    /*
    =====================================================
    4. AUTHENTICATED EMAIL
    =====================================================
    */

    const email =
      String(
        user.email ||
        ""
      ).trim().toLowerCase();

    if (!email) {

      return json(
        res,
        400,
        {
          ok: false,
          error:
            "Your account email is unavailable."
        }
      );
    }


    /*
    =====================================================
    5. INITIALIZE PAYSTACK
    =====================================================
    */

    const applicationUrl =
      getApplicationUrl(req);

    const callbackUrl =
      `${applicationUrl}/?obitrend_video_payment=return`;


    const metadata = {

      product:
        "OBITREND_VIDEO",

      package:
        packageInfo.id,

      package_name:
        packageInfo.name,

      video_seconds:
        packageInfo.seconds,

      amount:
        packageInfo.amount,

      currency:
        "NGN",

      obitrend_user_id:
        user.id,

      user_id:
        user.id,

      obitrend_email:
        email,

      source:
        "OBITREND_AI_VIDEO_STUDIO"

    };


    const result =
      await paystackRequest(
        "/transaction/initialize",
        {
          method: "POST",

          body: JSON.stringify({

            email,

            amount:
              packageInfo.amount,

            currency:
              "NGN",

            callback_url:
              callbackUrl,

            metadata

          })
        }
      );


    /*
    =====================================================
    6. CHECK PAYSTACK RESPONSE
    =====================================================
    */

    if (
      !result.ok ||
      !result.data?.status ||
      !result.data?.data?.authorization_url
    ) {

      return json(
        res,
        502,
        {
          ok: false,
          error:
            "Video payment could not be started. Please try again."
        }
      );
    }


    /*
    =====================================================
    7. RETURN PAYMENT URL
    =====================================================
    */

    return json(
      res,
      200,
      {

        ok: true,

        product:
          "OBITREND_VIDEO",

        package:
          packageInfo.id,

        seconds:
          packageInfo.seconds,

        amount:
          packageInfo.amount,

        authorization_url:
          result.data.data.authorization_url,

        authorizationUrl:
          result.data.data.authorization_url,

        access_code:
          result.data.data.access_code,

        accessCode:
          result.data.data.access_code,

        reference:
          result.data.data.reference

      }
    );


  } catch (error) {

    /*
    =====================================================
    FRIENDLY SERVER RESPONSE
    =====================================================
    */

    console.error(
      "OBITREND VIDEO PAYMENT:",
      error?.message || error
    );

    return json(
      res,
      500,
      {
        ok: false,
        error:
          "Unable to start the video payment right now. Please try again."
      }
    );

  }

}
