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

FLOW

Browser image
      ↓
OBITREND SERVER
      ↓
validate/download image
      ↓
Runway ephemeral upload
      ↓
runway://... image URI
      ↓
Runway Gen-4.5
      ↓
taskId
      ↓
video-status.js
      ↓
Supabase Storage
      ↓
signed video URL

IMPORTANT

5 seconds  = 1 OBITREND 5-second video credit
10 seconds = 1 OBITREND 10-second video credit

Runway accepts Gen-4.5 image-to-video with:
- promptImage
- promptText
- ratio
- duration

The reference image is uploaded to Runway first instead
of relying on an external image URL.

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

const runway =
  RUNWAY_API_KEY
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

    taskDetails:
      error?.taskDetails ||
      error?.task_details ||
      null,

    responseData:
      error?.response?.data ||
      error?.response?.body ||
      error?.body ||
      null,
  };
}

/*
=========================================================
EXTRACT RUNWAY FAILURE INFORMATION
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
REFUND OBITREND VIDEO CREDIT
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
DATA URI PARSER
=========================================================
*/

function parseDataImageUri(
  value
) {
  const match =
    value.match(
      /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i
    );

  if (!match) {
    throw new Error(
      "Invalid image data."
    );
  }

  const contentType =
    match[1].toLowerCase();

  const base64 =
    match[2];

  if (!base64) {
    throw new Error(
      "The reference image is empty."
    );
  }

  let extension =
    "jpg";

  if (
    contentType ===
    "image/png"
  ) {
    extension =
      "png";
  } else if (
    contentType ===
    "image/webp"
  ) {
    extension =
      "webp";
  } else if (
    contentType ===
      "image/jpeg" ||
    contentType ===
      "image/jpg"
  ) {
    extension =
      "jpg";
  } else {
    throw new Error(
      "The reference image format is not supported."
    );
  }

  const buffer =
    Buffer.from(
      base64,
      "base64"
    );

  if (
    !buffer.length
  ) {
    throw new Error(
      "The reference image is empty."
    );
  }

  return {
    buffer,
    contentType,
    filename:
      `reference.${extension}`,
  };
}

/*
=========================================================
DOWNLOAD HTTPS IMAGE
=========================================================
*/

async function downloadReferenceImage(
  imageUrl
) {
  const response =
    await fetch(
      imageUrl
    );

  if (
    !response.ok
  ) {
    throw new Error(
      `Unable to download the reference image (${response.status}).`
    );
  }

  const contentType =
    (
      response.headers.get(
        "content-type"
      ) ||
      ""
    )
      .split(";")[0]
      .trim()
      .toLowerCase();

  if (
    ![
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
    ].includes(
      contentType
    )
  ) {
    throw new Error(
      "The reference URL did not return a supported image."
    );
  }

  const arrayBuffer =
    await response.arrayBuffer();

  const buffer =
    Buffer.from(
      arrayBuffer
    );

  if (
    !buffer.length
  ) {
    throw new Error(
      "The reference image is empty."
    );
  }

  let extension =
    "jpg";

  if (
    contentType ===
    "image/png"
  ) {
    extension =
      "png";
  } else if (
    contentType ===
    "image/webp"
  ) {
    extension =
      "webp";
  }

  return {
    buffer,
    contentType,
    filename:
      `reference.${extension}`,
  };
}

/*
=========================================================
GET REFERENCE IMAGE BUFFER
=========================================================
*/

async function getReferenceImage(
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
  DATA IMAGE
  -------------------------------------------------------
  */

  if (
    /^data:image\//i.test(
      value
    )
  ) {
    return parseDataImageUri(
      value
    );
  }

  /*
  -------------------------------------------------------
  HTTPS IMAGE
  -------------------------------------------------------
  */

  if (
    /^https:\/\//i.test(
      value
    )
  ) {
    return downloadReferenceImage(
      value
    );
  }

  /*
  -------------------------------------------------------
  HTTP IMAGE
  -------------------------------------------------------
  */

  if (
    /^http:\/\//i.test(
      value
    )
  ) {
    return downloadReferenceImage(
      value
    );
  }

  throw new Error(
    "The reference image must use a valid image URL or image data."
  );
}

