import RunwayML from "@runwayml/sdk";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "./credits.js";

const RUNWAY_API_KEY = process.env.RUNWAY_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  if (value >= 0 && value <= 1) {
    return Math.round(value * 100);
  }

  return Math.max(0, Math.min(100, Math.round(value)));
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
      error: "Video generation is not configured yet.",
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
        error: "Video task ID is required.",
      });
    }

    // --------------------------------------------------
    // SERVICE-ROLE SUPABASE CLIENT
    // --------------------------------------------------

    const supabase = supabaseServiceClient();

    // --------------------------------------------------
    // SECURITY CHECK
    // ONLY THE OWNER OF THIS VIDEO JOB CAN CHECK IT
    // --------------------------------------------------

    const { data: videoJob, error: jobError } =
      await supabase
        .from("video_jobs")
        .select(
          "id,user_id,runway_task_id,status,progress,video_url,error_message,created_at,completed_at"
        )
        .eq("runway_task_id", taskId)
        .eq("user_id", auth.user.id)
        .maybeSingle();

    if (jobError) {
      console.error(
        "OBITREND video job lookup error:",
        jobError.message
      );

      return send(res, 500, {
        success: false,
        error: "Unable to find your video job.",
      });
    }

    if (!videoJob) {
      return send(res, 404, {
        success: false,
        error: "Video job not found.",
      });
    }

    // --------------------------------------------------
    // IF ALREADY COMPLETED AND STORED, RETURN IT
    // --------------------------------------------------

    if (
      videoJob.status === "completed" &&
      videoJob.video_url
    ) {
      return send(res, 200, {
        success: true,
        status: "SUCCEEDED",
        taskId,
        videoUrl: videoJob.video_url,
        progress: 100,
      });
    }

    // --------------------------------------------------
    // CHECK RUNWAY
    // --------------------------------------------------

    const task = await runway.tasks.retrieve(taskId);

    const runwayStatus =
      String(task?.status || "").toUpperCase();

    const progress = normalizeProgress(
      task?.progress
    );

    // --------------------------------------------------
    // RUNNING / PENDING
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
        .eq("user_id", auth.user.id);

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

    if (runwayStatus === "SUCCEEDED") {
      const videoUrl =
        Array.isArray(task.output) &&
        task.output.length
          ? String(task.output[0] || "")
          : "";

      if (!videoUrl) {
        await supabase
          .from("video_jobs")
          .update({
            status: "failed",
            progress: 100,
            error_message:
              "Runway completed the video but returned no video file.",
          })
          .eq("id", videoJob.id)
          .eq("user_id", auth.user.id);

        return send(res, 502, {
          success: false,
          status: "FAILED",
          taskId,
          error:
            "Runway completed the video but returned no video file.",
        });
      }

      await supabase
        .from("video_jobs")
        .update({
          status: "completed",
          progress: 100,
          video_url: videoUrl,
          error_message: null,
          completed_at: new Date().toISOString(),
        })
        .eq("id", videoJob.id)
        .eq("user_id", auth.user.id);

      return send(res, 200, {
        success: true,
        status: "SUCCEEDED",
        taskId,
        videoUrl,
        progress: 100,
      });
    }

    // --------------------------------------------------
    // FAILED
    // --------------------------------------------------

    if (runwayStatus === "FAILED") {
      const errorMessage =
        "Runway could not complete the video.";

      await supabase
        .from("video_jobs")
        .update({
          status: "failed",
          progress,
          error_message: errorMessage,
        })
        .eq("id", videoJob.id)
        .eq("user_id", auth.user.id);

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

    if (runwayStatus === "CANCELED") {
      const errorMessage =
        "Video generation was canceled.";

      await supabase
        .from("video_jobs")
        .update({
          status: "canceled",
          progress,
          error_message: errorMessage,
        })
        .eq("id", videoJob.id)
        .eq("user_id", auth.user.id);

      return send(res, 200, {
        success: false,
        status: "CANCELED",
        taskId,
        progress,
        error: errorMessage,
      });
    }

    // --------------------------------------------------
    // UNKNOWN / OTHER RUNWAY STATUS
    // --------------------------------------------------

    await supabase
      .from("video_jobs")
      .update({
        status: runwayStatus.toLowerCase() || "processing",
        progress,
      })
      .eq("id", videoJob.id)
      .eq("user_id", auth.user.id);

    return send(res, 200, {
      success: true,
      status: runwayStatus || "PENDING",
      taskId,
      progress,
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
