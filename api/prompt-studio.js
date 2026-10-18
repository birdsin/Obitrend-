import OpenAI from "openai";
import { getAuthenticatedUser, getRedisConfig, spendCredit, refundCredit } from "../lib/credits.js";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function send(res, status, data) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(data);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { status: "failed_refunded", reason: "Method not allowed." });
  }

  const auth = await getAuthenticatedUser(req);
  if (!auth?.ok || !auth?.user?.id) {
    return send(res, auth?.status || 401, { status: "failed_refunded", reason: auth?.error || "Please sign in." });
  }

  const prompt = String(req.body?.prompt || "").trim();
  const requestId = String(req.body?.requestId || "").trim();
  if (!prompt || prompt.length > 12000 || !/^[a-zA-Z0-9_-]{16,100}$/.test(requestId)) {
    return send(res, 400, { status: "failed_refunded", reason: "A valid prompt and request ID are required." });
  }

  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_PROMPT_MODEL) {
    return send(res, 503, { status: "failed_refunded", reason: "Prompt generation is not configured. No credit was charged." });
  }

  const redis = getRedisConfig();
  if (!redis?.url || !redis?.token) {
    return send(res, 503, { status: "failed_refunded", reason: "Credit service is unavailable. No credit was charged." });
  }

  const spent = await spendCredit(auth.user.id, redis);
  if (!spent?.success) {
    return send(res, 402, { status: "insufficient_credits", reason: "No credits available." });
  }

  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_PROMPT_MODEL,
      input: [
        { role: "system", content: "Create one detailed, production-ready fashion image prompt from the user's brief. Preserve the specified garment, color, material, silhouette, fit, and styling. Return only the prompt text; do not claim to generate an image." },
        { role: "user", content: prompt }
      ]
    });
    const text = String(response.output_text || "").trim();
    if (!text) throw new Error("Empty prompt result");
    return send(res, 200, { status: "generated", text, requestId });
  } catch (error) {
    await refundCredit(auth.user.id, redis, spent.creditType || "");
    console.error("Prompt Studio generation failed:", error?.message || error);
    return send(res, 502, { status: "failed_refunded", reason: "Prompt generation failed. A credit refund was attempted." });
  }
}
