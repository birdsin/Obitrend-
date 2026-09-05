/*
===========================================================
 OBITREND AI — CREDITS + PRO ENTITLEMENT API
===========================================================

 FREE
   3 generations
   resets every 7 days

 STANDARD PRO
   ₦15,000 / week
   Standard premium features

 FULL PRO
   ₦45,000 / month
   All premium features

 IMPORTANT
   Pro status is stored per authenticated Supabase user.
   Never trust userId supplied by the browser.

===========================================================
*/

const FREE_CREDITS = 3;
const FREE_PERIOD_SECONDS = 7 * 24 * 60 * 60;

/*
-----------------------------------------------------------
 PRO CREDIT ALLOWANCES

 These can be changed from Vercel environment variables.

 PAYSTACK_WEEKLY_PRO_CREDITS
 PAYSTACK_MONTHLY_PRO_CREDITS

 Defaults:
   Weekly  = 30
   Monthly = 120
-----------------------------------------------------------
*/

const WEEKLY_PRO_CREDITS = Math.max(
  1,
  Number(process.env.PAYSTACK_WEEKLY_PRO_CREDITS || 30)
);

const MONTHLY_PRO_CREDITS = Math.max(
  1,
  Number(process.env.PAYSTACK_MONTHLY_PRO_CREDITS || 120)
);

/*
-----------------------------------------------------------
 PLAN DEFINITIONS
-----------------------------------------------------------
*/

export const PRO_PLANS = {
  PRO_WEEKLY: {
    key: "PRO_WEEKLY",
    tier: "standard",
    name: "OBITREND Standard Pro",
    amount: 1500000,
    currency: "NGN",
    interval: "weekly",
    durationSeconds: 7 * 24 * 60 * 60,
    credits: WEEKLY_PRO_CREDITS
  },

  PRO_MONTHLY: {
    key: "PRO_MONTHLY",
    tier: "full",
    name: "OBITREND Full Pro",
    amount: 4500000,
    currency: "NGN",
    interval: "monthly",
    durationSeconds: 30 * 24 * 60 * 60,
    credits: MONTHLY_PRO_CREDITS
  }
};

/*
-----------------------------------------------------------
 HELPERS
-----------------------------------------------------------
*/

function clean(value) {
  return String(value ?? "").trim();
}

function cleanUserId(value) {
  const id = clean(value);

  if (!id) return "";

  return id;
}

function send(res, status, data) {
  return res.status(status).json(data);
}

/*
-----------------------------------------------------------
 REDIS REST
-----------------------------------------------------------
*/

async function redisCommand(
  url,
  token,
  command
) {
  if (!url || !token) {
    throw new Error(
      "Redis environment variables are missing."
    );
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });

  if (!response.ok) {
    const text =
      await response.text().catch(() => "");

    throw new Error(
      `Redis request failed: ${response.status} ${text}`
    );
  }

  const data =
    await response.json();

  return data?.result ?? null;
}

/*
-----------------------------------------------------------
 REDIS CONFIG
-----------------------------------------------------------
*/

export function getRedisConfig() {
  return {
    url:
      clean(process.env.KV_REST_API_URL) ||
      clean(process.env.UPSTASH_REDIS_REST_URL),

    token:
      clean(process.env.KV_REST_API_TOKEN) ||
      clean(process.env.UPSTASH_REDIS_REST_TOKEN)
  };
}

/*
-----------------------------------------------------------
 SUPABASE AUTHENTICATION

 The browser's userId is NEVER trusted.

 The access token is checked against Supabase Auth.
-----------------------------------------------------------
*/

