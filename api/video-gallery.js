import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "../lib/credits.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const VIDEO_BUCKET = "obitrend-videos";

function send(res, status, body) {
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return send(res, 405, { success: false, error: "Method not allowed." });
  }

  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth.ok) return send(res, auth.status, { success: false, error: auth.error });

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      console.error("OBITREND video gallery: Supabase public configuration is missing.");
      return send(res, 503, { success: false, error: "Video gallery is temporarily unavailable." });
    }

    const authorization = req.headers?.authorization || req.headers?.Authorization || "";
    const tokenMatch = typeof authorization === "string" ? authorization.match(/^Bearer\s+(.+)$/i) : null;
    const token = tokenMatch?.[1]?.trim();
    if (!token) return send(res, 401, { success: false, error: "Please sign in to continue." });

    // User JWT + RLS: only this user's own video rows and private storage objects are accessible.
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    const { data: jobs, error } = await supabase
      .from("video_jobs")
      .select("id,runway_task_id,status,duration_seconds,video_url,created_at,completed_at")
      .eq("user_id", auth.user.id)
      .eq("status", "completed")
      .not("video_url", "is", null)
      .order("completed_at", { ascending: false })
      .limit(30);

    if (error) {
      console.error("OBITREND video gallery lookup error:", error.message);
      return send(res, 500, { success: false, error: "Unable to load your saved videos." });
    }

    const videos = [];
    for (const job of jobs || []) {
      const { data, error: signedError } = await supabase.storage
        .from(VIDEO_BUCKET)
        .createSignedUrl(job.video_url, 60 * 60);
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
