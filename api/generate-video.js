import RunwayML, { TaskFailedError } from "@runwayml/sdk";
import { createClient } from "@supabase/supabase-js";
import {
  getAuthenticatedUser,
  getProStatus,
  getRedisConfig,
} from "./credits.js";

const RUNWAY_API_KEY = process.env.RUNWAY_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const runway = RUNWAY_API_KEY
  ? new RunwayML({
      apiKey: RUNWAY_API_KEY,
    })
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
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
    const auth = await getAuthenticatedUser(req);

    if (!auth.ok) {
      return send(res, auth.status, {
        success: false,
        error: auth.error,
      });
    }
// --------------------------------------------------
// VIDEO IS PRO-ONLY
// FREE USERS CANNOT GENERATE VIDEO
// FREE CREDITS ARE NEVER USED FOR VIDEO
// --------------------------------------------------

const redis = getRedisConfig();

const proStatus = await getProStatus(
  auth.user.id,
  redis
);

if (!proStatus.active) {
  return send(res, 403, {
    success: false,
    proRequired: true,
    error:
      "Video generation is available to OBITREND Pro users only.",
  });
}
    const body = req.body || {};

    const prompt = String(body.prompt || "").trim();
    const imageUrl = String(body.imageUrl || "").trim();
    const ratio = String(body.ratio || "1280:720");
    const duration = Number(body.duration || 5);

    if (!prompt) {
      return send(res, 400, {
        success: false,
        error: "Video prompt is required.",
      });
    }

    const allowedRatios = new Set([
      "1280:720",
      "720:1280",
      "1584:672",
      "1104:832",
      "832:1104",
      "672:1584",
      "960:960",
    ]);

    if (!allowedRatios.has(ratio)) {
      return send(res, 400, {
        success: false,
        error: "Unsupported video aspect ratio.",
      });
    }

    if (![2, 3, 4, 5, 6, 7, 8, 9, 10].includes(duration)) {
      return send(res, 400, {
        success: false,
        error: "Video duration must be between 2 and 10 seconds.",
      });
    }

    const input = {
      model: "gen4.5",
      promptText: prompt,
      ratio,
      duration,
    };

    if (imageUrl) {
      input.promptImage = imageUrl;
    }

    const task = await runway.imageToVideo.create(input);

    const supabase = supabaseServiceClient();

    const { error: insertError } = await supabase
      .from("video_jobs")
      .insert({
        user_id: auth.user.id,
        runway_task_id: task.id,
        status: "queued",
        progress: 0,
        prompt,
        image_url: imageUrl || null,
      });

    if (insertError) {
      console.error(
        "OBITREND video job database error:",
        insertError.message
      );

      return send(res, 503, {
        success: false,
        error: "Video started but could not be registered. Please try again.",
      });
    }

    return send(res, 200, {
      success: true,
      taskId: task.id,
      status: "queued",
      message: "Video generation started.",
    });
  } catch (error) {
    if (error instanceof TaskFailedError) {
      console.error(
        "OBITREND Runway task failed:",
        error.taskDetails
      );

      return send(res, 502, {
        success: false,
        error: "Runway could not start the video generation.",
      });
    }

    console.error(
      "OBITREND video generation error:",
      error?.message || error
    );

    return send(res, 500, {
      success: false,
      error: "Unable to start video generation right now.",
    });
  }
}
