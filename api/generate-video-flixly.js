import { createClient } from "@supabase/supabase-js";
import { waitUntil } from "@vercel/functions";
import { getAuthenticatedUser, getProStatus, getRedisConfig } from "../lib/credits.js";
import { reserveVideoSeconds, linkVideoReservation, refundVideoReservation } from "../video-credits.js";

const FLIXLY_API_KEY = process.env.FLIXLY_API_KEY;
const FLIXLY_VIDEO_MODEL = process.env.FLIXLY_VIDEO_MODEL || "kling-4-0";
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
const VIDEO_BUCKET = "obitrend-videos";
const APP_ORIGIN = process.env.VERCEL_URL
  ? "https://" + process.env.VERCEL_URL
  : (process.env.APP_ORIGIN || "https://obitrend.vercel.app");

function send(res, status, body) { return res.status(status).json(body); }
function supabaseServiceClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase server configuration is missing.");
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}
function imageMimeAndExtension(dataUri) {
  const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([\s\S]+)$/i.exec(dataUri || "");
  if (!match) throw new Error("The uploaded reference must be a JPEG, PNG, or WebP image.");
  const mime = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
  const extension = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > 15 * 1024 * 1024) throw new Error("Reference image must be under 15 MB.");
  return { buffer, mime, extension };
}
function ratioName(value) {
  const ratios = {
    "1280:720": "16:9", "1584:672": "21:9", "1104:832": "16:9",
    "960:960": "1:1", "832:1104": "9:16", "720:1280": "9:16", "672:1584": "9:16"
  };
  return ratios[value] || "16:9";
}
async function monitorFlixlyTask(taskId, accessToken) {
  if (!taskId || !accessToken) return;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(APP_ORIGIN + "/api/video-status-flixly?taskId=" + encodeURIComponent(taskId), {
        method: "GET", cache: "no-store",
        headers: { Accept: "application/json", Authorization: "Bearer " + accessToken }
      });
      const data = await response.json().catch(() => ({}));
      const status = String(data?.status || "").toUpperCase();
      if (status === "SUCCEEDED" || status === "FAILED" || status === "CANCELED") return;
    } catch (error) {
      console.error("OBITREND Flixly background status check error:", error?.message || error);
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  console.error("OBITREND Flixly background status watcher reached its maximum watch time:", taskId);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { success: false, error: "Method not allowed." });
  if (!FLIXLY_API_KEY) return send(res, 503, { success: false, error: "Flixly video generation is not configured. Add FLIXLY_API_KEY to this staging deployment." });

  let redis = null;
  let reservationId = null;
  let reserved = false;
  let taskId = null;

  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth?.ok || !auth?.user?.id) return send(res, auth?.status || 401, { success: false, error: auth?.error || "Authentication failed." });

    redis = getRedisConfig();
    const pro = await getProStatus(auth.user.id, redis);
    if (!pro?.active) return send(res, 403, { success: false, error: "AI Video is available to Pro users only." });

    const body = req.body || {};
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
    const duration = Number(body.duration);
    const ratio = typeof body.ratio === "string" ? body.ratio.trim() : "1280:720";
    const cameraStyle = typeof body.cameraStyle === "string" ? body.cameraStyle.trim() : "AI Smart Camera";
    const musicStyle = typeof body.musicStyle === "string" ? body.musicStyle.trim() : "regional";
    const musicRegion = typeof body.musicRegion === "string" ? body.musicRegion.trim() : "auto";
    const musicLabel = typeof body.musicLabel === "string" ? body.musicLabel.trim() : "Auto regional soundtrack";

    if (!prompt) return send(res, 400, { success: false, error: "Video prompt is required." });
    if (![5, 10, 15, 20].includes(duration)) return send(res, 400, { success: false, error: "Video duration must be 5, 10, 15, or 20 seconds." });
    if (!["1280:720", "720:1280", "1584:672", "1104:832", "832:1104", "672:1584", "960:960"].includes(ratio)) return send(res, 400, { success: false, error: "Invalid video ratio." });
    if (!imageUrl) return send(res, 400, { success: false, error: "Upload or select a reference image before creating a video." });

    const supabase = supabaseServiceClient();
    reservationId = `video-${auth.user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const reservation = await reserveVideoSeconds({ userId: auth.user.id, seconds: duration, jobId: reservationId, redis });
    if (!reservation?.ok) return send(res, 402, { success: false, error: reservation?.error || "You do not have enough video seconds." });
    reserved = true;

    let providerImageUrl = imageUrl;
    if (/^data:image\//i.test(imageUrl)) {
      const { buffer, mime, extension } = imageMimeAndExtension(imageUrl);
      const referencePath = `references/${auth.user.id}/${reservationId}.${extension}`;
      const { error: uploadError } = await supabase.storage.from(VIDEO_BUCKET).upload(referencePath, buffer, { contentType: mime, upsert: false });
      if (uploadError) throw new Error("Could not prepare the uploaded image for video generation.");
      const { data: signed, error: signedError } = await supabase.storage.from(VIDEO_BUCKET).createSignedUrl(referencePath, 60 * 60);
      if (signedError || !signed?.signedUrl) throw new Error("Could not create a secure reference image URL.");
      providerImageUrl = signed.signedUrl;
    } else if (!/^https:\/\//i.test(imageUrl)) {
      throw new Error("Reference image must be uploaded or use a secure HTTPS URL.");
    }

    const camera = ["Canon EOS R5 Mark II", "Fujifilm GFX 100S II", "Nikon Z8"].includes(cameraStyle) ? cameraStyle : "AI Smart Camera";
    const soundtrack = musicStyle === "regional"
      ? "Add suitable original, royalty-safe regional soundtrack; region preference " + musicRegion + "."
      : "Soundtrack style: " + musicLabel + ". Use original audio only; do not imitate an existing song or artist.";
    const finalPrompt = [
      prompt,
      "Preserve the uploaded fashion reference image as the primary visual source. Keep the garment's exact color, cut, silhouette, neckline, straps, seams, print, fabric texture, and construction. Do not redesign or recolor the garment.",
      "Camera style: " + camera + ". Do not display camera branding.",
      soundtrack,
      "Create a polished, photorealistic fashion campaign video with natural movement and smooth camera motion."
    ].join("\n");

    const response = await fetch("https://www.flixly.ai/api/v1/generate", {
      method: "POST",
      headers: { Authorization: "Bearer " + FLIXLY_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        model: FLIXLY_VIDEO_MODEL,
        prompt: finalPrompt,
        type: "IMAGE_TO_VIDEO",
        input: { image_url: providerImageUrl, duration, aspect_ratio: ratioName(ratio), resolution: "720p" }
      })
    });
    const providerData = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = providerData?.error?.message || providerData?.error || providerData?.message || "Flixly could not start video generation.";
      const refund = await refundVideoReservation({ jobId: reservationId, redis });
      reserved = !refund?.ok;
      return send(res, 502, { success: false, error: String(message), provider: "flixly", creditRefunded: Boolean(refund?.ok) });
    }

    taskId = String(providerData?.id || providerData?.generation_id || "").trim();
    if (!taskId) {
      const refund = await refundVideoReservation({ jobId: reservationId, redis });
      reserved = !refund?.ok;
      return send(res, 502, { success: false, error: "Flixly did not return a video task ID.", provider: "flixly", creditRefunded: Boolean(refund?.ok) });
    }

    const linked = await linkVideoReservation({ reservationId, taskId, redis });
    if (!linked?.ok) {
      console.error("OBITREND Flixly reservation link error:", linked?.error);
      return send(res, 503, { success: false, status: "QUEUED", taskId, error: "Video generation started, but its credit reservation needs a status retry.", retryable: true });
    }

    const { error: insertError } = await supabase.from("video_jobs").insert({
      user_id: auth.user.id, runway_task_id: taskId, status: "queued", progress: 0,
      prompt: finalPrompt, image_url: imageUrl, duration_seconds: duration, credit_refunded: false
    });
    if (insertError) {
      console.error("OBITREND Flixly video job insert error:", insertError.message);
      return send(res, 503, { success: false, status: "QUEUED", taskId, error: "Video generation started, but the job could not be registered yet.", retryable: true });
    }

    const authHeader = req.headers?.authorization || req.headers?.Authorization || "";
    const accessToken = String(authHeader).replace(/^Bearer\s+/i, "").trim();
    if (accessToken) {
      waitUntil(monitorFlixlyTask(taskId, accessToken));
    }
    return send(res, 200, { success: true, status: "QUEUED", taskId, duration, provider: "flixly" });
  } catch (error) {
    console.error("OBITREND Flixly video generation error:", error?.message || error);
    if (reserved && reservationId && !taskId) {
      const refund = await refundVideoReservation({ jobId: reservationId, redis }).catch(() => ({ ok: false }));
      reserved = !refund?.ok;
    }
    return send(res, 502, { success: false, error: error?.message || "Unable to start Flixly video generation.", provider: "flixly", creditRefunded: !reserved });
  }
}
