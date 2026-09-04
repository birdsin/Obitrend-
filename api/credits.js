// =====================================================
// OBITREND AI FASHION CREATOR
// COMPLETE PRO + FREE CREDIT SYSTEM
// =====================================================

const FREE_CREDITS = 3;

// Pro receives 30 premium generations for each paid
// 7-day Pro period.
const PRO_CREDITS = Math.max(
  1,
  Number(process.env.PAYSTACK_PRO_CREDITS || 30)
);

const FREE_PERIOD_SECONDS =
  7 * 24 * 60 * 60;

const PRO_SECONDS =
  7 * 24 * 60 * 60;


// =====================================================
// RESPONSE
// =====================================================

function send(res, status, data) {
  return res.status(status).json(data);
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

  if (
    !response.ok ||
    !data ||
    data.error
  ) {
    throw new Error(
      data?.error ||
      `Redis request failed (${response.status}).`
    );
  }

  return data.result;
}


// =====================================================
// USER
// =====================================================

function cleanUserId(value) {
  return String(value || "")
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


// =====================================================
// AUTHENTICATION
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


// =====================================================
// REDIS KEYS
// =====================================================

function balanceKey(userId) {
  return `obitrend:credits:${userId}`;
}


function resetKey(userId) {
  return `obitrend:credits-reset:${userId}`;
}


function proKey(userId) {
  return `obitrend:pro:${userId}`;
}


function proExpiryKey(userId) {
  return `obitrend:pro-expiry:${userId}`;
}


function proBalanceKey(userId) {
  return `obitrend:pro-credits:${userId}`;
}


function proEmailKey(userId) {
  return `obitrend:pro-email:${userId}`;
}


function proReferenceKey(userId) {
  return `obitrend:pro-reference:${userId}`;
}


// =====================================================
// ACTIVATE PRO
// =====================================================

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

  if (
    !redis?.url ||
    !redis?.token
  ) {
    throw new Error(
      "Redis environment variables are missing."
    );
  }

  const now =
    Math.floor(
      Date.now() / 1000
    );

  const expiresAt =
    now + PRO_SECONDS;

  /*
   * IMPORTANT:
   *
   * Payment success activates:
   *
   * 1. Pro
   * 2. 7-day expiry
   * 3. 30 Pro credits
   *
   * Free credits remain separate.
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
        PRO_SECONDS
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
        PRO_SECONDS
      ]
    ),

    redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        proBalanceKey(safeUserId),
        PRO_CREDITS,
        "EX",
        PRO_SECONDS
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
            PRO_SECONDS
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
            PRO_SECONDS
          ]
        )
      : Promise.resolve(null)
  ]);

  return {
    active: true,

    userId:
      safeUserId,

    expiresAt,

    proCredits:
      PRO_CREDITS,

    proCreditsRemaining:
      PRO_CREDITS
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
      proCreditsTotal:
        PRO_CREDITS
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

    const isActive =
      status === "active" ||
      status === "true";

    if (!isActive) {
      return {
        active: false,
        expiresAt: null,
        proCredits: 0,
        proCreditsTotal:
          PRO_CREDITS
      };
    }

    let expiresAt = null;

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

      const number =
        Number(value);

      if (
        Number.isFinite(number) &&
        number > 0
      ) {
        expiresAt =
          number;
      }

    } catch {}


    /*
     * Fallback to Redis TTL if the
     * expiry timestamp is missing.
     */

    if (
      expiresAt === null
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
          Number.isFinite(ttl) &&
          ttl >= 0
        ) {
          expiresAt =
            Math.floor(
              Date.now() / 1000
            ) + ttl;
        }

      } catch {}
    }


    const now =
      Math.floor(
        Date.now() / 1000
      );

    /*
     * Pro expires from SERVER TIME.
     */

    if (
      expiresAt !== null &&
      expiresAt <= now
    ) {
      await deactivatePro(
        safeUserId,
        redis
      );

      return {
        active: false,
        expiresAt: null,
        proCredits: 0,
        proCreditsTotal:
          PRO_CREDITS
      };
    }


    let proCredits = 0;

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
          Number(raw || 0)
        );

    } catch {}


    return {
      active: true,

      expiresAt,

      proCredits,

      proCreditsTotal:
        PRO_CREDITS
    };

  } catch (error) {
    console.error(
      "OBITREND Pro status check failed:",
      error
    );

    return {
      active: false,
      expiresAt: null,
      proCredits: 0,
      proCreditsTotal:
        PRO_CREDITS
    };
  }
}


