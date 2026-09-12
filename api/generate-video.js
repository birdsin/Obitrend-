import RunwayML, { TaskFailedError } from "@runwayml/sdk";
import { createClient } from "@supabase/supabase-js";

import {
  getAuthenticatedUser,
  getProStatus,
  getRedisConfig,
} from "../lib/credits.js";

const RUNWAY_API_KEY = process.env.RUNWAY_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const runway = RUNWAY_API_KEY
  ? new RunwayML({
      apiKey: RUNWAY_API_KEY,
    })
  : null;

function supabaseServiceClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase server configuration is missing.");
  }

  return createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

function send(res, status, body) {
  return res.status(status).json(body);
}

/*
=========================================================
REFUND VIDEO CREDIT
Used when Runway cannot start a task.
=========================================================
*/
async function refundVideoCredit(
  supabase,
  userId,
  duration
) {
  try {
    const { data, error } = await supabase.rpc(
      "refund_video_credit",
      {
        target_user_id: userId,
        target_duration: duration,
      }
    );

    if (error) {
      console.error(
        "OBITREND video credit refund error:",
        error.message
      );

      return false;
    }

    return Boolean(data?.[0]?.success);
  } catch (error) {
    console.error(
      "OBITREND video credit refund exception:",
      error?.message || error
    );

    return false;
  }
}

