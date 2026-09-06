// =====================================================
// OBITREND AI FASHION CREATOR
// SECURE SERVER-SIDE CREDIT SYSTEM
//
// PAID PLANS
// ₦10,000  = 4 days  = 5 credits
// ₦20,000  = 8 days  = 10 credits
// ₦30,000  = 14 days = 15 credits
// ₦60,000  = 30 days = 30 credits
//
// FREE USERS
// 3 free credits / 7 days
//
// SECURITY
// - User identity comes from verified Supabase token.
// - Browser-supplied userId is never trusted.
// - Paid credits never fall back to free credits.
// - Credit spending is atomic.
// - Credit refunds can specify the exact credit type.
// - Paid accounts lock immediately when exhausted.
// - Paid expiry is enforced server-side.
// =====================================================

const FREE_CREDITS = 3;
const FREE_PERIOD_SECONDS = 7 * 24 * 60 * 60;

// =====================================================
// PLAN CONFIGURATION
// =====================================================

const PLAN_CONFIG = Object.freeze({
  PRO_4_DAY: {
    tier: "standard",
    credits: 5,
    seconds: 4 * 24 * 60 * 60,
    amount: 1000000,
    name: "OBITREND 4 Day Pro"
  },

  PRO_8_DAY: {
    tier: "standard",
    credits: 10,
    seconds: 8 * 24 * 60 * 60,
    amount: 2000000,
    name: "OBITREND 8 Day Pro"
  },

  PRO_14_DAY: {
    tier: "standard",
    credits: 15,
    seconds: 14 * 24 * 60 * 60,
    amount: 3000000,
    name: "OBITREND 14 Day Pro"
  },

  PRO_MONTHLY: {
    tier: "full",
    credits: 30,
    seconds: 30 * 24 * 60 * 60,
    amount: 6000000,
    name: "OBITREND Monthly Pro"
  }
});

// =====================================================
// HELPERS
// =====================================================

function send(res, status, data) {
  return res.status(status).json(data);
}

function cleanUserId(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 100);
}

function clean(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

// =====================================================
// PLAN HELPERS
// =====================================================

export function getPlanConfig(plan) {
  return PLAN_CONFIG[upper(plan)] || null;
}

export function getAllPlanConfigs() {
  return PLAN_CONFIG;
}

// =====================================================
// REDIS CONFIG
// =====================================================

export function getRedisConfig() {
  return {
    url: String(
      process.env.KV_REST_API_URL ||
      process.env.UPSTASH_REDIS_REST_URL ||
      ""
    )
      .trim()
      .replace(/\/+$/, ""),

    token: String(
      process.env.KV_REST_API_TOKEN ||
      process.env.UPSTASH_REDIS_REST_TOKEN ||
      ""
    ).trim()
  };
}

// =====================================================
// REDIS COMMAND
// =====================================================

async function redisCommand(url, token, command) {
  if (!url || !token) {
    throw new Error("Redis configuration unavailable.");
  }

  const response = await fetch(
    `${url}/${command.map(encodeURIComponent).join("/")}`,
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

  if (
    !response.ok ||
    !data ||
    data.error
  ) {
    throw new Error(
      data?.error || "Redis request failed."
    );
  }

  return data.result;
}

// =====================================================
// REDIS LUA / ATOMIC COMMAND
// =====================================================

async function redisEval(
  url,
  token,
  script,
  keys = [],
  args = []
) {
  return redisCommand(
    url,
    token,
    [
      "EVAL",
      script,
      String(keys.length),
      ...keys,
      ...args
    ]
  );
}

// =====================================================
// SUPABASE AUTH
// =====================================================

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

  const match =
    header.match(/^Bearer\s+(.+)$/i);

  return match
    ? match[1].trim()
    : "";
}

// =====================================================
// VERIFIED AUTHENTICATED USER
// =====================================================

export async function getAuthenticatedUser(req) {
  const token = getBearerToken(req);

  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "Please sign in to continue."
    };
  }

  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = getSupabaseKey();

  if (!supabaseUrl || !supabaseKey) {
    return {
      ok: false,
      status: 500,
      error:
        "Authentication is temporarily unavailable."
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

    const email =
      String(data?.email || "")
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
          "Your login session has expired. Please log in again."
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
      "OBITREND authentication failure:",
      error
    );

    return {
      ok: false,
      status: 502,
      error:
        "Unable to verify your login right now."
    };
  }
}

