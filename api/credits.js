/**
 * OBITREND AI FASHION CREATOR
 * Weekly server-side credits
 *
 * 100 generations / 7 days
 *
 * Uses your existing Upstash Redis variables.
 */

const WEEK_SECONDS = 7 * 24 * 60 * 60;
const WEEKLY_CREDITS = 100;

function send(res, status, data) {
  return res.status(status).json(data);
}

function getRedisConfig() {
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

function balanceKey(userId) {
  return `obitrend:credits:${userId}`;
}

function expiryKey(userId) {
  return `obitrend:credits:expiry:${userId}`;
}

async function getOrCreateCredits(userId, redis) {
  const key = balanceKey(userId);
  const expiresKey = expiryKey(userId);

  let balance = await redisCommand(
    redis.url,
    redis.token,
    ["GET", key]
  );

  let expiresAt = await redisCommand(
    redis.url,
    redis.token,
    ["GET", expiresKey]
  );

  const now = Math.floor(Date.now() / 1000);

  /*
   * New user or expired weekly period.
   */
  if (
    balance === null ||
    expiresAt === null ||
    Number(expiresAt) <= now
  ) {
    balance = WEEKLY_CREDITS;
    expiresAt = now + WEEK_SECONDS;

    await redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        key,
        balance,
        "EX",
        WEEK_SECONDS
      ]
    );

    await redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        expiresKey,
        expiresAt,
        "EX",
        WEEK_SECONDS
      ]
    );
  } else {
    balance = Math.max(0, Number(balance));
    expiresAt = Number(expiresAt);
  }

  return {
    balance,
    total: WEEKLY_CREDITS,
    expiresAt
  };
}
async function spendCredit(userId, redis) {
  const key = balanceKey(userId);

  const current = await redisCommand(
    redis.url,
    redis.token,
    [
      "GET",
      key
    ]
  );

  const balance = Number(current || 0);

  if (balance <= 0) {
    return {
      success: false,
      balance: 0
    };
  }

  const newBalance = await redisCommand(
    redis.url,
    redis.token,
    [
      "DECR",
      key
    ]
  );

  return {
    success: true,
    balance: Number(newBalance)
  };
}
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");

    return send(res, 405, {
      success: false,
      error: "Method not allowed."
    });
  }

  const redis = getRedisConfig();

  if (!redis.url || !redis.token) {
    return send(res, 500, {
      success: false,
      error:
        "Redis environment variables are missing in Vercel."
    });
  }

  const userId = cleanUserId(
    req.query?.userId
  );

  if (!userId || userId.length < 8) {
    return send(res, 400, {
      success: false,
      error: "A valid userId is required."
    });
  }

  try {
    const credits = await getOrCreateCredits(
      userId,
      redis
    );

    return send(res, 200, {
      success: true,
      credits: credits.balance,
      total: credits.total,
      expiresAt: credits.expiresAt
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
