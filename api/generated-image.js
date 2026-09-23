import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "../lib/credits.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_BUCKET = "obitrend-generated";

function serviceClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase server configuration is missing.");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

function pathFromStoredImage(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    const marker = "/storage/v1/object/sign/";
    const index = url.pathname.indexOf(marker);
    if (index === -1) return null;

    const encoded = url.pathname.slice(index + marker.length);
    const slash = encoded.indexOf("/");
    if (slash <= 0) return null;

    return {
      bucket: decodeURIComponent(encoded.slice(0, slash)),
      path: decodeURIComponent(encoded.slice(slash + 1))
    };
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed." });
  }

  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ success: false, error: auth.error });
    }

    const pathParam = String(req.query?.path || "").trim();
    const jobId = String(req.query?.jobId || "").trim();

    const supabase = serviceClient();
    let stored = null;

    /*
    Direct generated-image requests use the private storage path returned
    by the image generation API. The path is accepted only when it belongs
    to the authenticated user's own images directory.
    */
    if (pathParam) {
      const decodedPath = decodeURIComponent(pathParam);
      const ownerPrefix = `${auth.user.id}/`;
      if (!decodedPath.startsWith(ownerPrefix) || decodedPath.includes("..")) {
        return res.status(403).json({
          success: false,
          error: "You are not authorized to load this generated image."
        });
      }
      stored = { bucket: DEFAULT_BUCKET, path: decodedPath };
    } else {
      if (!jobId) {
        return res.status(400).json({
          success: false,
          error: "Generation image reference is required."
        });
      }

      const { data: job, error: jobError } = await supabase
        .from("generation_jobs")
        .select("id,user_id,status,result")
        .eq("id", jobId)
        .eq("user_id", auth.user.id)
        .maybeSingle();

      if (jobError) throw jobError;
      if (!job) {
        return res.status(404).json({ success: false, error: "Generation job not found." });
      }
      if (job.status !== "completed") {
        return res.status(409).json({ success: false, error: "Generation is not completed yet." });
      }

      const result = job.result || {};
      stored = result.storagePath
        ? { bucket: DEFAULT_BUCKET, path: String(result.storagePath) }
        : pathFromStoredImage(result.imageUrl || result.images?.[0]);
    }

    if (!stored?.path) {
      return res.status(404).json({
        success: false,
        error: "Generated image file could not be located."
      });
    }

    const bucket = stored.bucket || DEFAULT_BUCKET;
    const { data: file, error: downloadError } = await supabase.storage
      .from(bucket)
      .download(stored.path);

    if (downloadError || !file) {
      throw downloadError || new Error("Generated image file could not be downloaded.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || "image/png";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", String(buffer.length));
    res.setHeader("Cache-Control", "private, max-age=300, stale-while-revalidate=60");
    return res.status(200).send(buffer);
  } catch (error) {
    console.error("OBITREND generated image proxy failed:", error?.message || error);
    return res.status(503).json({
      success: false,
      error: "Unable to load the generated image right now."
    });
  }
}
