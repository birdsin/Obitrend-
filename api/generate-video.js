import RunwayML from "@runwayml/sdk";
import { createClient } from "@supabase/supabase-js";

import {
  getAuthenticatedUser,
  getProStatus,
  getRedisConfig,
} from "../lib/credits.js";

/*
=========================================================
SERVER CONFIGURATION
=========================================================
*/

const RUNWAY_API_KEY =
  process.env.RUNWAY_API_KEY ||
  process.env.RUNWAYML_API_SECRET;

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE;

const runway = RUNWAY_API_KEY
  ? new RunwayML({
      apiKey: RUNWAY_API_KEY,
    })
  : null;

/*
=========================================================
SUPABASE SERVER CLIENT
=========================================================
*/

function supabaseServiceClient() {
  if (!SUPABASE_URL) {
    throw new Error(
      "SUPABASE_URL is missing from Vercel environment variables."
    );
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is missing from Vercel environment variables."
    );
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

/*
=========================================================
RESPONSE HELPER
=========================================================
*/

function send(res, status, body) {
  return res.status(status).json(body);
}

/*
=========================================================
SAFE ERROR EXTRACTION
=========================================================
*/

function getErrorDetails(error) {
  return {
    name: error?.name || null,
    message: error?.message || null,
    status: error?.status || error?.statusCode || null,
    code: error?.code || null,
    type: error?.type || null,
    taskDetails: error?.taskDetails || null,
    responseData:
      error?.response?.data ||
      error?.response?.body ||
      null,
  };
}

/*
=========================================================
REFUND VIDEO CREDIT
=========================================================
*/

async function refundVideoCredit(
  supabase,
  userId,
  duration
) {
  try {
    const { data, error } =
      await supabase.rpc(
        "refund_video_credit",
        {
          target_user_id: userId,
          target_duration: duration,
        }
      );

    if (error) {
      console.error(
        "OBITREND VIDEO REFUND ERROR:",
        error
      );

      return false;
    }

    return Boolean(
      data?.[0]?.success
    );
  } catch (error) {
    console.error(
      "OBITREND VIDEO REFUND EXCEPTION:",
      getErrorDetails(error)
    );

    return false;
  }
}

/*
=========================================================
MAIN VIDEO GENERATION ENDPOINT
=========================================================
*/

export default async function handler(
  req,
  res
) {
  /*
  -------------------------------------------------------
  METHOD
  -------------------------------------------------------
  */

  if (req.method !== "POST") {
    return send(res, 405, {
      success: false,
      error: "Method not allowed.",
    });
  }

  /*
  -------------------------------------------------------
  RUNWAY CONFIGURATION
  -------------------------------------------------------
  */

  if (!RUNWAY_API_KEY || !runway) {
    console.error(
      "OBITREND ERROR: Runway API key is missing."
    );

    return send(res, 503, {
      success: false,
      error:
        "Runway video generation is not configured on the server.",
    });
  }

  let auth = null;
  let duration = 0;
  let videoCreditConsumed = false;
  let supabase = null;

  try {
    /*
    =====================================================
    AUTHENTICATION
    =====================================================
    */

    auth =
      await getAuthenticatedUser(req);

    if (!auth?.ok) {
      return send(
        res,
        auth?.status || 401,
        {
          success: false,
          error:
            auth?.error ||
            "Authentication failed.",
        }
      );
    }

    /*
    =====================================================
    PRO CHECK
    =====================================================
    */

    const redis =
      getRedisConfig();

    const proStatus =
      await getProStatus(
        auth.user.id,
        redis
      );

    if (!proStatus?.active) {
      return send(res, 403, {
        success: false,
        proRequired: true,
        error:
          "Video generation is available to OBITREND Pro users only.",
      });
    }

    /*
    =====================================================
    REQUEST DATA
    =====================================================
    */

    const body =
      req.body || {};

    const prompt =
      typeof body.prompt === "string"
        ? body.prompt.trim()
        : "";

    const imageUrl =
      typeof body.imageUrl === "string"
        ? body.imageUrl.trim()
        : "";

    const ratio =
      typeof body.ratio === "string"
        ? body.ratio.trim()
        : "1280:720";

    duration =
      Number(body.duration);

    if (!Number.isFinite(duration)) {
      duration = 5;
    }

    /*
    =====================================================
    VALIDATE PROMPT
    =====================================================
    */

    if (!prompt) {
      return send(res, 400, {
        success: false,
        error:
          "Video prompt is required.",
      });
    }

    /*
    =====================================================
    VALIDATE DURATION
    =====================================================
    */

    if (![5, 10].includes(duration)) {
      return send(res, 400, {
        success: false,
        error:
          "Video duration must be 5 or 10 seconds.",
      });
    }

    /*
    =====================================================
    RUNWAY GEN-4.5 RATIOS
    =====================================================
    */

    const allowedRatios =
      new Set([
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
        error:
          "Unsupported video aspect ratio.",
        allowedRatios:
          Array.from(
            allowedRatios
          ),
      });
    }

    /*
    =====================================================
    IMAGE VALIDATION
    =====================================================
    */

    if (imageUrl) {
      const validImage =
        imageUrl.startsWith("http://") ||
        imageUrl.startsWith("https://") ||
        imageUrl.startsWith("data:image/");

      if (!validImage) {
        return send(res, 400, {
          success: false,
          error:
            "The video reference image is invalid. Use a public image URL or supported image data.",
        });
      }
    }

    /*
    =====================================================
    SUPABASE
    =====================================================
    */

    supabase =
      supabaseServiceClient();

    /*
    =====================================================
    CONSUME VIDEO CREDIT
    =====================================================
    */

    const {
      data: creditData,
      error: creditError,
    } =
      await supabase.rpc(
        "consume_video_credit",
        {
          target_user_id:
            auth.user.id,
          target_duration:
            duration,
        }
      );

    if (creditError) {
      console.error(
        "OBITREND CREDIT CONSUMPTION ERROR:",
        creditError
      );

      return send(res, 503, {
        success: false,
        error:
          "Video credit system is temporarily unavailable.",
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
    =====================================================
    RUNWAY REQUEST
    =====================================================
    */

    const input = {
      model: "gen4.5",
      promptText: prompt,
      ratio,
      duration,
    };

    /*
    -----------------------------------------------------
    ADD IMAGE ONLY WHEN PROVIDED
    -----------------------------------------------------
    */

    if (imageUrl) {
      input.promptImage =
        imageUrl;
    }

    console.log(
      "OBITREND RUNWAY REQUEST:",
      {
        model: input.model,
        ratio: input.ratio,
        duration: input.duration,
        hasPromptImage:
          Boolean(input.promptImage),
        promptLength:
          prompt.length,
      }
    );

    /*
    =====================================================
    CREATE RUNWAY TASK
    =====================================================
    */

    let task;

    try {
      task =
        await runway.imageToVideo.create(
          input
        );
    } catch (runwayError) {
      const details =
        getErrorDetails(
          runwayError
        );

      console.error(
        "OBITREND RUNWAY CREATE ERROR:",
        details
      );

      /*
      ---------------------------------------------------
      REFUND CREDIT
      ---------------------------------------------------
      */

      if (
        videoCreditConsumed &&
        supabase
      ) {
        const refunded =
          await refundVideoCredit(
            supabase,
            auth.user.id,
            duration
          );

        videoCreditConsumed =
          !refunded;
      }

      /*
      ---------------------------------------------------
      RETURN USEFUL ERROR
      ---------------------------------------------------
      */

      return send(res, 502, {
        success: false,
        error:
          "Runway rejected the video request. Your video credit was returned.",
        provider: "runway",
        details:
          process.env.NODE_ENV ===
          "production"
            ? undefined
            : details,
      });
    }

    /*
    =====================================================
    VERIFY TASK ID
    =====================================================
    */

    if (!task?.id) {
      console.error(
        "OBITREND RUNWAY RETURNED NO TASK ID:",
        task
      );

      if (
        videoCreditConsumed &&
        supabase
      ) {
        const refunded =
          await refundVideoCredit(
            supabase,
            auth.user.id,
            duration
          );

        videoCreditConsumed =
          !refunded;
      }

      return send(res, 502, {
        success: false,
        error:
          "Runway did not return a valid video task. Your video credit was returned.",
      });
    }

    console.log(
      "OBITREND RUNWAY TASK CREATED:",
      task.id
    );

    /*
    =====================================================
    REGISTER JOB
    =====================================================
    */

    const {
      error: insertError,
    } =
      await supabase
        .from("video_jobs")
        .insert({
          user_id:
            auth.user.id,
          runway_task_id:
            task.id,
          status:
            "queued",
          progress: 0,
          prompt,
          image_url:
            imageUrl || null,
          duration_seconds:
            duration,
          credit_refunded:
            false,
        });

    /*
    =====================================================
    DATABASE ERROR
    =====================================================
    */

    if (insertError) {
      console.error(
        "OBITREND VIDEO JOB INSERT ERROR:",
        insertError
      );

      /*
      IMPORTANT:
      Do NOT refund here because Runway has
      already accepted the task.
      */

      return send(res, 503, {
        success: false,
        error:
          "Video was accepted by Runway, but OBITREND could not save the video job.",
        taskId:
          task.id,
        databaseError:
          process.env.NODE_ENV ===
          "production"
            ? undefined
            : insertError.message,
      });
    }

    /*
    =====================================================
    SUCCESS
    =====================================================
    */

    return send(res, 200, {
      success: true,
      taskId:
        task.id,
      status:
        "queued",
      duration,
      remainingCredits:
        creditResult.remaining_credits,
      message:
        "Video generation started.",
    });
  } catch (error) {
    /*
    =====================================================
    UNEXPECTED ERROR
    =====================================================
    */

    const details =
      getErrorDetails(error);

    console.error(
      "================================================="
    );

    console.error(
      "OBITREND VIDEO GENERATION UNEXPECTED ERROR"
    );

    console.error(
      details
    );

    console.error(
      "================================================="
    );

    /*
    -----------------------------------------------------
    EMERGENCY REFUND
    -----------------------------------------------------
    */

    if (
      videoCreditConsumed &&
      auth?.user?.id &&
      [5, 10].includes(duration) &&
      supabase
    ) {
      const refunded =
        await refundVideoCredit(
          supabase,
          auth.user.id,
          duration
        );

      if (refunded) {
        videoCreditConsumed =
          false;
      }
    }

    /*
    -----------------------------------------------------
    RETURN ERROR
    -----------------------------------------------------
    */

    return send(res, 500, {
      success: false,
      error:
        "Unable to start video generation right now.",
      details:
        process.env.NODE_ENV ===
        "production"
          ? undefined
          : details.message,
    });
  }
}
