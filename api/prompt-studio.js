import OpenAI from "openai";
import { getAuthenticatedUser, getRedisConfig, spendCredit, refundCredit } from "../lib/credits.js";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const HISTORY_LIMIT = 50;

function send(res, status, data) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(data);
}

async function redisCommand(redis, command, args = []) {
  const response = await fetch(`${redis.url}/${[command, ...args].map(encodeURIComponent).join("/")}`, {
    headers: { Authorization: `Bearer ${redis.token}` }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || data.error) throw new Error("Prompt storage unavailable.");
  return data.result;
}

function parse(value) {
  if (typeof value !== "string") return null;
  try { return JSON.parse(value); } catch { return null; }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { status: "failed_refunded", reason: "Method not allowed." });
  }

  try {
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
      return send(res, 503, { status: "failed_refunded", reason: "Prompt service is not configured. No credit was charged." });
    }

    const redis = getRedisConfig();
    if (!redis?.url || !redis?.token) {
      return send(res, 503, { status: "failed_refunded", reason: "Credit service is unavailable. No credit was charged." });
    }

    const userId = auth.user.id;
    const requestKey = `obitrend:prompt-studio:request:${userId}:${requestId}`;
    const lockKey = `${requestKey}:lock`;
    const historyKey = `obitrend:prompt-studio:history:${userId}`;
    const existing = parse(await redisCommand(redis, "GET", [requestKey]));
    if (existing?.status === "generated") return send(res, 200, { ...existing, duplicate: true });

    const lock = await redisCommand(redis, "SET", [lockKey, "processing", "NX", "EX", "240"]);
    if (lock !== "OK") return send(res, 409, { status: "duplicate", reason: "This request is already processing. Please wait before retrying." });

    let spent = null;
    try {
      spent = await spendCredit(userId, redis);
      if (!spent?.success) {
        await redisCommand(redis, "DEL", [lockKey]);
        return send(res, 402, { status: "insufficient_credits", reason: "No credits available." });
      }

      const response = await client.responses.create({
        model: process.env.OPENAI_PROMPT_MODEL,
        input: [
          { role: "system", content: "Create one detailed, production-ready fashion image prompt from the user's brief. Preserve specified garment details, colors, materials, silhouette, fit, and styling. Return only the final prompt text; do not claim to generate an image." },
          { role: "user", content: prompt }
        ]
      });
      const text = String(response.output_text || "").trim();
      if (!text) throw new Error("Empty prompt result.");

      const createdAt = new Date().toISOString();
      const result = { status: "generated", text, requestId, createdAt };
      await redisCommand(redis, "SET", [requestKey, JSON.stringify(result), "EX", "86400"]);
      await redisCommand(redis, "LPUSH", [historyKey, JSON.stringify({ id: requestId, reason: "generation_reserved:prompt_studio", delta: -1, createdAt, status: "generated", text })]);
      await redisCommand(redis, "LTRIM", [historyKey, "0", String(HISTORY_LIMIT - 1)]);
      await redisCommand(redis, "EXPIRE", [historyKey, "7776000"]);
      await redisCommand(redis, "DEL", [lockKey]);
      return send(res, 200, result);
    } catch (error) {
      if (spent?.success) {
        try {
          await refundCredit(userId, redis, spent.creditType || "");
          await redisCommand(redis, "LPUSH", [historyKey, JSON.stringify({ id: requestId, reason: "generation_refund:prompt_studio", delta: 1, createdAt: new Date().toISOString(), status: "failed_refunded" })]);
          await redisCommand(redis, "LTRIM", [historyKey, "0", String(HISTORY_LIMIT - 1)]);
        } catch (refundError) {
          console.error("Prompt Studio refund/history failure:", refundError?.message || refundError);
        }
      }
      await redisCommand(redis, "DEL", [lockKey]).catch(() => {});
      console.error("Prompt Studio generation failed:", error?.message || error);
      return send(res, 502, { status: "failed_refunded", reason: "Prompt generation failed. A credit refund was attempted." });
    }
  } catch (error) {
    console.error("Prompt Studio API error:", error?.message || error);
    return send(res, 503, { status: "failed_refunded", reason: "Prompt service is temporarily unavailable." });
  }
}
