import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "../lib/credits.js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const VIDEO_BUCKET = "obitrend-videos";

function send(res, status, body) {
  return res.status(status).json(body);
}

function userClient(accessToken) {
  const publishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !publishableKey || !accessToken) return null;

  // Forward the verified user's JWT so both video_jobs RLS and private
  // Storage object policies evaluate ownership with auth.uid().
  return createClient(SUPABASE_URL, publishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });
}

function getBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  const match = typeof header === "string" ? header.match(/^Bearer\\s+(.+)$/i) : null;
  return match ? match[1].trim() : "";
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return send(res, 405, { success: false, error: "Method not allowed." });
  }

  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth.ok) return send(res, auth.status, { success: false, error: auth.error });

    const supabase = userClient(getBearerToken(req));
    if (!supabase) {
      return send(res, 503, { success: false, error: "Video storage is not configured for your account." });
    }

    const { data: jobs, error } = await supabase
      .from("video_jobs")
      .select("id,runway_task_id,status,duration_seconds,video_url,created_at,completed_at")
      .eq("user_id", auth.user.id)
      .eq("status", "completed")
      .not("video_url", "is", null)
      .order("completed_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("OBITREND video gallery lookup error:", error.message);
      return send(res, 500, { success: false, error: "Unable to load your saved videos." });
    }

    const videos = [];
    for (const job of jobs || []) {
      const storagePath = String(job.video_url || "").trim();
      if (!storagePath || storagePath.startsWith("/") || storagePath.includes("..")) continue;

      const { data, error: signedError } = await supabase.storage
        .from(VIDEO_BUCKET)
        .createSignedUrl(storagePath, 60 * 60);

      if (signedError || !data?.signedUrl) {
        console.warn("OBITREND video gallery signed URL error:", signedError?.message || "No signed URL");
        continue;
      }

      videos.push({
        id: job.id,
        taskId: job.runway_task_id,
        duration: Number(job.duration_seconds || 0),
        videoUrl: data.signedUrl,
        createdAt: job.created_at,
        completedAt: job.completed_at
      });
    }

    return send(res, 200, { success: true, videos });
  } catch (error) {
    console.error("OBITREND video gallery error:", error?.message || error);
    return send(res, 500, { success: false, error: "Unable to load your saved videos right now." });
  }
}
