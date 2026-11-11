import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "../lib/credits.js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const IMAGE_BUCKET = "obitrend-generated";

function getBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  const match = typeof header === "string" ? header.match(/^Bearer\s+(.+)$/i) : null;
  return match ? match[1].trim() : "";
}

function userStorageClient(accessToken) {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !accessToken) {
    throw new Error("Authenticated image storage configuration is missing.");
  }
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    accessToken: async () => accessToken,
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

function send(res, status, body) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return send(res, 405, { success: false, error: "Method not allowed." });
  }

  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth.ok) {
      return send(res, auth.status, { success: false, error: auth.error });
    }

    const accessToken = getBearerToken(req);
    const path = String(req.query?.path || "").trim();
    if (!path) {
      return send(res, 400, { success: false, error: "Saved image reference is required." });
    }

    // Only permit an image under the authenticated user's own storage folder.
    // The bucket is fixed server-side; callers cannot select another bucket.
    const ownerPrefix = `${auth.user.id}/images/`;
    if (
      !path.startsWith(ownerPrefix) ||
      path.includes("\\") ||
      path.split("/").some(segment => segment === "." || segment === "..") ||
      !/\.(png|jpe?g|webp)$/i.test(path)
    ) {
      return send(res, 403, {
        success: false,
        error: "You are not authorized to load this generated image."
      });
    }

    const supabase = userStorageClient(accessToken);
    const { data: file, error } = await supabase.storage
      .from(IMAGE_BUCKET)
      .download(path);

    if (error || !file) {
      console.warn("OBITREND authenticated image download failed:", error?.message || error);
      return send(res, 404, {
        success: false,
        error: "This saved image is unavailable. Refresh your History and try again."
      });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!buffer.length) {
      return send(res, 404, { success: false, error: "The saved image file is empty." });
    }

    const contentType = file.type || "image/png";
    const extension = contentType.includes("webp")
      ? "webp"
      : contentType.includes("jpeg") || contentType.includes("jpg")
        ? "jpg"
        : "png";
    const filename = `OBITREND-fashion-creation.${extension}`;
    const shouldDownload = String(req.query?.download || "") === "1";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", String(buffer.length));
    res.setHeader(
      "Content-Disposition",
      shouldDownload
        ? `attachment; filename="${filename}"; filename*=UTF-8''${filename}`
        : "inline"
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    return res.status(200).send(buffer);
  } catch (error) {
    console.error("OBITREND authenticated generated-image proxy failed:", error?.message || error);
    return send(res, 503, {
      success: false,
      error: "Unable to load the generated image right now. Please refresh and try again."
    });
  }
}
