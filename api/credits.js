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
// 3 free credits only
//
// IMPORTANT
// Paid users NEVER fall back to free credits.
// A paid account is locked when its credits finish
// or its paid time expires.
// =====================================================

const FREE_CREDITS = 3;

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

const FREE_PERIOD_SECONDS = 7 * 24 * 60 * 60;

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
    const email = String(data?.email || "")
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

// This key permanently marks that a paid entitlement ended
// because its paid credits were exhausted.
//
// This prevents the account from receiving the 3 free credits
// after a paid package has been used up.
function proExhaustedKey(userId) {
  return `obitrend:pro:exhausted:${userId}`;
}

// =====================================================
// FREE CREDIT ACCOUNT
// =====================================================

async function getOrCreateFreeCredits(userId, redis) {
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

  const now = Math.floor(Date.now() / 1000);

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

// =====================================================
// ACTIVATE PAID PLAN
//
// IMPORTANT:
// This function must only be called AFTER Paystack has
// verified a successful payment.
//
// It receives the exact plan purchased.
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
    throw new Error("Invalid user ID.");
  }

  if (!redis?.url || !redis?.token) {
    throw new Error(
      "Redis environment variables are missing."
    );
  }

  const packageInfo = getPlanConfig(plan);

  if (!packageInfo) {
    throw new Error(
      "Invalid OBITREND Pro package."
    );
  }

  const now = Math.floor(Date.now() / 1000);

  const expiresAt =
    now + packageInfo.seconds;

  /*
   * New paid purchase completely replaces the previous
   * paid entitlement.
   *
   * The user receives exactly the credits belonging to
   * the package that was verified by Paystack.
   */

  await Promise.all([
    redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        proKey(safeUserId),
        "active",
        "EX",
        packageInfo.seconds
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
        packageInfo.seconds
      ]
    ),

    redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        proBalanceKey(safeUserId),
        packageInfo.credits,
        "EX",
        packageInfo.seconds
      ]
    ),

    redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        proCreditsExpiryKey(safeUserId),
        expiresAt,
        "EX",
        packageInfo.seconds
      ]
    ),

    email
      ? redisCommand(
          redis.url,
          redis.token,
          [
            "SET",
            proEmailKey(safeUserId),
            String(email)
              .trim()
              .toLowerCase(),
            "EX",
            packageInfo.seconds
          ]
        )
      : Promise.resolve(null),

    reference
      ? redisCommand(
          redis.url,
          redis.token,
          [
            "SET",
            proReferenceKey(safeUserId),
            String(reference).trim(),
            "EX",
            packageInfo.seconds
          ]
        )
      : Promise.resolve(null),

    // Remove the exhausted-paid marker.
    redisCommand(
      redis.url,
      redis.token,
      [
        "DEL",
        proExhaustedKey(safeUserId)
      ]
    )
  ]);

  return {
    active: true,
    userId: safeUserId,
    plan: upper(plan),
    planName: packageInfo.name,
    expiresAt,
    proCredits: packageInfo.credits,
    proCreditsRemaining:
      packageInfo.credits,
    durationSeconds:
      packageInfo.seconds
  };
}

// =====================================================
// GET PAID STATUS
// =====================================================

