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

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed." });
  }

  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ success: false, error: auth.error });
    }

    const supabase = client();
    const userId = auth.user.id;
    const imagePaths = new Map();

    async function collectPngFiles(prefix) {
      const pageSize = 100;
      let offset = 0;
      while (true) {
        const { data: files, error } = await supabase.storage
          .from(IMAGE_BUCKET)
          .list(prefix, {
            limit: pageSize,
            offset,
            sortBy: { column: "created_at", order: "desc" }
          });
        if (error) throw error;
        for (const file of files || []) {
          if (!file?.name) continue;
          const path = `${prefix}/${file.name}`;
          if (/\.(png|jpe?g|webp)$/i.test(file.name)) {
            imagePaths.set(path, file);
          } else if (!file.metadata && !file.id) {
            await collectPngFiles(path);
          }
        }
        if (!files || files.length < pageSize) break;
        offset += files.length;
      }
    }

    // Support both the older user/images layout and the current
    // user/job-id/image-N.png layout.
    await collectPngFiles(`${userId}/images`);
    await collectPngFiles(userId);

    const recentPaths = [...imagePaths.entries()]
      .sort((a, b) => String(b[1]?.created_at || b[1]?.updated_at || "").localeCompare(String(a[1]?.created_at || a[1]?.updated_at || "")))
      .slice(0, 50);
    const images = (await Promise.all(
      recentPaths.map(async ([path, file]) => {
        // Return a fresh signed URL for every gallery load. The bucket is private,
        // and this avoids showing expired/failed browser proxy URLs for saved work.
        const { data: signed, error: signedError } = await supabase.storage
          .from(IMAGE_BUCKET)
          .createSignedUrl(path, 3600);

        if (signedError || !signed?.signedUrl) {
          console.warn("OBITREND gallery signed URL failed:", path, signedError?.message || signedError);
          return null;
        }

        return {
          id: path,
          imageUrl: signed.signedUrl,
          storagePath: path,
          createdAt: file?.created_at || file?.updated_at || null
        };
      })
    )).filter(Boolean);

    return res.status(200).json({ success: true, images });
  } catch (error) {
    console.error("OBITREND image gallery error:", error?.message || error);
    return res.status(500).json({
      success: false,
      error: "Unable to load your saved images right now."
    });
  }
}
