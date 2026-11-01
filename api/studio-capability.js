import { getAuthenticatedUser, getProStatus, getRedisConfig } from "../lib/credits.js";
import { isPaidStudioTool, issueStudioCapability } from "../lib/studio-capability.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, error: "Method not allowed." });
  }

  const auth = await getAuthenticatedUser(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ success: false, error: auth.error });
  }

  const toolId = String(req.body?.toolId || "").trim().toLowerCase();
  if (!isPaidStudioTool(toolId)) {
    return res.status(400).json({ success: false, error: "Unknown paid Studio tool." });
  }

  const pro = await getProStatus(auth.user.id, getRedisConfig());
  if (pro?.active !== true) {
    return res.status(403).json({
      success: false,
      error: "An active OBITREND Pro plan is required.",
      upgradeRequired: true,
      toolLocked: true
    });
  }

  const capability = issueStudioCapability(auth.user.id, toolId);
  if (!capability) {
    return res.status(503).json({
      success: false,
      error: "Secure Studio authorization is unavailable."
    });
  }

  return res.status(200).json({ success: true, capability, expiresIn: 180 });
}
