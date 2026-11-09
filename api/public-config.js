// Public, non-secret Supabase browser configuration.
// Staging preview deployments use the isolated OBITREND Staging project.
// Production and all other deployments continue to use their configured env vars.
export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const stagingRefs = new Set([
    "staging/studio-export-isolated-20261109"
  ]);
  const isIsolatedStaging =
    stagingRefs.has(process.env.VERCEL_GIT_COMMIT_REF || "");

  const url = isIsolatedStaging
    ? "https://ooosypddaalftxfeyoaw.supabase.co"
    : process.env.SUPABASE_URL;
  const key = isIsolatedStaging
    ? "sb_publishable_OncGmXQzDnlmaC5Iw70x2g_sMjL5x6Q"
    : process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return res.status(503).json({
      error: "Supabase browser configuration is not available for this deployment."
    });
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".supabase.co")) {
      return res.status(503).json({ error: "Supabase URL configuration is invalid." });
    }
  } catch {
    return res.status(503).json({ error: "Supabase URL configuration is invalid." });
  }

  return res.status(200).json({ url, publishableKey: key });
}
