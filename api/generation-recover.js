import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser, getRedisConfig, refundCredit } from "../lib/credits.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function client() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success:false, error:"Method not allowed." });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ success:false, error:"Generation recovery is not configured." });
  }

  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth.ok) return res.status(auth.status).json({ success:false, error:auth.error });

    const supabase = client();
    const { data: jobs, error } = await supabase
      .from("generation_jobs")
      .select("id,status,result,error_message,created_at")
      .eq("user_id", auth.user.id)
      .eq("status", "completed")
      .order("created_at", { ascending:false })
      .limit(5);

    if (error) throw error;

    const broken = (jobs || []).find(job => {
      const result = job?.result;
      const imageUrl = result?.imageUrl || (Array.isArray(result?.images) ? result.images.find(Boolean) : null);
      return !imageUrl;
    });

    if (!broken) {
      return res.status(200).json({ success:true, restored:false });
    }

    const claimed = await supabase
      .from("generation_jobs")
      .update({
        status:"failed",
        progress:100,
        error_message:"Generation completed without a usable image. Credit restored automatically."
      })
      .eq("id", broken.id)
      .eq("user_id", auth.user.id)
      .eq("status", "completed")
      .select("id")
      .maybeSingle();

    if (claimed.error) throw claimed.error;
    if (!claimed.data) return res.status(200).json({ success:true, restored:false });

    const redis = getRedisConfig();
    const refund = await refundCredit(auth.user.id, redis, "pro");
    if (!refund?.success) {
      await supabase
        .from("generation_jobs")
        .update({
          status:"completed",
          progress:100,
          error_message:null
        })
        .eq("id", broken.id)
        .eq("user_id", auth.user.id);
      throw new Error("Unable to restore the image credit right now.");
    }

    return res.status(200).json({
      success:true,
      restored:true,
      creditType:"pro",
      balance:refund.balance
    });
  } catch (error) {
    console.error("OBITREND generation credit recovery failed:", error?.message || error);
    return res.status(503).json({
      success:false,
      restored:false,
      error:"Unable to restore the failed generation credit right now."
    });
  }
}