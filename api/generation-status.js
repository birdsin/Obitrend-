import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "../lib/credits.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function client() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ success: false, error: "Method not allowed." });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ success: false, error: "Generation status is not configured." });
  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });
    const jobId = String(req.query?.jobId || "").trim();
    if (!jobId) return res.status(400).json({ success: false, error: "Generation job ID is required." });
    const { data, error } = await client()
      .from("generation_jobs")
      .select("id,status,progress,result,error_message,created_at,completed_at")
      .eq("id", jobId)
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: "Generation job not found." });

    /*
      Generated files are private Supabase objects. Return a fresh signed
      browser URL for completed images so the <img> element can load the
      image directly without relying on Authorization headers, blob URLs,
      or a browser-specific object-URL delivery path.
    */
    if (data.status === "completed" && data.result?.storagePaths?.length) {
      const result = { ...data.result };
      const paths = Array.isArray(result.storagePaths) ? result.storagePaths : [];
      const signedImages = await Promise.all(paths.map(async (path) => {
        const safePath = String(path || "").trim();
        if (!safePath || !safePath.startsWith(auth.user.id + "/")) return null;
        const { data: signed, error: signedError } = await client()
          .storage
          .from("obitrend-generated")
          .createSignedUrl(safePath, 3600);
        if (signedError || !signed?.signedUrl) return null;
        return signed.signedUrl;
      }));
      const validSignedImages = signedImages.filter(Boolean);
      if (validSignedImages.length) {
        result.images = validSignedImages;
        result.imageUrl = validSignedImages[0];
        data = { ...data, result };
      }
    }

    return res.status(200).json({ success: true, job: data });
  } catch (error) {
    console.error("OBITREND generation status failed:", error?.message || error);
    return res.status(503).json({ success: false, error: "Unable to check generation status right now." });
  }
}
