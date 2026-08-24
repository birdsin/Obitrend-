/**
 * OBITREND AI FASHION CREATOR
 * Server-side credits + Pro entitlement
 *
 * FREE / TEST:
 * 3 generations total
 *
 * PRO:
 * Paid entitlement for 7 days
 *
 * Uses existing Upstash Redis variables.
 */

const FREE_CREDITS = 3;
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
  const response = await fetch(
    `${url}/${command.map(encodeURIComponent).join("/")}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  let data;

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
   FREE CREDIT KEYS
========================================================= */

function balanceKey(userId) {
  return `obitrend:credits:${userId}`;
}

function initializedKey(userId) {
  return `obitrend:credits:initialized:${userId}`;
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

/**
 * Save a verified Pro entitlement.
 *
 * IMPORTANT:
 * Only call this AFTER Paystack has independently
 * verified a successful payment.
 */
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

/**
 * Check whether Pro is currently active.
 */
export async function getProStatus(userId, redis) {
  const safeUserId = cleanUserId(userId);

  if (!safeUserId) {
    return {
      active: false,
      expiresAt: null
    };
  }

  const [status, expiresAt] =
    await Promise.all([
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
   FREE CREDITS
========================================================= */

/**
 * Create the free trial ONCE.
 *
 * There is intentionally NO weekly reset.
 *
 * A user gets 3 free generations total.
 */
async function getOrCreateCredits(userId, redis) {
  const key = balanceKey(userId);
  const initialized = initializedKey(userId);

  const alreadyInitialized =
    await redisCommand(
      redis.url,
      redis.token,
      ["GET", initialized]
    );

  if (alreadyInitialized !== null) {
    const current =
      await redisCommand(
        redis.url,
        redis.token,
        ["GET", key]
      );

    return {
      balance: Math.max(
        0,
        Number(current || 0)
      ),
      total: FREE_CREDITS
    };
  }

  /*
   * First visit:
   * give exactly 3 credits.
   */
  await redisCommand(
    redis.url,
    redis.token,
    [
      "SET",
      key,
      FREE_CREDITS
    ]
  );

  await redisCommand(
    redis.url,
    redis.token,
    [
      "SET",
      initialized,
      "1"
    ]
  );

  return {
    balance: FREE_CREDITS,
    total: FREE_CREDITS
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
   * Make sure the user has been initialized.
   *
   * This prevents a new user from getting
   * an artificial zero balance simply because
   * /api/credits was never called first.
   */
  await getOrCreateCredits(
    safeUserId,
    redis
  );

  const key =
    balanceKey(safeUserId);

  const current =
    await redisCommand(
      redis.url,
      redis.token,
      ["GET", key]
    );

  const balance =
    Number(current || 0);

  if (balance <= 0) {
    return {
      success: false,
      balance: 0,
      reason: "no_free_credits",
      upgradeRequired: true
    };
  }

  /*
   * Atomically decrease the balance.
   */
  const newBalance =
    await redisCommand(
      redis.url,
      redis.token,
      ["DECR", key]
    );

  return {
    success: true,
    balance: Number(newBalance),
    upgradeRequired: false
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

  /*
   * Never create free credits for a user who
   * never had a trial initialized.
   */
  if (current === null) {
    return {
      success: false,
      balance: 0
    };
  }

  const newBalance =
    await redisCommand(
      redis.url,
      redis.token,
      ["INCR", key]
    );

  /*
   * Never allow a refund to exceed the
   * original 3-credit free trial.
   */
  const safeBalance =
    Math.min(
      Number(newBalance),
      FREE_CREDITS
    );

  if (
    Number(newBalance) >
    FREE_CREDITS
  ) {
    await redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        key,
        FREE_CREDITS
      ]
    );
  }

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
      error:
        "Method not allowed."
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
            ? `You have ${credits.balance} free generation(s) remaining.`
            : "Free trial finished. Upgrade to continue."
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