// =====================================================
// REDIS KEYS
// =====================================================

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

function proBalanceKey(userId) {
  return `obitrend:pro:credits:${userId}`;
}

function proCreditsExpiryKey(userId) {
  return `obitrend:pro:credits:expiry:${userId}`;
}

function proPlanKey(userId) {
  return `obitrend:pro:plan:${userId}`;
}

function proTotalKey(userId) {
  return `obitrend:pro:credits:total:${userId}`;
}

function proExhaustedKey(userId) {
  return `obitrend:pro:exhausted:${userId}`;
}

// =====================================================
// FREE CREDIT ACCOUNT
// =====================================================

async function getOrCreateFreeCredits(userId, redis) {
  const safeUserId = cleanUserId(userId);

  if (!safeUserId) {
    throw new Error("Invalid user.");
  }

  const balance = balanceKey(safeUserId);
  const reset = resetKey(safeUserId);

  const now = Math.floor(Date.now() / 1000);

  /*
   * Atomic free-account initialization.
   *
   * If the account doesn't exist, create both keys.
   * If another request creates it first, preserve it.
   */
  const script = `
    local balance = redis.call("GET", KEYS[1])
    local reset = redis.call("GET", KEYS[2])
    local now = tonumber(ARGV[1])
    local credits = tonumber(ARGV[2])
    local ttl = tonumber(ARGV[3])

    if not balance or not reset or tonumber(reset) <= now then
      local newReset = now + ttl

      redis.call("SET", KEYS[1], credits, "EX", ttl)
      redis.call("SET", KEYS[2], newReset, "EX", ttl)

      return {credits, newReset}
    end

    return {
      math.max(0, tonumber(balance) or 0),
      tonumber(reset)
    }
  `;

  const result = await redisEval(
    redis.url,
    redis.token,
    script,
    [balance, reset],
    [
      String(now),
      String(FREE_CREDITS),
      String(FREE_PERIOD_SECONDS)
    ]
  );

  return {
    balance: Math.max(
      0,
      Math.floor(
        safeNumber(result?.[0], 0)
      )
    ),

    total: FREE_CREDITS,

    resetAt: Math.floor(
      safeNumber(result?.[1], now + FREE_PERIOD_SECONDS)
    )
  };
}

// =====================================================
// ACTIVATE PAID PLAN
// =====================================================

