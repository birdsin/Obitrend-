// OBITREND AI FASHION CREATOR
// Server-side credits + Pro entitlement
// Authenticated by Supabase; entitlement stored in Redis.

const FREE_CREDITS = 3;
const CREDIT_PERIOD_SECONDS = 7 * 24 * 60 * 60;
const PRO_SECONDS = 7 * 24 * 60 * 60;

function send(res, status, data) {
  return res.status(status).json(data);
}

/* =========================================================
   REDIS
========================================================= */

export function getRedisConfig() {
  return {
    url: String(
      process.env.KV_REST_API_URL ||
      process.env.UPSTASH_REDIS_REST_URL ||
      ""
    ).trim(),

    token: String(
      process.env.KV_REST_API_TOKEN ||
      process.env.UPSTASH_REDIS_REST_TOKEN ||
      ""
    ).trim()
  };
}

async function redisCommand(url, token, command) {
  if (!url || !token) {
    throw new Error(
      "Redis environment variables are missing."
    );
  }

  const response = await fetch(
    `${url.replace(/\/$/, "")}/${command
      .map(encodeURIComponent)
      .join("/")}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok || !data || data.error) {
    throw new Error(
      data?.error ||
      `Redis request failed (${response.status}).`
    );
  }

  return data.result;
}

/* =========================================================
   SUPABASE AUTHENTICATION
========================================================= */

function cleanUserId(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 100);
}

function getSupabaseUrl() {
  return String(
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ""
  )
    .trim()
    .replace(/\/+$/, "");
}

function getSupabaseKey() {
  return String(
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ""
  ).trim();
}

function getBearerToken(req) {
  const header =
    req.headers?.authorization ||
    req.headers?.Authorization ||
    "";

  if (typeof header !== "string") {
    return "";
  }

  const match =
    header.match(/^Bearer\s+(.+)$/i);

  return match
    ? match[1].trim()
    : "";
}

/*
 * IMPORTANT:
 * This function is exported so /api/generate.js
 * can verify the exact same Supabase user.
 */
export async function getAuthenticatedUser(req) {
  const token =
    getBearerToken(req);

  if (!token) {
    return {
      ok: false,
      status: 401,
      error:
        "You must be logged in to use OBITREND."
    };
  }

  const supabaseUrl =
    getSupabaseUrl();

  const supabaseKey =
    getSupabaseKey();

  if (
    !supabaseUrl ||
    !supabaseKey
  ) {
    return {
      ok: false,
      status: 500,
      error:
        "Supabase authentication is not configured on the server."
    };
  }

  try {
    const response =
      await fetch(
        `${supabaseUrl}/auth/v1/user`,
        {
          method: "GET",

          headers: {
            apikey:
              supabaseKey,

            Authorization:
              `Bearer ${token}`,

            Accept:
              "application/json"
          }
        }
      );

    let data = null;

    try {
      data =
        await response.json();
    } catch {
      data = null;
    }

    const userId =
      cleanUserId(data?.id);

    const email =
      String(
        data?.email || ""
      )
        .trim()
        .toLowerCase();

    if (
      !response.ok ||
      !userId ||
      userId.length < 8 ||
      !email.includes("@")
    ) {
      return {
        ok: false,
        status: 401,
        error:
          "Your login session is invalid or expired. Please log in again."
      };
    }

    return {
      ok: true,

      user: {
        id: userId,
        email
      }
    };

  } catch (error) {

    console.error(
      "Supabase authentication request failed:",
      error
    );

    return {
      ok: false,
      status: 502,
      error:
        "Unable to verify your OBITREND login right now."
    };
  }
}

/* =========================================================
   REDIS KEYS
========================================================= */

function balanceKey(userId) {
  return `obitrend:credits:${userId}`;
}

function resetKey(userId) {
  return `obitrend:credits:reset:${userId}`;
}

function proKey(userId) {
  return `obitrend:pro:${userId}`;
}

function proExpiryKey(userId) {
  return `obitrend:pro:expiry:${userId}`;
}

function proEmailKey(userId) {
  return `obitrend:pro:email:${userId}`;
}

function proReferenceKey(userId) {
  return `obitrend:pro:reference:${userId}`;
}

/* =========================================================
   ACTIVATE PRO
========================================================= */

export async function activatePro(
  userId,
  email,
  reference,
  redis
) {
  const safeUserId =
    cleanUserId(userId);

  if (!safeUserId) {
    throw new Error(
      "Invalid user ID."
    );
  }

  const now =
    Math.floor(
      Date.now() / 1000
    );

  const expiresAt =
    now + PRO_SECONDS;

  await redisCommand(
    redis.url,
    redis.token,
    [
      "SET",
      proKey(safeUserId),
      "active",
      "EX",
      PRO_SECONDS
    ]
  );

  await redisCommand(
    redis.url,
    redis.token,
    [
      "SET",
      proExpiryKey(safeUserId),
      expiresAt,
      "EX",
      PRO_SECONDS
    ]
  );

  if (email) {
    await redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        proEmailKey(safeUserId),
        String(email)
          .trim()
          .toLowerCase(),
        "EX",
        PRO_SECONDS
      ]
    );
  }

  if (reference) {
    await redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        proReferenceKey(safeUserId),
        String(reference).trim(),
        "EX",
        PRO_SECONDS
      ]
    );
  }

  return {
    active: true,
    userId: safeUserId,
    expiresAt
  };
}

/* =========================================================
   PRO STATUS
========================================================= */

export async function getProStatus(
  userId,
  redis
) {
  const safeUserId =
    cleanUserId(userId);

  if (!safeUserId) {
    return {
      active: false,
      expiresAt: null
    };
  }

  if (
    !redis?.url ||
    !redis?.token
  ) {
    return {
      active: false,
      expiresAt: null
    };
  }

  try {
    /*
     * OBITREND has used both:
     *
     * "active"
     * "true"
     *
     * for the Pro status value.
     *
     * Accept both so existing paid users
     * are not broken.
     */

    const status =
      await redisCommand(
        redis.url,
        redis.token,
        [
          "GET",
          proKey(safeUserId)
        ]
      );

    /*
     * The Pro status key itself is created
     * with a 7-day Redis expiration.
     *
     * Therefore an active status key is
     * already time-limited even when the
     * separate expiry key does not exist.
     */

    const isActive =
      status === "active" ||
      status === "true";

    if (!isActive) {
      return {
        active: false,
        expiresAt: null
      };
    }

    /*
     * Try the separate expiry key first.
     */

    let expiresAt = null;

    try {
      const expiryValue =
        await redisCommand(
          redis.url,
          redis.token,
          [
            "GET",
            proExpiryKey(safeUserId)
          ]
        );

      if (
        expiryValue !== null &&
        Number.isFinite(
          Number(expiryValue)
        )
      ) {
        expiresAt =
          Number(expiryValue);
      }
    } catch {
      /*
       * The expiry key may not exist for
       * older Pro activations.
       *
       * That is okay because the main
       * Pro key has its own Redis TTL.
       */
    }

    const now =
      Math.floor(
        Date.now() / 1000
      );

    /*
     * If an expiry timestamp exists,
     * verify it.
     */

    if (
      expiresAt !== null &&
      expiresAt <= now
    ) {
      return {
        active: false,
        expiresAt: null
      };
    }

    /*
     * Pro is valid.
     *
     * If expiresAt is unavailable,
     * return null rather than incorrectly
     * rejecting an existing paid user.
     */

    return {
      active: true,
      expiresAt
    };

  } catch (error) {

    console.error(
      "OBITREND Pro status check failed:",
      error
    );

    return {
      active: false,
      expiresAt: null
    };
  }
}

/* =========================================================
   FREE CREDITS
========================================================= */

async function getOrCreateCredits(
  userId,
  redis
) {
  const safeUserId =
    cleanUserId(userId);

  const balance =
    balanceKey(safeUserId);

  const reset =
    resetKey(safeUserId);

  const [
    currentBalance,
    resetAtValue
  ] = await Promise.all([
    redisCommand(
      redis.url,
      redis.token,
      [
        "GET",
        balance
      ]
    ),

    redisCommand(
      redis.url,
      redis.token,
      [
        "GET",
        reset
      ]
    )
  ]);

  const now =
    Math.floor(
      Date.now() / 1000
    );

  const resetAt =
    resetAtValue === null
      ? 0
      : Number(resetAtValue);

  if (
    currentBalance === null ||
    !Number.isFinite(resetAt) ||
    resetAt <= now
  ) {

    const newResetAt =
      now +
      CREDIT_PERIOD_SECONDS;

    await redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        balance,
        FREE_CREDITS,
        "EX",
        CREDIT_PERIOD_SECONDS
      ]
    );

    await redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        reset,
        newResetAt,
        "EX",
        CREDIT_PERIOD_SECONDS
      ]
    );

    return {
      balance:
        FREE_CREDITS,

      total:
        FREE_CREDITS,

      resetAt:
        newResetAt
    };
  }

  return {
    balance:
      Math.max(
        0,
        Number(
          currentBalance || 0
        )
      ),

    total:
      FREE_CREDITS,

    resetAt
  };
}

/* =========================================================
   SPEND CREDIT
========================================================= */

export async function spendCredit(
  userId,
  redis
) {
  const safeUserId =
    cleanUserId(userId);

  if (!safeUserId) {
    return {
      success: false,
      balance: 0,
      reason:
        "invalid_user"
    };
  }

  const credits =
    await getOrCreateCredits(
      safeUserId,
      redis
    );

  if (
    credits.balance <= 0
  ) {
    return {
      success: false,
      balance: 0,
      reason:
        "no_free_credits",
      upgradeRequired:
        true,
      resetAt:
        credits.resetAt
    };
  }

  const newBalance =
    await redisCommand(
      redis.url,
      redis.token,
      [
        "DECR",
        balanceKey(
          safeUserId
        )
      ]
    );

  return {
    success: true,

    balance:
      Math.max(
        0,
        Number(newBalance)
      ),

    upgradeRequired:
      false,

    resetAt:
      credits.resetAt
  };
}

/* =========================================================
   REFUND CREDIT
========================================================= */

export async function refundCredit(
  userId,
  redis
) {
  const safeUserId =
    cleanUserId(userId);

  if (!safeUserId) {
    return {
      success: false,
      balance: 0
    };
  }

  const key =
    balanceKey(
      safeUserId
    );

  const current =
    await redisCommand(
      redis.url,
      redis.token,
      [
        "GET",
        key
      ]
    );

  if (current === null) {
    return {
      success: false,
      balance: 0
    };
  }

  const currentNumber =
    Number(current);

  if (
    currentNumber >=
    FREE_CREDITS
  ) {
    return {
      success: true,
      balance:
        FREE_CREDITS
    };
  }

  const newBalance =
    await redisCommand(
      redis.url,
      redis.token,
      [
        "INCR",
        key
      ]
    );

  return {
    success: true,

    balance:
      Math.min(
        FREE_CREDITS,
        Math.max(
          0,
          Number(newBalance)
        )
      )
  };
}

/* =========================================================
   GET /api/credits
========================================================= */

export default async function handler(
  req,
  res
) {

  if (
    req.method !== "GET"
  ) {

    res.setHeader(
      "Allow",
      "GET"
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
        error:
          "Redis environment variables are missing in Vercel."
      }
    );
  }

  try {

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

    const userId =
      auth.user.id;

    const credits =
      await getOrCreateCredits(
        userId,
        redis
      );

    const pro =
      await getProStatus(
        userId,
        redis
      );

    const now =
      Math.floor(
        Date.now() / 1000
      );

    const secondsRemaining =
      Math.max(
        0,
        Number(
          credits.resetAt || 0
        ) - now
      );

    return send(
      res,
      200,
      {
        success: true,

        credits:
          credits.balance,

        total:
          credits.total,

        freeTrial:
          true,

        freeTrialLimit:
          FREE_CREDITS,

        freeTrialRemaining:
          credits.balance,

        resetAt:
          credits.resetAt,

        secondsUntilReset:
          secondsRemaining,

        resetEvery:
          CREDIT_PERIOD_SECONDS,

        upgradeRequired:
          !pro.active &&
          credits.balance <= 0,

        proActive:
          pro.active,

        proExpiresAt:
          pro.expiresAt,

        message:
          pro.active
            ? "OBITREND Pro is active."
            : credits.balance > 0
              ? `You have ${credits.balance} free generation(s) remaining this week.`
              : "Your weekly free generations are finished. Upgrade to continue or wait for the next reset."
      }
    );

  } catch (error) {

    console.error(
      "OBITREND credits error:",
      error
    );

    return send(
      res,
      500,
      {
        success: false,
        error:
          "Unable to read OBITREND credits right now."
      }
    );
  }
}
