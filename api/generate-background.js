import { waitUntil } from "@vercel/functions";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "./credits.js";

export const config = {
  api: {
    bodyParser: { sizeLimit: "12mb" },
  },
};

export const maxDuration = 300;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_ORIGIN = process.env.APP_ORIGIN || "https://obitrend.vercel.app";
const BUCKET = "obitrend-generated";
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@obitrend.vercel.app";

function json(res, status, body) {
  return res.status(status).json(body);
}

function serviceClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase server configuration is missing.");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function extractImages(data) {
  const values = Array.isArray(data?.images) ? data.images : [];
  if (values.length) return values.filter(Boolean);
  const single = data?.image || data?.imageUrl || data?.url || data?.generatedImage;
  return single ? [single] : [];
}

function dataUrlToBuffer(value) {
  const match = String(value || "").match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match) throw new Error("Generated image format was not supported.");
  return {
    mimeType: match[1].toLowerCase(),
    buffer: Buffer.from(match[2], "base64"),
  };
}

async function createJob(supabase, userId) {
  const { data, error } = await supabase
    .from("generation_jobs")
    .insert({ user_id: userId, status: "processing", progress: 0 })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function updateJob(supabase, jobId, patch) {
  const { error } = await supabase
    .from("generation_jobs")
    .update(patch)
    .eq("id", jobId);
  if (error) throw error;
}

async function saveGeneratedImages(supabase, userId, jobId, images) {
  const urls = [];
  for (let i = 0; i < images.length; i += 1) {
    const { mimeType, buffer } = dataUrlToBuffer(images[i]);
    const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
    const path = `${userId}/${jobId}/${i + 1}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: mimeType,
        upsert: true,
      });
    if (uploadError) throw uploadError;
    const { data, error: signedError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    if (signedError) throw signedError;
    urls.push({ path, url: data.signedUrl });
  }
  return urls;
}


async function notifyUser(supabase, userId, jobId) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;
  let webpush;
  try {
    webpush = (await import("web-push")).default;
  } catch (error) {
    console.error("OBITREND push package unavailable:", error?.message || error);
    return;
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  const { data: rows, error } = await supabase
    .from("push_subscriptions")
    .select("id,endpoint,subscription")
    .eq("user_id", userId);
  if (error) throw error;
  const payload = JSON.stringify({
    title: "OBITREND",
    body: "Your fashion image has been generated successfully.",
    tag: `obitrend-generation-${jobId}`,
    url: `/`
  });
  for (const row of rows || []) {
    try {
      await webpush.sendNotification(row.subscription, payload);
    } catch (pushError) {
      const status = Number(pushError?.statusCode || 0);
      if (status === 404 || status === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", row.id);
      } else {
        console.warn("OBITREND push delivery failed:", pushError?.message || pushError);
      }
    }
  }
}

async function runGeneration({ jobId, userId, token, payload }) {
  const supabase = serviceClient();
  try {
    const response = await fetch(`${APP_ORIGIN}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const raw = await response.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch {}

    if (!response.ok || data?.success !== true) {
      throw new Error(data?.error || "OBITREND could not complete the image generation.");
    }

    await updateJob(supabase, jobId, { progress: 75 });
    const images = extractImages(data);
    if (!images.length) throw new Error("No generated image was returned.");

    const stored = await saveGeneratedImages(supabase, userId, jobId, images);
    await updateJob(supabase, jobId, {
      status: "completed",
      progress: 100,
      result: stored,
      completed_at: new Date().toISOString(),
    });
    await notifyUser(supabase, userId, jobId);
  } catch (error) {
    console.error("OBITREND background generation failed:", error?.message || error);
    try {
      await updateJob(supabase, jobId, {
        status: "failed",
        progress: 100,
        error_message: "OBITREND could not complete the image generation right now. Please try again.",
        completed_at: new Date().toISOString(),
      });
    } catch (dbError) {
      console.error("OBITREND job failure update failed:", dbError?.message || dbError);
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { success: false, error: "Method not allowed." });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(res, 500, { success: false, error: "Background generation is not configured yet." });
  }

  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth.ok) return json(res, auth.status, { success: false, error: auth.error });

    const payload = req.body || {};
    if (!payload.imageBase64) {
      return json(res, 400, { success: false, error: "Please upload a clothing image first." });
    }

    const supabase = serviceClient();
    const jobId = await createJob(supabase, auth.user.id);

    waitUntil(runGeneration({
      jobId,
      userId: auth.user.id,
      token: String(req.headers.authorization || "").replace(/^Bearer\s+/i, ""),
      payload: { ...payload, userId: auth.user.id },
    }));

    return json(res, 202, {
      success: true,
      queued: true,
      jobId,
      message: "Your fashion image is being generated in the background.",
    });
  } catch (error) {
    console.error("OBITREND background job creation failed:", error?.message || error);
    return json(res, 503, { success: false, error: "OBITREND could not start the background generation." });
  }
}