export async function activatePro(
  userId,
  email,
  reference,
  redis,
  plan = "PRO_MONTHLY"
) {
  const safeUserId = cleanUserId(userId);

  if (!safeUserId) {
    throw new Error("Invalid user.");
  }

  if (!redis?.url || !redis?.token) {
    throw new Error("Credit service unavailable.");
  }

  const selectedPlan = upper(plan);

  const packageInfo =
    getPlanConfig(selectedPlan);

  if (!packageInfo) {
    throw new Error("Invalid OBITREND package.");
  }

  const now =
    Math.floor(Date.now() / 1000);

  const expiresAt =
    now + packageInfo.seconds;

  const ttl =
    packageInfo.seconds;

  /*
   * Activate the complete package in one Redis
   * transaction.
   */
  const script = `
    redis.call(
      "SET",
      KEYS[1],
      "active",
      "EX",
      ARGV[1]
    )

    redis.call(
      "SET",
      KEYS[2],
      ARGV[2],
      "EX",
      ARGV[1]
    )

    redis.call(
      "SET",
      KEYS[3],
      ARGV[3],
      "EX",
      ARGV[1]
    )

    redis.call(
      "SET",
      KEYS[4],
      ARGV[2],
      "EX",
      ARGV[1]
    )

    redis.call(
      "SET",
      KEYS[5],
      ARGV[4],
      "EX",
      ARGV[1]
    )

    redis.call(
      "SET",
      KEYS[6],
      ARGV[3],
      "EX",
      ARGV[1]
    )

    if ARGV[5] ~= "" then
      redis.call(
        "SET",
        KEYS[7],
        ARGV[5],
        "EX",
        ARGV[1]
      )
    end

    if ARGV[6] ~= "" then
      redis.call(
        "SET",
        KEYS[8],
        ARGV[6],
        "EX",
        ARGV[1]
      )
    end

    redis.call(
      "DEL",
      KEYS[9]
    )

    return 1
  `;

  await redisEval(
    redis.url,
    redis.token,
    script,
    [
      proKey(safeUserId),
      proExpiryKey(safeUserId),
      proBalanceKey(safeUserId),
      proCreditsExpiryKey(safeUserId),
      proPlanKey(safeUserId),
      proTotalKey(safeUserId),
      proEmailKey(safeUserId),
      proReferenceKey(safeUserId),
      proExhaustedKey(safeUserId)
    ],
    [
      String(ttl),
      String(expiresAt),
      String(packageInfo.credits),
      selectedPlan,
      email
        ? String(email).trim().toLowerCase()
        : "",
      reference
        ? String(reference).trim()
        : ""
    ]
  );

  return {
    active: true,

    userId: safeUserId,

    plan: selectedPlan,

    planName: packageInfo.name,

    expiresAt,

    proCredits: packageInfo.credits,

    proCreditsRemaining: packageInfo.credits,

    proCreditsTotal: packageInfo.credits,

    durationSeconds: packageInfo.seconds
  };
}

// =====================================================
// GET PAID STATUS
// =====================================================

