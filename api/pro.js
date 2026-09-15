/*
=========================================================
OBITREND AI FASHION CREATOR
PRO STATUS + PAYMENT VERIFICATION BRIDGE
=========================================================

CURRENT PRO PACKAGES ARE CONTROLLED BY:

    /api/paystack

Packages:

    ₦10,000 → 4 days  → 5 credits
    ₦20,000 → 8 days  → 10 credits
    ₦30,000 → 14 days → 15 credits
    ₦60,000 → 30 days → 30 credits

IMPORTANT:

- /api/paystack is the single payment source of truth.
- /api/pro no longer contains a separate Weekly/Monthly
  payment verification system.
- GET /api/pro keeps the dashboard Pro-status function.
- POST /api/pro bridges older frontend verification calls
  to the current /api/paystack verification system.
- Authentication is still required.
- The authenticated user's Bearer token is forwarded.
- No client-supplied userId is trusted.
=========================================================
*/

import {
  getAuthenticatedUser,
  getProStatus,
  getRedisConfig
} from "../lib/credits.js";


/* =========================================================
   HELPERS
========================================================= */

function clean(value) {

  return String(
    value ?? ""
  ).trim();

}


function send(
  res,
  status,
  data
) {

  return res
    .status(status)
    .json(data);

}


/* =========================================================
   BEARER TOKEN
========================================================= */

function getBearerToken(req) {

  const header =
    req.headers?.authorization ||
    req.headers?.Authorization ||
    "";

  if (
    typeof header !==
    "string"
  ) {

    return "";

  }

  const match =
    header.match(
      /^Bearer\s+(.+)$/i
    );

  return match
    ? match[1].trim()
    : "";

}


/* =========================================================
   REQUEST REFERENCE
========================================================= */

function getReference(
  req
) {

  const url =
    new URL(
      req.url,
      "http://localhost"
    );

  return clean(
    url.searchParams.get(
      "reference"
    ) ||
    url.searchParams.get(
      "trxref"
    ) ||
    url.searchParams.get(
      "ref"
    ) ||
    ""
  );

}


/* =========================================================
   PARSE BODY
========================================================= */

async function getBody(
  req
) {

  let body =
    req.body ||
    {};

  if (
    typeof body ===
    "string"
  ) {

    try {

      body =
        JSON.parse(
          body
        );

    } catch {

      body = {};

    }

  }

  if (
    !body ||
    typeof body !==
    "object"
  ) {

    body = {};

  }

  return body;

}


/* =========================================================
   CURRENT APP URL
========================================================= */

function getAppUrl(
  req
) {

  const configured =
    clean(
      process.env.OBITREND_APP_URL
    );

  if (
    configured
  ) {

    return configured
      .replace(
        /\/+$/,
        ""
      );

  }

  const forwardedHost =
    clean(
      req.headers?.[
        "x-forwarded-host"
      ]
    );

  const host =
    forwardedHost ||
    clean(
      req.headers?.host
    );

  const forwardedProto =
    clean(
      req.headers?.[
        "x-forwarded-proto"
      ]
    );

  const protocol =
    forwardedProto ||
    "https";

  if (
    host
  ) {

    return (
      `${protocol}://${host}`
    )
      .replace(
        /\/+$/,
        ""
      );

  }

  return (
    "https://obitrend.vercel.app"
  );

}


/* =========================================================
   FORWARD PAYMENT VERIFICATION
========================================================= */

async function forwardPaymentVerification(
  req,
  res,
  reference
) {

  if (
    !reference
  ) {

    return send(
      res,
      400,
      {
        ok: false,

        success: false,

        paid: false,

        error:
          "Payment reference is required."
      }
    );

  }


  const token =
    getBearerToken(
      req
    );

  if (
    !token
  ) {

    return send(
      res,
      401,
      {
        ok: false,

        success: false,

        paid: false,

        error:
          "Please sign in to continue."
      }
    );

  }


  const appUrl =
    getAppUrl(
      req
    );


  const verifyUrl =
    `${appUrl}/api/paystack?reference=${encodeURIComponent(
      reference
    )}`;


  try {

    const response =
      await fetch(
        verifyUrl,
        {
          method:
            "GET",

          headers: {

            Authorization:
              `Bearer ${token}`,

            Accept:
              "application/json"

          },

          cache:
            "no-store"

        }
      );


    let data =
      null;


    try {

      data =
        await response.json();

    } catch {

      data =
        null;

    }


    if (
      data &&
      typeof data ===
      "object"
    ) {

      return send(
        res,
        response.status,
        data
      );

    }


    return send(
      res,
      response.status,
      {
        ok:
          response.ok,

        success:
          false,

        paid:
          false,

        error:
          "Unable to verify the Paystack payment."
      }
    );

  } catch (
    error
  ) {

    console.error(
      "OBITREND Pro payment verification bridge error:",
      error
    );

    return send(
      res,
      502,
      {
        ok: false,

        success: false,

        paid: false,

        error:
          "Unable to verify the payment right now."
      }
    );

  }

}


