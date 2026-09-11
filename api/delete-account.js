/*
=========================================================
OBITREND SECURE ACCOUNT DELETION ENDPOINT
File: api/delete-account.js

SECURITY:
- Browser sends the signed-in user's access token.
- Server verifies the token with Supabase Auth.
- Server verifies the requested user ID/email.
- Server deletes ONLY that authenticated Supabase user.
- SUPABASE_SERVICE_ROLE_KEY is NEVER exposed to the browser.
=========================================================
*/

function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function send(res, status, data) {
  return res.status(status).json(data);
}

function getBearerToken(req) {
  const header =
    req.headers?.authorization ||
    req.headers?.Authorization ||
    "";

  if (typeof header !== "string") return "";

  const match = header.match(/^Bearer\s+(.+)$/i);

  return match ? match[1].trim() : "";
}

function getSupabaseUrl() {
  return clean(
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ""
  ).replace(/\/+$/, "");
}

function getPublicSupabaseKey() {
  return clean(
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ""
  );
}

function getServiceRoleKey() {
  return clean(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  );
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  /*
  -------------------------------------------------------
  ONLY POST IS ALLOWED
  -------------------------------------------------------
  */

  if (req.method !== "POST") {
    return send(res, 405, {
      success: false,
      error: "Method not allowed. Use POST."
    });
  }

  try {
    /*
    -------------------------------------------------------
    1. GET SIGNED-IN USER TOKEN
    -------------------------------------------------------
    */

    const token = getBearerToken(req);

    if (!token) {
      return send(res, 401, {
        success: false,
        error:
          "You must be signed in to delete your OBITREND account."
      });
    }

    /*
    -------------------------------------------------------
    2. GET SUPABASE SERVER CONFIGURATION
    -------------------------------------------------------
    */

    const supabaseUrl = getSupabaseUrl();
    const publicKey = getPublicSupabaseKey();
    const serviceRoleKey = getServiceRoleKey();

    if (!supabaseUrl) {
      return send(res, 500, {
        success: false,
        error:
          "SUPABASE_URL is missing from Vercel Environment Variables."
      });
    }

    if (!publicKey) {
      return send(res, 500, {
        success: false,
        error:
          "The Supabase publishable/anon key is missing from Vercel Environment Variables."
      });
    }

    if (!serviceRoleKey) {
      return send(res, 500, {
        success: false,
        error:
          "SUPABASE_SERVICE_ROLE_KEY is missing from Vercel Environment Variables."
      });
    }

    /*
    -------------------------------------------------------
    3. VERIFY THE REAL SIGNED-IN USER
    -------------------------------------------------------
    */

    const authResponse = await fetch(
      `${supabaseUrl}/auth/v1/user`,
      {
        method: "GET",
        headers: {
          apikey: publicKey,
          Authorization: `Bearer ${token}`,
          Accept: "application/json"
        }
      }
    );

    const authData = await readJson(authResponse);

    if (!authResponse.ok || !authData?.id) {
      return send(res, 401, {
        success: false,
        error:
          "Your login session is invalid or expired. Please sign in again."
      });
    }

    const authenticatedUserId = clean(
      authData.id,
      100
    );

    const authenticatedEmail = clean(
      authData.email || "",
      320
    ).toLowerCase();

    /*
    -------------------------------------------------------
    4. READ OPTIONAL CONFIRMATION DATA
    -------------------------------------------------------
    */

    const body = req.body || {};

    const requestedUserId = clean(
      body.userId,
      100
    );

    const requestedEmail = clean(
      body.email,
      320
    ).toLowerCase();

    /*
    -------------------------------------------------------
    5. VERIFY USER ID IF FRONTEND SENT ONE
    -------------------------------------------------------
    */

    if (
      requestedUserId &&
      requestedUserId !== authenticatedUserId
    ) {
      return send(res, 403, {
        success: false,
        error:
          "The account information does not match your signed-in session."
      });
    }

    /*
    -------------------------------------------------------
    6. VERIFY EMAIL IF FRONTEND SENT ONE
    -------------------------------------------------------
    */

    if (
      requestedEmail &&
      requestedEmail !== authenticatedEmail
    ) {
      return send(res, 403, {
        success: false,
        error:
          "The account email does not match your signed-in session."
      });
    }

    /*
    -------------------------------------------------------
    7. PERMANENTLY DELETE SUPABASE AUTH USER
    -------------------------------------------------------

    IMPORTANT:
    This request uses the SERVER-ONLY service-role key.

    The key never goes to the browser.
    */

    const deleteResponse = await fetch(
      `${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(
        authenticatedUserId
      )}`,
      {
        method: "DELETE",

        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          Accept: "application/json"
        }
      }
    );

    const deleteData = await readJson(
      deleteResponse
    );

    /*
    -------------------------------------------------------
    8. HANDLE SUPABASE DELETE ERROR
    -------------------------------------------------------
    */

    if (!deleteResponse.ok) {
      console.error(
        "OBITREND Supabase account deletion failed:",
        deleteData
      );

      return send(
        res,
        deleteResponse.status || 500,
        {
          success: false,
          error:
            deleteData?.msg ||
            deleteData?.message ||
            deleteData?.error_description ||
            deleteData?.error ||
            "Supabase could not delete the OBITREND account."
        }
      );
    }

    /*
    -------------------------------------------------------
    9. BEST-EFFORT REDIS CLEANUP
    -------------------------------------------------------
    */

    try {
      const redisUrl = clean(
        process.env.KV_REST_API_URL ||
        process.env.UPSTASH_REDIS_REST_URL ||
        ""
      ).replace(/\/+$/, "");

      const redisToken = clean(
        process.env.KV_REST_API_TOKEN ||
        process.env.UPSTASH_REDIS_REST_TOKEN ||
        ""
      );

      if (redisUrl && redisToken) {
        const redisKeys = [
          `obitrend:credits:${authenticatedUserId}`,
          `obitrend:credits:reset:${authenticatedUserId}`,
          `obitrend:pro:${authenticatedUserId}`,
          `obitrend:pro:expiry:${authenticatedUserId}`,
          `obitrend:pro:email:${authenticatedUserId}`,
          `obitrend:pro:reference:${authenticatedUserId}`,
          `obitrend:pro:credits:${authenticatedUserId}`,
          `obitrend:pro:credits:expiry:${authenticatedUserId}`,
          `obitrend:pro:exhausted:${authenticatedUserId}`,

          `obitrend:v2:credits:${authenticatedUserId}`,
          `obitrend:v2:credits:reset:${authenticatedUserId}`,
          `obitrend:v2:pro:${authenticatedUserId}`,
          `obitrend:v2:pro:expiry:${authenticatedUserId}`,
          `obitrend:v2:pro:email:${authenticatedUserId}`,
          `obitrend:v2:pro:reference:${authenticatedUserId}`,
          `obitrend:v2:pro:credits:${authenticatedUserId}`,
          `obitrend:v2:pro:total:${authenticatedUserId}`,
          `obitrend:v2:pro:plan:${authenticatedUserId}`,
          `obitrend:v2:pro:tier:${authenticatedUserId}`
        ];

        await fetch(
          `${redisUrl}/pipeline`,
          {
            method: "POST",

            headers: {
              Authorization: `Bearer ${redisToken}`,
              "Content-Type": "application/json",
              Accept: "application/json"
            },

            body: JSON.stringify(
              redisKeys.map((key) => [
                "DEL",
                key
              ])
            )
          }
        ).catch(() => null);
      }
    } catch (redisError) {
      console.warn(
        "OBITREND Redis cleanup warning:",
        redisError
      );
    }

    /*
    -------------------------------------------------------
    10. SUCCESS
    -------------------------------------------------------
    */

    return send(res, 200, {
      success: true,
      message:
        "Your OBITREND account has been permanently deleted."
    });

  } catch (error) {

    console.error(
      "OBITREND account deletion endpoint error:",
      error
    );

    return send(res, 500, {
      success: false,
      error:
        error?.message ||
        "Account deletion could not be completed."
    });
  }
}