export async function getProStatus(
  userId,
  redis
) {
  const safeUserId = cleanUserId(userId);

  if (
    !safeUserId ||
    !redis?.url ||
    !redis?.token
  ) {
    return {
      active: false,
      expired: false,
      exhausted: false,
      expiresAt: null,
      proCredits: 0,
      proCreditsTotal: 0,
      plan: null
    };
  }

  try {
    const now =
      Math.floor(Date.now() / 1000);

    const [
      status,
      expiresValue,
      creditsValue,
      exhaustedValue,
      planValue,
      totalValue
    ] = await Promise.all([
      redisCommand(
        redis.url,
        redis.token,
        ["GET", proKey(safeUserId)]
      ),

      redisCommand(
        redis.url,
        redis.token,
        ["GET", proExpiryKey(safeUserId)]
      ),

      redisCommand(
        redis.url,
        redis.token,
        ["GET", proBalanceKey(safeUserId)]
      ),

      redisCommand(
        redis.url,
        redis.token,
        ["GET", proExhaustedKey(safeUserId)]
      ),

      redisCommand(
        redis.url,
        redis.token,
        ["GET", proPlanKey(safeUserId)]
      ),

      redisCommand(
        redis.url,
        redis.token,
        ["GET", proTotalKey(safeUserId)]
      )
    ]);

    const expiresAt =
      Number.isFinite(Number(expiresValue)) &&
      Number(expiresValue) > 0
        ? Number(expiresValue)
        : null;

    const storedCredits =
      Math.max(
        0,
        Math.floor(
          safeNumber(creditsValue, 0)
        )
      );

    const exhausted =
      String(exhaustedValue || "") === "1";

    const active =
      (status === "active" ||
        status === "true") &&
      (!expiresAt || expiresAt > now);

    let plan =
      clean(planValue) || null;

    let total =
      Math.floor(
        safeNumber(totalValue, 0)
      );

    const packageInfo =
      plan
        ? getPlanConfig(plan)
        : null;

    if (
      total <= 0 &&
      packageInfo
    ) {
      total = packageInfo.credits;
    }

    if (total <= 0) {
      total = storedCredits;
    }

    // ---------------------------------------------------
    // EXPIRED
    // ---------------------------------------------------

    if (
      expiresAt !== null &&
      expiresAt <= now
    ) {
      await deactivatePro(
        safeUserId,
        redis,
        false
      );

      return {
        active: false,
        expired: true,
        exhausted: false,
        expiresAt: null,
        proCredits: 0,
        proCreditsTotal: 0,
        plan: null
      };
    }

    // ---------------------------------------------------
    // EXHAUSTED
    // ---------------------------------------------------

    if (
      exhausted ||
      (active && storedCredits <= 0)
    ) {
      if (active && storedCredits <= 0) {
        await lockExhaustedPro(
          safeUserId,
          redis,
          expiresAt
        );
      }

      return {
        active: false,
        expired: false,
        exhausted: true,
        expiresAt,
        proCredits: 0,
        proCreditsTotal: total,
        plan
      };
    }

    // ---------------------------------------------------
    // NO ACTIVE PAID PLAN
    // ---------------------------------------------------

    if (!active) {
      return {
        active: false,
        expired: false,
        exhausted: false,
        expiresAt: null,
        proCredits: 0,
        proCreditsTotal: 0,
        plan: null
      };
    }

    return {
      active: true,
      expired: false,
      exhausted: false,

      expiresAt,

      proCredits: storedCredits,

      proCreditsTotal: total,

      plan
    };
  } catch (error) {
    console.error(
      "OBITREND Pro status check failed:",
      error
    );

    return {
      active: false,
      expired: false,
      exhausted: false,
      expiresAt: null,
      proCredits: 0,
      proCreditsTotal: 0,
      plan: null
    };
  }
}

// =====================================================
// LOCK EXHAUSTED PAID ACCOUNT
// =====================================================

async function lockExhaustedPro(
  userId,
  redis,
  expiresAt = null
) {
  const safeUserId = cleanUserId(userId);

  if (
    !safeUserId ||
    !redis?.url ||
    !redis?.token
  ) {
    return;
  }

  const now =
    Math.floor(Date.now() / 1000);

  const ttl =
    expiresAt
      ? Math.max(
          1,
          Number(expiresAt) - now
        )
      : 31536000;

  await redisEval(
    redis.url,
    redis.token,
    `
      redis.call("DEL", KEYS[1])
      redis.call("SET", KEYS[2], "1", "EX", ARGV[1])
      return 1
    `,
    [
      proKey(safeUserId),
      proExhaustedKey(safeUserId)
    ],
    [String(ttl)]
  );
}

// =====================================================
// DEACTIVATE PAID PLAN
// =====================================================

export async function deactivatePro(
  userId,
  redis,
  keepExhausted = false
) {
  const safeUserId = cleanUserId(userId);

  if (
    !safeUserId ||
    !redis?.url ||
    !redis?.token
  ) {
    return;
  }

  if (keepExhausted) {
    await lockExhaustedPro(
      safeUserId,
      redis
    );

    return;
  }

  await redisCommand(
    redis.url,
    redis.token,
    [
      "DEL",
      proKey(safeUserId),
      proExpiryKey(safeUserId),
      proBalanceKey(safeUserId),
      proCreditsExpiryKey(safeUserId),
      proEmailKey(safeUserId),
      proReferenceKey(safeUserId),
      proPlanKey(safeUserId),
      proTotalKey(safeUserId),
      proExhaustedKey(safeUserId)
    ]
  );
}

