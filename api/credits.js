// =====================================================
// OBITREND AI FASHION CREATOR
// SERVER-SIDE FREE + PAID CREDIT SYSTEM
// Supabase authentication + Redis balances
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
// IMPORTANT
// Paid users NEVER fall back to free credits.
// Paid credits are separate from OpenAI billing.
// =====================================================

const FREE_CREDITS = 3;

const FREE_PERIOD_SECONDS =
  7 * 24 * 60 * 60;

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
// BASIC HELPERS
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
// REDIS
// =====================================================

export function getRedisConfig() {
  return {
    url: String(
      process.env.KV_REST_API_URL ||
      process.env.UPSTASH_REDIS_REST_URL ||
      ""
    )
      .trim(),

    token: String(
      process.env.KV_REST_API_TOKEN ||
      process.env.UPSTASH_REDIS_REST_TOKEN ||
      ""
    )
      .trim()
  };
}

async function redisCommand(
  url,
  token,
  command
) {
  if (!url || !token) {
    throw new Error(
      "Redis configuration unavailable."
    );
  }

  const response = await fetch(
    `${url.replace(/\/$/, "")}/${command
      .map(encodeURIComponent)
      .join("/")}`,
    {
      method: "GET",
      headers: {
        Authorization:
          `Bearer ${token}`
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
      data?.error ||
      "Redis request failed."
    );
  }

  return data.result;
}

// =====================================================
// SUPABASE AUTHENTICATION
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

  if (
    typeof header !== "string"
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

export async function getAuthenticatedUser(
  req
) {
  const token =
    getBearerToken(req);

  if (!token) {
    return {
      ok: false,
      status: 401,
      error:
        "Please sign in to continue."
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
        "Authentication is temporarily unavailable."
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

// NEW:
// Stores the exact package purchased.
function proPlanKey(userId) {
  return `obitrend:pro:plan:${userId}`;
}

// NEW:
// Stores the original number of credits purchased.
function proTotalKey(userId) {
  return `obitrend:pro:credits:total:${userId}`;
}

// Prevents paid users from falling into free credits.
function proExhaustedKey(userId) {
  return `obitrend:pro:exhausted:${userId}`;
}

// =====================================================
// FREE CREDIT ACCOUNT
// =====================================================

async function getOrCreateFreeCredits(
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
      ["GET", balance]
    ),

    redisCommand(
      redis.url,
      redis.token,
      ["GET", reset]
    )
  ]);

  const now =
    Math.floor(
      Date.now() / 1000
    );

  const resetAt =
    resetAtValue === null
      ? 0
      : safeNumber(
          resetAtValue,
          0
        );

  if (
    currentBalance === null ||
    resetAt <= now
  ) {
    const newResetAt =
      now +
      FREE_PERIOD_SECONDS;

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
      Math.floor(
        safeNumber(
          currentBalance,
          0
        )
      )
    ),

    total: FREE_CREDITS,

    resetAt
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
  const safeUserId =
    cleanUserId(userId);

  if (!safeUserId) {
    throw new Error(
      "Invalid user."
    );
  }

  if (
    !redis?.url ||
    !redis?.token
  ) {
    throw new Error(
      "Credit service unavailable."
    );
  }

  const packageInfo =
    getPlanConfig(plan);

  if (!packageInfo) {
    throw new Error(
      "Invalid OBITREND package."
    );
  }

  const now =
    Math.floor(
      Date.now() / 1000
    );

  const expiresAt =
    now +
    packageInfo.seconds;

  const ttl =
    packageInfo.seconds;

  await Promise.all([
    // Active paid account
    redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        proKey(safeUserId),
        "active",
        "EX",
        ttl
      ]
    ),

    // Expiration
    redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        proExpiryKey(safeUserId),
        expiresAt,
        "EX",
        ttl
      ]
    ),

    // Remaining credits
    redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        proBalanceKey(safeUserId),
        packageInfo.credits,
        "EX",
        ttl
      ]
    ),

    // Credit expiration
    redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        proCreditsExpiryKey(
          safeUserId
        ),
        expiresAt,
        "EX",
        ttl
      ]
    ),

    // NEW: exact package
    redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        proPlanKey(
          safeUserId
        ),
        upper(plan),
        "EX",
        ttl
      ]
    ),

    // NEW: original credit total
    redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        proTotalKey(
          safeUserId
        ),
        packageInfo.credits,
        "EX",
        ttl
      ]
    ),

    email
      ? redisCommand(
          redis.url,
          redis.token,
          [
            "SET",
            proEmailKey(
              safeUserId
            ),
            String(email)
              .trim()
              .toLowerCase(),
            "EX",
            ttl
          ]
        )
      : Promise.resolve(null),

    reference
      ? redisCommand(
          redis.url,
          redis.token,
          [
            "SET",
            proReferenceKey(
              safeUserId
            ),
            String(reference)
              .trim(),
            "EX",
            ttl
          ]
        )
      : Promise.resolve(null),

    // Remove old exhausted marker
    redisCommand(
      redis.url,
      redis.token,
      [
        "DEL",
        proExhaustedKey(
          safeUserId
        )
      ]
    )
  ]);

  return {
    active: true,

    userId:
      safeUserId,

    plan:
      upper(plan),

    planName:
      packageInfo.name,

    expiresAt,

    proCredits:
      packageInfo.credits,

    proCreditsRemaining:
      packageInfo.credits,

    proCreditsTotal:
      packageInfo.credits,

    durationSeconds:
      packageInfo.seconds
  };
}

