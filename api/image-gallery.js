import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "../lib/credits.js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const IMAGE_BUCKET = "obitrend-generated";

function send(res, status, body) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  return res.status(status).json(body);
}

function getBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  const match = typeof header === "string" ? header.match(/^Bearer\s+(.+)$/i) : null;
  return match ? match[1].trim() : "";
}

function userStorageClient(accessToken) {
  const publishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !publishableKey || !accessToken) {
    throw new Error("Supabase authenticated storage configuration is missing.");
  }
  return createClient(SUPABASE_URL, publishableKey, {
    accessToken: async () => accessToken,
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return send(res, 405, { success: false, error: "Method not allowed." });
  }

  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth.ok) {
      return send(res, auth.status, { success: false, error: auth.error });
    }

    // Use the same signed-in user's Supabase session that uploaded the images.
    // This avoids relying on a separate service-role environment variable.
    const supabase = userStorageClient(getBearerToken(req));
    const userId = auth.user.id;
    const imagePaths = new Map();

    async function collectImageFiles(prefix) {
      const pageSize = 1000;
      let offset = 0;
      while (true) {
        const { data: files, error } = await supabase.storage
          .from(IMAGE_BUCKET)
          .list(prefix, { limit: pageSize, offset, sortBy: { column: "created_at", order: "desc" } });
        if (error) throw error;
        const page = files || [];
        for (const file of page) {
          if (!file?.name) continue;
          const path = `${prefix}/${file.name}`;
          if (/\.(png|jpe?g|webp)$/i.test(file.name)) {
            imagePaths.set(path, file);
          } else if (!file.metadata && !file.id) {
            await collectImageFiles(path);
          }
        }
        if (page.length < pageSize) break;
        offset += pageSize;
      }
    }

    await collectImageFiles(`${userId}/images`);

    const images = (await Promise.all([...imagePaths.entries()].map(async ([path, file]) => {
      const { data, error } = await supabase.storage
        .from(IMAGE_BUCKET)
        .createSignedUrl(path, 3600, { download: false });
      if (error || !data?.signedUrl) {
        console.warn("OBITREND gallery signed URL failed:", path, error?.message || error);
        return null;
      }
      return {
        id: path,
        imageUrl: data.signedUrl,
        storagePath: path,
        createdAt: file?.created_at || file?.updated_at || null
      };
    }))).filter(Boolean)
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .slice(0, 200);

    return send(res, 200, { success: true, images });
  } catch (error) {
    console.error("OBITREND image gallery error:", error?.message || error);
    return send(res, 500, {
      success: false,
      error: "Unable to load your saved images right now."
    });
  }
}