// =====================================================
// ATOMIC CREDIT SPENDING
// =====================================================
//
// IMPORTANT:
//
// This operation decides between paid and free credits
// INSIDE ONE Redis Lua operation.
//
// Therefore:
//
// Paid available
//     ↓
// Paid credit is spent
//
// Paid exhausted
//     ↓
// Request is LOCKED
//     ↓
// FREE CREDIT IS NOT USED
//
// No race condition between GET and DECR.
// =====================================================

export async function spendCredit(
  userId,
  redis
) {
  const safeUserId = cleanUserId(userId);

  if (
    !safeUserId ||
    !redis?.url ||
    !redis?.token
  ) {
    return {
      success: false,
      balance: 0,
      reason: "credit_service_unavailable"
    };
  }

  const now =
    Math.floor(Date.now() / 1000);

  const script = `
    local now = tonumber(ARGV[1])
    local freeCredits = tonumber(ARGV[2])
    local freeTTL = tonumber(ARGV[3])

    -------------------------------------------------------
    -- PAID ACCOUNT
    -------------------------------------------------------

    local proStatus =
      redis.call("GET", KEYS[1])

    local proExpiry =
      redis.call("GET", KEYS[2])

    local proBalance =
      redis.call("GET", KEYS[3])

    local exhausted =
      redis.call("GET", KEYS[4])

    if exhausted == "1" then
      return {
        0,
        "locked",
        "no_pro_credits"
      }
    end

    if proStatus == "active" then

      local expiry =
        tonumber(proExpiry or "0")

      if expiry > 0 and expiry <= now then

        redis.call("DEL", KEYS[1])

        return {
          0,
          "expired",
          "expired"
        }
      end

      local balance =
        tonumber(proBalance or "0")

      if balance <= 0 then

        redis.call("DEL", KEYS[1])
        redis.call(
          "SET",
          KEYS[4],
          "1",
          "EX",
          math.max(
            1,
            expiry - now
          )
        )

        return {
          0,
          "locked",
          "no_pro_credits"
        }
      end

      local newBalance =
        redis.call(
          "DECR",
          KEYS[3]
        )

      if newBalance < 0 then

        redis.call(
          "SET",
          KEYS[3],
          "0"
        )

        redis.call("DEL", KEYS[1])

        redis.call(
          "SET",
          KEYS[4],
          "1",
          "EX",
          math.max(
            1,
            expiry - now
          )
        )

        return {
          0,
          "locked",
          "no_pro_credits"
        }
      end

      if newBalance == 0 then

        redis.call(
          "DEL",
          KEYS[1]
        )

        redis.call(
          "SET",
          KEYS[4],
          "1",
          "EX",
          math.max(
            1,
            expiry - now
          )
        )

        return {
          1,
          "pro",
          "last",
          expiry
        }
      end

      return {
        1,
        "pro",
        newBalance,
        expiry
      }
    end

    -------------------------------------------------------
    -- PAID ACCOUNT EXHAUSTED
    -------------------------------------------------------

    if exhausted == "1" then
      return {
        0,
        "locked",
        "no_pro_credits"
      }
    end

    -------------------------------------------------------
    -- FREE ACCOUNT
    -------------------------------------------------------

    local freeBalance =
      redis.call(
        "GET",
        KEYS[5]
      )

    local freeReset =
      redis.call(
        "GET",
        KEYS[6]
      )

    if
      not freeBalance
      or not freeReset
      or tonumber(freeReset) <= now
    then

      local newReset =
        now + freeTTL

      redis.call(
        "SET",
        KEYS[5],
        freeCredits,
        "EX",
        freeTTL
      )

      redis.call(
        "SET",
        KEYS[6],
        newReset,
        "EX",
        freeTTL
      )

      freeBalance =
        tostring(freeCredits)

      freeReset =
        tostring(newReset)
    end

    local free =
      tonumber(freeBalance or "0")

    if free <= 0 then

      return {
        0,
        "free",
        "no_free_credits",
        tonumber(freeReset)
      }
    end

    local newFree =
      redis.call(
        "DECR",
        KEYS[5]
      )

    if newFree < 0 then

      redis.call(
        "SET",
        KEYS[5],
        "0"
      )

      return {
        0,
        "free",
        "no_free_credits",
        tonumber(freeReset)
      }
    end

    return {
      1,
      "free",
      newFree,
      tonumber(freeReset)
    }
  `;

  const result =
    await redisEval(
      redis.url,
      redis.token,
      script,
      [
        proKey(safeUserId),
        proExpiryKey(safeUserId),
        proBalanceKey(safeUserId),
        proExhaustedKey(safeUserId),
        balanceKey(safeUserId),
        resetKey(safeUserId)
      ],
      [
        String(now),
        String(FREE_CREDITS),
        String(FREE_PERIOD_SECONDS)
      ]
    );

  const success =
    Number(result?.[0]) === 1;

  const type =
    String(result?.[1] || "");

  const third =
    result?.[2];

  const fourth =
    result?.[3];

  // ---------------------------------------------------
  // FAILED
  // ---------------------------------------------------

  if (!success) {

    if (
      third === "expired"
    ) {
      return {
        success: false,
        balance: 0,
        reason: "expired",
        upgradeRequired: true,
        proActive: false,
        proExhausted: false
      };
    }

    if (
      type === "locked" ||
      third === "no_pro_credits"
    ) {
      return {
        success: false,
        balance: 0,
        reason: "no_pro_credits",
        upgradeRequired: true,
        proActive: false,
        proExhausted: true,
        proCredits: 0
      };
    }

    if (
      third === "no_free_credits"
    ) {
      return {
        success: false,
        balance: 0,
        reason: "no_free_credits",
        upgradeRequired: true,
        proActive: false,
        proExhausted: false,
        resetAt:
          safeNumber(fourth, 0)
      };
    }

    return {
      success: false,
      balance: 0,
      reason: "credit_unavailable",
      upgradeRequired: false
    };
  }

  // ---------------------------------------------------
  // PAID CREDIT
  // ---------------------------------------------------

  if (type === "pro") {

    const balance =
      third === "last"
        ? 0
        : Math.max(
            0,
            Math.floor(
              safeNumber(third, 0)
            )
          );

    return {
      success: true,

      balance,

      proCredits: balance,

      proCreditsTotal: null,

      proActive:
        balance > 0,

      proExhausted:
        balance === 0,

      usedCredit: true,

      creditType: "pro",

      expiresAt:
        safeNumber(fourth, 0) || null
    };
  }

  // ---------------------------------------------------
  // FREE CREDIT
  // ---------------------------------------------------

  return {
    success: true,

    balance:
      Math.max(
        0,
        Math.floor(
          safeNumber(third, 0)
        )
      ),

    proCredits: null,

    proCreditsTotal: null,

    proActive: false,

    proExhausted: false,

    usedCredit: true,

    creditType: "free",

    resetAt:
      safeNumber(fourth, 0)
  };
}