// =====================================================
// GET PAID STATUS
// =====================================================

export async function getProStatus(
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
      Math.floor(
        Date.now() / 1000
      );

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
        [
          "GET",
          proKey(safeUserId)
        ]
      ),

      redisCommand(
        redis.url,
        redis.token,
        [
          "GET",
          proExpiryKey(
            safeUserId
          )
        ]
      ),

      redisCommand(
        redis.url,
        redis.token,
        [
          "GET",
          proBalanceKey(
            safeUserId
          )
        ]
      ),

      redisCommand(
        redis.url,
        redis.token,
        [
          "GET",
          proExhaustedKey(
            safeUserId
          )
        ]
      ),

      redisCommand(
        redis.url,
        redis.token,
        [
          "GET",
          proPlanKey(
            safeUserId
          )
        ]
      ),

      redisCommand(
        redis.url,
        redis.token,
        [
          "GET",
          proTotalKey(
            safeUserId
          )
        ]
      )
    ]);

    const active =
      status === "active" ||
      status === "true";

    const expiresAt =
      Number.isFinite(
        Number(expiresValue)
      ) &&
      Number(expiresValue) > 0
        ? Number(expiresValue)
        : null;

    const storedCredits =
      Math.max(
        0,
        Math.floor(
          safeNumber(
            creditsValue,
            0
          )
        )
      );

    const exhausted =
      String(
        exhaustedValue || ""
      ) === "1";

    let plan =
      clean(planValue) ||
      null;

    let total =
      Math.floor(
        safeNumber(
          totalValue,
          0
        )
      );

    // ---------------------------------------------------
    // Recover total from stored plan if necessary
    // ---------------------------------------------------

    const packageInfo =
      plan
        ? getPlanConfig(plan)
        : null;

    if (
      total <= 0 &&
      packageInfo
    ) {
      total =
        packageInfo.credits;
    }

    /*
     * Legacy accounts may not have the new total key.
     *
     * Do NOT invent a package amount.
     * Preserve their actual stored balance.
     */
    if (total <= 0) {
      total =
        storedCredits;
    }

    // ---------------------------------------------------
    // EXHAUSTED PAID ACCOUNT
    // ---------------------------------------------------

    if (exhausted) {
      return {
        active: false,
        expired: false,
        exhausted: true,

        expiresAt,

        proCredits: 0,

        proCreditsTotal:
          total,

        plan
      };
    }

    // ---------------------------------------------------
    // NO ACTIVE PAID PLAN
    // ---------------------------------------------------

    if (!active) {
      return {
        active: false,

        expired:
          Boolean(
            expiresAt &&
            expiresAt <= now
          ),

        exhausted: false,

        expiresAt: null,

        proCredits: 0,

        proCreditsTotal: 0,

        plan: null
      };
    }

    // ---------------------------------------------------
    // EXPIRED PAID PLAN
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
    // ZERO PAID CREDITS
    // ---------------------------------------------------

    if (
      storedCredits <= 0
    ) {
      /*
       * Keep the entitlement metadata so a failed
       * generation can still refund the final credit.
       */
      await lockExhaustedPro(
        safeUserId,
        redis
      );

      return {
        active: false,
        expired: false,
        exhausted: true,

        expiresAt,

        proCredits: 0,

        proCreditsTotal:
          total,

        plan
      };
    }

    // ---------------------------------------------------
    // ACTIVE PAID ACCOUNT
    // ---------------------------------------------------

    return {
      active: true,
      expired: false,
      exhausted: false,

      expiresAt,

      proCredits:
        storedCredits,

      proCreditsTotal:
        total,

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
//
// IMPORTANT:
// We keep the paid balance/expiry/package metadata.
// This allows a failed generation to refund the final
// credit safely.
//
// The account is still LOCKED because proKey is removed
// and proExhaustedKey is set.
// =====================================================

async function lockExhaustedPro(
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
    return;
  }

  await Promise.all([
    redisCommand(
      redis.url,
      redis.token,
      [
        "DEL",
        proKey(safeUserId)
      ]
    ),

    redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        proExhaustedKey(
          safeUserId
        ),
        "1"
      ]
    )
  ]);
}

