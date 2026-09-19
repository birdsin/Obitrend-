import OpenAI from "openai";
import { getAuthenticatedUser } from "../lib/credits.js";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb"
    }
  }
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

function cleanDataUrl(value) {
  const valueString = String(value || "").trim();
  if (!/^data:image\//i.test(valueString)) return null;
  if (valueString.length > 10 * 1024 * 1024) return null;
  return valueString;
}

function parseJson(text) {
  try {
    const value = JSON.parse(String(text || "").trim());
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed."
    });
  }

  try {
    const auth = await getAuthenticatedUser(req);

    if (!auth?.ok || !auth?.user?.id) {
      return res.status(401).json({
        success: false,
        error: "Authentication required."
      });
    }

    const imageBase64 = cleanDataUrl(
      req.body?.imageBase64 ||
      req.body?.image ||
      req.body?.uploadedImage
    );

    if (!imageBase64) {
      return res.status(400).json({
        success: false,
        error: "A valid uploaded image is required."
      });
    }

    const response = await openai.responses.create({
      model: process.env.OPENAI_VISION_MODEL || "gpt-5.6-luna",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `
Analyze this uploaded image for OBITREND's automatic scene and object intelligence.

Identify what is actually visible. Detect:
- clothing / garments and garment category
- people and approximate count
- houses, villas, apartments, buildings, hotels and interiors
- cars, motorcycles, bicycles, buses and other vehicles
- furniture
- bags, shoes and accessories
- electronics
- products and merchandise
- plants, trees and outdoor elements
- streets, roads, shops, restaurants, airports, beaches, pools and other environments
- important objects that affect how a realistic fashion scene should be generated

Do not invent objects that are not visible.
Return ONLY valid JSON with these fields:
{
  "primarySubject": "short description",
  "sceneType": "short description",
  "objects": ["object 1", "object 2"],
  "peopleCount": 0,
  "garments": ["garment 1"],
  "vehicles": ["vehicle 1"],
  "properties": ["house/building/interior if visible"],
  "environment": ["environment element 1"],
  "colors": ["important visible color"],
  "materials": ["important visible material"],
  "details": ["important visual detail"],
  "generationInstruction": "short instruction describing how the detected real objects and environment should be respected in the generated image"
}
`
            },
            {
              type: "input_image",
              image_url: imageBase64,
              detail: "high"
            }
          ]
        }
      ]
    });

    const raw = response.output_text || "";
    const analysis = parseJson(raw);

    return res.status(200).json({
      success: true,
      analysis: {
        primarySubject: String(analysis.primarySubject || ""),
        sceneType: String(analysis.sceneType || ""),
        objects: Array.isArray(analysis.objects) ? analysis.objects.slice(0, 30) : [],
        peopleCount: Number.isFinite(Number(analysis.peopleCount)) ? Number(analysis.peopleCount) : 0,
        garments: Array.isArray(analysis.garments) ? analysis.garments.slice(0, 20) : [],
        vehicles: Array.isArray(analysis.vehicles) ? analysis.vehicles.slice(0, 20) : [],
        properties: Array.isArray(analysis.properties) ? analysis.properties.slice(0, 20) : [],
        environment: Array.isArray(analysis.environment) ? analysis.environment.slice(0, 20) : [],
        colors: Array.isArray(analysis.colors) ? analysis.colors.slice(0, 20) : [],
        materials: Array.isArray(analysis.materials) ? analysis.materials.slice(0, 20) : [],
        details: Array.isArray(analysis.details) ? analysis.details.slice(0, 30) : [],
        generationInstruction: String(analysis.generationInstruction || "")
      }
    });
  } catch (error) {
    console.error("OBITREND automatic image detection failed:", error?.message || error);
    return res.status(500).json({
      success: false,
      error: "Automatic image detection is temporarily unavailable."
    });
  }
}
