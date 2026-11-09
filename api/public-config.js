// Public, non-secret Supabase browser configuration.
// Never return service-role keys or any other server secret.
export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;

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
