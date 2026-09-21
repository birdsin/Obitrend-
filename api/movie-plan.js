import OpenAI from "openai";
import { getAuthenticatedUser } from "../lib/credits.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.MOVIE_PLANNER_MODEL || "gpt-5.6";

function send(res, status, body) {
  return res.status(status).json(body);
}

const SYSTEM = `You are OBITREND's senior AI film director, cinematographer and screenplay architect.
Turn a user's movie idea into a production-ready cinematic blueprint for AI video generation.
Prioritize visual continuity, character continuity, geography, wardrobe continuity, realistic physics, natural human motion, coherent lighting and deliberate camera language.
Never write vague filler. Every shot must be independently understandable while also fitting the story.
Use professional cinematography terminology: camera body, lens, focal length, aperture, shutter, movement, framing, angle, focus, lighting, color grade.
Prefer physically plausible camera choices and natural motion.
The blueprint will be used by a shot-generation engine, so keep each shot prompt concrete and visual.
Do not imitate a living filmmaker's exact style. Use generic cinematic descriptors instead.
Return ONLY valid JSON matching the requested structure.`;

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    logline: { type: "string" },
    genre: { type: "string" },
    visualBible: {
      type: "object", additionalProperties: false,
      properties: {
        world: { type: "string" },
        colorGrade: { type: "string" },
        lighting: { type: "string" },
        realism: { type: "string" },
        continuityRules: { type: "array", items: { type: "string" } }
      },
      required: ["world","colorGrade","lighting","realism","continuityRules"]
    },
    characters: {
      type: "array", items: {
        type: "object", additionalProperties: false,
        properties: {
          name: { type: "string" },
          role: { type: "string" },
          appearance: { type: "string" },
          wardrobe: { type: "string" },
          personality: { type: "string" }
        },
        required: ["name","role","appearance","wardrobe","personality"]
      }
    },
    scenes: {
      type: "array", minItems: 1, maxItems: 24,
      items: {
        type: "object", additionalProperties: false,
        properties: {
          number: { type: "integer" },
          heading: { type: "string" },
          purpose: { type: "string" },
          location: { type: "string" },
          timeOfDay: { type: "string" },
          durationSeconds: { type: "integer" },
          dialogue: { type: "string" },
          shots: {
            type: "array", minItems: 1, maxItems: 6,
            items: {
              type: "object", additionalProperties: false,
              properties: {
                shotNumber: { type: "integer" },
                durationSeconds: { type: "integer" },
                shotPrompt: { type: "string" },
                camera: { type: "string" },
                lens: { type: "string" },
                framing: { type: "string" },
                angle: { type: "string" },
                movement: { type: "string" },
                focus: { type: "string" },
                lighting: { type: "string" },
                sound: { type: "string" },
                continuity: { type: "string" }
              },
              required: ["shotNumber","durationSeconds","shotPrompt","camera","lens","framing","angle","movement","focus","lighting","sound","continuity"]
            }
          }
        },
        required: ["number","heading","purpose","location","timeOfDay","durationSeconds","dialogue","shots"]
      }
    }
  },
  required: ["title","logline","genre","visualBible","characters","scenes"]
};

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { success:false, error:"Method not allowed." });
  if (!process.env.OPENAI_API_KEY) return send(res, 503, { success:false, error:"AI movie planning is not configured." });

  const auth = await getAuthenticatedUser(req);
  if (!auth?.ok || !auth?.user?.id) return send(res, auth?.status || 401, { success:false, error:auth?.error || "Authentication failed." });

  const body = req.body || {};
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const length = Number(body.length) || 5;
  const style = typeof body.style === "string" ? body.style.trim() : "cinematic realism";
  const aspect = typeof body.aspect === "string" ? body.aspect.trim() : "16:9";

  if (!prompt) return send(res, 400, { success:false, error:"Movie prompt is required." });

  const sceneCount = Math.min(24, Math.max(3, length <= 5 ? 6 : length <= 15 ? 12 : 18));

  try {
    const response = await openai.responses.create({
      model: MODEL,
      reasoning: { effort: "high" },
      instructions: SYSTEM,
      input: `Create a production blueprint for this movie idea.

USER IDEA:
${prompt}

TARGET LENGTH: approximately ${length} minutes
VISUAL STYLE: ${style}
ASPECT RATIO: ${aspect}
TARGET SCENES: ${sceneCount}

Continuity is critical. Establish recurring characters before scenes. Build escalating story beats. Each scene should contain multiple usable shots, and each shot must have a precise camera/lens/movement direction.`,
      text: {
        format: {
          type: "json_schema",
          name: "obitrend_movie_blueprint",
          strict: true,
          schema
        }
      }
    });

    const raw = response.output_text || "";
    const plan = JSON.parse(raw);
    return send(res, 200, { success:true, model:MODEL, plan });
  } catch (error) {
    console.error("OBITREND MOVIE PLAN ERROR:", error);
    return send(res, 500, { success:false, error:"The AI movie director could not complete the movie blueprint. Please try again." });
  }
}
