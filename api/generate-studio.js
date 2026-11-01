import { getAuthenticatedUser, getProStatus, getRedisConfig } from "../lib/credits.js";
import generateHandler from "./generate.js";

/**
 * Dedicated Studio generation capability.
 * Unlike the legacy /api/generate route (kept for existing web/Android clients),
 * every request to this route requires a server-verified active Pro entitlement.
 * The browser cannot downgrade this route by changing a request body tool ID.
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      success: false,
      error: "Method not allowed."
    });
  }

  const auth = await getAuthenticatedUser(req);
  if (!auth.ok) {
    return res.status(auth.status).json({
      success: false,
      error: auth.error
    });
  }

  let entitlement;
  try {
    entitlement = await getProStatus(auth.user.id, getRedisConfig());
  } catch (error) {
    console.error("OBITREND Studio Pro verification failed:", error?.message || error);
    entitlement = null;
  }

  if (entitlement?.active !== true) {
    return res.status(403).json({
      success: false,
      error: "This Studio tool requires an active OBITREND Pro plan.",
      upgradeRequired: true,
      toolLocked: true
    });
  }

  return generateHandler(req, res);
}
