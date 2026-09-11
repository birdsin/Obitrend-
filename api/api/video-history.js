import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "./credits.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const VIDEO_BUCKET = "obitrend-videos";

function send(res, status, body) {
  return res.status(status).json(body);
}

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

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return send(res, 405, {
      success: false,
      error: "Method not allowed.",
    });
  }

  try {
    // -----------------------------------------------
    // AUTHENTICATE USER
    // -----------------------------------------------

    const auth = await getAuthenticatedUser(req);

    if (!auth.ok) {
      return send(res, auth.status, {
        success: false,
        error: auth.error,
      });
    }

    const supabase = supabaseServiceClient();

    // -----------------------------------------------
    // GET ONLY THIS USER'S VIDEO JOBS
    // -----------------------------------------------

    const { data: jobs, error } =
      await supabase
        .from("video_jobs")
        .select(
          "id,status,progress,prompt,image_url,video_url,error_message,created_at,completed_at"
        )
        .eq("user_id", auth.user.id)
        .order("created_at", {
          ascending: false,
        })
        .limit(50);

    if (error) {
      console.error(
        "OBITREND video history error:",
        error.message
      );

      return send(res, 500, {
        success: false,
        error:
          "Unable to load video history.",
      });
    }

    // -----------------------------------------------
    // CREATE PRIVATE SIGNED URLS
    // -----------------------------------------------

    const history = [];

    for (const job of jobs || []) {
      let videoUrl = null;

      if (
        job.status === "completed" &&
        job.video_url
      ) {
        const { data: signedData } =
          await supabase.storage
            .from(VIDEO_BUCKET)
            .createSignedUrl(
              job.video_url,
              60 * 60
            );

        if (signedData?.signedUrl) {
          videoUrl =
            signedData.signedUrl;
        }
      }

      history.push({
        id: job.id,
        status: job.status,
        progress: job.progress,
        prompt: job.prompt,
        imageUrl: job.image_url,
        videoUrl,
        errorMessage:
          job.error_message,
        createdAt:
          job.created_at,
        completedAt:
          job.completed_at,
      });
    }

    return send(res, 200, {
      success: true,
      videos: history,
    });

  } catch (error) {
    console.error(
      "OBITREND video history server error:",
      error?.message || error
    );

    return send(res, 500, {
      success: false,
      error:
        "Unable to load video history right now.",
    });
  }
}
