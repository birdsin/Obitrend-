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
          Return both delivery paths:
          1. a fresh signed Supabase URL for normal browser image loading;
          2. the authenticated OBITREND proxy as a reliable fallback.

          This keeps the existing gallery workflow unchanged while making
          saved images resilient to signed-URL/browser delivery failures.
        */
        const { data: signed, error: signedError } = await supabase.storage
          .from(IMAGE_BUCKET)
          .createSignedUrl(path, 3600);

        const proxyUrl =
          "/api/generated-image?path=" + encodeURIComponent(path);

        return {
          id: path,
          imageUrl: signedError || !signed?.signedUrl
            ? proxyUrl
            : signed.signedUrl,
          proxyUrl,
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
