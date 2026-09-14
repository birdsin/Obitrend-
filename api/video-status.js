import RunwayML from "@runwayml/sdk";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "../lib/credits.js";

/*
=========================================================
OBITREND AI VIDEO STATUS
=========================================================

PERMANENT VIDEO JOB FLOW

PENDING
   ↓
RUNNING
   ↓
SUCCEEDED
   ↓
download → Supabase Storage → signed URL

OR

FAILED
   ↓
read Runway failureCode
   ↓
refund OBITREND credit ONCE
   ↓
show exact failure reason

OR

CANCELED
   ↓
refund OBITREND credit ONCE

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

const VIDEO_BUCKET =
  "obitrend-videos";

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

function send(res, status, body) {
  return res.status(status).json(body);
}

/*
=========================================================
PROGRESS
=========================================================
*/

function normalizeProgress(value) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return 0;
  }

  if (
    value >= 0 &&
    value <= 1
  ) {
    return Math.round(
      value * 100
    );
  }

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(value)
    )
  );
}

/*
=========================================================
SAFE RUNWAY ERROR EXTRACTION
=========================================================
*/

function getRunwayFailure(task) {
  const failureCode =
    task?.failureCode ||
    task?.failure_code ||
    task?.error?.failureCode ||
    task?.error?.code ||
    null;

  const failureMessage =
    task?.failureMessage ||
    task?.failure_message ||
    task?.error?.message ||
    task?.message ||
    null;

  return {
    failureCode:
      failureCode
        ? String(failureCode)
        : null,

    failureMessage:
      failureMessage
        ? String(failureMessage)
        : null,
  };
}

/*
=========================================================
RUNWAY FAILURE CLASSIFICATION
=========================================================
*/

function classifyFailure(
  failureCode
) {
  const code =
    String(
      failureCode || ""
    ).toUpperCase();

  /*
  -------------------------------------------------------
  SAFETY
  -------------------------------------------------------
  */

  if (
    code.startsWith("SAFETY.") ||
    code.includes(
      "INPUT_PREPROCESSING.SAFETY"
    )
  ) {
    return {
      category:
        "safety",
      retryable:
        false,
    };
  }

  /*
  -------------------------------------------------------
  INVALID ASSET
  -------------------------------------------------------
  */

  if (
    code ===
      "ASSET.INVALID" ||
    code.startsWith(
      "ASSET."
    )
  ) {
    return {
      category:
        "invalid_asset",
      retryable:
        false,
    };
  }

  /*
  -------------------------------------------------------
  INPUT PREPROCESSING
  -------------------------------------------------------
  */

  if (
    code.includes(
      "INPUT_PREPROCESSING.INTERNAL"
    )
  ) {
    return {
      category:
        "temporary",
      retryable:
        true,
    };
  }

  /*
  -------------------------------------------------------
  THIRD PARTY
  -------------------------------------------------------
  */

  if (
    code.startsWith(
      "THIRD_PARTY."
    )
  ) {
    return {
      category:
        "temporary",
      retryable:
        true,
    };
  }

  /*
  -------------------------------------------------------
  INTERNAL
  -------------------------------------------------------
  */

  if (
    code === "INTERNAL" ||
    code === "" ||
    code === "NULL"
  ) {
    return {
      category:
        "temporary",
      retryable:
        true,
    };
  }

  /*
  -------------------------------------------------------
  UNKNOWN
  -------------------------------------------------------
  */

  return {
    category:
      "unknown",
    retryable:
      false,
  };
}

/*
=========================================================
USER-FRIENDLY FAILURE MESSAGE
=========================================================
*/

function getFriendlyFailureMessage(
  failureCode,
  category
) {
  if (
    category ===
    "safety"
  ) {
    return (
      "Runway's safety system rejected this video request. " +
      "Try a different prompt or reference image. " +
      "The OBITREND video credit was restored."
    );
  }

  if (
    category ===
    "invalid_asset"
  ) {
    return (
      "Runway could not process the reference image. " +
      "Please use a clear supported image and try again. " +
      "The OBITREND video credit was restored."
    );
  }

  if (
    category ===
    "temporary"
  ) {
    return (
      "Runway experienced a temporary processing problem. " +
      "Your OBITREND video credit was restored. " +
      "Please try again shortly."
    );
  }

  return (
    "Runway could not complete this video. " +
    "Your OBITREND video credit was restored."
  );
}