/*
=========================================================
MAIN VIDEO GENERATION ENDPOINT
=========================================================
*/
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return send(res, 405, {
      success: false,
      error: "Method not allowed.",
    });
  }

  if (!RUNWAY_API_KEY || !runway) {
    return send(res, 503, {
      success: false,
      error: "Video generation is not configured yet.",
    });
  }

  let auth;
  let duration = 0;
  let videoCreditConsumed = false;

  try {
    /*
    ------------------------------------------------------
    AUTHENTICATION
    ------------------------------------------------------
    */
    auth = await getAuthenticatedUser(req);

    if (!auth.ok) {
      return send(res, auth.status, {
        success: false,
        error: auth.error,
      });
    }

    /*
    ------------------------------------------------------
    VIDEO IS PRO-ONLY
    FREE USERS CANNOT GENERATE VIDEO
    FREE IMAGE CREDITS ARE NEVER USED FOR VIDEO
    ------------------------------------------------------
    */
    const redis = getRedisConfig();

    const proStatus = await getProStatus(
      auth.user.id,
      redis
    );

    if (!proStatus.active) {
      return send(res, 403, {
        success: false,
        proRequired: true,
        error:
          "Video generation is available to OBITREND Pro users only.",
      });
    }

    /*
    ------------------------------------------------------
    REQUEST DATA
    ------------------------------------------------------
    */
    const body = req.body || {};

    const prompt = String(
      body.prompt || ""
    ).trim();

    const imageUrl = String(
      body.imageUrl || ""
    ).trim();

    const ratio = String(
      body.ratio || "1280:720"
    );

    duration = Number(
      body.duration || 5
    );

    /*
    ------------------------------------------------------
    PROMPT REQUIRED
    ------------------------------------------------------
    */
    if (!prompt) {
      return send(res, 400, {
        success: false,
        error: "Video prompt is required.",
      });
    }

    /*
    ------------------------------------------------------
    ONLY PAID VIDEO PACKAGES ARE ALLOWED
    5 SECONDS
    10 SECONDS
    ------------------------------------------------------
    */
    if (![5, 10].includes(duration)) {
      return send(res, 400, {
        success: false,
        error:
          "Video duration must be 5 or 10 seconds.",
      });
    }

    /*
    ------------------------------------------------------
    RUNWAY SUPPORTED RATIOS
    ------------------------------------------------------
    */
    const allowedRatios = new Set([
      "1280:720",
      "720:1280",
      "1584:672",
      "1104:832",
      "832:1104",
      "672:1584",
      "960:960",
    ]);

    if (!allowedRatios.has(ratio)) {
      return send(res, 400, {
        success: false,
        error: "Unsupported video aspect ratio.",
      });
    }

    /*
    ------------------------------------------------------
    SUPABASE SERVICE CLIENT
    ------------------------------------------------------
    */
    const supabase = supabaseServiceClient();

    /*
    ------------------------------------------------------
    CONSUME THE CORRECT VIDEO CREDIT
    5 SECOND -> balance_5
    10 SECOND -> balance_10
    ------------------------------------------------------
    */
    const {
      data: creditData,
      error: creditError,
    } = await supabase.rpc(
      "consume_video_credit",
      {
        target_user_id: auth.user.id,
        target_duration: duration,
      }
    );

    if (creditError) {
      console.error(
        "OBITREND video credit consumption error:",
        creditError.message
      );

      return send(res, 503, {
        success: false,
        error:
          "Video credit system is temporarily unavailable. Please try again.",
      });
    }

    const creditResult =
      creditData?.[0];

    if (!creditResult?.success) {
      return send(res, 402, {
        success: false,
        videoCreditRequired: true,
        duration,
        error:
          duration === 5
            ? "You need a 5-second video credit to generate this video."
            : "You need a 10-second video credit to generate this video.",
      });
    }

    videoCreditConsumed = true;

    /*
    ------------------------------------------------------
    CREATE RUNWAY VIDEO TASK
    ------------------------------------------------------
    */
    const input = {
      model: "gen4.5",
      promptText: prompt,
      ratio,
      duration,
    };

    if (imageUrl) {
      input.promptImage = imageUrl;
    }

    let task;

    try {
      task = await runway.imageToVideo.create(
        input
      );
    } catch (error) {
      /*
      ----------------------------------------------------
      RUNWAY DID NOT START
      RETURN THE VIDEO CREDIT
      ----------------------------------------------------
      */
      if (videoCreditConsumed) {
        await refundVideoCredit(
          supabase,
          auth.user.id,
          duration
        );

        videoCreditConsumed = false;
      }

      if (error instanceof TaskFailedError) {
        console.error(
          "OBITREND Runway task failed:",
          error.taskDetails
        );

        return send(res, 502, {
          success: false,
          error:
            "Runway could not start the video generation. Your video credit was returned.",
        });
      }

      console.error(
        "OBITREND Runway start error:",
        error?.message || error
      );

      return send(res, 502, {
        success: false,
        error:
          "Runway could not start the video generation. Your video credit was returned.",
      });
    }

    /*
    ------------------------------------------------------
    REGISTER VIDEO JOB
    ------------------------------------------------------
    */
    const {
      error: insertError,
    } = await supabase
      .from("video_jobs")
      .insert({
        user_id: auth.user.id,
        runway_task_id: task.id,
        status: "queued",
        progress: 0,
        prompt,
        image_url: imageUrl || null,
        duration_seconds: duration,
        credit_refunded: false,
      });

    if (insertError) {
      console.error(
        "OBITREND video job database error:",
        insertError.message
      );

      /*
      ----------------------------------------------------
      The Runway task already exists.
      We cannot safely pretend the task never started.
      The credit remains consumed so a completed task
      cannot accidentally become a free video.
      ----------------------------------------------------
      */

      return send(res, 503, {
        success: false,
        error:
          "Video started but could not be registered. Please contact OBITREND support before retrying.",
      });
    }

    /*
    ------------------------------------------------------
    SUCCESS
    ------------------------------------------------------
    */
    return send(res, 200, {
      success: true,
      taskId: task.id,
      status: "queued",
      duration,
      remainingCredits:
        creditResult.remaining_credits,
      message:
        "Video generation started.",
    });
  } catch (error) {
    /*
    ------------------------------------------------------
    UNEXPECTED ERROR
    ------------------------------------------------------
    */
    console.error(
      "OBITREND video generation error:",
      error?.message || error
    );

    /*
    ------------------------------------------------------
    IF CREDIT WAS CONSUMED BUT RUNWAY NEVER STARTED,
    ATTEMPT TO RETURN IT.
    ------------------------------------------------------
    */
    if (
      videoCreditConsumed &&
      auth?.user?.id &&
      [5, 10].includes(duration)
    ) {
      try {
        const supabase =
          supabaseServiceClient();

        await refundVideoCredit(
          supabase,
          auth.user.id,
          duration
        );
      } catch (refundError) {
        console.error(
          "OBITREND emergency video credit refund error:",
          refundError?.message ||
            refundError
        );
      }
    }

    return send(res, 500, {
      success: false,
      error:
        "Unable to start video generation right now.",
    });
  }
}