// =====================================================
// DEACTIVATE PAID PLAN
// =====================================================

export async function deactivatePro(
  userId,
  redis,
  keepExhausted = false
) {
  const safeUserId =
    cleanUserId(userId);

  if (
    !safeUserId ||
    !redis?.url ||
    !redis?.token
  ) {
    return;
  }

  if (
    keepExhausted
  ) {
    await lockExhaustedPro(
      safeUserId,
      redis
    );

    return;
  }

  await Promise.all([
    redisCommand(
      redis.url,
      redis.token,
      [
        "DEL",
        proKey(safeUserId)
      ]
    ),

    redisCommand(
      redis.url,
      redis.token,
      [
        "DEL",
        proExpiryKey(
          safeUserId
        )
      ]
    ),

    redisCommand(
      redis.url,
      redis.token,
      [
        "DEL",
        proBalanceKey(
          safeUserId
        )
      ]
    ),

    redisCommand(
      redis.url,
      redis.token,
      [
        "DEL",
        proCreditsExpiryKey(
          safeUserId
        )
      ]
    ),

    redisCommand(
      redis.url,
      redis.token,
      [
        "DEL",
        proEmailKey(
          safeUserId
        )
      ]
    ),

    redisCommand(
      redis.url,
      redis.token,
      [
        "DEL",
        proReferenceKey(
          safeUserId
        )
      ]
    ),

    redisCommand(
      redis.url,
      redis.token,
      [
        "DEL",
        proPlanKey(
          safeUserId
        )
      ]
    ),

    redisCommand(
      redis.url,
      redis.token,
      [
        "DEL",
        proTotalKey(
          safeUserId
        )
      ]
    ),

    redisCommand(
      redis.url,
      redis.token,
      [
        "DEL",
        proExhaustedKey(
          safeUserId
        )
      ]
    )
  ]);
}