export async function getProStatus(userId, redis) {
  const safeUserId = cleanUserId(userId);

  if (!safeUserId || !redis?.url || !redis?.token) {
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
    const now = Math.floor(Date.now() / 1000);

    const [
      status,
      expiresValue,
      creditsValue,
      exhaustedValue
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
      )
    ]);

    const active =
      status === "active" ||
      status === "true";

    const expiresAt =
      Number.isFinite(Number(expiresValue)) &&
      Number(expiresValue) > 0
        ? Number(expiresValue)
        : null;

    const storedCredits =
      Number.isFinite(Number(creditsValue))
        ? Math.max(0, Math.floor(Number(creditsValue)))
        : 0;

    const exhausted =
      String(exhaustedValue || "") === "1";

    // ---------------------------------------------------
    // NO ACTIVE PAID PLAN
    // ---------------------------------------------------

    if (!active) {
      return {
        active: false,
        expired: Boolean(expiresAt && expiresAt <= now),
        exhausted,
        expiresAt: null,
        proCredits: 0,
        proCreditsTotal: 0,
        plan: null
      };
    }

    // ---------------------------------------------------
    // PAID PLAN HAS EXPIRED
    // ---------------------------------------------------

    if (expiresAt !== null && expiresAt <= now) {
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
    // PAID CREDITS ARE FINISHED
    // ---------------------------------------------------

    if (storedCredits <= 0) {
      await deactivatePro(
        safeUserId,
        redis,
        true
      );

      return {
        active: false,
        expired: false,
        exhausted: true,
        expiresAt,
        proCredits: 0,
        proCreditsTotal: 0,
        plan: null
      };
    }

    // ---------------------------------------------------
    // VALID ACTIVE PAID ACCOUNT
    // ---------------------------------------------------

    return {
      active: true,
      expired: false,
      exhausted: false,

      expiresAt,

      proCredits: storedCredits,

      /*
       * IMPORTANT:
       * This is the CURRENT server-side balance.
       * It is never taken from OpenAI.
       */
      proCreditsTotal: storedCredits,

      plan: null
    };

  } catch (error) {

    /*
     * Technical details stay on the server.
     * Nothing from Redis/OpenAI is exposed to customers.
     */

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
// DEACTIVATE PAID PLAN
// =====================================================
//
// keepExhausted=true means:
// The paid credits finished, so the user is locked and
// MUST NOT fall into the free-credit system.
//
// keepExhausted=false means the paid entitlement expired.
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
      [
        "DEL",
        proCreditsExpiryKey(safeUserId)
      ]
    ),

    redisCommand(
      redis.url,
      redis.token,
      ["DEL", proEmailKey(safeUserId)]
    ),

    redisCommand(
      redis.url,
      redis.token,
      [
        "DEL",
        proReferenceKey(safeUserId)
      ]
    ),

    keepExhausted
      ? redisCommand(
          redis.url,
          redis.token,
          [
            "SET",
            proExhaustedKey(safeUserId),
            "1"
          ]
        )
      : Promise.resolve(null)
  ]);
}

// =====================================================
// SPEND ONE CREDIT
// =====================================================
//
// This is the critical security gate.
//
// Paid user:
//   spends paid credit only.
//
// Free user:
//   spends free credit.
//
// Exhausted paid user:
//   stays LOCKED.
//
// Paid user NEVER receives free credits.
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
    if (pro.proCredits <= 0) {
      await deactivatePro(
        safeUserId,
        redis,
        true
      );

      return {
        success: false,
        balance: 0,
        reason: "no_pro_credits",
        upgradeRequired: true,
        proActive: false,
        proExhausted: true,
        proCredits: 0,
        expiresAt: pro.expiresAt
      };
    }

    const result =
      Number(
        await redisCommand(
          redis.url,
          redis.token,
          [
            "DECR",
            proBalanceKey(safeUserId)
          ]
        )
      );

    if (result < 0) {
      await redisCommand(
        redis.url,
        redis.token,
        [
          "INCR",
          proBalanceKey(safeUserId)
        ]
      );

      await deactivatePro(
        safeUserId,
        redis,
        true
      );

      return {
        success: false,
        balance: 0,
        reason: "no_pro_credits",
        upgradeRequired: true,
        proActive: false,
        proExhausted: true,
        proCredits: 0,
        expiresAt: pro.expiresAt
      };
    }

    // Last paid credit has now been consumed.
    if (result === 0) {
      await deactivatePro(
        safeUserId,
        redis,
        true
      );

      return {
        success: true,
        balance: 0,
        proCredits: 0,
        proActive: false,
        proExhausted: true,
        usedCredit: true,
        creditType: "pro",
        expiresAt: pro.expiresAt
      };
    }

    return {
      success: true,
      balance: result,
      proCredits: result,
      proActive: true,
      proExhausted: false,
      usedCredit: true,
      creditType: "pro",
      expiresAt: pro.expiresAt
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
          proExhaustedKey(safeUserId)
        ]
      );

    exhausted =
      String(marker || "") === "1";
  } catch {}

  if (exhausted) {
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

  // ===================================================
  // FREE USER
  // ===================================================

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
      proExhausted: false,
      resetAt: free.resetAt
    };
  }

  const result =
    Number(
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
      proExhausted: false,
      resetAt: free.resetAt
    };
  }

  return {
    success: true,
    balance: result,
    proCredits: null,
    proActive: false,
    proExhausted: false,
    usedCredit: true,
    creditType: "free",
    resetAt: free.resetAt
  };
}