/* =========================================================
   GET PRO STATUS
========================================================= */

async function handleStatus(
  req,
  res,
  authUser
) {

  const redis =
    getRedisConfig();


  if (
    !redis?.url ||
    !redis?.token
  ) {

    return send(
      res,
      500,
      {
        ok: false,

        success: false,

        error:
          "Credit service is temporarily unavailable."
      }
    );

  }


  const pro =
    await getProStatus(
      authUser.id,
      redis
    );


  const now =
    Math.floor(
      Date.now() / 1000
    );


  let secondsRemaining =
    null;


  if (
    pro.expiresAt !==
      null &&
    pro.expiresAt !==
      undefined
  ) {

    secondsRemaining =
      Math.max(
        0,
        Number(
          pro.expiresAt
        ) -
        now
      );

  }


  const active =
    pro.active === true;


  const isMonthly =
    active &&
    String(
      pro.plan ||
      ""
    )
      .trim()
      .toUpperCase() ===
      "PRO_MONTHLY";


  return send(
    res,
    200,
    {

      ok: true,

      success: true,

      proActive:
        active,

      active,

      expired:
        pro.expired === true,

      exhausted:
        pro.exhausted === true,

      plan:
        pro.plan ||
        null,

      planName:
        pro.planName ||
        null,

      tier:
        pro.tier ||
        (isMonthly
          ? "full"
          : active
            ? "standard"
            : null),

      proCredits:
        Number(
          pro.proCredits || 0
        ),

      proCreditsRemaining:
        Number(
          pro.proCreditsRemaining ||
          pro.proCredits ||
          0
        ),

      proCreditsTotal:
        Number(
          pro.proCreditsTotal ||
          0
        ),

      credits:
        Number(
          pro.proCreditsRemaining ||
          pro.proCredits ||
          0
        ),

      expiresAt:
        pro.expiresAt ||
        null,

      secondsRemaining,

      durationSeconds:
        pro.durationSeconds ||
        null

    }
  );

}


/* =========================================================
   MAIN HANDLER
========================================================= */

export default async function handler(
  req,
  res
) {

  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate"
  );


  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
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
    req.method !==
      "GET" &&
    req.method !==
      "POST"
  ) {

    res.setHeader(
      "Allow",
      "GET, POST, OPTIONS"
    );

    return send(
      res,
      405,
      {
        ok: false,

        success: false,

        error:
          "Method not allowed."
      }
    );

  }


  try {

    /*
    =====================================================
    AUTHENTICATE USER
    =====================================================
    */

    const auth =
      await getAuthenticatedUser(
        req
      );


    if (
      !auth.ok
    ) {

      return send(
        res,
        auth.status,
        {
          ok: false,

          success: false,

          error:
            auth.error
        }
      );

    }


    /*
    =====================================================
    POST
    =====================================================

    Older frontend payment verification calls:

      POST /api/pro

    are forwarded to:

      GET /api/paystack?reference=...

    This means the current package system remains
    the only payment/activation system.
    */

    if (
      req.method ===
      "POST"
    ) {

      const body =
        await getBody(
          req
        );


      const reference =
        clean(
          body?.reference ||
          body?.trxref ||
          body?.ref ||
          ""
        );


      return await forwardPaymentVerification(
        req,
        res,
        reference
      );

    }


    /*
    =====================================================
    GET
    =====================================================
    */

    const reference =
      getReference(
        req
      );


    /*
    If a payment reference exists, verify it through
    the current /api/paystack system.
    */

    if (
      reference
    ) {

      return await forwardPaymentVerification(
        req,
        res,
        reference
      );

    }


    /*
    Otherwise return the authenticated user's
    current Pro entitlement.
    */

    return await handleStatus(
      req,
      res,
      auth.user
    );

  } catch (
    error
  ) {

    console.error(
      "OBITREND Pro API error:",
      error
    );

    return send(
      res,
      500,
      {
        ok: false,

        success: false,

        error:
          "Unable to process the Pro request right now."
      }
    );

  }

}