// =====================================================
// SPEND ONE CREDIT
// =====================================================

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

  // ===================================================
  // PAID USER
  // ===================================================

  if (pro.active) {

    if (
      pro.proCredits <= 0
    ) {
      await lockExhaustedPro(
        safeUserId,
        redis
      );

      return {
        success: false,
        balance: 0,

        reason:
          "no_pro_credits",

        upgradeRequired: true,

        proActive: false,

        proExhausted: true,

        proCredits: 0,

        proCreditsTotal:
          pro.proCreditsTotal,

        expiresAt:
          pro.expiresAt
      };
    }

    const result =
      Number(
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

    if (
      result < 0
    ) {
      await redisCommand(
        redis.url,
        redis.token,
        [
          "SET",
          proBalanceKey(
            safeUserId
          ),
          0
        ]
      );

      await lockExhaustedPro(
        safeUserId,
        redis
      );

      return {
        success: false,
        balance: 0,
        reason:
          "no_pro_credits",
        upgradeRequired: true,
        proActive: false,
        proExhausted: true,
        proCredits: 0,
        proCreditsTotal:
          pro.proCreditsTotal,
        expiresAt:
          pro.expiresAt
      };
    }

    // -------------------------------------------------
    // LAST PAID CREDIT
    // -------------------------------------------------

    if (
      result === 0
    ) {
      await lockExhaustedPro(
        safeUserId,
        redis
      );

      return {
        success: true,

        balance: 0,

        proCredits: 0,

        proCreditsTotal:
          pro.proCreditsTotal,

        proActive: false,

        proExhausted: true,

        usedCredit: true,

        creditType: "pro",

        expiresAt:
          pro.expiresAt
      };
    }

    return {
      success: true,

      balance: result,

      proCredits: result,

      proCreditsTotal:
        pro.proCreditsTotal,

      proActive: true,

      proExhausted: false,

      usedCredit: true,

      creditType: "pro",

      expiresAt:
        pro.expiresAt
    };
  }

  // ===================================================
  // PAID ACCOUNT ALREADY EXHAUSTED
  // ===================================================

  let exhausted = false;

  try {
    const marker =
      await redisCommand(
        redis.url,
        redis.token,
        [
          "GET",
          proExhaustedKey(
            safeUserId
          )
        ]
      );

    exhausted =
      String(
        marker || ""
      ) === "1";

  } catch {}

  if (exhausted) {
    return {
      success: false,

      balance: 0,

      reason:
        "no_pro_credits",

      upgradeRequired: true,

      proActive: false,

      proExhausted: true,

      proCredits: 0
    };
  }

  // ===================================================
  // FREE USER
  // ===================================================

  const free =
    await getOrCreateFreeCredits(
      safeUserId,
      redis
    );

  if (
    free.balance <= 0
  ) {
    return {
      success: false,

      balance: 0,

      reason:
        "no_free_credits",

      upgradeRequired: true,

      proActive: false,

      proExhausted: false,

      resetAt:
        free.resetAt
    };
  }

  const result =
    Number(
      await redisCommand(
        redis.url,
        redis.token,
        [
          "DECR",
          balanceKey(
            safeUserId
          )
        ]
      )
    );

  if (
    result < 0
  ) {
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
      success: false,

      balance: 0,

      reason:
        "no_free_credits",

      upgradeRequired: true,

      proActive: false,

      proExhausted: false,

      resetAt:
        free.resetAt
    };
  }

  return {
    success: true,

    balance: result,

    proCredits: null,

    proCreditsTotal: null,

    proActive: false,

    proExhausted: false,

    usedCredit: true,

    creditType: "free",

    resetAt:
      free.resetAt
  };
}