// =====================================================
// REFUND ONE CREDIT
// =====================================================
//
// Used when OpenAI generation fails after a credit
// has already been charged.
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

  const pro =
    await getProStatus(
      safeUserId,
      redis
    );

  if (pro.active) {
    const current =
      Number(
        await redisCommand(
          redis.url,
          redis.token,
          [
            "GET",
            proBalanceKey(safeUserId)
          ]
        )
      );

    if (!Number.isFinite(current)) {
      return {
        success: false,
        balance: 0
      };
    }

    const maxCredits =
      pro.proCreditsTotal ||
      current + 1;

    const newBalance =
      Math.min(
        maxCredits,
        Math.max(
          0,
          Number(
            await redisCommand(
              redis.url,
              redis.token,
              [
                "INCR",
                proBalanceKey(safeUserId)
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

  // If this account was already marked exhausted,
  // do not accidentally create a free allowance.
  let exhausted = false;

  try {
    const marker =
      await redisCommand(
        redis.url,
        redis.token,
        [
          "GET",
          proExhaustedKey(safeUserId)
        ]
      );

    exhausted =
      String(marker || "") === "1";
  } catch {}

  if (exhausted) {
    return {
      success: false,
      balance: 0,
      creditType: "locked"
    };
  }

  const current =
    await redisCommand(
      redis.url,
      redis.token,
      [
        "GET",
        balanceKey(safeUserId)
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
    !Number.isFinite(currentNumber)
  ) {
    return {
      success: false,
      balance: 0
    };
  }

  if (
    currentNumber >= FREE_CREDITS
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
        balanceKey(safeUserId)
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

// =====================================================
// GET CREDITS / SUBSCRIPTION STATUS
// =====================================================

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

    const userId =
      auth.user.id;

    const pro =
      await getProStatus(
        userId,
        redis
      );

    const now =
      Math.floor(Date.now() / 1000);

    // =================================================
    // PAID USER
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
            pro.proCredits,

          credits:
            pro.proCredits,

          total:
            pro.proCredits,

          freeTrial: false,
          freeTrialRemaining: 0,
          freeTrialLimit: FREE_CREDITS,

          resetAt: null,
          secondsUntilReset: null,

          upgradeRequired:
            pro.proCredits <= 0,

          creditType: "pro",

          message:
            pro.proCredits > 0
              ? `OBITREND Pro active — ${pro.proCredits} credit(s) remaining.`
              : "Your OBITREND Pro credits are finished. Renew your plan to continue."
        }
      );
    }

    // =================================================
    // PAID CREDITS FINISHED
    //
    // IMPORTANT:
    // Do NOT create/read the free account here.
    // =================================================

    if (pro.exhausted) {
      return send(
        res,
        200,
        {
          success: true,

          proActive: false,
          proExhausted: true,

          proExpiresAt: null,
          proSecondsRemaining: null,

          proCredits: 0,
          proCreditsTotal: 0,

          credits: 0,
          total: 0,

          freeTrial: false,
          freeTrialRemaining: 0,
          freeTrialLimit: FREE_CREDITS,

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
      500,
      {
        success: false,
        error:
          "Unable to read OBITREND credits right now."
      }
    );
  }
}
