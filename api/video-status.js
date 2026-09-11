import RunwayML from "@runwayml/sdk";
import { getAuthenticatedUser } from "./credits.js";

const RUNWAY_API_KEY = process.env.RUNWAY_API_KEY;

const runway = RUNWAY_API_KEY
  ? new RunwayML({
      apiKey: RUNWAY_API_KEY,
    })
  : null;

function send(res, status, body) {
  return res.status(status).json(body);
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
    const auth = await getAuthenticatedUser(req);

    if (!auth.ok) {
      return send(res, auth.status, {
        success: false,
        error: auth.error,
      });
    }

    const taskId = String(req.query?.taskId || "").trim();

    if (!taskId) {
      return send(res, 400, {
        success: false,
        error: "Video task ID is required.",
      });
    }

    const task = await runway.tasks.retrieve(taskId);

    const status = String(task?.status || "").toUpperCase();

    if (status === "SUCCEEDED") {
      const videoUrl =
        Array.isArray(task.output) && task.output.length
          ? task.output[0]
          : "";

      if (!videoUrl) {
        return send(res, 502, {
          success: false,
          error: "Runway completed the video but returned no video file.",
        });
      }

      return send(res, 200, {
        success: true,
        status: "SUCCEEDED",
        taskId: task.id,
        videoUrl,
      });
    }

    if (status === "FAILED") {
      return send(res, 200, {
        success: false,
        status: "FAILED",
        taskId: task.id,
        error: "Runway could not complete the video.",
      });
    }

    if (status === "CANCELED") {
      return send(res, 200, {
        success: false,
        status: "CANCELED",
        taskId: task.id,
        error: "Video generation was canceled.",
      });
    }

    return send(res, 200, {
      success: true,
      status: status || "PENDING",
      taskId: task.id,
      progress:
        typeof task.progress === "number"
          ? task.progress
          : null,
    });
  } catch (error) {
    console.error(
      "OBITREND Runway video status error:",
      error?.message || error
    );

    return send(res, 500, {
      success: false,
      error: "Unable to check video generation status right now.",
    });
  }
}
