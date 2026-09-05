// =====================================================
// OBITREND AI FASHION CREATOR
// SERVER-SIDE AUTH + SUBSCRIPTIONS + CREDITS
//
// FLOW
//
// LOGIN
//   ↓
// AUTHENTICATE SUPABASE USER
//   ↓
// CHECK SUBSCRIPTION
//   ↓
// CHECK CREDIT
//   ↓
// CREDIT AVAILABLE?
//   ├── NO → STOP → UPGRADE
//   │
//   └── YES
//        ↓
//     DEDUCT 1 CREDIT
//        ↓
//     GENERATE IMAGE
//        ↓
//     SUCCESS → CREDIT STAYS SPENT
//        ↓
//     OPENAI FAILURE → REFUND 1 CREDIT
//
// PLANS
//
// 4 DAYS    = ₦10,000 = 5 CREDITS
// 8 DAYS    = ₦20,000 = 10 CREDITS
// 14 DAYS   = ₦30,000 = LIMITED PRO
// MONTHLY   = ₦60,000 = FULL PRO
//
// =====================================================

const FREE_CREDITS = 3;
const FREE_PERIOD_SECONDS =
  7 * 24 * 60 * 60;

// =====================================================
// EXACT PAID PLAN SETTINGS
// =====================================================

const PLAN_CONFIG = {
  "4day": {
    name: "4 Day",
    price: 10000,
    durationSeconds: 4 * 24 * 60 * 60,

    // EXACTLY 5 CREDITS
    credits: 5,

    pro: false,
    fullPro: false,

    featureLevel: "small"
  },

  "8day": {
    name: "8 Day",
    price: 20000,
    durationSeconds: 8 * 24 * 60 * 60,

    // EXACTLY 10 CREDITS
    credits: 10,

    pro: false,
    fullPro: false,

    featureLevel: "small"
  },

  "14day": {
    name: "14 Day",
    price: 30000,
    durationSeconds: 14 * 24 * 60 * 60,

    /*
    -------------------------------------------------------
    YOU SAID "HAVE FEW".

    Set the exact number you want here.
    -------------------------------------------------------
    */
    credits: Number(
      process.env.OBITREND_14DAY_CREDITS || 15
    ),

    pro: true,
    fullPro: false,

    featureLevel: "limited_pro"
  },

  monthly: {
    name: "Monthly",
    price: 60000,

    durationSeconds:
      30 * 24 * 60 * 60,

    /*
    -------------------------------------------------------
    Monthly is FULL PRO.

    Set the exact monthly generation allowance with:
    OBITREND_MONTHLY_CREDITS

    If you want unlimited generation, that should be a
    separate explicit business rule rather than being
    accidentally created by the credit system.
    -------------------------------------------------------
    */
    credits: Number(
      process.env.OBITREND_MONTHLY_CREDITS || 30
    ),

    pro: true,
    fullPro: true,

    featureLevel: "full_pro"
  }
};

// =====================================================
// BACKWARD COMPATIBILITY
// =====================================================

const PRO_CREDITS =
  PLAN_CONFIG.monthly.credits;

const PRO_SECONDS =
  7 * 24 * 60 * 60;

