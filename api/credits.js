/**
 * OBITREND AI FASHION CREATOR
 * Server-side credits + Pro entitlement
 *
 * FREE:
 * 3 generations per 7-day period
 *
 * PRO:
 * Paid entitlement for 7 days
 *
 * Uses existing Upstash Redis variables.
 */

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
    throw new Error("Redis environment variables are missing.");
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

function cleanUserId(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 100);
}

/* =========================================================
   CREDIT KEYS
========================================================= */

function balanceKey(userId) {
  return `obitrend:credits:${userId}`;
}

function resetKey(userId) {
  return `obitrend:credits:reset:${userId}`;
}

/* =========================================================
   PRO KEYS
========================================================= */

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
   PRO ENTITLEMENT
========================================================= */

export async function activatePro(
  userId,
  email,
  reference,
  redis
) {
  const safeUserId = cleanUserId(userId);

  if (!safeUserId) {
    throw new Error("Invalid user ID.");
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + PRO_SECONDS;

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
        String(email).trim().toLowerCase(),
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

export async function getProStatus(userId, redis) {
  const safeUserId = cleanUserId(userId);

  if (!safeUserId) {
    return {
      active: false,
      expiresAt: null
    };
  }

  const [status, expiresAt] = await Promise.all([
    redisCommand(
      redis.url,
      redis.token,
      ["GET", proKey(safeUserId)]
    ),

    redisCommand(
      redis.url,
      redis.token,
      ["GET", proExpiryKey(safeUserId)]
    )
  ]);

  const expiry =
    expiresAt === null
      ? null
      : Number(expiresAt);

  const now =
    Math.floor(Date.now() / 1000);

  const active =
    status === "active" &&
    Number.isFinite(expiry) &&
    expiry > now;

  return {
    active,
    expiresAt: active ? expiry : null
  };
}

/* =========================================================
   WEEKLY FREE CREDITS
========================================================= */

async function getOrCreateCredits(userId, redis) {
  const safeUserId = cleanUserId(userId);

  const balance = balanceKey(safeUserId);
  const reset = resetKey(safeUserId);

  const [currentBalance, resetAtValue] =
    await Promise.all([
      redisCommand(
        redis.url,
        redis.token,
        ["GET", balance]
      ),

      redisCommand(
        redis.url,
        redis.token,
        ["GET", reset]
      )
    ]);

  const now =
    Math.floor(Date.now() / 1000);

  const resetAt =
    resetAtValue === null
      ? 0
      : Number(resetAtValue);

  /*
   * First visit OR weekly period expired.
   */
  if (
    currentBalance === null ||
    !Number.isFinite(resetAt) ||
    resetAt <= now
  ) {
    const newResetAt =
      now + CREDIT_PERIOD_SECONDS;

    /*
     * Set the new weekly allowance.
     */
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
      balance: FREE_CREDITS,
      total: FREE_CREDITS,
      resetAt: newResetAt
    };
  }

  return {
    balance: Math.max(
      0,
      Number(currentBalance || 0)
    ),

    total: FREE_CREDITS,

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
      reason: "invalid_user"
    };
  }

  /*
   * Make sure the weekly allowance exists.
   */
  const credits =
    await getOrCreateCredits(
      safeUserId,
      redis
    );

  if (credits.balance <= 0) {
    return {
      success: false,
      balance: 0,
      reason: "no_free_credits",
      upgradeRequired: true,
      resetAt: credits.resetAt
    };
  }

  const key =
    balanceKey(safeUserId);

  /*
   * Atomically decrease.
   */
  const newBalance =
    await redisCommand(
      redis.url,
      redis.token,
      ["DECR", key]
    );

  const numericBalance =
    Math.max(
      0,
      Number(newBalance)
    );

  return {
    success: true,
    balance: numericBalance,
    upgradeRequired: false,
    resetAt: credits.resetAt
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
    balanceKey(safeUserId);

  const current =
    await redisCommand(
      redis.url,
      redis.token,
      ["GET", key]
    );

  if (current === null) {
    return {
      success: false,
      balance: 0
    };
  }

  const currentNumber =
    Number(current);

  /*
   * Do not refund above the weekly limit.
   */
  if (currentNumber >= FREE_CREDITS) {
    return {
      success: true,
      balance: FREE_CREDITS
    };
  }

  const newBalance =
    await redisCommand(
      redis.url,
      redis.token,
      ["INCR", key]
    );

  const safeBalance =
    Math.min(
      FREE_CREDITS,
      Math.max(0, Number(newBalance))
    );

  return {
    success: true,
    balance: safeBalance
  };
}

/* =========================================================
   GET /api/credits
========================================================= */

export default async function handler(
  req,
  res
) {
  if (req.method !== "GET") {
    res.setHeader(
      "Allow",
      "GET"
    );

    return send(res, 405, {
      success: false,
      error: "Method not allowed."
    });
  }

  const redis =
    getRedisConfig();

  if (
    !redis.url ||
    !redis.token
  ) {
    return send(res, 500, {
      success: false,
      error:
        "Redis environment variables are missing in Vercel."
    });
  }

  const userId =
    cleanUserId(
      req.query?.userId
    );

  if (
    !userId ||
    userId.length < 8
  ) {
    return send(res, 400, {
      success: false,
      error:
        "A valid userId is required."
    });
  }

  try {
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
      Math.floor(Date.now() / 1000);

    const secondsRemaining =
      Math.max(
        0,
        Number(credits.resetAt || 0) - now
      );

    return send(res, 200, {
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
    });

  } catch (error) {
    console.error(
      "OBITREND credits error:",
      error
    );

    return send(res, 500, {
      success: false,
      error:
        "Unable to read OBITREND credits right now."
    });
  }
}
