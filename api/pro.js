/**
 * OBITREND PRO ENTITLEMENT API
 *
 * Stores verified Pro access server-side in Upstash Redis.
 *
 * Required Vercel environment variables:
 *
 * KV_REST_API_URL
 * KV_REST_API_TOKEN
 *
 * or:
 *
 * UPSTASH_REDIS_REST_URL
 * UPSTASH_REDIS_REST_TOKEN
 */

const PRO_SECONDS = 7 * 24 * 60 * 60;

function send(res, status, data) {
  return res.status(status).json(data);
}

function clean(value) {
  return String(value || "")
    .trim()
    .slice(0, 200);
}

function cleanUserId(value) {
  return clean(value)
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 100);
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
    `${url}/${command
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

function proKey(userId) {
  return `obitrend:pro:${userId}`;
}

function referenceKey(userId) {
  return `obitrend:pro:reference:${userId}`;
}

function emailKey(userId) {
  return `obitrend:pro:email:${userId}`;
}

/**
 * Save verified Pro access.
 */
async function activatePro(
  userId,
  reference,
  email,
  redis
) {
  const key = proKey(userId);

  const expiresAt =
    Math.floor(Date.now() / 1000) +
    PRO_SECONDS;

  await redisCommand(
    redis.url,
    redis.token,
    [
      "SET",
      key,
      "true",
      "EX",
      PRO_SECONDS
    ]
  );

  if (reference) {
    await redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        referenceKey(userId),
        reference,
        "EX",
        PRO_SECONDS
      ]
    );
  }

  if (email) {
    await redisCommand(
      redis.url,
      redis.token,
      [
        "SET",
        emailKey(userId),
        email,
        "EX",
        PRO_SECONDS
      ]
    );
  }

  return {
    active: true,
    expiresAt
  };
}

/**
 * Read current Pro access.
 */
async function getPro(
  userId,
  redis
) {
  const active = await redisCommand(
    redis.url,
    redis.token,
    [
      "GET",
      proKey(userId)
    ]
  );

  const reference = await redisCommand(
    redis.url,
    redis.token,
    [
      "GET",
      referenceKey(userId)
    ]
  );

  const email = await redisCommand(
    redis.url,
    redis.token,
    [
      "GET",
      emailKey(userId)
    ]
  );

  return {
    active: active === "true",
    reference: reference || "",
    email: email || ""
  };
}

export default async function handler(
  req,
  res
) {
  const redis = getRedisConfig();

  if (!redis.url || !redis.token) {
    return send(res, 500, {
      success: false,
      error:
        "Redis environment variables are missing in Vercel."
    });
  }

  try {

    /* =====================================================
       GET — CHECK PRO STATUS
    ===================================================== */

    if (req.method === "GET") {

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

      const pro =
        await getPro(
          userId,
          redis
        );

      return send(res, 200, {
        success: true,
        pro: pro.active,
        active: pro.active,
        reference: pro.reference,
        email: pro.email
      });
    }

    /* =====================================================
       POST — SAVE VERIFIED PRO PAYMENT
    ===================================================== */

    if (req.method === "POST") {

      const userId =
        cleanUserId(
          req.body?.userId
        );

      const reference =
        clean(
          req.body?.reference
        );

      const email =
        clean(
          req.body?.email
        ).toLowerCase();

      /*
       * IMPORTANT:
       *
       * This endpoint should only be called AFTER
       * /api/paystack has independently verified
       * the transaction with Paystack.
       *
       * The frontend must never call this endpoint
       * merely because a user says they paid.
       */

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

      if (!reference) {
        return send(res, 400, {
          success: false,
          error:
            "A verified payment reference is required."
        });
      }

      const result =
        await activatePro(
          userId,
          reference,
          email,
          redis
        );

      return send(res, 200, {
        success: true,
        pro: true,
        active: true,
        reference,
        email,
        expiresAt:
          result.expiresAt,
        message:
          "OBITREND Pro entitlement saved."
      });
    }

    res.setHeader(
      "Allow",
      "GET, POST"
    );

    return send(res, 405, {
      success: false,
      error:
        "Method not allowed."
    });

  } catch (error) {

    console.error(
      "OBITREND Pro entitlement error:",
      error
    );

    return send(res, 500, {
      success: false,
      error:
        "Unable to process OBITREND Pro entitlement."
    });
  }
}
