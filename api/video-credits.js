import { getAuthenticatedUser, getRedisConfig } from "../lib/credits.js";
import { getVideoStatus } from "../video-credits.js";

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

  try {
    const auth = await getAuthenticatedUser(req);

    if (!auth.ok) {
      return send(res, auth.status, {
        success: false,
        error: auth.error,
      });
    }

    const redis = getRedisConfig();
    const wallet = await getVideoStatus(auth.user.id, redis);

    if (!wallet?.ok) {
      return send(res, 503, {
        success: false,
        error: "Unable to load your video credits.",
      });
    }

    const seconds = Math.max(0, Number(wallet.seconds || 0));

    /*
      Video credits are stored as seconds.

      The legacy balance5/balance10/balance15/balance20 fields are
      kept in the response for compatibility, but generation and
      payment validation use the single seconds wallet.
    */
    return send(res, 200, {
      success: true,
      seconds,
      videoSeconds: seconds,
      totalSeconds: seconds,
      balance5: Math.floor(seconds / 5),
      balance10: Math.floor(seconds / 10),
      balance15: Math.floor(seconds / 15),
      balance20: Math.floor(seconds / 20),
      totalCredits: seconds,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "OBITREND video credits error:",
      error?.message || error
    );

    return send(res, 500, {
      success: false,
      error: "Unable to load video credits right now.",
    });
  }
}
