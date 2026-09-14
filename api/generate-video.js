import RunwayML from "@runwayml/sdk";
import { createClient } from "@supabase/supabase-js";

import {
  getAuthenticatedUser,
  getProStatus,
  getRedisConfig,
} from "../lib/credits.js";

/*
=========================================================
OBITREND AI VIDEO GENERATOR
=========================================================

PERMANENT VIDEO GENERATION FLOW

1. Authenticate user
2. Verify Pro access
3. Validate prompt
4. Validate duration
5. Validate ratio
6. Validate reference image
7. Consume OBITREND video credit
8. Send Gen-4.5 request to Runway
9. Save task ID
10. video-status.js handles the task afterwards

IMPORTANT:
- 5 seconds = 1 OBITREND 5-second video credit
- 10 seconds = 1 OBITREND 10-second video credit
- Do not refund a credit when Runway has successfully
  accepted the task.
- Refund only when the task was never created.
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
      "SUPABASE_URL is missing."
    );
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is missing."
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

function send(
  res,
  status,
  body
) {
  return res
    .status(status)
    .json(body);
}

/*
=========================================================
RUNWAY ERROR DETAILS
=========================================================
*/

function getErrorDetails(
  error
) {
  const taskDetails =
    error?.taskDetails ||
    error?.task_details ||
    null;

  const responseData =
    error?.response?.data ||
    error?.response?.body ||
    error?.body ||
    null;

  return {
    name:
      error?.name ||
      null,

    message:
      error?.message ||
      null,

    status:
      error?.status ||
      error?.statusCode ||
      null,

    code:
      error?.code ||
      null,

    type:
      error?.type ||
      null,

    taskDetails,

    responseData,
  };
}

/*
=========================================================
EXTRACT FAILURE INFORMATION
=========================================================
*/

function extractFailureDetails(
  error
) {
  const details =
    getErrorDetails(
      error
    );

  const source =
    details.taskDetails ||
    details.responseData ||
    error ||
    {};

  const failureCode =
    source?.failureCode ||
    source?.failure_code ||
    source?.error?.failureCode ||
    source?.error?.code ||
    details.code ||
    null;

  const failureMessage =
    source?.failureMessage ||
    source?.failure_message ||
    source?.error?.message ||
    details.message ||
    null;

  return {
    failureCode:
      failureCode
        ? String(
            failureCode
          )
        : null,

    failureMessage:
      failureMessage
        ? String(
            failureMessage
          )
        : null,

    details,
  };
}

/*
=========================================================
IMAGE VALIDATION
=========================================================
*/

function isDataImageUri(
  value
) {
  return (
    typeof value ===
      "string" &&
    /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(
      value
    )
  );
}

function isHttpsUrl(
  value
) {
  return (
    typeof value ===
      "string" &&
    /^https:\/\//i.test(
      value
    )
  );
}

/*
=========================================================
PREPARE REFERENCE IMAGE
=========================================================

Runway accepts:

- HTTPS image URLs
- image data URIs

If the browser supplies a data URI, we keep it.

If the browser supplies HTTPS, we keep the HTTPS URL.

HTTP URLs are converted to a data URI server-side so the
Runway API never receives an HTTP promptImage URL.
=========================================================
*/

async function preparePromptImage(
  imageUrl
) {
  if (
    !imageUrl ||
    typeof imageUrl !==
      "string"
  ) {
    return null;
  }

  const value =
    imageUrl.trim();

  /*
  -------------------------------------------------------
  DATA URI
  -------------------------------------------------------
  */

  if (
    isDataImageUri(
      value
    )
  ) {
    /*
    Runway has a 5 MB limit for data URI image inputs.
    ---------------------------------------------------
    */

    const commaIndex =
      value.indexOf(
        ","
      );

    if (
      commaIndex ===
      -1
    ) {
      throw new Error(
        "Invalid image data URI."
      );
    }

    const base64Part =
      value.slice(
        commaIndex + 1
      );

    if (
      !base64Part
    ) {
      throw new Error(
        "The reference image data is empty."
      );
    }

    /*
    Base64 length is an approximate safety check.
    */

    if (
      value.length >
      5 * 1024 * 1024
    ) {
      throw new Error(
        "The reference image is too large for Runway."
      );
    }

    return value;
  }

  /*
  -------------------------------------------------------
  HTTPS URL
  -------------------------------------------------------
  */

  if (
    isHttpsUrl(
      value
    )
  ) {
    /*
    Runway can fetch HTTPS URLs directly.
    */

    return value;
  }

  /*
  -------------------------------------------------------
  HTTP URL
  -------------------------------------------------------
  */

  if (
    /^http:\/\//i.test(
      value
    )
  ) {
    const response =
      await fetch(
        value
      );

    if (
      !response.ok
    ) {
      throw new Error(
        `Unable to download the reference image (${response.status}).`
      );
    }

    const contentType =
      response.headers.get(
        "content-type"
      ) ||
      "";

    if (
      !contentType.toLowerCase().startsWith(
        "image/"
      )
    ) {
      throw new Error(
        "The reference URL did not return an image."
      );
    }

    const buffer =
      Buffer.from(
        await response.arrayBuffer()
      );

    if (
      !buffer.length
    ) {
      throw new Error(
        "The reference image is empty."
      );
    }

    /*
    Runway data URI limit is 5 MB.
    */

    if (
      buffer.length >
      3.3 * 1024 * 1024
    ) {
      throw new Error(
        "The reference image is too large for Runway."
      );
    }

    return (
      `data:${contentType};base64,` +
      buffer.toString(
        "base64"
      )
    );
  }

  throw new Error(
    "The reference image must use a valid HTTPS image URL or image data."
  );
}

