import {
  getAuthenticatedUser,
  getProStatus,
  getRedisConfig,
} from "../lib/credits.js";

const FREE_CREDITS = 3;
const FREE_PERIOD_SECONDS = 7 * 24 * 60 * 60;

function send(res, status, body) {
  return res.status(status).json(body);
}

async function redisGet(url, token, key) {
  if (!url || !token) return null;

  const response = await fetch(
    `${url}/GET/${encodeURIComponent(key)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) return null;

  const data =
    await response.json().catch(() => null);

  return data?.result ?? null;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return send(res, 405, {
      success: false,
      error: "Method not allowed.",
    });
  }

  try {
    const auth =
      await getAuthenticatedUser(req);

    if (!auth.ok) {
      return send(
        res,
        auth.status || 401,
        {
          success: false,
          error:
            auth.error ||
            "Please sign in to continue.",
        }
      );
    }

    const userId = auth.user.id;
    const redis = getRedisConfig();

    const now =
      Math.floor(Date.now() / 1000);

    /*
     * PRO CREDITS
     */
    const pro =
      await getProStatus(
        userId,
        redis
      );

    if (
      pro?.active &&
      !pro?.expired
    ) {
      const proCredits =
        Math.max(
          0,
          Math.floor(
            Number(
              pro.proCredits ?? 0
            )
          )
        );

      const expiresAt =
        Number(
          pro.expiresAt ?? 0
        );

      const secondsRemaining =
        Math.max(
          0,
          expiresAt - now
        );

      return send(res, 200, {
        success: true,

        credits:
          proCredits,

        balance:
          proCredits,

        remaining:
          proCredits,

        proCredits:
          proCredits,

        proCreditsRemaining:
          proCredits,

        proCreditsTotal:
          Number(
            pro.proCreditsTotal ?? 0
          ),

        plan:
          pro.plan ?? null,

        expiresAt:
          expiresAt || null,

        secondsRemaining,

        remainingSeconds:
          secondsRemaining,

        timeRemaining:
          secondsRemaining,

        freeCredits: 0,

        source: "pro",
      });
    }

    /*
     * FREE CREDITS
     */
    const freeBalanceRaw =
      await redisGet(
        redis.url,
        redis.token,
        `obitrend:credits:${userId}`
      );

    const freeResetRaw =
      await redisGet(
        redis.url,
        redis.token,
        `obitrend:credits:reset:${userId}`
      );

    let freeCredits =
      Number(
        freeBalanceRaw
      );

    let resetAt =
      Number(
        freeResetRaw
      );

    if (
      !Number.isFinite(
        freeCredits
      )
    ) {
      freeCredits = 0;
    }

    if (
      !Number.isFinite(
        resetAt
      )
    ) {
      resetAt = 0;
    }

    freeCredits =
      Math.max(
        0,
        Math.min(
          FREE_CREDITS,
          Math.floor(
            freeCredits
          )
        )
      );

    const secondsRemaining =
      Math.max(
        0,
        resetAt - now
      );

    return send(res, 200, {
      success: true,

      credits:
        freeCredits,

      balance:
        freeCredits,

      remaining:
        freeCredits,

      proCredits: 0,

      proCreditsRemaining: 0,

      proCreditsTotal: 0,

      plan: null,

      expiresAt:
        resetAt || null,

      secondsRemaining,

      remainingSeconds:
        secondsRemaining,

      timeRemaining:
        secondsRemaining,

      freeCredits,

      source: "free",
    });

  } catch (error) {

    console.error(
      "OBITREND credits endpoint error:",
      error
    );

    return send(res, 500, {
      success: false,
      error:
        "Unable to load credits right now.",
    });
  }
}