// =====================================================
// REFUND ONE CREDIT
// =====================================================
//
// creditType may be:
//
// "pro"
// "free"
//
// The generation API will be updated in Step 2 to pass
// the exact type that was actually charged.
//
// This prevents a failed paid generation from accidentally
// becoming a free-credit refund.
// =====================================================

export async function refundCredit(
  userId,
  redis,
  creditType = ""
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

  const requestedType =
    clean(creditType).toLowerCase();

  // ===================================================
  // EXACT PAID REFUND
  // ===================================================

  if (requestedType === "pro") {

    const [
      totalValue,
      expiryValue,
      planValue
    ] = await Promise.all([
      redisCommand(
        redis.url,
        redis.token,
        [
          "GET",
          proTotalKey(safeUserId)
        ]
      ),

      redisCommand(
        redis.url,
        redis.token,
        [
          "GET",
          proExpiryKey(safeUserId)
        ]
      ),

      redisCommand(
        redis.url,
        redis.token,
        [
          "GET",
          proPlanKey(safeUserId)
        ]
      )
    ]);

    const total =
      Math.max(
        0,
        Math.floor(
          safeNumber(totalValue, 0)
        )
      );

    const expiresAt =
      safeNumber(expiryValue, 0);

    if (
      total <= 0 ||
      !planValue
    ) {
      return {
        success: false,
        balance: 0,
        creditType: "pro"
      };
    }

    const now =
      Math.floor(Date.now() / 1000);

    if (
      expiresAt <= now
    ) {
      return {
        success: false,
        balance: 0,
        creditType: "expired"
      };
    }

    const ttl =
      Math.max(
        1,
        expiresAt - now
      );

    const script = `
      local current =
        tonumber(
          redis.call(
            "GET",
            KEYS[1]
          ) or "0"
        )

      local total =
        tonumber(ARGV[1])

      local newBalance =
        math.min(
          total,
          current + 1
        )

      redis.call(
        "SET",
        KEYS[1],
        newBalance,
        "EX",
        ARGV[2]
      )

      redis.call(
        "SET",
        KEYS[2],
        "active",
        "EX",
        ARGV[2]
      )

      redis.call(
        "DEL",
        KEYS[3]
      )

      return newBalance
    `;

    const newBalance =
      Number(
        await redisEval(
          redis.url,
          redis.token,
          script,
          [
            proBalanceKey(safeUserId),
            proKey(safeUserId),
            proExhaustedKey(safeUserId)
          ],
          [
            String(total),
            String(ttl)
          ]
        )
      );

    return {
      success: true,

      balance:
        Math.max(
          0,
          Math.floor(newBalance)
        ),

      proCredits:
        Math.max(
          0,
          Math.floor(newBalance)
        ),

      proCreditsTotal:
        total,

      creditType: "pro"
    };
  }

  // ===================================================
  // EXACT FREE REFUND
  // ===================================================

  if (requestedType === "free") {

    const [
      currentValue,
      resetValue
    ] = await Promise.all([
      redisCommand(
        redis.url,
        redis.token,
        [
          "GET",
          balanceKey(safeUserId)
        ]
      ),

      redisCommand(
        redis.url,
        redis.token,
        [
          "GET",
          resetKey(safeUserId)
        ]
      )
    ]);

    if (
      currentValue === null ||
      resetValue === null
    ) {
      return {
        success: false,
        balance: 0,
        creditType: "free"
      };
    }

    const now =
      Math.floor(Date.now() / 1000);

    const resetAt =
      safeNumber(resetValue, 0);

    if (
      resetAt <= now
    ) {
      return {
        success: false,
        balance: 0,
        creditType: "expired"
      };
    }

    const ttl =
      Math.max(
        1,
        resetAt - now
      );

    const script = `
      local current =
        tonumber(
          redis.call(
            "GET",
            KEYS[1]
          ) or "0"
        )

      local maximum =
        tonumber(ARGV[1])

      if current >= maximum then
        return maximum
      end

      local newBalance =
        redis.call(
          "INCR",
          KEYS[1]
        )

      return math.min(
        maximum,
        newBalance
      )
    `;

    const newBalance =
      Number(
        await redisEval(
          redis.url,
          redis.token,
          script,
          [balanceKey(safeUserId)],
          [String(FREE_CREDITS)]
        )
      );

    /*
     * Re-apply the remaining TTL if necessary.
     */
    await redisCommand(
      redis.url,
      redis.token,
      [
        "EXPIRE",
        balanceKey(safeUserId),
        String(ttl)
      ]
    );

    return {
      success: true,

      balance:
        Math.max(
          0,
          Math.min(
            FREE_CREDITS,
            Math.floor(newBalance)
          )
        ),

      creditType: "free"
    };
  }

  // ===================================================
  // LEGACY FALLBACK
  // ===================================================
  //
  // This exists temporarily for older callers.
  // New generate.js will always provide the exact type.
  // ===================================================

  const pro =
    await getProStatus(
      safeUserId,
      redis
    );

  if (pro.active || pro.exhausted) {
    return refundCredit(
      safeUserId,
      redis,
      "pro"
    );
  }

  return refundCredit(
    safeUserId,
    redis,
    "free"
  );
}

