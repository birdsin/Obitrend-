import { createHmac, timingSafeEqual } from "node:crypto";

const TOOL_IDS = new Set([
  "model-selection",
  "pose-selection",
  "background-selection",
  "colour-variations",
  "fashion-campaigns",
  "outfit-preview",
  "virtual-try-on",
  "sketch-to-fashion",
  "fabric-studio",
  "pattern-creator",
  "accessory-styling",
  "product-photography",
  "lookbook",
  "social-content",
  "editorial-studio",
  "image-enhancer",
  "background-remover",
  "fashion-moodboard",
  "collection-planner"
]);

function signingKey() {
  return String(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    ""
  ).trim();
}

function sign(value, key) {
  return createHmac("sha256", key).update(value).digest("base64url");
}

export function isPaidStudioTool(toolId) {
  return TOOL_IDS.has(String(toolId || "").trim().toLowerCase());
}

export function issueStudioCapability(userId, toolId, now = Date.now()) {
  const key = signingKey();
  const uid = String(userId || "").trim();
  const tool = String(toolId || "").trim().toLowerCase();
  if (!key || !uid || !isPaidStudioTool(tool)) return null;

  const payload = Buffer.from(JSON.stringify({
    sub: uid,
    tool,
    exp: Math.floor(now / 1000) + 180
  })).toString("base64url");
  return payload + "." + sign(payload, key);
}

export function verifyStudioCapability(token, userId, toolId, now = Date.now()) {
  const key = signingKey();
  if (!key || typeof token !== "string") return false;

  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;

  const expected = sign(parts[0], key);
  const actualBuffer = Buffer.from(parts[1]);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) return false;

  try {
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    return payload?.sub === String(userId || "") &&
      payload?.tool === String(toolId || "").trim().toLowerCase() &&
      isPaidStudioTool(payload?.tool) &&
      Number.isInteger(payload?.exp) &&
      payload.exp > Math.floor(now / 1000);
  } catch {
    return false;
  }
}
