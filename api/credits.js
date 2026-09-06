// =====================================================
// OBITREND AI FASHION CREATOR
// FRESH V2 FREE + PRO CREDIT SYSTEM
// Supabase authentication + Redis balances
// =====================================================

const FREE_CREDITS = 3;
const FREE_PERIOD_SECONDS = 7 * 24 * 60 * 60;

const PLAN_CONFIG = Object.freeze({
  PRO_4_DAY: {
    tier: "standard",
    credits: 5,
    seconds: 4 * 24 * 60 * 60
  },

  PRO_8_DAY: {
    tier: "standard",
    credits: 10,
    seconds: 8 * 24 * 60 * 60
  },

  PRO_14_DAY: {
    tier: "standard",
    credits: 15,
    seconds: 14 * 24 * 60 * 60
  },

  PRO_MONTHLY: {
    tier: "full",
    credits: 30,
    seconds: 30 * 24 * 60 * 60
  }
});

function send(res, status, data) {
  return res.status(status).json(data);
}

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
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
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

  const match = header.match(/^Bearer\s+(.+)$/i);

  return match ? match[1].trim() : "";
}

export async function getAuthenticatedUser(req) {
  const token = getBearerToken(req);

  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "You must be logged in to use OBITREND."
    };
  }

  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = getSupabaseKey();

  if (!supabaseUrl || !supabaseKey) {
    return {
      ok: false,
      status: 500,
      error: "Supabase authentication is not configured on the server."
    };
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/auth/v1/user`,
      {
        method: "GET",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${token}`,
          Accept: "application/json"
        }
      }
    );

    let data = null;

    try {
      data = await response.json();
    } catch {
      data = null;
    }

    const userId = cleanUserId(data?.id);
    const email = String(
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
  } catch {
    return {
      ok: false,
      status: 502,
      error:
        "Unable to verify your OBITREND login right now."
    };
  }
}

/*
=========================================================
FRESH V2 KEYS
=========================================================

The old Pro balance is deliberately NOT used.

The new system starts from zero for Pro and requires
a fresh successful Paystack payment.
*/

function balanceKey(userId) {
  return `obitrend:v2:credits:${userId}`;
}

function resetKey(userId) {
  return `obitrend:v2:credits:reset:${userId}`;
}

function proKey(userId) {
  return `obitrend:v2:pro:${userId}`;
}

function proExpiryKey(userId) {
  return `obitrend:v2:pro:expiry:${userId}`;
}

function proEmailKey(userId) {
  return `obitrend:v2:pro:email:${userId}`;
}

function proReferenceKey(userId) {
  return `obitrend:v2:pro:reference:${userId}`;
}

function proBalanceKey(userId) {
  return `obitrend:v2:pro:credits:${userId}`;
}

function proTotalKey(userId) {
  return `obitrend:v2:pro:total:${userId}`;
}

function proPlanKey(userId) {
  return `obitrend:v2:pro:plan:${userId}`;
}

function proTierKey(userId) {
  return `obitrend:v2:pro:tier:${userId}`;
}

export async function activatePro(
  userId,
  email,
  reference,
  redis,
  seconds,
  credits,
  plan
) {
  const safeUserId = cleanUserId(userId);
  const selected = PLAN_CONFIG[plan];

  if (
    !safeUserId ||
    !selected ||
    !redis?.url ||
    !redis?.token
  ) {
    throw new Error(
      "Unable to activate the selected OBITREND Pro package."
    );
  }

  const duration = selected.seconds;
  const allowance = selected.credits;

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + duration;

  await Promise.all([
    redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        proKey(safeUserId),
        "active",
        "EX",
        duration
      ]
    ),

    redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        proExpiryKey(safeUserId),
        expiresAt,
        "EX",
        duration
      ]
    ),

    redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        proBalanceKey(safeUserId),
        allowance,
        "EX",
        duration
      ]
    ),

    redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        proTotalKey(safeUserId),
        allowance,
        "EX",
        duration
      ]
    ),

    redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        proPlanKey(safeUserId),
        plan,
        "EX",
        duration
      ]
    ),

    redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        proTierKey(safeUserId),
        selected.tier,
        "EX",
        duration
      ]
    ),

    redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        proEmailKey(safeUserId),
        String(email || "")
          .trim()
          .toLowerCase(),
        "EX",
        duration
      ]
    ),

    redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        proReferenceKey(safeUserId),
        String(reference || "").trim(),
        "EX",
        duration
      ]
    )
  ]);

  return {
    active: true,
    expiresAt,
    proCredits: allowance,
    proCreditsTotal: allowance,
    plan,
    planTier: selected.tier
  };
}