/*
=========================================================
SIGNED VIDEO URL
=========================================================
*/

async function createSignedVideoUrl(
  supabase,
  storagePath
) {
  const {
    data,
    error,
  } =
    await supabase.storage
      .from(
        VIDEO_BUCKET
      )
      .createSignedUrl(
        storagePath,
        60 * 60
      );

  if (error) {
    console.error(
      "OBITREND SIGNED URL ERROR:",
      error.message
    );

    return null;
  }

  return (
    data?.signedUrl ||
    null
  );
}

/*
=========================================================
SAVE RUNWAY VIDEO TO SUPABASE
=========================================================
*/

async function saveRunwayVideo(
  supabase,
  videoUrl,
  userId,
  jobId
) {
  if (
    !videoUrl ||
    typeof videoUrl !==
      "string"
  ) {
    throw new Error(
      "Runway did not provide a valid video URL."
    );
  }

  const response =
    await fetch(
      videoUrl
    );

  if (!response.ok) {
    throw new Error(
      `Unable to download completed video (${response.status}).`
    );
  }

  const videoBuffer =
    Buffer.from(
      await response.arrayBuffer()
    );

  if (
    !videoBuffer.length
  ) {
    throw new Error(
      "Runway returned an empty video file."
    );
  }

  const storagePath =
    `${userId}/${jobId}.mp4`;

  const {
    error: uploadError,
  } =
    await supabase.storage
      .from(
        VIDEO_BUCKET
      )
      .upload(
        storagePath,
        videoBuffer,
        {
          contentType:
            "video/mp4",

          upsert:
            true,
        }
      );

  if (uploadError) {
    throw new Error(
      `Video storage upload failed: ${uploadError.message}`
    );
  }

  return storagePath;
}

/*
=========================================================
REFUND VIDEO CREDIT
=========================================================

IMPORTANT:

Only ONE request is allowed to claim the refund.

We first atomically mark credit_refunded=true.

Then the refund RPC runs.

If the RPC fails, we restore the flag to false so
another status request can safely try again.

This prevents multiple browser polling requests from
refunding the same video credit repeatedly.
=========================================================
*/

