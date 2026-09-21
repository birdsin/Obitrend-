import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser, getRedisConfig } from "../lib/credits.js";
import { getVideoStatus, refundVideoReservationByTask } from "../video-credits.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getSupabaseAdmin() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function send(res, status, body) {
  return res.status(status).json(body);
}

async function reconcileFailedVideoRefunds(userId, redis) {
  const supabase = getSupabaseAdmin();
  if (!supabase || !redis) return;

  const { data: failedJobs, error } = await supabase
    .from("video_jobs")
    .select("id,runway_task_id,credit_refunded")
    .eq("user_id", userId)
    .eq("status", "failed")
    .eq("credit_refunded", false)
    .not("runway_task_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error || !Array.isArray(failedJobs) || !failedJobs.length) return;

  for (const job of failedJobs) {
    try {
      const result = await refundVideoReservationByTask({
        taskId: String(job.runway_task_id),
        redis,
      });

      if (result?.ok) {
        await supabase
          .from("video_jobs")
          .update({ credit_refunded: true })
          .eq("id", job.id)
          .eq("user_id", userId);
      }
    } catch (refundError) {
      console.error(
        "OBITREND failed video refund reconciliation error:",
        refundError?.message || refundError
      );
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return send(res, 405, {
      success: false,
      error: "Method not allowed.",
    });
  }

  try {
    const auth = await getAuthenticatedUser(req);

    if (!auth.ok) {
      return send(res, auth.status, {
        success: false,
        error: auth.error,
      });
    }

    const redis = getRedisConfig();

    // Recover any failed video reservations that were not marked refunded.
    // This is idempotent: already-refunded reservations are not credited again.
    await reconcileFailedVideoRefunds(auth.user.id, redis);

    const wallet = await getVideoStatus(auth.user.id, redis);

    if (!wallet?.ok) {
      return send(res, 503, {
        success: false,
        error: "Unable to load your video credits.",
      });
    }

    const seconds = Math.max(0, Number(wallet.seconds || 0));

    /*
      Video credits are stored as seconds.

      The legacy balance5/balance10/balance15/balance20 fields are
      kept in the response for compatibility, but generation and
      payment validation use the single seconds wallet.
    */
    return send(res, 200, {
      success: true,
      seconds,
      videoSeconds: seconds,
      totalSeconds: seconds,
      balance5: Math.floor(seconds / 5),
      balance10: Math.floor(seconds / 10),
      balance15: Math.floor(seconds / 15),
      balance20: Math.floor(seconds / 20),
      totalCredits: seconds,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "OBITREND video credits error:",
      error?.message || error
    );

    return send(res, 500, {
      success: false,
      error: "Unable to load video credits right now.",
    });
  }
}