function send(
  res,
  status,
  data
) {
  return res
    .status(status)
    .json(data);
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

async function redisCommand(
  url,
  token,
  command
) {
  if (!url || !token) {
    throw new Error(
      "Redis is not configured."
    );
  }

  const response =
    await fetch(
      `${url.replace(
        /\/$/,
        ""
      )}/${command
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
    data =
      await response.json();
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
// USER
// =====================================================

function cleanUserId(value) {
  return String(
    value || ""
  )
    .trim()
    .replace(
      /[^a-zA-Z0-9_-]/g,
      ""
    )
    .slice(0, 100);
}

// =====================================================
// SUPABASE
// =====================================================

function getSupabaseUrl() {
  return String(
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ""
  )
    .trim()
    .replace(
      /\/+$/,
      ""
    );
}

function getSupabaseKey() {
  return String(
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env
      .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env
      .NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ""
  ).trim();
}

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

// =====================================================
// AUTHENTICATE CURRENT USER
// =====================================================

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
        "Sign-in is temporarily unavailable. Please try again."
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
      cleanUserId(
        data?.id
      );

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
          "Your login session has expired. Please sign in again."
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
        "Unable to verify your login right now. Please try again."
    };
  }
}

// =====================================================
// REDIS KEYS
// =====================================================

function balanceKey(
  userId
) {
  return `obitrend:credits:${userId}`;
}

function resetKey(
  userId
) {
  return `obitrend:credits:reset:${userId}`;
}

function proKey(
  userId
) {
  return `obitrend:pro:${userId}`;
}

function proExpiryKey(
  userId
) {
  return `obitrend:pro:expiry:${userId}`;
}

function proEmailKey(
  userId
) {
  return `obitrend:pro:email:${userId}`;
}

function proReferenceKey(
  userId
) {
  return `obitrend:pro:reference:${userId}`;
}

function proBalanceKey(
  userId
) {
  return `obitrend:pro:credits:${userId}`;
}

function proCreditsExpiryKey(
  userId
) {
  return `obitrend:pro:credits:expiry:${userId}`;
}

function proPlanKey(
  userId
) {
  return `obitrend:pro:plan:${userId}`;
}

function proFeatureKey(
  userId
) {
  return `obitrend:pro:feature:${userId}`;
}

function proPriceKey(
  userId
) {
  return `obitrend:pro:price:${userId}`;
}

// =====================================================
// PLAN RESOLUTION
// =====================================================

function normalizePlan(
  value
) {
  const plan =
    String(
      value || ""
    )
      .trim()
      .toLowerCase()
      .replace(
        /\s+/g,
        ""
      );

  if (
    plan === "4" ||
    plan === "4day" ||
    plan === "4days"
  ) {
    return "4day";
  }

  if (
    plan === "8" ||
    plan === "8day" ||
    plan === "8days"
  ) {
    return "8day";
  }

  if (
    plan === "14" ||
    plan === "14day" ||
    plan === "14days"
  ) {
    return "14day";
  }

  if (
    plan === "monthly" ||
    plan === "month" ||
    plan === "30day" ||
    plan === "30days"
  ) {
    return "monthly";
  }

  return "";
}

function planFromDuration(
  durationSeconds
) {
  const seconds =
    Number(
      durationSeconds
    );

  if (
    seconds ===
    PLAN_CONFIG[
      "4day"
    ].durationSeconds
  ) {
    return "4day";
  }

  if (
    seconds ===
    PLAN_CONFIG[
      "8day"
    ].durationSeconds
  ) {
    return "8day";
  }

  if (
    seconds ===
    PLAN_CONFIG[
      "14day"
    ].durationSeconds
  ) {
    return "14day";
  }

  if (
    seconds ===
    PLAN_CONFIG[
      "monthly"
    ].durationSeconds
  ) {
    return "monthly";
  }

  return "";
}

// =====================================================
// ACTIVATE / RENEW PLAN
// =====================================================

export async function activatePro(
  userId,
  email,
  reference,
  redis,
  durationSeconds = PRO_SECONDS,
  requestedPlan = ""
) {
  const safeUserId =
    cleanUserId(
      userId
    );

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
      "Redis is not configured."
    );
  }

  /*
  -------------------------------------------------------
  Resolve the purchased plan.

  If payment code sends a plan, use it.

  Otherwise preserve compatibility with existing code that
  sends durationSeconds.
  -------------------------------------------------------
  */

  let plan =
    normalizePlan(
      requestedPlan
    );

  if (!plan) {
    plan =
      planFromDuration(
        durationSeconds
      );
  }

  /*
  -------------------------------------------------------
  Existing old weekly Pro calls remain compatible.
  -------------------------------------------------------
  */

  if (!plan) {
    plan = "8day";
  }

  const config =
    PLAN_CONFIG[
      plan
    ];

  const safeReference =
    String(
      reference || ""
    ).trim();

  /*
  -------------------------------------------------------
  PAYMENT IDEMPOTENCY
  -------------------------------------------------------
  */

  if (safeReference) {
    try {
      const existingReference =
        await redisCommand(
          redis.url,
          redis.token,
          [
            "GET",
            proReferenceKey(
              safeUserId
            )
          ]
        );

      if (
        existingReference &&
        String(
          existingReference
        ).trim() ===
          safeReference
      ) {
        return getProStatus(
          safeUserId,
          redis
        );
      }
    } catch {}
  }

  const now =
    Math.floor(
      Date.now() / 1000
    );

  const expiresAt =
    now +
    config.durationSeconds;

  /*
  -------------------------------------------------------
  Store the exact purchased plan.
  -------------------------------------------------------
  */

  await Promise.all([
    redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        proKey(
          safeUserId
        ),
        "active",
        "EX",
        config.durationSeconds
      ]
    ),

    redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        proExpiryKey(
          safeUserId
        ),
        expiresAt,
        "EX",
        config.durationSeconds
      ]
    ),

    redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        proBalanceKey(
          safeUserId
        ),
        config.credits,
        "EX",
        config.durationSeconds
      ]
    ),

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
        config.durationSeconds
      ]
    ),

    redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        proPlanKey(
          safeUserId
        ),
        plan,
        "EX",
        config.durationSeconds
      ]
    ),

    redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        proFeatureKey(
          safeUserId
        ),
        config.featureLevel,
        "EX",
        config.durationSeconds
      ]
    ),

    redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        proPriceKey(
          safeUserId
        ),
        config.price,
        "EX",
        config.durationSeconds
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
            String(
              email
            )
              .trim()
              .toLowerCase(),
            "EX",
            config.durationSeconds
          ]
        )
      : Promise.resolve(null),

    safeReference
      ? redisCommand(
          redis.url,
          redis.token,
          [
            "SET",
            proReferenceKey(
              safeUserId
            ),
            safeReference,
            "EX",
            config.durationSeconds
          ]
        )
      : Promise.resolve(null)
  ]);

  return {
    active: true,

    userId:
      safeUserId,

    plan,

    planName:
      config.name,

    price:
      config.price,

    expiresAt,

    proCredits:
      config.credits,

    proCreditsRemaining:
      config.credits,

    fullPro:
      config.fullPro,

    featureLevel:
      config.featureLevel
  };
}

// =====================================================
// GET PRO STATUS
// =====================================================

export async function getProStatus(
  userId,
  redis
) {
  const safeUserId =
    cleanUserId(
      userId
    );

  if (
    !safeUserId ||
    !redis?.url ||
    !redis?.token
  ) {
    return {
      active: false,
      plan: "free",
      expiresAt: null,
      proCredits: 0,
      proCreditsTotal: 0,
      fullPro: false,
      featureLevel: "free"
    };
  }

  try {
    const status =
      await redisCommand(
        redis.url,
        redis.token,
        [
          "GET",
          proKey(
            safeUserId
          )
        ]
      );

    const isActive =
      status ===
        "active" ||
      status ===
        "true";

    if (!isActive) {
      return {
        active: false,
        plan: "free",
        expiresAt: null,
        proCredits: 0,
        proCreditsTotal: 0,
        fullPro: false,
        featureLevel: "free"
      };
    }

    let expiresAt =
      null;

    try {
      const value =
        await redisCommand(
          redis.url,
          redis.token,
          [
            "GET",
            proExpiryKey(
              safeUserId
            )
          ]
        );

      const n =
        Number(value);

      if (
        Number.isFinite(n) &&
        n > 0
      ) {
        expiresAt = n;
      }
    } catch {}

    if (
      expiresAt ===
      null
    ) {
      try {
        const ttl =
          Number(
            await redisCommand(
              redis.url,
              redis.token,
              [
                "TTL",
                proKey(
                  safeUserId
                )
              ]
            )
          );

        if (
          Number.isFinite(
            ttl
          ) &&
          ttl >= 0
        ) {
          expiresAt =
            Math.floor(
              Date.now() /
                1000
            ) + ttl;
        }
      } catch {}
    }

    const now =
      Math.floor(
        Date.now() / 1000
      );

    if (
      expiresAt !==
        null &&
      expiresAt <= now
    ) {
      await deactivatePro(
        safeUserId,
        redis
      );

      return {
        active: false,
        plan: "free",
        expiresAt: null,
        proCredits: 0,
        proCreditsTotal: 0,
        fullPro: false,
        featureLevel: "free"
      };
    }

    /*
    -------------------------------------------------------
    Read the exact purchased plan.
    -------------------------------------------------------
    */

    let plan =
      normalizePlan(
        await redisCommand(
          redis.url,
          redis.token,
          [
            "GET",
            proPlanKey(
              safeUserId
            )
          ]
        )
      );

    /*
    -------------------------------------------------------
    Backward compatibility with older Pro accounts.
    -------------------------------------------------------
    */

    if (!plan) {
      plan =
        "8day";
    }

    const config =
      PLAN_CONFIG[
        plan
      ] ||
      PLAN_CONFIG[
        "8day"
      ];

    let proCredits =
      0;

    try {
      const raw =
        await redisCommand(
          redis.url,
          redis.token,
          [
            "GET",
            proBalanceKey(
              safeUserId
            )
          ]
        );

      proCredits =
        Math.max(
          0,
          Number(
            raw || 0
          )
        );
    } catch {}

    return {
      active: true,

      plan,

      planName:
        config.name,

      price:
        config.price,

      expiresAt,

      proCredits,

      proCreditsTotal:
        config.credits,

      fullPro:
        config.fullPro,

      featureLevel:
        config.featureLevel
    };
  } catch {
    return {
      active: false,
      plan: "free",
      expiresAt: null,
      proCredits: 0,
      proCreditsTotal: 0,
      fullPro: false,
      featureLevel: "free"
    };
  }
}

// =====================================================
// DEACTIVATE
// =====================================================

export async function deactivatePro(
  userId,
  redis
) {
  const safeUserId =
    cleanUserId(
      userId
    );

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
        proKey(
          safeUserId
        )
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
        proFeatureKey(
          safeUserId
        )
      ]
    ),

    redisCommand(
      redis.url,
      redis.token,
      [
        "DEL",
        proPriceKey(
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
    )
  ]);
}

// =====================================================
// FREE CREDITS
// =====================================================

async function getOrCreateFreeCredits(
  userId,
  redis
) {
  const safeUserId =
    cleanUserId(
      userId
    );

  const balance =
    balanceKey(
      safeUserId
    );

  const reset =
    resetKey(
      safeUserId
    );

  const [
    currentBalance,
    resetAtValue
  ] =
    await Promise.all([
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
    resetAtValue ===
    null
      ? 0
      : Number(
          resetAtValue
        );

  if (
    currentBalance ===
      null ||
    !Number.isFinite(
      resetAt
    ) ||
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
          currentBalance ||
            0
        )
      ),

    total:
      FREE_CREDITS,

    resetAt
  };
}

// =====================================================
// SPEND EXACTLY ONE CREDIT
// =====================================================

export async function spendCredit(
  userId,
  redis
) {
  const safeUserId =
    cleanUserId(
      userId
    );

  if (
    !safeUserId ||
    !redis?.url ||
    !redis?.token
  ) {
    return {
      success: false,
      balance: 0,
      reason:
        "invalid_user"
    };
  }

  /*
  -------------------------------------------------------
  PAID SUBSCRIPTION
  -------------------------------------------------------
  */

  const pro =
    await getProStatus(
      safeUserId,
      redis
    );

  if (
    pro.active
  ) {
    if (
      pro.proCredits <=
      0
    ) {
      return {
        success: false,

        balance: 0,

        reason:
          "no_pro_credits",

        upgradeRequired:
          true,

        proActive:
          true,

        plan:
          pro.plan,

        fullPro:
          pro.fullPro,

        featureLevel:
          pro.featureLevel,

        proCredits:
          0,

        expiresAt:
          pro.expiresAt
      };
    }

    /*
    -----------------------------------------------------
    ATOMIC CREDIT DEDUCTION

    Exactly ONE paid credit.
    -----------------------------------------------------
    */

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
          "INCR",
          proBalanceKey(
            safeUserId
          )
        ]
      );

      return {
        success: false,
        balance: 0,
        reason:
          "no_pro_credits",
        upgradeRequired:
          true,
        proActive:
          true,
        plan:
          pro.plan,
        fullPro:
          pro.fullPro,
        featureLevel:
          pro.featureLevel,
        proCredits:
          0,
        expiresAt:
          pro.expiresAt
      };
    }

    return {
      success: true,

      balance:
        result,

      proCredits:
        result,

      proActive:
        true,

      usedCredit:
        true,

      creditType:
        "pro",

      plan:
        pro.plan,

      fullPro:
        pro.fullPro,

      featureLevel:
        pro.featureLevel,

      expiresAt:
        pro.expiresAt
    };
  }

  /*
  -------------------------------------------------------
  FREE USER
  -------------------------------------------------------
  */

  const free =
    await getOrCreateFreeCredits(
      safeUserId,
      redis
    );

  if (
    free.balance <=
    0
  ) {
    return {
      success: false,

      balance: 0,

      reason:
        "no_free_credits",

      upgradeRequired:
        true,

      proActive:
        false,

      creditType:
        "free",

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

      upgradeRequired:
        true,

      proActive:
        false,

      creditType:
        "free",

      resetAt:
        free.resetAt
    };
  }

  return {
    success: true,

    balance:
      result,

    proCredits:
      null,

    proActive:
      false,

    usedCredit:
      true,

    creditType:
      "free",

    resetAt:
      free.resetAt
  };
}

// =====================================================
// REFUND EXACTLY ONE CREDIT
// =====================================================

export async function refundCredit(
  userId,
  redis,
  creditType = ""
) {
  const safeUserId =
    cleanUserId(
      userId
    );

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

  /*
  -------------------------------------------------------
  PRO REFUND
  -------------------------------------------------------
  */

  if (
    creditType ===
    "pro"
  ) {
    const pro =
      await getProStatus(
        safeUserId,
        redis
      );

    if (
      !pro.active
    ) {
      return {
        success: false,
        balance: 0,
        creditType:
          "pro"
      };
    }

    const current =
      Number(
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

    if (
      !Number.isFinite(
        current
      )
    ) {
      return {
        success: false,
        balance: 0,
        creditType:
          "pro"
      };
    }

    if (
      current >=
      pro.proCreditsTotal
    ) {
      return {
        success: true,

        balance:
          pro.proCreditsTotal,

        proCredits:
          pro.proCreditsTotal,

        creditType:
          "pro"
      };
    }

    const result =
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
      );

    return {
      success: true,

      balance:
        Math.min(
          pro.proCreditsTotal,
          Math.max(
            0,
            result
          )
        ),

      proCredits:
        Math.min(
          pro.proCreditsTotal,
          Math.max(
            0,
            result
          )
        ),

      creditType:
        "pro"
    };
  }

  /*
  -------------------------------------------------------
  FREE REFUND
  -------------------------------------------------------
  */

  if (
    creditType ===
    "free"
  ) {
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
      current ===
      null
    ) {
      return {
        success: false,
        balance: 0,
        creditType:
          "free"
      };
    }

    const currentNumber =
      Number(
        current
      );

    if (
      !Number.isFinite(
        currentNumber
      )
    ) {
      return {
        success: false,
        balance: 0,
        creditType:
          "free"
      };
    }

    if (
      currentNumber >=
      FREE_CREDITS
    ) {
      return {
        success: true,
        balance:
          FREE_CREDITS,
        creditType:
          "free"
      };
    }

    const result =
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
            result
          )
        ),

      creditType:
        "free"
    };
  }

  /*
  -------------------------------------------------------
  BACKWARD COMPATIBILITY
  -------------------------------------------------------
  */

  const pro =
    await getProStatus(
      safeUserId,
      redis
    );

  if (
    pro.active
  ) {
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
// GET CREDITS / SUBSCRIPTION
// =====================================================

export default async function handler(
  req,
  res
) {
  if (
    req.method !==
    "GET"
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
          "This request cannot be completed."
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
          "OBITREND credits are temporarily unavailable. Please try again."
      }
    );
  }

  try {
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

    /*
    -------------------------------------------------------
    ACTIVE PAID PLAN
    -------------------------------------------------------
    */

    if (
      pro.active
    ) {
      const seconds =
        pro.expiresAt ===
        null
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

          proActive:
            true,

          plan:
            pro.plan,

          planName:
            pro.planName,

          price:
            pro.price,

          fullPro:
            pro.fullPro,

          featureLevel:
            pro.featureLevel,

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

          freeTrial:
            false,

          freeTrialRemaining:
            0,

          upgradeRequired:
            pro.proCredits <=
            0,

          resetAt:
            null,

          secondsUntilReset:
            null,

          creditType:
            "pro",

          message:
            pro.proCredits >
            0
              ? `${pro.planName} is active.`
              : "Your subscription credits are finished. Please upgrade."
        }
      );
    }

    /*
    -------------------------------------------------------
    FREE USER
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
        Number(
          free.resetAt ||
            0
        ) - now
      );

    return send(
      res,
      200,
      {
        success: true,

        proActive:
          false,

        plan:
          "free",

        planName:
          "Free",

        price:
          0,

        fullPro:
          false,

        featureLevel:
          "free",

        proExpiresAt:
          null,

        proSecondsRemaining:
          null,

        proCredits:
          0,

        proCreditsTotal:
          0,

        credits:
          free.balance,

        total:
          free.total,

        freeTrial:
          true,

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
          free.balance <=
          0,

        creditType:
          "free",

        message:
          free.balance >
          0
            ? `You have ${free.balance} free generation(s) remaining.`
            : "Your free generations are finished. Upgrade to continue."
      }
    );
  } catch {
    return send(
      res,
      500,
      {
        success: false,
        error:
          "Unable to load your OBITREND credits right now."
      }
    );
  }
}
