import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "./credits.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function client() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ success: false, error: "Push notifications are not configured." });
  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });
    const supabase = client();
    if (req.method === "POST") {
      const subscription = req.body?.subscription;
      if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        return res.status(400).json({ success: false, error: "Invalid push subscription." });
      }
      const { error } = await supabase.from("push_subscriptions").upsert({
        user_id: auth.user.id,
        endpoint: subscription.endpoint,
        subscription,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,endpoint" });
      if (error) throw error;
      return res.status(200).json({ success: true });
    }
    if (req.method === "DELETE") {
      const endpoint = String(req.body?.endpoint || "");
      if (!endpoint) return res.status(400).json({ success: false, error: "Subscription endpoint is required." });
      const { error } = await supabase.from("push_subscriptions").delete().eq("user_id", auth.user.id).eq("endpoint", endpoint);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }
    return res.status(405).json({ success: false, error: "Method not allowed." });
  } catch (error) {
    console.error("OBITREND push subscription failed:", error?.message || error);
    return res.status(503).json({ success: false, error: "Unable to save notification settings right now." });
  }
}
