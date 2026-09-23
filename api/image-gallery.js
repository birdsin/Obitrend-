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
      const { data: files, error } = await supabase.storage
        .from(IMAGE_BUCKET)
        .list(prefix, {
          limit: 100,
          sortBy: { column: "created_at", order: "desc" }
        });

      if (error) throw error;

      for (const file of files || []) {
        if (!file?.name) continue;
        const path = `${prefix}/${file.name}`;
        if (/\\.png$/i.test(file.name)) {
          imagePaths.set(path, file);
        } else if (!file.metadata && !file.id) {
          // Storage folders are returned without file metadata.
          await collectPngFiles(path);
        }
      }
    }

    // Support both the older user/images layout and the current
    // user/job-id/image-N.png layout.
    await collectPngFiles(`${userId}/images`);
    await collectPngFiles(userId);

    const images = (await Promise.all(
      [...imagePaths.entries()].map(async ([path, file]) => {
        /*
          Keep gallery images behind the authenticated image proxy instead
          of exposing a time-limited signed URL to the browser.

          The proxy verifies the signed-in OBITREND user owns the storage
          path and streams the private image from Supabase. This prevents
          gallery cards from becoming blank when a signed URL expires,
          fails to refresh, or is blocked by the browser.
        */
        return {
          id: path,
          imageUrl: "/api/generated-image?path=" + encodeURIComponent(path),
          storagePath: path,
          createdAt: file?.created_at || file?.updated_at || null
        };
      })
    )).filter(Boolean)
      .sort((a,b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .slice(0, 50);

    return res.status(200).json({ success: true, images });
  } catch (error) {
    console.error("OBITREND image gallery error:", error?.message || error);
    return res.status(500).json({
      success: false,
      error: "Unable to load your saved images right now."
    });
  }
}
