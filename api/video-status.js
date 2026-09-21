import RunwayML from "@runwayml/sdk";
import { createClient } from "@supabase/supabase-js";
import {
  getAuthenticatedUser,
  getRedisConfig,
} from "../lib/credits.js";

import {
  completeVideoReservationByTask,
  refundVideoReservationByTask,
} from "../video-credits.js";

const RUNWAY_API_KEY = process.env.RUNWAY_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const VIDEO_BUCKET = "obitrend-videos";

const runway = RUNWAY_API_KEY
  ? new RunwayML({
      apiKey: RUNWAY_API_KEY,
    })
  : null;

function supabaseServiceClient() {
  if (
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw new Error(
      "Supabase server configuration is missing."
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

function send(res, status, body) {
  return res.status(status).json(body);
}

function normalizeProgress(value) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return 0;
  }

  if (value >= 0 && value <= 1) {
    return Math.round(value * 100);
  }

  return Math.max(
    0,
    Math.min(100, Math.round(value))
  );
}

async function createSignedVideoUrl(
  supabase,
  storagePath
) {
  const { data, error } =
    await supabase.storage
      .from(VIDEO_BUCKET)
      .createSignedUrl(
        storagePath,
        60 * 60
      );

  if (error) {
    console.error(
      "OBITREND signed video URL error:",
      error.message
    );

    return null;
  }

  return data?.signedUrl || null;
}

async function saveRunwayVideo(
  supabase,
  videoUrl,
  userId,
  jobId
) {
  const response =
    await fetch(videoUrl);

  if (!response.ok) {
    throw new Error(
      `Unable to download completed video (${response.status}).`
    );
  }

  const videoBuffer =
    Buffer.from(
      await response.arrayBuffer()
    );

  if (!videoBuffer.length) {
    throw new Error(
      "Runway returned an empty video file."
    );
  }

  const storagePath =
    `${userId}/${jobId}.mp4`;

  const {
    error: uploadError,
  } = await supabase.storage
    .from(VIDEO_BUCKET)
    .upload(
      storagePath,
      videoBuffer,
      {
        contentType: "video/mp4",
        upsert: true,
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
=======================================================
REFUND VIDEO CREDIT
=======================================================
*/

async function refundVideoCredit(videoJob) {
  const taskId = String(videoJob?.runway_task_id || "").trim();

  if (!taskId) {
    return false;
  }

  try {
    const redis = getRedisConfig();

    const result =
      await refundVideoReservationByTask({
        taskId,
        redis,
      });

    return Boolean(result?.ok);
  } catch (error) {
    console.error(
      "OBITREND video seconds refund error:",
      error?.message || error
    );

    return false;
  }
}

async function completeVideoCredit(videoJob) {
  const taskId = String(videoJob?.runway_task_id || "").trim();

  if (!taskId) {
    return false;
  }

  try {
    const redis = getRedisConfig();

    const result =
      await completeVideoReservationByTask({
        taskId,
        redis,
      });

    return Boolean(result?.ok);
  } catch (error) {
    console.error(
      "OBITREND video seconds completion error:",
      error?.message || error
    );

    return false;
  }
}

/*
=======================================================
RUNWAY FAILURE DIAGNOSTICS
=======================================================

This function only improves how Runway failures are
identified and reported.

It does not change the generation flow, credits,
payments, storage, or player.
=======================================================
*/

function extractRunwayFailure(task) {
  const failure =
    task?.failure || {};

  const error =
    task?.error || {};

  const provider =
    task?.provider ||
    task?.providerError ||
    task?.provider_error ||
    {};

  const failureCode =
    task?.failureCode ||
    task?.failure_code ||
    failure?.failureCode ||
    failure?.failure_code ||
    failure?.code ||
    error?.failureCode ||
    error?.failure_code ||
    error?.code ||
    provider?.failureCode ||
    provider?.failure_code ||
    provider?.code ||
    null;

  const failureMessage =
    task?.failureMessage ||
    task?.failure_message ||
    failure?.failureMessage ||
    failure?.failure_message ||
    failure?.message ||
    error?.failureMessage ||
    error?.failure_message ||
    error?.message ||
    provider?.failureMessage ||
    provider?.failure_message ||
    provider?.message ||
    null;

  const failureType =
    task?.failureType ||
    task?.failure_type ||
    failure?.type ||
    error?.type ||
    provider?.type ||
    null;

  const failureDetails =
    task?.failureDetails ||
    task?.failure_details ||
    failure?.details ||
    error?.details ||
    provider?.details ||
    null;

  return {
    failureCode:
      failureCode !== null &&
      failureCode !== undefined
        ? String(failureCode)
        : null,

    failureMessage:
      failureMessage !== null &&
      failureMessage !== undefined
        ? String(failureMessage)
        : null,

    failureType:
      failureType !== null &&
      failureType !== undefined
        ? String(failureType)
        : null,

    failureDetails,
  };
}

/*
=======================================================
SAFE RUNWAY DIAGNOSTIC LOG
=======================================================
*/

function logRunwayFailure(
  task,
  diagnostics
) {
  console.error(
    "======================================================="
  );

  console.error(
    "OBITREND RUNWAY VIDEO FAILED"
  );

  console.error({
    taskId:
      task?.id || null,

    status:
      task?.status || null,

    failureCode:
      diagnostics.failureCode,

    failureMessage:
      diagnostics.failureMessage,

    failureType:
      diagnostics.failureType,

    failureDetails:
      diagnostics.failureDetails,
  });

  console.error(
    "RUNWAY FAILURE TASK DATA:",
    task
  );

  console.error(
    "======================================================="
  );
}

export default async function handler(
  req,
  res
) {
  if (req.method !== "GET") {
    return send(res, 405, {
      success: false,
      error: "Method not allowed.",
    });
  }

  if (
    !RUNWAY_API_KEY ||
    !runway
  ) {
    return send(res, 503, {
      success: false,
      error:
        "Video generation is not configured yet.",
    });
  }

  try {
    /*
    =======================================================
    AUTHENTICATE CURRENT USER
    =======================================================
    */

    const auth =
      await getAuthenticatedUser(req);

    if (!auth.ok) {
      return send(
        res,
        auth.status,
        {
          success: false,
          error: auth.error,
        }
      );
    }

    const taskId =
      String(
        req.query?.taskId || ""
      ).trim();

    if (!taskId) {
      return send(res, 400, {
        success: false,
        error:
          "Video task ID is required.",
      });
    }

    /*
    =======================================================
    SUPABASE SERVICE CLIENT
    =======================================================
    */

    const supabase =
      supabaseServiceClient();

    /*
    =======================================================
    FIND ONLY CURRENT USER'S JOB
    =======================================================
    */

    const {
      data: videoJob,
      error: jobError,
    } = await supabase
      .from("video_jobs")
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
        "OBITREND video job lookup error:",
        jobError.message
      );

      return send(res, 500, {
        success: false,
        error:
          "Unable to find your video job.",
      });
    }

    if (!videoJob) {
      return send(res, 404, {
        success: false,
        error:
          "Video job not found.",
      });
    }

    /*
    =======================================================
    ALREADY COMPLETED AND SAVED
    =======================================================
    */

    if (
      videoJob.status === "completed" &&
      videoJob.video_url
    ) {
      await completeVideoCredit(videoJob);

      const signedUrl =
        await createSignedVideoUrl(
          supabase,
          videoJob.video_url
        );

      if (!signedUrl) {
        return send(res, 500, {
          success: false,
          error:
            "Video is saved but could not be opened.",
        });
      }

      return send(res, 200, {
        success: true,
        status: "SUCCEEDED",
        taskId,
        videoUrl: signedUrl,
        progress: 100,
        duration:
          videoJob.duration_seconds,
      });
    }

    /*
    =======================================================
    CHECK RUNWAY
    =======================================================
    */

    const task =
      await runway.tasks.retrieve(
        taskId
      );

    const runwayStatus =
      String(
        task?.status || ""
      ).toUpperCase();

    const progress =
      normalizeProgress(
        task?.progress
      );

    /*
    =======================================================
    PENDING / RUNNING
    =======================================================
    */

    if (
      runwayStatus === "PENDING" ||
      runwayStatus === "RUNNING"
    ) {
      await supabase
        .from("video_jobs")
        .update({
          status:
            runwayStatus === "RUNNING"
              ? "processing"
              : "queued",
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

      return send(res, 200, {
        success: true,
        status: runwayStatus,
        taskId,
        progress,
        duration:
          videoJob.duration_seconds,
      });
    }

    /*
    =======================================================
    SUCCESS
    =======================================================
    */

    if (
      runwayStatus === "SUCCEEDED"
    ) {
      const runwayVideoUrl =
        Array.isArray(task.output) &&
        task.output.length
          ? String(
              task.output[0] || ""
            )
          : "";

      /*
      Runway reported success but returned
      no video file.
      */

      if (!runwayVideoUrl) {
        const errorMessage =
          "Runway completed the video but returned no video file.";

        const refunded =
          await refundVideoCredit(
            supabase,
            videoJob
          );

        await supabase
          .from("video_jobs")
          .update({
            status: "failed",
            progress: 100,
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

        return send(res, 200, {
          success: false,
          status: "FAILED",
          taskId,
          progress: 100,
          creditRefunded:
            refunded,
          error: refunded
            ? `${errorMessage} Your video credit was returned.`
            : errorMessage,
        });
      }

      /*
      -------------------------------------------------------
      DOWNLOAD AND PERMANENTLY SAVE VIDEO
      -------------------------------------------------------
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
          "OBITREND permanent video storage error:",
          storageError?.message ||
            storageError
        );

        /*
        Do NOT refund here.
        Runway successfully generated the video.
        A later status request can retry the save.
        */

        return send(res, 503, {
          success: false,
          status: "SUCCEEDED",
          taskId,
          error:
            "Video was generated but could not be saved permanently. Please check again.",
        });
      }

      /*
      -------------------------------------------------------
      SAVE STORAGE PATH IN DATABASE
      -------------------------------------------------------
      */

      const {
        error: updateError,
      } = await supabase
        .from("video_jobs")
        .update({
          status: "completed",
          progress: 100,
          video_url:
            storagePath,
          error_message: null,
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
          "OBITREND video database update error:",
          updateError.message
        );

        return send(res, 503, {
          success: false,
          error:
            "Video was saved but could not be registered.",
        });
      }

      /*
      -------------------------------------------------------
      FINALIZE THE RESERVED VIDEO SECONDS
      -------------------------------------------------------
      */
      const reservationCompleted =
        await completeVideoCredit(videoJob);

      if (!reservationCompleted) {
        console.error(
          "OBITREND video reservation could not be finalized after successful generation."
        );
      }

      /*
      -------------------------------------------------------
      CREATE PRIVATE SIGNED URL
      -------------------------------------------------------
      */

      const signedUrl =
        await createSignedVideoUrl(
          supabase,
          storagePath
        );

      if (!signedUrl) {
        return send(res, 500, {
          success: false,
          error:
            "Video was saved but could not be opened.",
        });
      }

      /*
      IMPORTANT:
      Return the playable video URL immediately.
      */

      return send(res, 200, {
        success: true,
        status: "SUCCEEDED",
        taskId,
        videoUrl: signedUrl,
        progress: 100,
        duration:
          videoJob.duration_seconds,
      });
    }

    /*
    =======================================================
    FAILED
    =======================================================
    */

    if (
      runwayStatus === "FAILED"
    ) {
      /*
      -------------------------------------------------------
      GET COMPLETE RUNWAY FAILURE DIAGNOSTICS
      -------------------------------------------------------
      */

      const diagnostics =
        extractRunwayFailure(
          task
        );

      logRunwayFailure(
        task,
        diagnostics
      );

      /*
      -------------------------------------------------------
      FALLBACK MESSAGE
      -------------------------------------------------------
      */

      const rawFailureMessage =
        diagnostics.failureMessage ||
        "Runway could not complete the video.";

      const failureCodeText = String(diagnostics.failureCode || "").toUpperCase();
      const failureMessage =
        failureCodeText === "INPUT_PREPROCESSING.SAFETY.THIRD_PARTY"
          ? "Runway blocked this video request during content safety review. Try a different reference image or prompt. Your video seconds were returned."
          : /not enough credits/i.test(rawFailureMessage)
            ? "The Runway video service account does not have enough provider credits to create this video. Your video seconds were returned."
            : rawFailureMessage;

      /*
      -------------------------------------------------------
      REFUND CREDIT
      -------------------------------------------------------
      */

      const refunded =
        await refundVideoCredit(
          supabase,
          videoJob
        );

      /*
      -------------------------------------------------------
      SAVE ACTUAL FAILURE MESSAGE
      -------------------------------------------------------
      */

      const databaseErrorMessage =
        diagnostics.failureCode
          ? `${diagnostics.failureCode}: ${failureMessage}`
          : failureMessage;

      await supabase
        .from("video_jobs")
        .update({
          status: "failed",
          progress,
          error_message:
            databaseErrorMessage,
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
      -------------------------------------------------------
      RETURN FULL DIAGNOSTIC INFORMATION
      -------------------------------------------------------
      */

      return send(res, 200, {
        success: false,

        status: "FAILED",

        taskId,

        progress,

        creditRefunded:
          refunded,

        failureCode:
          diagnostics.failureCode,

        failureMessage:
          failureMessage,

        failureType:
          diagnostics.failureType,

        failureDetails:
          diagnostics.failureDetails,

        error: refunded
          ? `${failureMessage} Your video credit was returned.`
          : failureMessage,
      });
    }

    /*
    =======================================================
    CANCELED
    =======================================================
    */

    if (
      runwayStatus === "CANCELED"
    ) {
      const errorMessage =
        "Video generation was canceled.";

      const refunded =
        await refundVideoCredit(
          supabase,
          videoJob
        );

      await supabase
        .from("video_jobs")
        .update({
          status: "canceled",
          progress,
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

      return send(res, 200, {
        success: false,
        status: "CANCELED",
        taskId,
        progress,
        creditRefunded:
          refunded,
        error: refunded
          ? `${errorMessage} Your video credit was returned.`
          : errorMessage,
      });
    }

    /*
    =======================================================
    OTHER RUNWAY STATUS
    =======================================================
    */

    await supabase
      .from("video_jobs")
      .update({
        status:
          runwayStatus.toLowerCase() ||
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

    return send(res, 200, {
      success: true,
      status:
        runwayStatus || "PENDING",
      taskId,
      progress,
      duration:
        videoJob.duration_seconds,
    });

  } catch (error) {
    console.error(
      "OBITREND Runway video status error:",
      error?.message || error
    );

    return send(res, 500, {
      success: false,
      error:
        "Unable to check video generation status right now.",
    });
  }
}
