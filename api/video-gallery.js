import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "../lib/credits.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VIDEO_BUCKET = "obitrend-videos";

function supabaseServiceClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase server configuration is missing.");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

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

    const supabase = supabaseServiceClient();

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

    return send(res, 200, {
      success: true,
      videos
    });
  } catch (error) {
    console.error("OBITREND video gallery error:", error?.message || error);
    return send(res, 500, {
      success: false,
      error: "Unable to load your saved videos right now."
    });
  }
}
