import RunwayML from "@runwayml/sdk";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "./credits.js";

const RUNWAY_API_KEY = process.env.RUNWAY_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const VIDEO_BUCKET = "obitrend-videos";

const runway = RUNWAY_API_KEY
  ? new RunwayML({ apiKey: RUNWAY_API_KEY })
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
  const { data, error } = await supabase.storage
    .from(VIDEO_BUCKET)
    .createSignedUrl(storagePath, 60 * 60);

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

  const { error: uploadError } =
    await supabase.storage
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

export default async function handler(req, res) {
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
    // --------------------------------------------------
    // AUTHENTICATE CURRENT USER
    // --------------------------------------------------

    const auth = await getAuthenticatedUser(req);

    if (!auth.ok) {
      return send(res, auth.status, {
        success: false,
        error: auth.error,
      });
    }

    const taskId = String(
      req.query?.taskId || ""
    ).trim();

    if (!taskId) {
      return send(res, 400, {
        success: false,
        error:
          "Video task ID is required.",
      });
    }

    // --------------------------------------------------
    // SUPABASE SERVICE CLIENT
    // --------------------------------------------------

    const supabase =
      supabaseServiceClient();

    // --------------------------------------------------
    // VERIFY JOB BELONGS TO CURRENT USER
    // --------------------------------------------------

    const { data: videoJob, error: jobError } =
      await supabase
        .from("video_jobs")
        .select(
          "id,user_id,runway_task_id,status,progress,video_url,error_message,created_at,completed_at"
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

    // --------------------------------------------------
    // ALREADY SAVED
    // --------------------------------------------------

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
      });
    }

    // --------------------------------------------------
    // CHECK RUNWAY
    // --------------------------------------------------

    const task =
      await runway.tasks.retrieve(taskId);

    const runwayStatus =
      String(
        task?.status || ""
      ).toUpperCase();

    const progress =
      normalizeProgress(
        task?.progress
      );

    // --------------------------------------------------
    // PENDING / RUNNING
    // --------------------------------------------------

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
        .eq("id", videoJob.id)
        .eq(
          "user_id",
          auth.user.id
        );

      return send(res, 200, {
        success: true,
        status: runwayStatus,
        taskId,
        progress,
      });
    }

    // --------------------------------------------------
    // SUCCESS
    // --------------------------------------------------

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

      if (!runwayVideoUrl) {
        const errorMessage =
          "Runway completed the video but returned no video file.";

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

        return send(res, 502, {
          success: false,
          status: "FAILED",
          taskId,
          error: errorMessage,
        });
      }

      // ----------------------------------------------
      // DOWNLOAD RUNWAY VIDEO AND SAVE PERMANENTLY
      // ----------------------------------------------

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

        return send(res, 503, {
          success: false,
          status: "SUCCEEDED",
          taskId,
          error:
            "Video was generated but could not be saved permanently. Please check again.",
        });
      }

      // ----------------------------------------------
      // SAVE STORAGE PATH IN DATABASE
      // ----------------------------------------------

      const { error: updateError } =
        await supabase
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

      // ----------------------------------------------
      // CREATE TEMPORARY PRIVATE SIGNED URL
      // ----------------------------------------------

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
      });
    }

    // --------------------------------------------------
    // FAILED
    // --------------------------------------------------

    if (
      runwayStatus === "FAILED"
    ) {
      const errorMessage =
        "Runway could not complete the video.";

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
        error: errorMessage,
      });
    }

    // --------------------------------------------------
    // CANCELED
    // --------------------------------------------------

    if (
      runwayStatus === "CANCELED"
    ) {
      const errorMessage =
        "Video generation was canceled.";

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
        error: errorMessage,
      });
    }

    // --------------------------------------------------
    // OTHER STATUS
    // --------------------------------------------------

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
    });

  } catch (error) {
    console.error(
      "OBITREND Runway video status error:",
      error?.message ||
        error
    );

    return send(res, 500, {
      success: false,
      error:
        "Unable to check video generation status right now.",
    });
  }
}