/*
=========================================================
UPLOAD REFERENCE IMAGE TO RUNWAY
=========================================================

Runway officially supports ephemeral uploads.

The upload returns:

runway://...

That URI is then passed to promptImage.
=========================================================
*/

async function uploadReferenceImage(
  image
) {
  if (
    !image?.buffer ||
    !Buffer.isBuffer(
      image.buffer
    )
  ) {
    throw new Error(
      "The reference image could not be prepared."
    );
  }

  /*
  -------------------------------------------------------
  RUNWAY EPHEMERAL UPLOAD LIMIT
  -------------------------------------------------------
  */

  const MAX_UPLOAD_SIZE =
    200 * 1024 * 1024;

  if (
    image.buffer.length >
    MAX_UPLOAD_SIZE
  ) {
    throw new Error(
      "The reference image is too large for Runway."
    );
  }

  /*
  -------------------------------------------------------
  MINIMUM RUNWAY FILE SIZE
  -------------------------------------------------------
  */

  if (
    image.buffer.length <
    512
  ) {
    throw new Error(
      "The reference image is too small for Runway."
    );
  }

  /*
  -------------------------------------------------------
  CREATE RUNWAY FILE
  -------------------------------------------------------
  */

  const runwayFile =
    await toFile(
      image.buffer,
      image.filename
    );

  /*
  -------------------------------------------------------
  EPHEMERAL UPLOAD
  -------------------------------------------------------
  */

  const uploaded =
    await runway.uploads.createEphemeral(
      runwayFile
    );

  if (
    !uploaded?.uri
  ) {
    throw new Error(
      "Runway did not return an image upload URI."
    );
  }

  return String(
    uploaded.uri
  );
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
  /*
  =======================================================
  METHOD
  =======================================================
  */

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

  let auth =
    null;

  let duration =
    0;

  let videoCreditConsumed =
    false;

  let supabase =
    null;

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
      duration =
        5;
    }

    /*
    =====================================================
    PROMPT
    =====================================================
    */

    if (
      !prompt
    ) {
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
    CONSUME VIDEO CREDIT
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
    PREPARE REFERENCE IMAGE
    =====================================================
    */

    let promptImage =
  null;

if (
  imageUrl
) {
  if (
    /^https?:\/\//i.test(
      imageUrl
    )
  ) {
    promptImage =
      imageUrl;
  } else if (
    /^data:image\//i.test(
      imageUrl
    )
  ) {
    promptImage =
      imageUrl;
  }
}

    /*
    =====================================================
    BUILD RUNWAY GEN-4.5 REQUEST
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

    /*
    -----------------------------------------------------
    REFERENCE IMAGE
    -----------------------------------------------------
    */

    if (
      promptImage
    ) {
      input.promptImage =
        promptImage;
    }

    console.log(
      "OBITREND RUNWAY VIDEO REQUEST:",
      {
        model:
          input.model,

        ratio:
          input.ratio,

        duration:
          input.duration,

        hasPromptImage:
          Boolean(
            input.promptImage
          ),
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

      const refunded =
        videoCreditConsumed &&
        supabase
          ? await refundVideoCredit(
              supabase,
              auth.user.id,
              duration
            )
          : false;

      if (
        refunded
      ) {
        videoCreditConsumed =
          false;
      }

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
            refunded,
        }
      );
    }

    /*
    =====================================================
    TASK ID CHECK
    =====================================================
    */

    if (
      !task?.id
    ) {
      console.error(
        "OBITREND RUNWAY DID NOT RETURN TASK ID:",
        task
      );

      const refunded =
        videoCreditConsumed &&
        supabase
          ? await refundVideoCredit(
              supabase,
              auth.user.id,
              duration
            )
          : false;

      if (
        refunded
      ) {
        videoCreditConsumed =
          false;
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
            refunded,
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
    IMPORTANT

    Runway has accepted the task.

    DO NOT REFUND HERE.

    The status endpoint must continue checking the
    Runway task.
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

  } catch (
    error
  ) {
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

      if (
        refunded
      ) {
        videoCreditConsumed =
          false;
      }
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