/*
=========================================================
REFUND
=========================================================
*/

async function refundVideoCredit(
  supabase,
  userId,
  duration
) {
  try {
    const {
      data,
      error,
    } =
      await supabase.rpc(
        "refund_video_credit",
        {
          target_user_id:
            userId,

          target_duration:
            duration,
        }
      );

    if (error) {
      console.error(
        "OBITREND VIDEO REFUND ERROR:",
        error.message
      );

      return false;
    }

    return Boolean(
      data?.[0]?.success
    );
  } catch (error) {
    console.error(
      "OBITREND VIDEO REFUND EXCEPTION:",
      error?.message ||
        error
    );

    return false;
  }
}

/*
=========================================================
MAIN HANDLER
=========================================================
*/

export default async function handler(
  req,
  res
) {
  if (
    req.method !==
    "POST"
  ) {
    return send(
      res,
      405,
      {
        success:
          false,

        error:
          "Method not allowed.",
      }
    );
  }

  /*
  =======================================================
  RUNWAY CONFIGURATION
  =======================================================
  */

  if (
    !RUNWAY_API_KEY ||
    !runway
  ) {
    return send(
      res,
      503,
      {
        success:
          false,

        error:
          "Runway video generation is not configured.",
      }
    );
  }

  let auth = null;

  let duration = 0;

  let videoCreditConsumed =
    false;

  let supabase = null;

  try {
    /*
    =====================================================
    AUTHENTICATION
    =====================================================
    */

    auth =
      await getAuthenticatedUser(
        req
      );

    if (
      !auth?.ok ||
      !auth?.user?.id
    ) {
      return send(
        res,
        auth?.status ||
          401,
        {
          success:
            false,

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

    if (
      !proStatus?.active
    ) {
      return send(
        res,
        403,
        {
          success:
            false,

          error:
            "AI Video is available to Pro users only.",
        }
      );
    }

    /*
    =====================================================
    REQUEST BODY
    =====================================================
    */

    const body =
      req.body ||
      {};

    const prompt =
      typeof body.prompt ===
      "string"
        ? body.prompt.trim()
        : "";

    const imageUrl =
      typeof body.imageUrl ===
      "string"
        ? body.imageUrl.trim()
        : "";

    const ratio =
      typeof body.ratio ===
      "string"
        ? body.ratio.trim()
        : "1280:720";

    duration =
      Number(
        body.duration
      );

    if (
      !Number.isFinite(
        duration
      )
    ) {
      duration = 5;
    }

    /*
    =====================================================
    PROMPT
    =====================================================
    */

    if (!prompt) {
      return send(
        res,
        400,
        {
          success:
            false,

          error:
            "Video prompt is required.",
        }
      );
    }

    /*
    =====================================================
    DURATION
    =====================================================
    */

    if (
      ![5, 10].includes(
        duration
      )
    ) {
      return send(
        res,
        400,
        {
          success:
            false,

          error:
            "Video duration must be 5 or 10 seconds.",
        }
      );
    }

    /*
    =====================================================
    RATIO
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

    if (
      !allowedRatios.has(
        ratio
      )
    ) {
      return send(
        res,
        400,
        {
          success:
            false,

          error:
            "Invalid video ratio.",
        }
      );
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
    PREPARE REFERENCE IMAGE
    =====================================================
    */

    let promptImage =
      null;

    if (
      imageUrl
    ) {
      try {
        promptImage =
          await preparePromptImage(
            imageUrl
          );
      } catch (imageError) {
        return send(
          res,
          400,
          {
            success:
              false,

            error:
              imageError?.message ||
              "Unable to prepare the reference image.",
          }
        );
      }
    }

    /*
    =====================================================
    CONSUME OBITREND VIDEO CREDIT
    =====================================================
    */

    const {
      data:
        creditData,
      error:
        creditError,
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

    if (
      creditError
    ) {
      console.error(
        "OBITREND VIDEO CREDIT ERROR:",
        creditError.message
      );

      return send(
        res,
        500,
        {
          success:
            false,

          error:
            "Unable to use your video credit.",
        }
      );
    }

    const creditResult =
      creditData?.[0];

    if (
      !creditResult?.success
    ) {
      return send(
        res,
        402,
        {
          success:
            false,

          error:
            creditResult?.message ||
            "You do not have enough video credits.",
        }
      );
    }

    videoCreditConsumed =
      true;

    /*
    =====================================================
    BUILD RUNWAY REQUEST
    =====================================================
    */

    const input = {
      model:
        "gen4.5",

      promptText:
        prompt,

      ratio,

      duration,
    };

    if (
      promptImage
    ) {
      input.promptImage =
        promptImage;
    }

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
    } catch (
      runwayError
    ) {
      const failure =
        extractFailureDetails(
          runwayError
        );

      console.error(
        "================================================="
      );

      console.error(
        "OBITREND RUNWAY CREATE FAILED"
      );

      console.error({
        failureCode:
          failure.failureCode,

        failureMessage:
          failure.failureMessage,

        status:
          failure.details.status,

        code:
          failure.details.code,

        type:
          failure.details.type,

        taskDetails:
          failure.details.taskDetails,

        responseData:
          failure.details.responseData,
      });

      console.error(
        "================================================="
      );

      /*
      ---------------------------------------------------
      TASK WAS NOT CREATED
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
      RETURN THE REAL PROVIDER INFORMATION
      ---------------------------------------------------

      Keep the same main user-facing error.

      The actual Runway information is returned separately
      so the frontend can display a useful reason.
      ---------------------------------------------------
      */

      return send(
        res,
        502,
        {
          success:
            false,

          error:
            "Runway rejected the video request. Your video credit was returned.",

          provider:
            "runway",

          failureCode:
            failure.failureCode,

          failureMessage:
            failure.failureMessage,

          details:
            failure.details,

          creditRefunded:
            !videoCreditConsumed,
        }
      );
    }

    /*
    =====================================================
    RUNWAY DID NOT RETURN TASK ID
    =====================================================
    */

    if (
      !task?.id
    ) {
      console.error(
        "OBITREND RUNWAY DID NOT RETURN TASK ID:",
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

      return send(
        res,
        502,
        {
          success:
            false,

          error:
            "Runway did not return a video task ID. Your video credit was returned.",

          provider:
            "runway",

          creditRefunded:
            !videoCreditConsumed,
        }
      );
    }

    /*
    =====================================================
    SAVE VIDEO JOB
    =====================================================
    */

    const {
      error:
        insertError,
    } =
      await supabase
        .from(
          "video_jobs"
        )
        .insert({
          user_id:
            auth.user.id,

          runway_task_id:
            task.id,

          status:
            "queued",

          progress:
            0,

          prompt,

          image_url:
            imageUrl ||
            null,

          duration_seconds:
            duration,

          credit_refunded:
            false,
        });

    /*
    IMPORTANT:

    Runway has already accepted the task.

    Therefore DO NOT refund here.

    Otherwise the user could receive a free credit while
    Runway continues generating the video.
    */

    if (
      insertError
    ) {
      console.error(
        "OBITREND VIDEO JOB INSERT ERROR:",
        insertError.message
      );

      return send(
        res,
        503,
        {
          success:
            false,

          status:
            "QUEUED",

          taskId:
            task.id,

          error:
            "Video generation started, but the job could not be registered yet.",

          retryable:
            true,
        }
      );
    }

    /*
    =====================================================
    SUCCESS
    =====================================================
    */

    return send(
      res,
      200,
      {
        success:
          true,

        status:
          "QUEUED",

        taskId:
          task.id,

        duration,

        remainingCredits:
          creditResult.remaining_credits,

        message:
          "Video generation started.",
      }
    );

  } catch (error) {
    console.error(
      "================================================="
    );

    console.error(
      "OBITREND VIDEO GENERATOR UNEXPECTED ERROR"
    );

    console.error(
      error?.message ||
        error
    );

    console.error(
      "================================================="
    );

    /*
    =====================================================
    EMERGENCY REFUND
    =====================================================
    */

    if (
      videoCreditConsumed &&
      supabase &&
      auth?.user?.id &&
      [5, 10].includes(
        duration
      )
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

    return send(
      res,
      500,
      {
        success:
          false,

        error:
          "Unable to start video generation.",
      }
    );
  }
}
