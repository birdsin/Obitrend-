import RunwayML from "@runwayml/sdk";
import { createClient } from "@supabase/supabase-js";

import {
  getAuthenticatedUser,
  getProStatus,
  getRedisConfig,
} from "../lib/credits.js";

/*
=========================================================
OBITREND AI VIDEO — SECURE RUNWAY GEN-4.5
=========================================================

FLOW:

1. Authenticate user
2. Verify Pro
3. Validate request
4. Consume exactly one OBITREND video credit
5. Create Runway task
6. Save task in video_jobs
7. Return task ID

IMPORTANT:
Runway generation is asynchronous.

The separate /api/video-status endpoint is responsible
for checking the task result and refunding the OBITREND
credit if the task permanently fails.
=========================================================
*/

/*
=========================================================
ENVIRONMENT
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
RESPONSE
=========================================================
*/

function send(res, status, body) {
  return res.status(status).json(body);
}

/*
=========================================================
SAFE ERROR DETAILS
=========================================================
*/

function getErrorDetails(error) {
  return {
    name: error?.name || null,
    message: error?.message || null,
    status:
      error?.status ||
      error?.statusCode ||
      error?.response?.status ||
      null,
    code: error?.code || null,
    type: error?.type || null,
    taskDetails:
      error?.taskDetails || null,
    responseData:
      error?.response?.data ||
      error?.response?.body ||
      null,
  };
}

/*
=========================================================
NORMALIZE URL
=========================================================
*/

function isValidImageUrl(value) {
  if (typeof value !== "string") {
    return false;
  }

  const url = value.trim();

  return (
    url.startsWith("https://") ||
    url.startsWith("http://") ||
    url.startsWith("data:image/")
  );
}

/*
=========================================================
ALLOWED RUNWAY GEN-4.5 IMAGE-TO-VIDEO RATIOS
=========================================================
*/

const ALLOWED_RATIOS = new Set([
  "1280:720",
  "720:1280",
  "1584:672",
  "1104:832",
  "832:1104",
  "672:1584",
  "960:960",
]);

/*
=========================================================
SAFE PROMPT
=========================================================

The user's fashion prompt is preserved, but we add
stable instructions that reduce unnecessary prompt
ambiguity.

We do NOT ask Runway to generate text, logos or graphics.
=========================================================
*/

function buildVideoPrompt(userPrompt) {
  const clean =
    typeof userPrompt === "string"
      ? userPrompt.trim()
      : "";

  const preservation =
    [
      "Create a premium photorealistic fashion campaign video.",
      "Use the supplied reference image as the primary visual reference.",
      "Preserve the visible garment design, construction, colors, patterns, proportions and material appearance.",
      "Do not redesign, recolor, replace or alter the garment.",
      "Keep the subject and outfit visually consistent throughout the shot.",
      "Use natural adult fashion-model movement.",
      "Use smooth realistic camera movement and professional fashion lighting.",
      "Keep the garment clearly visible throughout the video.",
      "Avoid sudden scene changes, warped clothing, duplicated limbs or unnatural body movement.",
    ].join(" ");

  if (!clean) {
    return preservation;
  }

  return `${clean} ${preservation}`;
}

/*
=========================================================
MAIN HANDLER
=========================================================
*/

