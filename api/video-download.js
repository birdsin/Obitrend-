import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "../lib/credits.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const VIDEO_BUCKET = "obitrend-videos";

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

function sendError(res, status, error) {
  return res.status(status).json({
    success: false,
    error,
  });
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return sendError(
      res,
      405,
      "Method not allowed."
    );
  }

  try {
    const auth =
      await getAuthenticatedUser(req);

    if (!auth.ok) {
      return sendError(
        res,
        auth.status,
        auth.error
      );
    }

    const taskId =
      String(
        req.query?.taskId || ""
      ).trim();

    if (!taskId) {
      return sendError(
        res,
        400,
        "Video task ID is required."
      );
    }

    const supabase =
      supabaseServiceClient();

    const {
      data: videoJob,
      error: jobError,
    } = await supabase
      .from("video_jobs")
      .select(
        "id,user_id,runway_task_id,status,video_url"
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
        "OBITREND video download lookup error:",
        jobError.message
      );

      return sendError(
        res,
        500,
        "Unable to find your video."
      );
    }

    if (
      !videoJob ||
      videoJob.status !== "completed" ||
      !videoJob.video_url
    ) {
      return sendError(
        res,
        404,
        "Your completed video could not be found."
      );
    }

    const {
      data: file,
      error: downloadError,
    } = await supabase.storage
      .from(VIDEO_BUCKET)
      .download(
        videoJob.video_url
      );

    if (downloadError) {
      console.error(
        "OBITREND video file download error:",
        downloadError.message
      );

      return sendError(
        res,
        500,
        "Unable to save the video right now."
      );
    }

    const buffer =
      Buffer.from(
        await file.arrayBuffer()
      );

    if (!buffer.length) {
      return sendError(
        res,
        500,
        "The video file is empty."
      );
    }

    res.setHeader(
      "Content-Type",
      "video/mp4"
    );

    res.setHeader(
      "Content-Length",
      String(buffer.length)
    );

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="obitrend-ai-fashion-video.mp4"'
    );

    res.setHeader(
      "Cache-Control",
      "private, no-store, max-age=0"
    );

    return res.status(200).send(buffer);
  } catch (error) {
    console.error(
      "OBITREND video download error:",
      error?.message || error
    );

    return sendError(
      res,
      500,
      "Unable to save the video right now."
    );
  }
}
