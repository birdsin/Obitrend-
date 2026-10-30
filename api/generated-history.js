import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "../lib/credits.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "obitrend-generated";

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return send(res, 405, { success: false, error: "Method not allowed." });
  }

  const auth = await getAuthenticatedUser(req);
  if (!auth?.ok || !auth?.user?.id) {
    return send(res, auth?.status || 401, { success: false, error: auth?.error || "Please sign in." });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return send(res, 503, { success: false, error: "Image history is temporarily unavailable." });
  }

  const limit = Math.max(1, Math.min(100, Number.parseInt(req.query?.limit, 10) || 50));
  const offset = Math.max(0, Number.parseInt(req.query?.offset, 10) || 0);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  try {
    const { data, error, count } = await supabase
      .from("generated_image_history")
      .select("id, storage_path, tool_id, title, prompt, settings, image_index, created_at", { count: "exact" })
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const items = await Promise.all((data || []).map(async row => {
      const { data: signed, error: signError } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(row.storage_path, 60 * 60);
      if (signError || !signed?.signedUrl) {
        return { ...row, image: null, unavailable: true };
      }
      return {
        id: row.id,
        kind: "real",
        tool: row.tool_id,
        title: row.title,
        prompt: row.prompt,
        settings: row.settings,
        image: signed.signedUrl,
        created: row.created_at
      };
    }));

    return send(res, 200, { success: true, items, total: count || 0, limit, offset, hasMore: offset + items.length < (count || 0) });
  } catch (error) {
    console.error("Generated image history read failed:", error?.message || error);
    return send(res, 503, { success: false, error: "Image history is temporarily unavailable." });
  }
}