export async function getAuthenticatedUser(req) {
  const authorization =
    clean(
      req.headers?.authorization ||
      req.headers?.Authorization
    );

  if (
    !authorization ||
    !authorization.toLowerCase().startsWith("bearer ")
  ) {
    return {
      ok: false,
      status: 401,
      error:
        "You must be signed in to use OBITREND."
    };
  }

  const token =
    authorization.slice(7).trim();

  if (!token) {
    return {
      ok: false,
      status: 401,
      error:
        "Your OBITREND login session is missing."
    };
  }

  const supabaseUrl =
    clean(process.env.SUPABASE_URL);

  const supabaseKey =
    clean(
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_ANON_KEY
    );

  if (!supabaseUrl || !supabaseKey) {
    return {
      ok: false,
      status: 500,
      error:
        "Supabase authentication is not configured."
    };
  }

  try {
    const response =
      await fetch(
        `${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: supabaseKey
          }
        }
      );

    let data = null;

    try {
      data = await response.json();
    } catch {
      data = null;
    }

    const userId =
      clean(data?.id);

    const email =
      clean(data?.email).toLowerCase();

    if (
      !response.ok ||
      !userId ||
      userId.length < 8
    ) {
      return {
        ok: false,
        status: 401,
        error:
          "Your OBITREND login session is invalid or expired. Please log in again."
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
      "Supabase authentication error:",
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

/*
===========================================================
 REDIS KEY FUNCTIONS
===========================================================
*/

function freeBalanceKey(userId) {
  return `obitrend:credits:${userId}`;
}

function freeResetKey(userId) {
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

function proPlanKey(userId) {
  return `obitrend:pro:plan:${userId}`;
}

function proTierKey(userId) {
  return `obitrend:pro:tier:${userId}`;
}

function proIntervalKey(userId) {
  return `obitrend:pro:interval:${userId}`;
}

function proAmountKey(userId) {
  return `obitrend:pro:amount:${userId}`;
}

function proCreditsKey(userId) {
  return `obitrend:pro:credits:${userId}`;
}

function proCreditsTotalKey(userId) {
  return `obitrend:pro:credits:total:${userId}`;
}

function proCreditsExpiryKey(userId) {
  return `obitrend:pro:credits:expiry:${userId}`;
}

/*
===========================================================
 PLAN LOOKUP
===========================================================
*/

export function getPlanDefinition(plan) {
  const key =
    clean(plan).toUpperCase();

  if (key === "PRO_MONTHLY") {
    return PRO_PLANS.PRO_MONTHLY;
  }

  return PRO_PLANS.PRO_WEEKLY;
}

/*
===========================================================
 FREE CREDITS
===========================================================
*/

async function getOrCreateFreeCredits(
  userId,
  redis
) {
  const safeUserId =
    cleanUserId(userId);

  const balanceKey =
    freeBalanceKey(safeUserId);

  const resetKey =
    freeResetKey(safeUserId);

  const now =
    Math.floor(Date.now() / 1000);

  let balance =
    await redisCommand(
      redis.url,
      redis.token,
      ["GET", balanceKey]
    );

  let resetAt =
    await redisCommand(
      redis.url,
      redis.token,
      ["GET", resetKey]
    );

  const numericReset =
    Number(resetAt);

  /*
  ---------------------------------------------------------
   First use or expired free period
  ---------------------------------------------------------
  */

  if (
    balance === null ||
    !Number.isFinite(numericReset) ||
    numericReset <= now
  ) {
    resetAt =
      now + FREE_PERIOD_SECONDS;

    await redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        balanceKey,
        FREE_CREDITS,
        "EX",
        FREE_PERIOD_SECONDS
      ]
    );

    await redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        resetKey,
        resetAt,
        "EX",
        FREE_PERIOD_SECONDS
      ]
    );

    balance =
      FREE_CREDITS;
  }

  return {
    balance: Math.max(
      0,
      Math.min(
        FREE_CREDITS,
        Number(balance)
      )
    ),

    total: FREE_CREDITS,

    resetAt:
      Number(resetAt)
  };
}

/*
===========================================================
 ACTIVATE / RENEW PRO

 Called ONLY after Paystack payment verification.
===========================================================
*/

export async function activatePro(
  userId,
  email,
  reference,
  redis,
  planInput = "PRO_WEEKLY"
) {
  const safeUserId =
    cleanUserId(userId);

  if (!safeUserId) {
    throw new Error(
      "Invalid user ID."
    );
  }

  if (
    !redis?.url ||
    !redis?.token
  ) {
    throw new Error(
      "Redis environment variables are missing."
    );
  }

  const plan =
    getPlanDefinition(planInput);

  /*
  ---------------------------------------------------------
   Idempotency

   Never grant the same Paystack reference twice.
  ---------------------------------------------------------
  */

  const previousReference =
    await redisCommand(
      redis.url,
      redis.token,
      [
        "GET",
        proReferenceKey(safeUserId)
      ]
    );

  if (
    reference &&
    previousReference ===
      clean(reference)
  ) {
    const existing =
      await getProStatus(
        safeUserId,
        redis
      );

    return {
      ...existing,
      alreadyActivated: true
    };
  }

  const now =
    Math.floor(Date.now() / 1000);

  /*
  ---------------------------------------------------------
   A newly purchased plan starts a fresh entitlement.
  ---------------------------------------------------------
  */

  const expiresAt =
    now + plan.durationSeconds;

  const ttl =
    plan.durationSeconds;

  await Promise.all([
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

    redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        proPlanKey(safeUserId),
        plan.key,
        "EX",
        ttl
      ]
    ),

    redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        proTierKey(safeUserId),
        plan.tier,
        "EX",
        ttl
      ]
    ),

    redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        proIntervalKey(safeUserId),
        plan.interval,
        "EX",
        ttl
      ]
    ),

    redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        proAmountKey(safeUserId),
        plan.amount,
        "EX",
        ttl
      ]
    ),

    redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        proCreditsKey(safeUserId),
        plan.credits,
        "EX",
        ttl
      ]
    ),

    redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        proCreditsTotalKey(safeUserId),
        plan.credits,
        "EX",
        ttl
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
        ttl
      ]
    ),

    email
      ? redisCommand(
          redis.url,
          redis.token,
          [
            "SET",
            proEmailKey(safeUserId),
            clean(email).toLowerCase(),
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
            proReferenceKey(safeUserId),
            clean(reference),
            "EX",
            ttl
          ]
        )
      : Promise.resolve(null)
  ]);

  return {
    active: true,

    userId: safeUserId,

    plan: plan.key,

    planTier: plan.tier,

    planName: plan.name,

    interval: plan.interval,

    amount: plan.amount,

    currency: plan.currency,

    expiresAt,

    proCredits: plan.credits,

    proCreditsRemaining: plan.credits
  };
}

/*
===========================================================
 GET PRO STATUS
===========================================================
*/

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
      expiresAt: null,
      proCredits: 0,
      plan: null,
      planTier: null
    };
  }

  try {
    const status =
      await redisCommand(
        redis.url,
        redis.token,
        [
          "GET",
          proKey(safeUserId)
        ]
      );

    const active =
      status === "active" ||
      status === "true";

    if (!active) {
      return {
        active: false,
        expiresAt: null,
        proCredits: 0,
        plan: null,
        planTier: null
      };
    }

    const expiresValue =
      await redisCommand(
        redis.url,
        redis.token,
        [
          "GET",
          proExpiryKey(safeUserId)
        ]
      );

    const expiresAt =
      Number(expiresValue);

    if (
      !Number.isFinite(expiresAt) ||
      expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      return {
        active: false,
        expiresAt: null,
        proCredits: 0,
        plan: null,
        planTier: null
      };
    }

    const [
      plan,
      tier,
      interval,
      amount,
      credits,
      total
    ] = await Promise.all([
      redisCommand(
        redis.url,
        redis.token,
        ["GET", proPlanKey(safeUserId)]
      ),

      redisCommand(
        redis.url,
        redis.token,
        ["GET", proTierKey(safeUserId)]
      ),

      redisCommand(
        redis.url,
        redis.token,
        ["GET", proIntervalKey(safeUserId)]
      ),

      redisCommand(
        redis.url,
        redis.token,
        ["GET", proAmountKey(safeUserId)]
      ),

      redisCommand(
        redis.url,
        redis.token,
        ["GET", proCreditsKey(safeUserId)]
      ),

      redisCommand(
        redis.url,
        redis.token,
        ["GET", proCreditsTotalKey(safeUserId)]
      )
    ]);

    const definition =
      getPlanDefinition(
        plan || "PRO_WEEKLY"
      );

    const proCredits =
      Math.max(
        0,
        Number.isFinite(Number(credits))
          ? Number(credits)
          : definition.credits
      );

    const proCreditsTotal =
      Math.max(
        1,
        Number.isFinite(Number(total))
          ? Number(total)
          : definition.credits
      );

    return {
      active: true,

      expiresAt,

      proCredits,

      proCreditsRemaining:
        proCredits,

      proCreditsTotal,

      plan:
        plan || definition.key,

      planTier:
        tier || definition.tier,

      planName:
        definition.name,

      interval:
        interval || definition.interval,

      amount:
        Number(amount) ||
        definition.amount,

      currency:
        definition.currency
    };
  } catch (error) {
    console.error(
      "getProStatus error:",
      error
    );

    return {
      active: false,
      expiresAt: null,
      proCredits: 0,
      plan: null,
      planTier: null
    };
  }
}

/*
===========================================================
 SPEND CREDIT
===========================================================
*/

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
  ---------------------------------------------------------
   PRO USERS
  ---------------------------------------------------------
  */

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
            proCreditsKey(safeUserId)
          ]
        )
      );

    if (
      !Number.isFinite(current) ||
      current <= 0
    ) {
      return {
        success: false,
        balance: 0,
        proCredits: 0,
        creditType: "pro",
        proActive: true,
        plan: pro.plan,
        planTier: pro.planTier,
        reason: "no_pro_credits",
        upgradeRequired: true
      };
    }

    const result =
      Number(
        await redisCommand(
          redis.url,
          redis.token,
          [
            "DECR",
            proCreditsKey(safeUserId)
          ]
        )
      );

    if (result < 0) {
      await redisCommand(
        redis.url,
        redis.token,
        [
          "INCR",
          proCreditsKey(safeUserId)
        ]
      );

      return {
        success: false,
        balance: 0,
        proCredits: 0,
        creditType: "pro",
        proActive: true,
        plan: pro.plan,
        planTier: pro.planTier,
        reason: "no_pro_credits",
        upgradeRequired: true
      };
    }

    return {
      success: true,

      balance: result,

      proCredits: result,

      creditType: "pro",

      proActive: true,

      plan: pro.plan,

      planTier: pro.planTier,

      usedCredit: true,

      upgradeRequired: false
    };
  }

  /*
  ---------------------------------------------------------
   FREE USERS
  ---------------------------------------------------------
  */

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
      creditType: "free",
      proActive: false,
      upgradeRequired: true,
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
          freeBalanceKey(safeUserId)
        ]
      )
    );

  if (result < 0) {
    await redisCommand(
      redis.url,
      redis.token,
      [
        "INCR",
        freeBalanceKey(safeUserId)
      ]
    );

    return {
      success: false,
      balance: 0,
      reason: "no_free_credits",
      creditType: "free",
      proActive: false,
      upgradeRequired: true,
      resetAt: free.resetAt
    };
  }

  return {
    success: true,

    balance: result,

    proCredits: null,

    creditType: "free",

    proActive: false,

    usedCredit: true,

    upgradeRequired: false,

    resetAt: free.resetAt
  };
}

/*
===========================================================
 REFUND CREDIT
===========================================================
*/

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

  /*
  ---------------------------------------------------------
   Refund Pro generation
  ---------------------------------------------------------
  */

  if (pro.active) {
    const current =
      Number(
        await redisCommand(
          redis.url,
          redis.token,
          [
            "GET",
            proCreditsKey(safeUserId)
          ]
        )
      );

    const total =
      Number(pro.proCreditsTotal);

    if (!Number.isFinite(current)) {
      return {
        success: false,
        balance: 0
      };
    }

    const maximum =
      Number.isFinite(total) &&
      total > 0
        ? total
        : current + 1;

    if (current >= maximum) {
      return {
        success: true,
        balance: maximum,
        proCredits: maximum,
        creditType: "pro"
      };
    }

    const newBalance =
      Number(
        await redisCommand(
          redis.url,
          redis.token,
          [
            "INCR",
            proCreditsKey(safeUserId)
          ]
        )
      );

    return {
      success: true,

      balance:
        Math.min(
          maximum,
          Math.max(
            0,
            newBalance
          )
        ),

      proCredits:
        Math.min(
          maximum,
          Math.max(
            0,
            newBalance
          )
        ),

      creditType: "pro"
    };
  }

  /*
  ---------------------------------------------------------
   Refund free generation
  ---------------------------------------------------------
  */

  const key =
    freeBalanceKey(safeUserId);

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
    Number(
      await redisCommand(
        redis.url,
        redis.token,
        [
          "INCR",
          key
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

    creditType: "free"
  };
}

/*
===========================================================
 GET /api/credits
===========================================================
*/

export default async function handler(
  req,
  res
) {
  res.setHeader(
    "Cache-Control",
    "no-store, max-age=0"
  );

  res.setHeader(
    "X-Content-Type-Options",
    "nosniff"
  );

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

  try {
    /*
    -------------------------------------------------------
     Authenticate the actual Supabase user.
    -------------------------------------------------------
    */

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

    /*
    -------------------------------------------------------
     Get Pro status.
    -------------------------------------------------------
    */

    const pro =
      await getProStatus(
        userId,
        redis
      );

    const now =
      Math.floor(Date.now() / 1000);

    /*
    -------------------------------------------------------
     ACTIVE PRO RESPONSE
    -------------------------------------------------------
    */

    if (pro.active) {
      const proSecondsRemaining =
        Math.max(
          0,
          Number(pro.expiresAt) - now
        );

      return send(res, 200, {
        success: true,

        proActive: true,

        proExpiresAt:
          pro.expiresAt,

        proSecondsRemaining,

        plan:
          pro.plan,

        planTier:
          pro.planTier,

        planName:
          pro.planName,

        interval:
          pro.interval,

        amount:
          pro.amount,

        currency:
          pro.currency,

        proCredits:
          pro.proCredits,

        proCreditsTotal:
          pro.proCreditsTotal,

        credits:
          pro.proCredits,

        total:
          pro.proCreditsTotal,

        freeTrial: false,

        freeTrialRemaining: 0,

        upgradeRequired:
          pro.proCredits <= 0,

        resetAt: null,

        secondsUntilReset: null,

        creditType: "pro",

        message:
          pro.proCredits > 0
            ? `${pro.planName} is active.`
            : "Your OBITREND Pro credits are finished."
      });
    }

    /*
    -------------------------------------------------------
     FREE RESPONSE
    -------------------------------------------------------
    */

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

    return send(res, 200, {
      success: true,

      proActive: false,

      proExpiresAt: null,

      proSecondsRemaining: null,

      plan: null,

      planTier: null,

      planName: null,

      interval: null,

      amount: null,

      currency: null,

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
          ? `You have ${free.balance} free generation(s) remaining this week.`
          : "Your weekly free generations are finished. Upgrade to OBITREND Pro to continue."
    });
  } catch (error) {
    console.error(
      "OBITREND credits API error:",
      error
    );

    return send(res, 500, {
      success: false,
      error:
        "Unable to load your OBITREND credits right now."
    });
  }
}