async function refundVideoCredit(
  supabase,
  videoJob
) {
  const duration =
    Number(
      videoJob.duration_seconds
    );

  if (
    ![5, 10].includes(
      duration
    )
  ) {
    console.error(
      "OBITREND REFUND: invalid duration."
    );

    return false;
  }

  /*
  -------------------------------------------------------
  Already refunded
  -------------------------------------------------------
  */

  if (
    videoJob.credit_refunded
  ) {
    return true;
  }

  /*
  -------------------------------------------------------
  CLAIM REFUND ATOMICALLY
  -------------------------------------------------------
  */

  const {
    data: claimedRows,
    error: claimError,
  } =
    await supabase
      .from(
        "video_jobs"
      )
      .update({
        credit_refunded:
          true,
      })
      .eq(
        "id",
        videoJob.id
      )
      .eq(
        "user_id",
        videoJob.user_id
      )
      .eq(
        "credit_refunded",
        false
      )
      .select(
        "id"
      );

  if (claimError) {
    console.error(
      "OBITREND REFUND CLAIM ERROR:",
      claimError.message
    );

    return false;
  }

  /*
  -------------------------------------------------------
  Another request already claimed the refund.
  -------------------------------------------------------
  */

  if (
    !claimedRows?.length
  ) {
    return true;
  }

  /*
  -------------------------------------------------------
  ACTUALLY RETURN CREDIT
  -------------------------------------------------------
  */

  try {
    const {
      data,
      error,
    } =
      await supabase.rpc(
        "refund_video_credit",
        {
          target_user_id:
            videoJob.user_id,

          target_duration:
            duration,
        }
      );

    if (error) {
      console.error(
        "OBITREND REFUND RPC ERROR:",
        error.message
      );

      /*
      Allow a future status request to retry.
      */

      await supabase
        .from(
          "video_jobs"
        )
        .update({
          credit_refunded:
            false,
        })
        .eq(
          "id",
          videoJob.id
        )
        .eq(
          "user_id",
          videoJob.user_id
        );

      return false;
    }

    const refunded =
      Boolean(
        data?.[0]?.success
      );

    if (!refunded) {
      console.error(
        "OBITREND REFUND RPC DID NOT RETURN SUCCESS."
      );

      await supabase
        .from(
          "video_jobs"
        )
        .update({
          credit_refunded:
            false,
        })
        .eq(
          "id",
          videoJob.id
        )
        .eq(
          "user_id",
          videoJob.user_id
        );

      return false;
    }

    return true;
  } catch (error) {
    console.error(
      "OBITREND REFUND EXCEPTION:",
      error?.message ||
        error
    );

    /*
    Allow retry after a genuine RPC failure.
    */

    await supabase
      .from(
        "video_jobs"
      )
      .update({
        credit_refunded:
          false,
      })
      .eq(
        "id",
        videoJob.id
      )
      .eq(
        "user_id",
        videoJob.user_id
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
  /*
  =======================================================
  METHOD
  =======================================================
  */

  if (
    req.method !==
    "GET"
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

  try {
    /*
    =====================================================
    AUTHENTICATE
    =====================================================
    */

    const auth =
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
    TASK ID
    =====================================================
    */

    const taskId =
      String(
        req.query?.taskId ||
          ""
      ).trim();

    if (!taskId) {
      return send(
        res,
        400,
        {
          success:
            false,

          error:
            "Video task ID is required.",
        }
      );
    }

    /*
    =====================================================
    SUPABASE
    =====================================================
    */

    const supabase =
      supabaseServiceClient();

    /*
    =====================================================
    FIND CURRENT USER'S JOB
    =====================================================
    */

    const {
      data: videoJob,
      error: jobError,
    } =
      await supabase
        .from(
          "video_jobs"
        )
        .select(
          [
            "id",
            "user_id",
            "runway_task_id",
            "status",
            "progress",
            "prompt",
            "image_url",
            "video_url",
            "error_message",
            "duration_seconds",
            "credit_refunded",
            "created_at",
            "completed_at",
          ].join(",")
        )
        .eq(
          "runway_task_id",
          taskId
        )
        .eq(
          "user_id",
          auth.user.id
        )
        .maybeSingle();

    if (jobError) {
      console.error(
        "OBITREND JOB LOOKUP ERROR:",
        jobError.message
      );

      return send(
        res,
        500,
        {
          success:
            false,

          error:
            "Unable to find your video job.",
        }
      );
    }

    if (!videoJob) {
      return send(
        res,
        404,
        {
          success:
            false,

          error:
            "Video job not found.",
        }
      );
    }

    /*
    =====================================================
    ALREADY COMPLETED
    =====================================================
    */

    if (
      videoJob.status ===
        "completed" &&
      videoJob.video_url
    ) {
      const signedUrl =
        await createSignedVideoUrl(
          supabase,
          videoJob.video_url
        );

      if (!signedUrl) {
        return send(
          res,
          500,
          {
            success:
              false,

            error:
              "Video is saved but could not be opened.",
          }
        );
      }

      return send(
        res,
        200,
        {
          success:
            true,

          status:
            "SUCCEEDED",

          taskId,

          videoUrl:
            signedUrl,

          progress:
            100,

          duration:
            videoJob.duration_seconds,
        }
      );
    }

    /*
    =====================================================
    GET CURRENT RUNWAY TASK
    =====================================================
    */

    let task;

    try {
      task =
        await runway.tasks.retrieve(
          taskId
        );
    } catch (runwayError) {
      console.error(
        "OBITREND RUNWAY STATUS ERROR:",
        runwayError?.message ||
          runwayError
      );

      return send(
        res,
        503,
        {
          success:
            false,

          status:
            "CHECKING",

          taskId,

          retryable:
            true,

          error:
            "Unable to check Runway right now. Please try again shortly.",
        }
      );
    }

    const runwayStatus =
      String(
        task?.status ||
          ""
      ).toUpperCase();

    const progress =
      normalizeProgress(
        task?.progress
      );

    /*
    =====================================================
    PENDING
    =====================================================
    */

    if (
      runwayStatus ===
      "PENDING"
    ) {
      await supabase
        .from(
          "video_jobs"
        )
        .update({
          status:
            "queued",

          progress,
        })
        .eq(
          "id",
          videoJob.id
        )
        .eq(
          "user_id",
          auth.user.id
        );

      return send(
        res,
        200,
        {
          success:
            true,

          status:
            "PENDING",

          taskId,

          progress,

          duration:
            videoJob.duration_seconds,
        }
      );
    }

    /*
    =====================================================
    RUNNING
    =====================================================
    */

    if (
      runwayStatus ===
      "RUNNING"
    ) {
      await supabase
        .from(
          "video_jobs"
        )
        .update({
          status:
            "processing",

          progress,
        })
        .eq(
          "id",
          videoJob.id
        )
        .eq(
          "user_id",
          auth.user.id
        );

      return send(
        res,
        200,
        {
          success:
            true,

          status:
            "RUNNING",

          taskId,

          progress,

          duration:
            videoJob.duration_seconds,
        }
      );
    }

    /*
    =====================================================
    FAILED
    =====================================================
    */

    if (
      runwayStatus ===
      "FAILED"
    ) {
      const failure =
        getRunwayFailure(
          task
        );

      const classification =
        classifyFailure(
          failure.failureCode
        );

      console.error(
        "================================================="
      );

      console.error(
        "OBITREND RUNWAY VIDEO FAILED"
      );

      console.error({
        taskId,

        failureCode:
          failure.failureCode,

        failureMessage:
          failure.failureMessage,

        category:
          classification.category,

        retryable:
          classification.retryable,
      });

      console.error(
        "================================================="
      );

      /*
      ---------------------------------------------------
      REFUND
      ---------------------------------------------------
      */

      const refunded =
        await refundVideoCredit(
          supabase,
          videoJob
        );

      const friendlyMessage =
        getFriendlyFailureMessage(
          failure.failureCode,
          classification.category
        );

      const finalMessage =
        refunded
          ? friendlyMessage
          : (
              "Video generation failed. " +
              "The credit refund is still being processed."
            );

      /*
      ---------------------------------------------------
      SAVE FAILURE
      ---------------------------------------------------
      */

      await supabase
        .from(
          "video_jobs"
        )
        .update({
          status:
            "failed",

          progress:
            100,

          error_message:
            failure.failureCode
              ? `${failure.failureCode}: ${
                  failure.failureMessage ||
                  friendlyMessage
                }`
              : friendlyMessage,
        })
        .eq(
          "id",
          videoJob.id
        )
        .eq(
          "user_id",
          auth.user.id
        );

      /*
      ---------------------------------------------------
      RETURN COMPLETE FAILURE INFORMATION
      ---------------------------------------------------
      */

      return send(
        res,
        200,
        {
          success:
            false,

          status:
            "FAILED",

          taskId,

          progress:
            100,

          duration:
            videoJob.duration_seconds,

          provider:
            "runway",

          failureCode:
            failure.failureCode,

          failureMessage:
            failure.failureMessage,

          category:
            classification.category,

          retryable:
            classification.retryable,

          creditRefunded:
            refunded,

          error:
            finalMessage,
        }
      );
    }

    /*
    =====================================================
    CANCELED
    =====================================================
    */

    if (
      runwayStatus ===
      "CANCELED"
    ) {
      const refunded =
        await refundVideoCredit(
          supabase,
          videoJob
        );

      const message =
        refunded
          ? "Video generation was canceled. Your OBITREND video credit was restored."
          : "Video generation was canceled. Your credit refund is still being processed.";

      await supabase
        .from(
          "video_jobs"
        )
        .update({
          status:
            "canceled",

          progress,

          error_message:
            message,
        })
        .eq(
          "id",
          videoJob.id
        )
        .eq(
          "user_id",
          auth.user.id
        );

      return send(
        res,
        200,
        {
          success:
            false,

          status:
            "CANCELED",

          taskId,

          progress,

          duration:
            videoJob.duration_seconds,

          creditRefunded:
            refunded,

          error:
            message,
        }
      );
    }

    /*
    =====================================================
    SUCCESS
    =====================================================
    */

    if (
      runwayStatus ===
      "SUCCEEDED"
    ) {
      const runwayVideoUrl =
        Array.isArray(
          task?.output
        ) &&
        task.output.length
          ? String(
              task.output[0] ||
                ""
            )
          : "";

      /*
      ---------------------------------------------------
      SUCCESS BUT NO OUTPUT
      ---------------------------------------------------
      */

      if (
        !runwayVideoUrl
      ) {
        const errorMessage =
          "Runway reported success but did not return a video file.";

        /*
        Treat as a failed generation because the user
        cannot receive the generated asset.
        */

        const refunded =
          await refundVideoCredit(
            supabase,
            videoJob
          );

        await supabase
          .from(
            "video_jobs"
          )
          .update({
            status:
              "failed",

            progress:
              100,

            error_message:
              errorMessage,
          })
          .eq(
            "id",
            videoJob.id
          )
          .eq(
            "user_id",
            auth.user.id
          );

        return send(
          res,
          200,
          {
            success:
              false,

            status:
              "FAILED",

            taskId,

            progress:
              100,

            creditRefunded:
              refunded,

            error:
              refunded
                ? `${errorMessage} Your OBITREND video credit was restored.`
                : errorMessage,
          }
        );
      }

      /*
      ---------------------------------------------------
      DOWNLOAD VIDEO
      ---------------------------------------------------
      */

      let storagePath;

      try {
        storagePath =
          await saveRunwayVideo(
            supabase,
            runwayVideoUrl,
            auth.user.id,
            videoJob.id
          );
      } catch (storageError) {
        console.error(
          "OBITREND VIDEO STORAGE ERROR:",
          storageError?.message ||
            storageError
        );

        /*
        IMPORTANT:

        DO NOT REFUND.

        Runway successfully generated the video.
        The next poll can retry the storage operation.
        */

        return send(
          res,
          503,
          {
            success:
              false,

            status:
              "SUCCEEDED",

            taskId,

            progress:
              100,

            retryable:
              true,

            error:
              "Video was generated but could not be saved yet. Please check again.",
          }
        );
      }

      /*
      ---------------------------------------------------
      SAVE COMPLETED JOB
      ---------------------------------------------------
      */

      const {
        error:
          updateError,
      } =
        await supabase
          .from(
            "video_jobs"
          )
          .update({
            status:
              "completed",

            progress:
              100,

            video_url:
              storagePath,

            error_message:
              null,

            completed_at:
              new Date().toISOString(),
          })
          .eq(
            "id",
            videoJob.id
          )
          .eq(
            "user_id",
            auth.user.id
          );

      if (updateError) {
        console.error(
          "OBITREND COMPLETED JOB UPDATE ERROR:",
          updateError.message
        );

        return send(
          res,
          503,
          {
            success:
              false,

            status:
              "SUCCEEDED",

            taskId,

            retryable:
              true,

            error:
              "Video was generated but could not be registered yet.",
          }
        );
      }

      /*
      ---------------------------------------------------
      SIGNED URL
      ---------------------------------------------------
      */

      const signedUrl =
        await createSignedVideoUrl(
          supabase,
          storagePath
        );

      if (!signedUrl) {
        return send(
          res,
          500,
          {
            success:
              false,

            status:
              "SUCCEEDED",

            taskId,

            error:
              "Video was saved but could not be opened.",
          }
        );
      }

      /*
      ---------------------------------------------------
      FINAL SUCCESS
      ---------------------------------------------------
      */

      return send(
        res,
        200,
        {
          success:
            true,

          status:
            "SUCCEEDED",

          taskId,

          videoUrl:
            signedUrl,

          progress:
            100,

          duration:
            videoJob.duration_seconds,
        }
      );
    }

    /*
    =====================================================
    UNKNOWN / FUTURE STATUS
    =====================================================
    */

    await supabase
      .from(
        "video_jobs"
      )
      .update({
        status:
          runwayStatus
            ? runwayStatus.toLowerCase()
            : "processing",

        progress,
      })
      .eq(
        "id",
        videoJob.id
      )
      .eq(
        "user_id",
        auth.user.id
      );

    return send(
      res,
      200,
      {
        success:
          true,

        status:
          runwayStatus ||
          "PENDING",

        taskId,

        progress,

        duration:
          videoJob.duration_seconds,
      }
    );

  } catch (error) {
    console.error(
      "================================================="
    );

    console.error(
      "OBITREND VIDEO STATUS UNEXPECTED ERROR"
    );

    console.error(
      error?.message ||
        error
    );

    console.error(
      "================================================="
    );

    return send(
      res,
      500,
      {
        success:
          false,

        error:
          "Unable to check video generation status right now.",
      }
    );
  }
}
