import { getRedisConfig } from "../lib/credits.js";

function send(res, status, data) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  return res.status(status).json(data);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return send(res, 405, { ok: false, error: "Method not allowed." });
  }

  // This diagnostic is intentionally restricted to the original staging deployment.
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.VERCEL_GIT_COMMIT_REF !== "staging/creator-studio-integration"
  ) {
    return send(res, 404, { ok: false, error: "Not found." });
  }

  const redis = getRedisConfig();
  if (!redis.url || !redis.token) {
    console.error("OBITREND staging Redis health: configuration unavailable.");
    return send(res, 503, { ok: false, redis: "unavailable", reason: "configuration" });
  }

  try {
    const response = await fetch(`${redis.url}/ping`, {
      method: "GET",
      headers: { Authorization: `Bearer ${redis.token}` },
      signal: AbortSignal.timeout(8000)
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || data?.error || String(data?.result || "").toUpperCase() !== "PONG") {
      console.error("OBITREND staging Redis health: ping failed.");
      return send(res, 503, { ok: false, redis: "unavailable", reason: "ping" });
    }

    return send(res, 200, { ok: true, redis: "reachable", check: "PING" });
  } catch (error) {
    console.error("OBITREND staging Redis health check failed.");
    return send(res, 503, { ok: false, redis: "unavailable", reason: "connection" });
  }
}
