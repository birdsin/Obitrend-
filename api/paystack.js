// api/credits.js
// OBITREND PRO — SERVER-SIDE PRO STATUS
// Uses Supabase as the source of truth.

const SUPABASE_URL = String(
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  ""
).trim().replace(/\/+$/, "");

const SUPABASE_SERVICE_ROLE_KEY = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  ""
).trim();

const PRO_DAYS = 7;

/* =========================================================
   SUPABASE REQUEST
========================================================= */

async function supabaseRequest(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Supabase server configuration is missing."
    );
  }

  const response = await fetch(
    `${SUPABASE_URL}${path}`,
    {
      ...options,

      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization:
          `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(options.headers || {})
      }
    }
  );

  const text = await response.text();

  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(
      data?.message ||
      data?.error_description ||
      data?.hint ||
      `Supabase request failed (${response.status}).`
    );
  }

  return data;
}

/* =========================================================
   CLEAN VALUES
========================================================= */

function cleanUserId(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 100);
}

function cleanEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function cleanReference(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._=-]/g, "")
    .slice(0, 200);
}

/* =========================================================
   REDIS CONFIG
========================================================= */

/*
 * Kept for compatibility with the existing paystack.js.
 *
 * Pro authorization itself is stored in Supabase.
 */

export function getRedisConfig() {
  const url = String(
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.REDIS_URL ||
    ""
  ).trim();

  const token = String(
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.REDIS_TOKEN ||
    ""
  ).trim();

  return {
    url,
    token
  };
}

/* =========================================================
   GET PRO STATUS
========================================================= */

export async function getProStatus(
  userId,
  _redis = null
) {
  const safeUserId =
    cleanUserId(userId);

  if (!safeUserId) {
    return {
      active: false,
      expiresAt: null
    };
  }

  /*
   * The existing database schema identifies
   * the account by email rather than user_id.
   *
   * Therefore first retrieve the Supabase
   * account email using the admin API.
   */

  const user =
    await supabaseRequest(
      `/auth/v1/admin/users/${encodeURIComponent(
        safeUserId
      )}`,
      {
        method: "GET"
      }
    );

  const email =
    cleanEmail(user?.email);

  if (!email) {
    return {
      active: false,
      expiresAt: null
    };
  }

  const rows =
    await supabaseRequest(
      `/rest/v1/obitrend_subscriptions` +
      `?email=eq.${encodeURIComponent(email)}` +
      `&status=eq.active` +
      `&select=expires_at,paystack_reference,plan_name` +
      `&order=expires_at.desc` +
      `&limit=1`,
      {
        method: "GET"
      }
    );

  const subscription =
    Array.isArray(rows)
      ? rows[0]
      : null;

  if (!subscription) {
    return {
      active: false,
      expiresAt: null
    };
  }

  const expiresAt =
    subscription.expires_at
      ? new Date(subscription.expires_at)
      : null;

  const active =
    Boolean(
      expiresAt &&
      !Number.isNaN(expiresAt.getTime()) &&
      expiresAt.getTime() > Date.now()
    );

  return {
    active,
    expiresAt:
      expiresAt
        ? expiresAt.toISOString()
        : null,

    reference:
      subscription.paystack_reference ||
      "",

    planName:
      subscription.plan_name ||
      "OBITREND PRO"
  };
}

/* =========================================================
   ACTIVATE PRO
========================================================= */

export async function activatePro(
  userId,
  email,
  reference,
  _redis = null
) {
  const safeUserId =
    cleanUserId(userId);

  const safeEmail =
    cleanEmail(email);

  const safeReference =
    cleanReference(reference);

  if (!safeUserId) {
    throw new Error(
      "Invalid Supabase user ID."
    );
  }

  if (
    !safeEmail ||
    !safeEmail.includes("@")
  ) {
    throw new Error(
      "Invalid account email."
    );
  }

  if (!safeReference) {
    throw new Error(
      "Invalid Paystack reference."
    );
  }

  /*
   * Make Pro last exactly 7 days
   * from activation.
   */

  const expiresAt =
    new Date(
      Date.now() +
      PRO_DAYS *
      24 *
      60 *
      60 *
      1000
    ).toISOString();

  const paidAt =
    new Date().toISOString();

  /*
   * Check whether this exact Paystack
   * reference was already processed.
   *
   * This prevents accidental duplicate
   * activation if the verification page
   * is refreshed.
   */

  const existing =
    await supabaseRequest(
      `/rest/v1/obitrend_subscriptions` +
      `?paystack_reference=eq.${encodeURIComponent(
        safeReference
      )}` +
      `&select=id,expires_at,status` +
      `&limit=1`,
      {
        method: "GET"
      }
    );

  if (
    Array.isArray(existing) &&
    existing.length > 0
  ) {
    return {
      activated: true,
      alreadyProcessed: true,
      expiresAt:
        existing[0].expires_at
    };
  }

  /*
   * Insert the verified subscription.
   */

  const inserted =
    await supabaseRequest(
      "/rest/v1/obitrend_subscriptions",
      {
        method: "POST",

        headers: {
          Prefer:
            "return=representation"
        },

        body:
          JSON.stringify({
            email:
              safeEmail,

            paystack_reference:
              safeReference,

            plan_name:
              "OBITREND PRO",

            amount_kobo:
              1500000,

            currency:
              "NGN",

            interval:
              "weekly",

            status:
              "active",

            paid_at:
              paidAt,

            expires_at:
              expiresAt
          })
      }
    );

  /*
   * Ensure the user's credits row exists.
   *
   * We do not use credits as the Pro
   * authorization source.
   */

  try {
    await supabaseRequest(
      "/rest/v1/obitrend_credits",
      {
        method: "POST",

        headers: {
          Prefer:
            "resolution=ignore-duplicates,return=minimal"
        },

        body:
          JSON.stringify({
            email:
              safeEmail,

            credits:
              0,

            total_purchased:
              0,

            total_used:
              0
          })
      }
    );
  } catch (error) {
    /*
     * A credits-row failure must not undo
     * an already verified Pro subscription.
     */
    console.warn(
      "OBITREND credits row was not created:",
      error
    );
  }

  return {
    activated: true,
    alreadyProcessed: false,

    expiresAt,

    subscription:
      Array.isArray(inserted)
        ? inserted[0] || null
        : inserted
  };
}