export async function getProStatus(userId, redis) {
  const safeUserId = cleanUserId(userId);

  if (
    !safeUserId ||
    !redis?.url ||
    !redis?.token
  ) {
    return {
      active: false,
      expiresAt: null,
      proCredits: 0
    };
  }

  try {
    const status = await redisCommand(
      redis.url,
      redis.token,
      [
        "GET",
        proKey(safeUserId)
      ]
    );

    if (
      status !== "active" &&
      status !== "true"
    ) {
      return {
        active: false,
        expiresAt: null,
        proCredits: 0
      };
    }

    const expiryRaw = await redisCommand(
      redis.url,
      redis.token,
      [
        "GET",
        proExpiryKey(safeUserId)
      ]
    );

    const expiresAt = Number(expiryRaw);
    const now = Math.floor(Date.now() / 1000);

    if (
      !Number.isFinite(expiresAt) ||
      expiresAt <= now
    ) {
      await deactivatePro(
        safeUserId,
        redis
      );

      return {
        active: false,
        expiresAt: null,
        proCredits: 0
      };
    }

    const plan = String(
      await redisCommand(
        redis.url,
        redis.token,
        [
          "GET",
          proPlanKey(safeUserId)
        ]
      ) || "PRO_8_DAY"
    );

    const tier = String(
      await redisCommand(
        redis.url,
        redis.token,
        [
          "GET",
          proTierKey(safeUserId)
        ]
      ) || "standard"
    );

    const total = Math.max(
      0,
      Number(
        await redisCommand(
          redis.url,
          redis.token,
          [
            "GET",
            proTotalKey(safeUserId)
          ]
        ) || 0
      )
    );

    const credits = Math.max(
      0,
      Number(
        await redisCommand(
          redis.url,
          redis.token,
          [
            "GET",
            proBalanceKey(safeUserId)
          ]
        ) || 0
      )
    );

    if (credits <= 0) {
      await deactivatePro(
        safeUserId,
        redis
      );

      return {
        active: false,
        expiresAt: null,
        proCredits: 0,
        proFinished: true,
        plan,
        planTier: tier,
        proCreditsTotal: total
      };
    }

    return {
      active: true,
      expiresAt,
      proCredits: credits,
      proCreditsTotal: total,
      plan,
      planTier: tier
    };
  } catch {
    return {
      active: false,
      expiresAt: null,
      proCredits: 0
    };
  }
}

export async function deactivatePro(
  userId,
  redis
) {
  const safeUserId = cleanUserId(userId);

  if (
    !safeUserId ||
    !redis?.url ||
    !redis?.token
  ) {
    return;
  }

  await Promise.all([
    redisCommand(
      redis.url,
      redis.token,
      ["DEL", proKey(safeUserId)]
    ),

    redisCommand(
      redis.url,
      redis.token,
      ["DEL", proExpiryKey(safeUserId)]
    ),

    redisCommand(
      redis.url,
      redis.token,
      ["DEL", proBalanceKey(safeUserId)]
    ),

    redisCommand(
      redis.url,
      redis.token,
      ["DEL", proTotalKey(safeUserId)]
    ),

    redisCommand(
      redis.url,
      redis.token,
      ["DEL", proPlanKey(safeUserId)]
    ),

    redisCommand(
      redis.url,
      redis.token,
      ["DEL", proTierKey(safeUserId)]
    ),

    redisCommand(
      redis.url,
      redis.token,
      ["DEL", proEmailKey(safeUserId)]
    ),

    redisCommand(
      redis.url,
      redis.token,
      ["DEL", proReferenceKey(safeUserId)]
    )
  ]);
}

