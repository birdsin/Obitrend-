/*
=========================================================
OBITREND ACCOUNT API
=========================================================

SECURITY RULES

- User identity comes ONLY from the verified Supabase token.
- Browser-supplied userId is NEVER trusted.
- Browser-supplied email is NEVER used to select an account.
- Browser-supplied credits are NEVER trusted.
- Every account response belongs to the authenticated user.
- Image credits and video seconds remain separate.
- Payment references are never exposed to the browser.
=========================================================
*/

import { createClient } from "@supabase/supabase-js";

import {
  getAuthenticatedUser,
  getProStatus,
  getRedisConfig
} from "../lib/credits.js";

import {
  getVideoStatus
} from "../video-credits.js";


const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;


/* =======================================================
   RESPONSE
======================================================= */

function send(res, status, data) {
  return res
    .status(status)
    .json(data);
}


/* =======================================================
   SUPABASE SERVER CLIENT
======================================================= */

function getSupabaseAdmin() {

  if (
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY
  ) {
    return null;
  }

  return createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
}


/* =======================================================
   REDIS COMMAND
======================================================= */

async function redisCommand(
  redis,
  command,
  args = []
) {

  if (!redis) {
    throw new Error(
      "Credit service unavailable."
    );
  }

  const url =
    redis.url ||
    redis.restUrl ||
    redis.endpoint;

  const token =
    redis.token ||
    redis.restToken ||
    redis.password;

  if (!url || !token) {
    throw new Error(
      "Credit service unavailable."
    );
  }

  const response =
    await fetch(
      url,
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${token}`,

          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          command,
          args
        })
      }
    );

  if (!response.ok) {
    throw new Error(
      "Credit service request failed."
    );
  }

  const data =
    await response.json();

  return data?.result;
}


/* =======================================================
   FREE IMAGE CREDIT STATUS
======================================================= */

async function getFreeCreditStatus(
  userId,
  redis
) {

  const balanceKey =
    `obitrend:credits:${userId}`;

  const resetKey =
    `obitrend:credits:reset:${userId}`;

  const [
    balanceValue,
    resetValue
  ] = await Promise.all([

    redisCommand(
      redis,
      "GET",
      [balanceKey]
    ),

    redisCommand(
      redis,
      "GET",
      [resetKey]
    )

  ]);

  const balance =
    Math.max(
      0,
      Math.floor(
        Number(balanceValue || 0)
      )
    );

  const resetAtNumber =
    Number(resetValue || 0);

  return {
    balance,

    total: 3,

    resetAt:
      Number.isFinite(
        resetAtNumber
      ) &&
      resetAtNumber > 0
        ? resetAtNumber
        : null
  };
}


/* =======================================================
   ACCOUNT DATA
======================================================= */

async function getAccountData(
  authUser
) {

  const userId =
    String(
      authUser.id
    ).trim();

  if (!userId) {
    throw new Error(
      "Authenticated user ID is unavailable."
    );
  }


  const supabase =
    getSupabaseAdmin();

  if (!supabase) {
    throw new Error(
      "Account service is temporarily unavailable."
    );
  }


  const redis =
    await getRedisConfig();


  if (
    !redis?.url ||
    !redis?.token
  ) {
    throw new Error(
      "Credit service is temporarily unavailable."
    );
  }


  /*
  -------------------------------------------------------
  PROFILE
  -------------------------------------------------------
  */

  const profileResult =
    await supabase
      .from("obitrend_profiles")
      .select(`
        user_id,
        obitrend_user_id,
        email,
        country,
        city,
        language,
        music_preference,
        fashion_influence,
        created_at,
        updated_at
      `)
      .eq(
        "user_id",
        userId
      )
      .maybeSingle();


  if (profileResult.error) {
    throw profileResult.error;
  }


  const profile =
    profileResult.data || {};


  /*
  -------------------------------------------------------
  FREE IMAGE CREDITS
  -------------------------------------------------------
  */

  const freeCredits =
    await getFreeCreditStatus(
      userId,
      redis
    );


  /*
  -------------------------------------------------------
  PRO STATUS
  -------------------------------------------------------
  */

  const pro =
    await getProStatus(
      userId,
      redis
    );


  /*
  -------------------------------------------------------
  VIDEO WALLET
  -------------------------------------------------------
  */

  const video =
    await getVideoStatus(
      userId,
      redis
    );


  /*
  -------------------------------------------------------
  CURRENT TIME
  -------------------------------------------------------
  */

  const now =
    Math.floor(
      Date.now() / 1000
    );


  let proSecondsRemaining =
    null;


  if (
    pro?.expiresAt !== null &&
    pro?.expiresAt !== undefined
  ) {

    proSecondsRemaining =
      Math.max(
        0,
        Number(
          pro.expiresAt
        ) - now
      );

  }


  /*
  -------------------------------------------------------
  RETURN SAFE ACCOUNT OBJECT
  -------------------------------------------------------

  NEVER return:

  - payment reference
  - Redis keys
  - service-role credentials
  - internal payment metadata
  */

  return {

    user: {

      id:
        userId,

      obitrendUserId:
        profile.obitrend_user_id ||
        `OBI-${userId
          .replace(/-/g, "")
          .slice(0, 8)
          .toUpperCase()}`,

      email:
        profile.email ||
        authUser.email ||
        "",

      country:
        profile.country ||
        "",

      city:
        profile.city ||
        "",

      language:
        profile.language ||
        "",

      musicPreference:
        profile.music_preference ||
        "",

      fashionInfluence:
        profile.fashion_influence ||
        "",

      createdAt:
        profile.created_at ||
        authUser.created_at ||
        null,

      updatedAt:
        profile.updated_at ||
        null

    },


    imageCredits: {

      free:
        freeCredits.balance,

      freeTotal:
        freeCredits.total,

      freeResetAt:
        freeCredits.resetAt,

      pro:
        Number(
          pro?.proCredits || 0
        ),

      proTotal:
        Number(
          pro?.proCreditsTotal || 0
        ),

      available:
        Number(
          freeCredits.balance || 0
        ) +
        Number(
          pro?.proCredits || 0
        )

    },


    pro: {

      active:
        pro?.active === true,

      plan:
        pro?.plan || null,

      planName:
        pro?.planName || null,

      tier:
        pro?.tier || null,

      credits:
        Number(
          pro?.proCredits || 0
        ),

      totalCredits:
        Number(
          pro?.proCreditsTotal || 0
        ),

      expiresAt:
        pro?.expiresAt || null,

      secondsRemaining:
        proSecondsRemaining,

      exhausted:
        pro?.exhausted === true

    },


    video: {

      seconds:
        Number(
          video?.seconds || 0
        ),

      totalPurchased:
        Number(
          video?.totalPurchased || 0
        ),

      active:
        video?.active === true

    }

  };
}


/* =======================================================
   MAIN HANDLER
======================================================= */

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
    "GET, OPTIONS"
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
    "GET"
  ) {

    res.setHeader(
      "Allow",
      "GET, OPTIONS"
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
    AUTHENTICATE
    =====================================================
    */

    const auth =
      await getAuthenticatedUser(
        req
      );


    if (
      !auth?.ok ||
      !auth?.user?.id
    ) {

      return send(
        res,
        auth?.status || 401,
        {
          ok: false,
          success: false,
          error:
            auth?.error ||
            "Please sign in to continue."
        }
      );

    }


    /*
    =====================================================
    LOAD ONLY THIS USER
    =====================================================
    */

    const account =
      await getAccountData(
        auth.user
      );


    return send(
      res,
      200,
      {
        ok: true,
        success: true,
        account
      }
    );


  } catch (error) {

    console.error(
      "OBITREND Account API error:",
      error
    );

    return send(
      res,
      500,
      {
        ok: false,
        success: false,
        error:
          "Unable to load your account right now."
      }
    );

  }

}