// =====================================================
// REFUND ONE CREDIT
// =====================================================
//
// Used only after a generation fails.
//
// Works even when the failed generation consumed the
// user's final paid credit.
// =====================================================

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

  // ---------------------------------------------------
  // Check paid entitlement metadata directly.
  // ---------------------------------------------------

  const [
    proPlan,
    proTotalValue,
    proExpiryValue,
    exhaustedValue
  ] = await Promise.all([
    redisCommand(
      redis.url,
      redis.token,
      [
        "GET",
        proPlanKey(
          safeUserId
        )
      ]
    ),

    redisCommand(
      redis.url,
      redis.token,
      [
        "GET",
        proTotalKey(
          safeUserId
        )
      ]
    ),

    redisCommand(
      redis.url,
      redis.token,
      [
        "GET",
        proExpiryKey(
          safeUserId
        )
      ]
    ),

    redisCommand(
      redis.url,
      redis.token,
      [
        "GET",
        proExhaustedKey(
          safeUserId
        )
      ]
    )
  ]);

  const total =
    Math.max(
      0,
      Math.floor(
        safeNumber(
          proTotalValue,
          0
        )
      )
    );

  const expiresAt =
    safeNumber(
      proExpiryValue,
      0
    );

  const isPaid =
    Boolean(
      proPlan ||
      total > 0 ||
      exhaustedValue === "1"
    );

  // ---------------------------------------------------
  // REFUND PAID CREDIT
  // ---------------------------------------------------

  if (isPaid && total > 0) {

    const now =
      Math.floor(
        Date.now() / 1000
      );

    if (
      expiresAt > 0 &&
      expiresAt <= now
    ) {
      return {
        success: false,
        balance: 0,
        creditType: "expired"
      };
    }

    const current =
      Math.max(
        0,
        Math.floor(
          safeNumber(
            await redisCommand(
              redis.url,
              redis.token,
              [
                "GET",
                proBalanceKey(
                  safeUserId
                )
              ]
            ),
            0
          )
        )
      );

    const newBalance =
      Math.min(
        total,
        current + 1
      );

    await redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        proBalanceKey(
          safeUserId
        ),
        newBalance,
        "EX",
        Math.max(
          1,
          expiresAt - now
        )
      ]
    );

    // Re-open paid account after successful refund.
    await redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        proKey(
          safeUserId
        ),
        "active",
        "EX",
        Math.max(
          1,
          expiresAt - now
        )
      ]
    );

    await redisCommand(
      redis.url,
      redis.token,
      [
        "DEL",
        proExhaustedKey(
          safeUserId
        )
      ]
    );

    return {
      success: true,

      balance:
        newBalance,

      proCredits:
        newBalance,

      proCreditsTotal:
        total,

      creditType:
        "pro"
    };
  }

  // ---------------------------------------------------
  // FREE REFUND
  // ---------------------------------------------------

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

  if (
    current === null
  ) {
    return {
      success: false,
      balance: 0
    };
  }

  const currentNumber =
    Number(current);

  if (
    !Number.isFinite(
      currentNumber
    )
  ) {
    return {
      success: false,
      balance: 0
    };
  }

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
    Number(
      await redisCommand(
        redis.url,
        redis.token,
        [
          "INCR",
          balanceKey(
            safeUserId
          )
        ]
      )
    );

  return {
    success: true,

    balance:
      Math.min(
        FREE_CREDITS,
        Math.max(
          0,
          newBalance
        )
      ),

    creditType:
      "free"
  };
}

// =====================================================
// GET CREDITS / SUBSCRIPTION STATUS
// =====================================================

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

    const pro =
      await getProStatus(
        userId,
        redis
      );

    const now =
      Math.floor(
        Date.now() / 1000
      );

    // =================================================
    // ACTIVE PAID USER
    // =================================================

    if (pro.active) {

      const seconds =
        pro.expiresAt === null
          ? null
          : Math.max(
              0,
              Number(
                pro.expiresAt
              ) - now
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

          // ORIGINAL PURCHASED TOTAL
          proCreditsTotal:
            pro.proCreditsTotal,

          // CURRENT REMAINING BALANCE
          credits:
            pro.proCredits,

          // ORIGINAL PACKAGE TOTAL
          total:
            pro.proCreditsTotal,

          plan:
            pro.plan,

          freeTrial: false,

          freeTrialRemaining: 0,

          freeTrialLimit:
            FREE_CREDITS,

          resetAt: null,

          secondsUntilReset:
            null,

          upgradeRequired:
            false,

          creditType:
            "pro",

          message:
            `OBITREND Pro active — ${pro.proCredits} credit(s) remaining.`
        }
      );
    }

    // =================================================
    // EXHAUSTED PAID USER
    // =================================================

    if (
      pro.exhausted
    ) {
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
                  Number(
                    pro.expiresAt
                  ) - now
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

          secondsUntilReset:
            null,

          upgradeRequired:
            true,

          creditType:
            "locked",

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

        proExhausted: false,

        proExpiresAt: null,

        proSecondsRemaining:
          null,

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

        creditType:
          "free",

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
