import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "../lib/credits.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const VIDEO_BUCKET = "obitrend-videos";

function sendError(res, status, error) {
  return res.status(status).json({ success: false, error });
}

export default async function handler(req, res) {
  if (req.method !== "GET") return sendError(res, 405, "Method not allowed.");

  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth.ok) return sendError(res, auth.status, auth.error);

    const authorization = req.headers?.authorization || req.headers?.Authorization || "";
    const tokenMatch = typeof authorization === "string" ? authorization.match(/^Bearer\s+(.+)$/i) : null;
    const token = tokenMatch?.[1]?.trim();
    if (!token) return sendError(res, 401, "Please sign in to continue.");

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      console.error("OBITREND video download: Supabase public configuration is missing.");
      return sendError(res, 503, "Video downloads are temporarily unavailable.");
    }

    const taskId = String(req.query?.taskId || "").trim();
    if (!taskId) return sendError(res, 400, "Video task ID is required.");

    // The user's JWT is used for both the ownership lookup and private Storage download.
    // RLS remains the authority; no service-role credential is required by this endpoint.
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    const { data: videoJob, error: jobError } = await supabase
      .from("video_jobs")
      .select("id,user_id,runway_task_id,status,video_url")
      .eq("runway_task_id", taskId)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (jobError) {
      console.error("OBITREND video download lookup error:", jobError.message);
      return sendError(res, 500, "Unable to find your video.");
    }
    if (!videoJob || videoJob.status !== "completed" || !videoJob.video_url) {
      return sendError(res, 404, "Your completed video could not be found.");
    }

    const { data: file, error: downloadError } = await supabase.storage
      .from(VIDEO_BUCKET)
      .download(videoJob.video_url);

    if (downloadError || !file) {
      console.error("OBITREND video file download error:", downloadError?.message || "File missing");
      return sendError(res, 500, "Unable to save the video right now.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!buffer.length) return sendError(res, 500, "The video file is empty.");

    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Length", String(buffer.length));
    res.setHeader("Content-Disposition", 'attachment; filename="obitrend-ai-fashion-video.mp4"');
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    return res.status(200).send(buffer);
  } catch (error) {
    console.error("OBITREND video download error:", error?.message || error);
    return sendError(res, 500, "Unable to save the video right now.");
  }
}
