import RunwayML from "@runwayml/sdk";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "./credits.js";

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
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
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
  const response = await fetch(videoUrl);

  if (!response.ok) {
    throw new Error(
      `Unable to download completed video (${response.status}).`
    );
  }

  const videoBuffer = Buffer.from(
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
=========================================================
REFUND VIDEO CREDIT
=========================================================
*/
async function refundVideoCredit(
  supabase,
  videoJob
) {
  const duration =
    Number(videoJob.duration_seconds);

  if (![5, 10].includes(duration)) {
    console.error(
      "OBITREND refund skipped: invalid video duration."
    );

    return false;
  }

  /*
  -------------------------------------------------------
  Prevent duplicate refunds.
  -------------------------------------------------------
  */
  if (videoJob.credit_refunded) {
    return true;
  }

  try {
    const {
      data,
      error,
    } = await supabase.rpc(
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
        "OBITREND video credit refund error:",
        error.message
      );

      return false;
    }

    const refunded =
      Boolean(data?.[0]?.success);

    if (!refunded) {
      console.error(
        "OBITREND video credit refund was not completed."
      );

      return false;
    }

    /*
    -------------------------------------------------------
    Mark the job as refunded only after the wallet
    successfully receives the credit.
    -------------------------------------------------------
    */
    const {
      error: markRefundedError,
    } = await supabase
      .from("video_jobs")
      .update({
        credit_refunded: true,
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
      );

    if (markRefundedError) {
      console.error(
        "OBITREND refund status update error:",
        markRefundedError.message
      );

      return false;
    }

    return true;
  } catch (error) {
    console.error(
      "OBITREND video credit refund exception:",
      error?.message || error
    );

    return false;
  }
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

  if (!RUNWAY_API_KEY || !runway) {
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
      return send(res, auth.status, {
        success: false,
        error: auth.error,
      });
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
      -----------------------------------------------------
      Runway says success but no video was returned.
      Treat this as a failed generation and refund.
      -----------------------------------------------------
      */

      if (!runwayVideoUrl) {
        const errorMessage =
          "Runway completed the video but returned no video file.";

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
            true,
          error: errorMessage,
        });
      }

      /*
      -----------------------------------------------------
      DOWNLOAD AND PERMANENTLY SAVE VIDEO
      -----------------------------------------------------
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
        IMPORTANT:
        Do NOT refund here.

        Runway successfully generated the video.
        The storage operation can be retried.
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
      -----------------------------------------------------
      SAVE STORAGE PATH IN DATABASE
      -----------------------------------------------------
      */

      const {
        error: updateError,
      } = await supabase
        .from("video_jobs")
        .update({
          status: "completed",
          progress: 100,
          video_url: storagePath,
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
      -----------------------------------------------------
      CREATE PRIVATE SIGNED URL
      -----------------------------------------------------
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
      const errorMessage =
        "Runway could not complete the video.";

      const refunded =
        await refundVideoCredit(
          supabase,
          videoJob
        );

      await supabase
        .from("video_jobs")
        .update({
          status: "failed",
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
        status: "FAILED",
        taskId,
        progress,
        creditRefunded: refunded,
        error: refunded
          ? `${errorMessage} Your video credit was returned.`
          : errorMessage,
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
        creditRefunded: refunded,
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