// =====================================================
// DEACTIVATE PRO
// =====================================================

export async function deactivatePro(
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
    cleanUserId(userId);

  const balance =
    balanceKey(safeUserId);

  const reset =
    resetKey(safeUserId);

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
          currentBalance || 0
        )
      ),

    total:
      FREE_CREDITS,

    resetAt
  };
}


// =====================================================
// SPEND CREDIT
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
      reason:
        "invalid_user"
    };
  }


  /*
   * ALWAYS check Pro first.
   */

  const pro =
    await getProStatus(
      safeUserId,
      redis
    );


  /*
   * PRO USER
   */

  if (pro.active) {

    /*
     * Pro has its own credit balance.
     *
     * Free credits are NOT consumed.
     */

    if (
      pro.proCredits <= 0
    ) {
      return {
        success: false,

        balance: 0,

        proCredits: 0,

        reason:
          "no_pro_credits",

        upgradeRequired:
          true,

        proActive:
          true,

        expiresAt:
          pro.expiresAt,

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
            "DECR",
            proBalanceKey(
              safeUserId
            )
          ]
        )
      );


    /*
     * Never allow negative Pro credits.
     */

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
        proCredits: 0,
        reason:
          "no_pro_credits",
        upgradeRequired:
          true,
        proActive:
          true,
        expiresAt:
          pro.expiresAt,
        creditType:
          "pro"
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

      expiresAt:
        pro.expiresAt
    };
  }


  /*
   * FREE USER
   */

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

      upgradeRequired:
        true,

      proActive:
        false,

      resetAt:
        free.resetAt,

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

      resetAt:
        free.resetAt,

      creditType:
        "free"
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
// REFUND CREDIT
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


  /*
   * Refund Pro credit if the
   * generation failed for a Pro user.
   */

  if (pro.active) {
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
        balance: 0
      };
    }


    if (
      current >= PRO_CREDITS
    ) {
      return {
        success: true,

        balance:
          PRO_CREDITS,

        proCredits:
          PRO_CREDITS,

        creditType:
          "pro"
      };
    }


    const newBalance =
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
          PRO_CREDITS,
          Math.max(
            0,
            newBalance
          )
        ),

      proCredits:
        Math.min(
          PRO_CREDITS,
          Math.max(
            0,
            newBalance
          )
        ),

      creditType:
        "pro"
    };
  }


  /*
   * Refund free credit.
   */

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
    currentNumber >= FREE_CREDITS
  ) {
    return {
      success: true,
      balance:
        FREE_CREDITS,
      creditType:
        "free"
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

    balance:
      Math.min(
        FREE_CREDITS,
        Math.max(
          0,
          Number(
            newBalance
          )
        )
      ),

    creditType:
      "free"
  };
}


// =====================================================
// GET /api/credits
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
     * =================================================
     * PRO RESPONSE
     * =================================================
     */

    if (
      pro.active
    ) {
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

          proActive:
            true,

          active:
            true,

          proExpiresAt:
            pro.expiresAt,

          expiresAt:
            pro.expiresAt,

          proSecondsRemaining:
            seconds,

          proCredits:
            pro.proCredits,

          proCreditsTotal:
            PRO_CREDITS,

          /*
           * For the dashboard, credits means
           * the CURRENT Pro credit balance.
           */

          credits:
            pro.proCredits,

          balance:
            pro.proCredits,

          total:
            PRO_CREDITS,

          freeTrial:
            false,

          freeTrialRemaining:
            0,

          resetAt:
            null,

          secondsUntilReset:
            null,

          creditType:
            "pro",

          upgradeRequired:
            pro.proCredits <= 0,

          message:
            pro.proCredits > 0
              ? "OBITREND Pro is active."
              : "Your OBITREND Pro premium credits are finished."
        }
      );
    }


    /*
     * =================================================
     * FREE RESPONSE
     * =================================================
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
          free.resetAt || 0
        ) - now
      );


    return send(
      res,
      200,
      {
        success: true,

        proActive:
          false,

        active:
          false,

        proExpiresAt:
          null,

        expiresAt:
          null,

        proSecondsRemaining:
          null,

        proCredits:
          0,

        proCreditsTotal:
          PRO_CREDITS,

        credits:
          free.balance,

        balance:
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

        creditType:
          "free",

        upgradeRequired:
          free.balance <= 0,

        message:
          free.balance > 0
            ? `You have ${free.balance} free generation(s) remaining this week.`
            : "Your weekly free generations are finished. Upgrade to OBITREND Pro to continue."
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
