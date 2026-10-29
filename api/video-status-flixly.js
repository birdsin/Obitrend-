import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser, getRedisConfig } from "../lib/credits.js";
import { completeVideoReservationByTask, refundVideoReservationByTask } from "../video-credits.js";

const FLIXLY_API_KEY = process.env.FLIXLY_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
const VIDEO_BUCKET = "obitrend-videos";

function send(res, status, body) { return res.status(status).json(body); }
function supabaseServiceClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase server configuration is missing.");
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}
function progressOf(task) {
  const raw = task?.progress ?? task?.percent ?? task?.percentage;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(100, Math.round(raw <= 1 ? raw * 100 : raw)));
}
async function createSignedVideoUrl(supabase, path) {
  const { data, error } = await supabase.storage.from(VIDEO_BUCKET).createSignedUrl(path, 60 * 60);
  if (error) throw new Error("Video is saved but could not be opened.");
  return data?.signedUrl || null;
}
async function saveVideo(supabase, videoUrl, userId, jobId) {
  if (!/^https:\/\//i.test(String(videoUrl || ""))) throw new Error("Flixly returned an invalid video URL.");
  const response = await fetch(videoUrl);
  if (!response.ok) throw new Error("Unable to download the completed Flixly video.");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error("Flixly returned an empty video file.");
  const path = `${userId}/${jobId}.mp4`;
  const { error } = await supabase.storage.from(VIDEO_BUCKET).upload(path, buffer, { contentType: "video/mp4", upsert: true });
  if (error) throw new Error("Video storage upload failed.");
  return path;
}
async function settle(taskId, refund = false) {
  try {
    const redis = getRedisConfig();
    const result = refund
      ? await refundVideoReservationByTask({ taskId, redis })
      : await completeVideoReservationByTask({ taskId, redis });
    return Boolean(result?.ok);
  } catch (error) {
    console.error("OBITREND Flixly video credit settlement error:", error?.message || error);
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { success: false, error: "Method not allowed." });
  if (!FLIXLY_API_KEY) return send(res, 503, { success: false, error: "Flixly video generation is not configured for this staging deployment." });

  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth?.ok || !auth?.user?.id) return send(res, auth?.status || 401, { success: false, error: auth?.error || "Authentication failed." });

    const taskId = String(req.query?.taskId || "").trim();
    if (!taskId) return send(res, 400, { success: false, error: "Video task ID is required." });

    const supabase = supabaseServiceClient();
    const { data: job, error: lookupError } = await supabase.from("video_jobs")
      .select("id,user_id,runway_task_id,status,progress,video_url,duration_seconds,error_message")
      .eq("runway_task_id", taskId).eq("user_id", auth.user.id).maybeSingle();

    if (lookupError) {
      console.error("OBITREND Flixly job lookup error:", lookupError.message);
      return send(res, 500, { success: false, error: "Unable to find your video job." });
    }
    if (!job) return send(res, 404, { success: false, error: "Video job not found." });

    if (job.status === "completed" && job.video_url) {
      await settle(taskId, false);
      const videoUrl = await createSignedVideoUrl(supabase, job.video_url);
      if (!videoUrl) return send(res, 500, { success: false, error: "Video is saved but could not be opened." });
      return send(res, 200, { success: true, status: "SUCCEEDED", taskId, videoUrl, progress: 100, duration: job.duration_seconds });
    }

    const response = await fetch("https://www.flixly.ai/api/v1/generations/" + encodeURIComponent(taskId), {
      headers: { Authorization: "Bearer " + FLIXLY_API_KEY, Accept: "application/json" },
      cache: "no-store"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("OBITREND Flixly status API error:", response.status, data?.error?.message || data?.message || "Unknown provider error");
      return send(res, 503, { success: false, error: "Flixly status is temporarily unavailable. Please retry." });
    }

    const rawStatus = String(data?.status || data?.generation?.status || "").toLowerCase();
    const progress = progressOf(data);
    const outputUrl = String(data?.output_url || data?.outputUrl || data?.output?.url || data?.result?.output_url || "").trim();

    if (["pending", "queued", "processing", "running", "in_progress"].includes(rawStatus)) {
      await supabase.from("video_jobs").update({ status: rawStatus === "pending" || rawStatus === "queued" ? "queued" : "processing", progress })
        .eq("id", job.id).eq("user_id", auth.user.id);
      return send(res, 200, { success: true, status: rawStatus === "pending" || rawStatus === "queued" ? "PENDING" : "RUNNING", taskId, progress, duration: job.duration_seconds });
    }

    if (["completed", "complete", "succeeded", "success"].includes(rawStatus)) {
      if (!outputUrl) {
        const message = "Flixly completed the task but did not return a video URL.";
        const refunded = await settle(taskId, true);
        await supabase.from("video_jobs").update({ status: "failed", progress: 100, error_message: message, credit_refunded: refunded }).eq("id", job.id).eq("user_id", auth.user.id);
        return send(res, 200, { success: false, status: "FAILED", taskId, progress: 100, creditRefunded: refunded, error: refunded ? message + " Your video seconds were returned." : message });
      }

      let storagePath;
      try {
        storagePath = await saveVideo(supabase, outputUrl, auth.user.id, job.id);
      } catch (error) {
        console.error("OBITREND Flixly permanent storage error:", error?.message || error);
        return send(res, 503, { success: false, status: "SUCCEEDED", taskId, error: "Video was generated but could not be saved permanently. Please check again." });
      }

      const { error: updateError } = await supabase.from("video_jobs").update({
        status: "completed", progress: 100, video_url: storagePath, error_message: null, completed_at: new Date().toISOString()
      }).eq("id", job.id).eq("user_id", auth.user.id);
      if (updateError) {
        console.error("OBITREND Flixly job completion update error:", updateError.message);
        return send(res, 503, { success: false, error: "Video was saved but could not be registered." });
      }

      const completed = await settle(taskId, false);
      if (!completed) console.error("OBITREND Flixly video reservation could not be finalized.");
      const videoUrl = await createSignedVideoUrl(supabase, storagePath);
      if (!videoUrl) return send(res, 500, { success: false, error: "Video was saved but could not be opened." });
      return send(res, 200, { success: true, status: "SUCCEEDED", taskId, videoUrl, progress: 100, duration: job.duration_seconds });
    }

    if (["failed", "error", "canceled", "cancelled"].includes(rawStatus)) {
      const providerMessage = data?.error?.message || data?.error || data?.message || "Flixly video generation failed.";
      const refunded = await settle(taskId, true);
      await supabase.from("video_jobs").update({ status: "failed", progress: 100, error_message: String(providerMessage), credit_refunded: refunded }).eq("id", job.id).eq("user_id", auth.user.id);
      return send(res, 200, { success: false, status: "FAILED", taskId, progress: 100, creditRefunded: refunded, error: refunded ? String(providerMessage) + " Your video seconds were returned." : String(providerMessage) });
    }

    await supabase.from("video_jobs").update({ status: "processing", progress }).eq("id", job.id).eq("user_id", auth.user.id);
    return send(res, 200, { success: true, status: "RUNNING", taskId, progress, duration: job.duration_seconds });
  } catch (error) {
    console.error("OBITREND Flixly video status error:", error?.message || error);
    return send(res, 500, { success: false, error: "Unable to check Flixly video status right now." });
  }
}
