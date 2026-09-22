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
    const prefix = `${auth.user.id}/images`;

    const { data: files, error } = await supabase.storage
      .from(IMAGE_BUCKET)
      .list(prefix, {
        limit: 50,
        sortBy: { column: "created_at", order: "desc" }
      });

    if (error) throw error;

    const images = (files || [])
      .filter(file => file?.name && /\\.png$/i.test(file.name))
      .map(file => {
        const path = `${prefix}/${file.name}`;
        return {
          id: path,
          imageUrl: `/api/generated-image?path=${encodeURIComponent(path)}`,
          createdAt: file.created_at || file.updated_at || null
        };
      });

    return res.status(200).json({ success: true, images });
  } catch (error) {
    console.error("OBITREND image gallery error:", error?.message || error);
    return res.status(500).json({
      success: false,
      error: "Unable to load your saved images right now."
    });
  }
}