// =====================================================
// GET CREDITS / SUBSCRIPTION STATUS
// =====================================================

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");

    return send(
      res,
      405,
      {
        success: false,
        error:
          "This action is not available."
      }
    );
  }

  const redis =
    getRedisConfig();

  if (
    !redis.url ||
    !redis.token
  ) {
    console.error(
      "OBITREND Redis configuration unavailable."
    );

    return send(
      res,
      503,
      {
        success: false,
        error:
          "Credit service is temporarily unavailable."
      }
    );
  }

  try {
    // -------------------------------------------------
    // VERIFIED USER
    // -------------------------------------------------

    const auth =
      await getAuthenticatedUser(req);

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

    // IMPORTANT:
    // Only the verified Supabase ID is used.
    const userId =
      auth.user.id;

    // -------------------------------------------------
    // PAID STATUS
    // -------------------------------------------------

    const pro =
      await getProStatus(
        userId,
        redis
      );

    const now =
      Math.floor(Date.now() / 1000);

    // =================================================
    // ACTIVE PAID USER
    // =================================================

    if (pro.active) {

      const seconds =
        pro.expiresAt === null
          ? null
          : Math.max(
              0,
              Number(pro.expiresAt) - now
            );

      return send(
        res,
        200,
        {
          success: true,

          proActive: true,

          proExhausted: false,

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

          freeTrial: false,

          freeTrialRemaining: 0,

          freeTrialLimit:
            FREE_CREDITS,

          resetAt: null,

          secondsUntilReset: null,

          upgradeRequired: false,

          creditType: "pro",

          message:
            `OBITREND Pro active — ${pro.proCredits} credit(s) remaining.`
        }
      );
    }

    // =================================================
    // EXHAUSTED PAID USER
    // =================================================

    if (pro.exhausted) {

      return send(
        res,
        200,
        {
          success: true,

          proActive: false,

          proExhausted: true,

          proExpiresAt:
            pro.expiresAt,

          proSecondsRemaining:
            pro.expiresAt
              ? Math.max(
                  0,
                  Number(pro.expiresAt) - now
                )
              : null,

          proCredits: 0,

          proCreditsTotal:
            pro.proCreditsTotal,

          credits: 0,

          total:
            pro.proCreditsTotal,

          plan:
            pro.plan,

          freeTrial: false,

          freeTrialRemaining: 0,

          freeTrialLimit:
            FREE_CREDITS,

          resetAt: null,

          secondsUntilReset: null,

          upgradeRequired: true,

          creditType: "locked",

          message:
            "Your OBITREND Pro credits are finished. Renew your plan to continue."
        }
      );
    }

    // =================================================
    // FREE USER
    // =================================================

    const free =
      await getOrCreateFreeCredits(
        userId,
        redis
      );

    const secondsUntilReset =
      Math.max(
        0,
        Number(free.resetAt || 0) - now
      );

    return send(
      res,
      200,
      {
        success: true,

        proActive: false,

        proExhausted: false,

        proExpiresAt: null,

        proSecondsRemaining: null,

        proCredits: 0,

        proCreditsTotal: 0,

        credits:
          free.balance,

        total:
          free.total,

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
            ? `You have ${free.balance} free generation(s) remaining.`
            : "Your 3 free generations are finished. Upgrade to OBITREND Pro to continue."
      }
    );

  } catch (error) {

    console.error(
      "OBITREND credits error:",
      error
    );

    return send(
      res,
      503,
      {
        success: false,
        error:
          "Unable to read your credits right now. Please try again."
      }
    );
  }
}
