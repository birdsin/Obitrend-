import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "../lib/credits.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const IMAGE_BUCKET = "obitrend-generated";

function client() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase server configuration is missing.");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

function send(res, status, body) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  return res.status(status).json(body);
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

    const supabase = client();
    const userId = auth.user.id;
    const imagePaths = new Map();

    async function collectImageFiles(prefix) {
      const { data: files, error } = await supabase.storage
        .from(IMAGE_BUCKET)
        .list(prefix, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
      if (error) throw error;

      for (const file of files || []) {
        if (!file?.name) continue;
        const path = `${prefix}/${file.name}`;
        if (/\.(png|jpe?g|webp)$/i.test(file.name)) {
          imagePaths.set(path, file);
        } else if (!file.metadata && !file.id) {
          await collectImageFiles(path);
        }
      }
    }

    await collectImageFiles(`${userId}/images`);
    await collectImageFiles(userId);

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
      .slice(0, 50);

    return send(res, 200, { success: true, images });
  } catch (error) {
    console.error("OBITREND image gallery error:", error?.message || error);
    return send(res, 500, { success: false, error: "Unable to load your saved images right now." });
  }
}
