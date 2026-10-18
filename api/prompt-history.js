import { getAuthenticatedUser, getRedisConfig } from "../lib/credits.js";

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return send(res, 405, { error: "Method not allowed." });
  }

  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth?.ok || !auth?.user?.id) {
      return send(res, auth?.status || 401, { error: auth?.error || "Please sign in." });
    }

    const redis = getRedisConfig();
    if (!redis?.url || !redis?.token) {
      return send(res, 503, { error: "Credit service is unavailable." });
    }

    const key = `obitrend:prompt-studio:history:${auth.user.id}`;
    const response = await fetch(`${redis.url}/LRANGE/${encodeURIComponent(key)}/0/49`, {
      headers: { Authorization: `Bearer ${redis.token}` }
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || data.error) {
      return send(res, 503, { error: "Prompt history is temporarily unavailable." });
    }

    const items = (Array.isArray(data.result) ? data.result : []).map(value => {
      try { return JSON.parse(value); } catch { return null; }
    }).filter(Boolean);
    return send(res, 200, items);
  } catch (error) {
    console.error("Prompt history API error:", error?.message || error);
    return send(res, 503, { error: "Prompt history is temporarily unavailable." });
  }
}