export default async function handler(req, res) {
  /*
  =======================================================
  METHOD
  =======================================================
  */

  if (req.method !== "POST") {
    return send(res, 405, {
      success: false,
      error: "Method not allowed.",
    });
  }

  /*
  =======================================================
  SERVER CONFIGURATION
  =======================================================
  */

  if (!RUNWAY_API_KEY || !runway) {
    console.error(
      "OBITREND VIDEO: Runway API key is missing."
    );

    return send(res, 503, {
      success: false,
      error:
        "Runway video generation is not configured on the server.",
    });
  }

  let auth = null;
  let supabase = null;

  let duration = 5;
  let creditConsumed = false;

  try {
    /*
    =====================================================
    AUTHENTICATION
    =====================================================
    */

    auth =
      await getAuthenticatedUser(req);

    if (!auth?.ok || !auth?.user?.id) {
      return send(res, auth?.status || 401, {
        success: false,
        error:
          auth?.error ||
          "Authentication failed.",
      });
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
    REQUEST
    =====================================================
    */

    const body =
      req.body || {};

    const userPrompt =
      typeof body.prompt === "string"
        ? body.prompt.trim()
        : "";

    const imageUrl =
      typeof body.imageUrl === "string"
        ? body.imageUrl.trim()
        : "";

    const requestedRatio =
      typeof body.ratio === "string"
        ? body.ratio.trim()
        : "720:1280";

    duration =
      Number(body.duration);

    if (![5, 10].includes(duration)) {
      duration = 5;
    }

    /*
    =====================================================
    PROMPT VALIDATION
    =====================================================
    */

    if (!userPrompt) {
      return send(res, 400, {
        success: false,
        error:
          "Video prompt is required.",
      });
    }

    /*
    =====================================================
    IMAGE VALIDATION
    =====================================================
    */

    if (imageUrl && !isValidImageUrl(imageUrl)) {
      return send(res, 400, {
        success: false,
        error:
          "The reference image URL is invalid.",
      });
    }

    /*
    =====================================================
    RATIO VALIDATION
    =====================================================
    */

    if (!ALLOWED_RATIOS.has(requestedRatio)) {
      return send(res, 400, {
        success: false,
        error:
          "Unsupported Gen-4.5 video aspect ratio.",
        allowedRatios:
          Array.from(ALLOWED_RATIOS),
      });
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

    This remains your existing OBITREND credit system.
    5 seconds consumes a 5-second credit.
    10 seconds consumes a 10-second credit.
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
        "OBITREND VIDEO CREDIT ERROR:",
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
            ? "You need a 5-second video credit."
            : "You need a 10-second video credit.",
      });
    }

    creditConsumed = true;

    /*
    =====================================================
    BUILD RUNWAY PROMPT
    =====================================================
    */

    const finalPrompt =
      buildVideoPrompt(
        userPrompt
      );

    /*
    =====================================================
    RUNWAY INPUT
    =====================================================
    */

    const input = {
      model: "gen4.5",

      promptText:
        finalPrompt,

      ratio:
        requestedRatio,

      duration,
    };

    /*
    -----------------------------------------------------
    ADD IMAGE ONLY WHEN PRESENT
    -----------------------------------------------------
    */

    if (imageUrl) {
      input.promptImage =
        imageUrl;
    }

    console.log(
      "================================================="
    );

    console.log(
      "OBITREND RUNWAY CREATE"
    );

    console.log({
      userId:
        auth.user.id,

      model:
        input.model,

      duration:
        input.duration,

      ratio:
        input.ratio,

      hasImage:
        Boolean(input.promptImage),

      promptLength:
        finalPrompt.length,
    });

    console.log(
      "================================================="
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
    } catch (error) {
      const details =
        getErrorDetails(error);

      console.error(
        "OBITREND RUNWAY CREATE FAILED:",
        details
      );

      /*
      ---------------------------------------------------
      TASK WAS NEVER CREATED
      ---------------------------------------------------
      */

      if (creditConsumed) {
        try {
          const { error: refundError } =
            await supabase.rpc(
              "refund_video_credit",
              {
                target_user_id:
                  auth.user.id,

                target_duration:
                  duration,
              }
            );

          if (refundError) {
            console.error(
              "OBITREND CREATE FAILURE REFUND ERROR:",
              refundError
            );
          } else {
            creditConsumed =
              false;
          }
        } catch (refundError) {
          console.error(
            "OBITREND CREATE FAILURE REFUND EXCEPTION:",
            refundError
          );
        }
      }

      const httpStatus =
        Number(details.status);

      const status =
        [400, 401, 404, 429, 502, 503, 504]
          .includes(httpStatus)
          ? httpStatus
          : 502;

      return send(res, status, {
        success: false,

        error:
          "Runway could not start this video.",

        provider:
          "runway",

        retryable:
          [429, 502, 503, 504]
            .includes(httpStatus),

        creditRestored:
          !creditConsumed,

        details:
          process.env.NODE_ENV ===
          "production"
            ? undefined
            : details,
      });
    }

    /*
    =====================================================
    VERIFY TASK
    =====================================================
    */

    if (!task?.id) {
      console.error(
        "OBITREND RUNWAY NO TASK ID:",
        task
      );

      /*
      ---------------------------------------------------
      NO TASK EXISTS -> SAFE REFUND
      ---------------------------------------------------
      */

      if (creditConsumed) {
        try {
          const { error: refundError } =
            await supabase.rpc(
              "refund_video_credit",
              {
                target_user_id:
                  auth.user.id,

                target_duration:
                  duration,
              }
            );

          if (!refundError) {
            creditConsumed =
              false;
          }
        } catch (refundError) {
          console.error(
            "OBITREND NO-TASK REFUND ERROR:",
            refundError
          );
        }
      }

      return send(res, 502, {
        success: false,

        error:
          "Runway did not return a valid video task.",

        creditRestored:
          !creditConsumed,
      });
    }

    /*
    =====================================================
    SAVE JOB IMMEDIATELY
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

          progress:
            0,

          prompt:
            finalPrompt,

          image_url:
            imageUrl || null,

          duration_seconds:
            duration,

          credit_refunded:
            false,
        });

    /*
    =====================================================
    DATABASE FAILURE AFTER RUNWAY ACCEPTED TASK
    =====================================================

    IMPORTANT:
    DO NOT refund automatically here.

    Runway already owns the task. The status endpoint
    must be able to recover the task by ID.

    Otherwise a refund could give the user a free credit
    while the Runway generation continues successfully.
    =====================================================
    */

    if (insertError) {
      console.error(
        "OBITREND VIDEO JOB INSERT ERROR:",
        insertError
      );

      return send(res, 503, {
        success: false,

        error:
          "Runway accepted the video, but OBITREND could not save the job.",

        taskId:
          task.id,

        creditConsumed:
          true,
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

      ratio:
        requestedRatio,

      remainingCredits:
        creditResult.remaining_credits,

      message:
        "Video generation started successfully.",
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
      "OBITREND VIDEO UNEXPECTED ERROR:",
      details
    );

    /*
    -----------------------------------------------------
    ONLY REFUND IF NO RUNWAY TASK WAS CREATED
    -----------------------------------------------------

    Once a Runway task exists, the status system owns
    the credit lifecycle.
    -----------------------------------------------------
    */

    if (
      creditConsumed &&
      supabase &&
      auth?.user?.id
    ) {
      try {
        const { error: refundError } =
          await supabase.rpc(
            "refund_video_credit",
            {
              target_user_id:
                auth.user.id,

              target_duration:
                duration,
            }
          );

        if (!refundError) {
          creditConsumed =
            false;
        }
      } catch (refundError) {
        console.error(
          "OBITREND EMERGENCY REFUND ERROR:",
          refundError
        );
      }
    }

    return send(res, 500, {
      success: false,

      error:
        "Unable to start video generation right now.",

      creditRestored:
        !creditConsumed,

      details:
        process.env.NODE_ENV ===
        "production"
          ? undefined
          : details.message,
    });
  }
}