async function getOrCreateFreeCredits(
  userId,
  redis
) {
  const safeUserId = cleanUserId(userId);

  const balance = balanceKey(
    safeUserId
  );

  const reset = resetKey(
    safeUserId
  );

  const [
    currentBalance,
    resetAtValue
  ] = await Promise.all([
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

  const now = Math.floor(
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
      now + FREE_PERIOD_SECONDS;

    await Promise.all([
      redisCommand(
        redis.url,
        redis.token,
        [
          "SET",
          balance,
          FREE_CREDITS,
          "EX",
          FREE_PERIOD_SECONDS
        ]
      ),

      redisCommand(
        redis.url,
        redis.token,
        [
          "SET",
          reset,
          newResetAt,
          "EX",
          FREE_PERIOD_SECONDS
        ]
      )
    ]);

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

export async function spendCredit(
  userId,
  redis
) {
  const safeUserId =
    cleanUserId(userId);

  if (
    !safeUserId ||
    !redis?.url ||
    !redis?.token
  ) {
    return {
      success: false,
      balance: 0,
      reason: "invalid_user"
    };
  }

  const pro =
    await getProStatus(
      safeUserId,
      redis
    );

  if (pro.active) {
    if (pro.proCredits <= 0) {
      return {
        success: false,
        balance: 0,
        reason: "no_pro_credits",
        upgradeRequired: true,
        proActive: false,
        proCredits: 0
      };
    }

    const result = Number(
      await redisCommand(
        redis.url,
        redis.token,
        [
          "DECR",
          proBalanceKey(
            safeUserId
          )
        ]
      )
    );

    if (result < 0) {
      await redisCommand(
        redis.url,
        redis.token,
        [
          "INCR",
          proBalanceKey(
            safeUserId
          )
        ]
      );

      return {
        success: false,
        balance: 0,
        reason: "no_pro_credits",
        upgradeRequired: true,
        proActive: false,
        proCredits: 0
      };
    }

    if (result === 0) {
      await deactivatePro(
        safeUserId,
        redis
      );
    }

    return {
      success: true,
      balance: result,
      proCredits: result,
      proActive: result > 0,
      usedCredit: true,
      creditType: "pro",
      expiresAt: pro.expiresAt,
      plan: pro.plan,
      planTier: pro.planTier
    };
  }

  const free =
    await getOrCreateFreeCredits(
      safeUserId,
      redis
    );

  if (free.balance <= 0) {
    return {
      success: false,
      balance: 0,
      reason: "no_free_credits",
      upgradeRequired: true,
      proActive: false,
      resetAt: free.resetAt
    };
  }

  const result = Number(
    await redisCommand(
      redis.url,
      redis.token,
      [
        "DECR",
        balanceKey(safeUserId)
      ]
    )
  );

  if (result < 0) {
    await redisCommand(
      redis.url,
      redis.token,
      [
        "INCR",
        balanceKey(safeUserId)
      ]
    );

    return {
      success: false,
      balance: 0,
      reason: "no_free_credits",
      upgradeRequired: true,
      proActive: false,
      resetAt: free.resetAt
    };
  }

  return {
    success: true,
    balance: result,
    proCredits: null,
    proActive: false,
    usedCredit: true,
    creditType: "free",
    resetAt: free.resetAt
  };
}

export async function refundCredit(
  userId,
  redis
) {
  const safeUserId =
    cleanUserId(userId);

  if (
    !safeUserId ||
    !redis?.url ||
    !redis?.token
  ) {
    return {
      success: false,
      balance: 0
    };
  }

  const pro =
    await getProStatus(
      safeUserId,
      redis
    );

  if (pro.active) {
    const current = Number(
      await redisCommand(
        redis.url,
        redis.token,
        [
          "GET",
          proBalanceKey(
            safeUserId
          )
        ]
      )
    );

    const total = Number(
      await redisCommand(
        redis.url,
        redis.token,
        [
          "GET",
          proTotalKey(
            safeUserId
          )
        ]
      )
    );

    if (
      !Number.isFinite(current) ||
      !Number.isFinite(total)
    ) {
      return {
        success: false,
        balance: 0
      };
    }

    const newBalance =
      Math.min(
        total,
        Math.max(
          0,
          Number(
            await redisCommand(
              redis.url,
              redis.token,
              [
                "INCR",
                proBalanceKey(
                  safeUserId
                )
              ]
            )
          )
        )
      );

    return {
      success: true,
      balance: newBalance,
      proCredits: newBalance,
      creditType: "pro"
    };
  }

  const current =
    await redisCommand(
      redis.url,
      redis.token,
      [
        "GET",
        balanceKey(
          safeUserId
        )
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
      balance: FREE_CREDITS,
      creditType: "free"
    };
  }

  const newBalance =
    await redisCommand(
      redis.url,
      redis.token,
      [
        "INCR",
        balanceKey(
          safeUserId
        )
      ]
    );

  return {
    success: true,
    balance: Math.min(
      FREE_CREDITS,
      Math.max(
        0,
        Number(newBalance)
      )
    ),
    creditType: "free"
  };
}

export function getPlanConfig(
  plan
) {
  return PLAN_CONFIG[plan] || null;
}

export default async function handler(
  req,
  res
) {
  if (req.method !== "GET") {
    res.setHeader(
      "Allow",
      "GET"
    );

    return send(
      res,
      405,
      {
        success: false,
        error: "Method not allowed."
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
          error: auth.error
        }
      );
    }

    const userId =
      auth.user.id;

    const pro =
      await getProStatus(
        userId,
        redis
      );

    const now =
      Math.floor(
        Date.now() / 1000
      );

    if (pro.active) {
      const seconds =
        Math.max(
          0,
          Number(pro.expiresAt) -
          now
        );

      return send(
        res,
        200,
        {
          success: true,
          proActive: true,
          proExpiresAt:
            pro.expiresAt,
          proSecondsRemaining:
            seconds,
          proCredits:
            pro.proCredits,
          proCreditsTotal:
            pro.proCreditsTotal,
          credits:
            pro.proCredits,
          total:
            pro.proCreditsTotal,
          plan:
            pro.plan,
          planTier:
            pro.planTier,
          tier:
            pro.planTier,
          freeTrial: false,
          freeTrialRemaining: 0,
          upgradeRequired: false,
          creditType: "pro",
          message:
            "OBITREND Pro is active."
        }
      );
    }

    const free =
      await getOrCreateFreeCredits(
        userId,
        redis
      );

    const secondsUntilReset =
      Math.max(
        0,
        Number(
          free.resetAt || 0
        ) - now
      );

    return send(
      res,
      200,
      {
        success: true,
        proActive: false,
        proExpiresAt: null,
        proSecondsRemaining:
          null,
        proCredits: 0,
        proCreditsTotal: 0,
        credits:
          free.balance,
        total:
          free.total,
        plan: null,
        planTier: "free",
        tier: "free",
        freeTrial: true,
        freeTrialLimit:
          FREE_CREDITS,
        freeTrialRemaining:
          free.balance,
        resetAt:
          free.resetAt,
        secondsUntilReset,
        resetEvery:
          FREE_PERIOD_SECONDS,
        upgradeRequired:
          free.balance <= 0,
        creditType: "free",
        message:
          free.balance > 0
            ? `You have ${free.balance} free generation(s) remaining this week.`
            : "Your free credits are finished. Choose an OBITREND Pro package to continue."
      }
    );
  } catch {
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
