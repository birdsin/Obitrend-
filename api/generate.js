import OpenAI from "openai";

/*
  OBITREND AI FASHION CREATOR
  Photorealistic Fashion Generation API

  Main goals:
  - Uploaded garment is the primary clothing reference
  - High garment fidelity
  - Photorealistic people and environments
  - Dynamic fashion campaign scenes
  - Strong error handling
  - Compatible with Vercel serverless functions
*/

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};

const MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1.5";

/* ---------------------------------------------------------
   HELPERS
--------------------------------------------------------- */

function getValue(body, ...names) {
  for (const name of names) {
    if (
      body &&
      body[name] !== undefined &&
      body[name] !== null &&
      body[name] !== ""
    ) {
      return body[name];
    }
  }

  return "";
}

function clean(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function normalizeBase64(input) {
  if (!input) return null;

  let value = String(input).trim();

  // Handle data URLs
  if (value.startsWith("data:image/")) {
    const comma = value.indexOf(",");
    if (comma !== -1) {
      value = value.slice(comma + 1);
    }
  }

  // Remove accidental whitespace/newlines
  value = value.replace(/\s/g, "");

  // Basic validation
  if (!value || value.length < 100) {
    return null;
  }

  return value;
}

function getMimeType(input) {
  if (!input) return "image/jpeg";

  const match = String(input).match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,/i
  );

  if (match) {
    return match[1].toLowerCase();
  }

  return "image/jpeg";
}

function extensionFromMime(mime) {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "jpg";
}

function safeJSON(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

/* ---------------------------------------------------------
   DYNAMIC SCENE ENGINE
--------------------------------------------------------- */

const locations = [
  "luxury beachfront resort",
  "premium city hotel entrance",
  "luxury hotel pool",
  "modern rooftop lounge",
  "high-end shopping district",
  "elegant fashion boutique",
  "luxury restaurant terrace",
  "tropical beach club",
  "private yacht marina",
  "modern luxury apartment",
  "designer fashion showroom",
  "airport luxury lounge",
  "European city boulevard",
  "modern African luxury hotel",
  "Dubai-style luxury boulevard",
  "Miami-style beachfront",
  "Abuja luxury hotel",
  "Lagos upscale shopping district",
  "Paris-inspired fashion street",
  "London luxury street",
  "New York fashion district",
  "Milan-inspired fashion street",
  "Dubai luxury resort",
];

const lightingStyles = [
  "natural daylight",
  "soft morning sunlight",
  "warm afternoon sunlight",
  "golden hour sunlight",
  "cinematic evening light",
  "soft luxury hotel lighting",
  "bright editorial daylight",
  "subtle overcast daylight",
  "professional fashion studio lighting",
];

const cameraStyles = [
  "professional full-frame fashion photography",
  "high-end commercial fashion photography",
  "editorial fashion photography",
  "luxury ecommerce photography",
  "premium lifestyle campaign photography",
  "85mm portrait photography",
  "50mm professional fashion photography",
];

const poses = [
  "natural standing fashion pose",
  "walking naturally toward the camera",
  "relaxed pose beside a luxury building",
  "seated naturally in a luxury environment",
  "standing beside a pool",
  "walking through a premium shopping district",
  "relaxed resort pose",
  "natural editorial fashion pose",
];

function pick(array, seed) {
  let hash = 0;

  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }

  const index = Math.abs(hash) % array.length;
  return array[index];
}

/* ---------------------------------------------------------
   PHOTOREALISM PROMPT
--------------------------------------------------------- */

function buildPrompt(body) {
  const seed =
    clean(body.seed) ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const model = clean(body.model, "a professional fashion model");
  const bodyType = clean(body.bodyType, "natural realistic proportions");
  const face = clean(body.face, "natural photorealistic face");
  const pose = clean(body.pose) || pick(poses, seed);
  const fashionStyle = clean(
    body.fashionStyle || body.style,
    "premium fashion campaign"
  );

  const camera = clean(body.camera) || pick(cameraStyles, seed);
  const locationType = clean(body.locationType);
  const city = clean(body.city);
  const property = clean(body.property);
  const vehicle = clean(body.vehicle);
  const lighting = clean(body.lighting) || pick(lightingStyles, seed);
  const creativeDirection = clean(
    body.creativeDirection || body.creative,
    "luxury professional fashion campaign"
  );

  const location =
    [locationType, city, property].filter(Boolean).join(", ") ||
    pick(locations, seed);

  return `
OBITREND PHOTOREALISTIC FASHION CAMPAIGN

The uploaded clothing reference image is the PRIMARY VISUAL REFERENCE.

The clothing itself is the most important object in this generation.

Create a completely photorealistic professional fashion photograph.

GARMENT FIDELITY — EXTREMELY IMPORTANT:

Reproduce the garment from the uploaded reference as accurately as possible.

Preserve:

- exact garment type
- exact silhouette
- exact proportions
- exact neckline
- exact sleeve design
- exact sleeve length
- exact cuffs
- exact hem
- exact garment length
- exact fabric appearance
- exact ribbing
- exact seams
- exact stitching
- exact folds where physically appropriate
- exact colors
- exact color blocking
- exact stripes
- exact patterns
- exact graphics
- exact embroidery
- exact bows
- exact logos that are visibly present
- exact decorative elements
- exact placement of visible design elements
- exact orientation of visible design elements

Do NOT redesign the garment.

Do NOT create a similar garment.

Do NOT replace the garment with another garment.

Do NOT invent missing clothing details.

Do NOT change the garment's colors.

Do NOT add belts, buttons, pockets, collars, zippers, patterns, graphics, bows or decorative elements that are not present in the reference.

The result should look like the EXACT physical garment from the reference was photographed on the model.

The garment must behave like real fabric.

Use realistic:
- fabric tension
- folds
- wrinkles
- seams
- stitching
- shadows
- highlights
- thickness
- draping
- contact with the body

PHOTOREALISM:

Everything must look physically real.

The person must have:
- realistic skin texture
- realistic facial features
- realistic eyes
- realistic hair
- realistic hands
- anatomically correct fingers
- realistic body proportions
- natural posture

The environment must contain physically believable:
- architecture
- furniture
- vehicles
- plants
- glass
- metal
- pavement
- water
- reflections
- shadows
- depth
- perspective

Do not make the scene look like:
- cartoon
- anime
- painting
- illustration
- CGI
- 3D render
- plastic skin
- doll
- mannequin
- artificial fabric
- synthetic background

CAMPAIGN:

Model:
${model}

Body type:
${bodyType}

Face:
${face}

Pose:
${pose}

Fashion direction:
${fashionStyle}

Location:
${location}

Vehicle:
${vehicle || "none unless naturally appropriate"}

Lighting:
${lighting}

Camera:
${camera}

Creative direction:
${creativeDirection}

Create a premium commercial fashion photograph with realistic camera optics, realistic depth of field, realistic exposure, realistic shadows and natural interaction between the model, garment and environment.

The final image must look like a genuine photograph taken by a professional fashion photographer.

Do not add text, captions, watermarks, artificial labels or promotional graphics unless the user specifically requested them.

IMPORTANT:
The uploaded garment takes priority over all creative choices.

If a creative choice conflicts with the uploaded garment, preserve the uploaded garment.
`;
}

/* ---------------------------------------------------------
   MAIN HANDLER
--------------------------------------------------------- */

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed. Use POST.",
    });
  }

  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        ok: false,
        error:
          "OPENAI_API_KEY is missing from Vercel Environment Variables.",
      });
    }

    const body =
      typeof req.body === "object" && req.body !== null
        ? req.body
        : {};

    /*
      Accept several possible names so this API works
      with your existing OBITREND frontend.
    */

    const rawImage =
      getValue(
        body,
        "imageBase64",
        "uploadedImage",
        "image",
        "clothingImage",
        "referenceImage"
      );

    const imageBase64 = normalizeBase64(rawImage);

    /*
      A garment reference is required for OBITREND's
      clothing-preservation workflow.
    */

    if (!imageBase64) {
      return res.status(400).json({
        ok: false,
        error:
          "No valid clothing image was received. Upload a JPG, PNG or WEBP clothing photo and try again.",
      });
    }

    const mime = getMimeType(rawImage);

    if (
      !mime.startsWith("image/")
    ) {
      return res.status(400).json({
        ok: false,
        error: "The uploaded file is not a valid image.",
      });
    }

    const buffer = Buffer.from(imageBase64, "base64");

    /*
      Protect the API from accidentally receiving enormous
      payloads.
    */

    if (buffer.length > 9 * 1024 * 1024) {
      return res.status(413).json({
        ok: false,
        error:
          "The clothing image is too large. Please use an image under 9MB.",
      });
    }

    if (buffer.length < 1000) {
      return res.status(400).json({
        ok: false,
        error:
          "The uploaded image appears to be empty or corrupted.",
      });
    }

    const extension = extensionFromMime(mime);

    const imageFile = await toFile(
      buffer,
      `obitrend-reference.${extension}`,
      {
        type: mime,
      }
    );

    const prompt = buildPrompt(body);

    const aspectRatio = clean(
      body.aspectRatio || body.ratio,
      "4:5"
    );

    /*
      Map frontend ratios to supported image sizes.
    */

    let size = "1024x1536";

    if (
      aspectRatio.includes("1:1") ||
      aspectRatio.toLowerCase().includes("square")
    ) {
      size = "1024x1024";
    } else if (
      aspectRatio.includes("16:9") ||
      aspectRatio.includes("landscape")
    ) {
      size = "1536x1024";
    } else {
      size = "1024x1536";
    }

    /*
      IMPORTANT:
      Use the EDIT endpoint because we have an uploaded
      garment reference image.

      High input fidelity is specifically intended to
      preserve important visual details from the input.
    */

    const result = await openai.images.edit({
      model: MODEL,
      image: imageFile,
      prompt,
      input_fidelity: "high",
      size,
      quality: "high",
      output_format: "jpeg",
      output_compression: 92,
      n: 1,
    });

    if (
      !result ||
      !result.data ||
      !result.data.length ||
      !result.data[0]
    ) {
      return res.status(502).json({
        ok: false,
        error:
          "The image service returned no image.",
        diagnostic: {
          model: MODEL,
          hasData: !!result?.data,
        },
      });
    }

    const image = result.data[0];

    if (!image.b64_json) {
      return res.status(502).json({
        ok: false,
        error:
          "The image service returned an invalid image response.",
        diagnostic: {
          model: MODEL,
          responseKeys: Object.keys(image || {}),
        },
      });
    }

    const imageUrl =
      `data:image/jpeg;base64,${image.b64_json}`;

    return res.status(200).json({
      ok: true,

      /*
        imageUrl is the main property expected by the
        OBITREND frontend.
      */
      imageUrl,

      /*
        Also return common aliases to make the endpoint
        compatible with older frontend code.
      */
      url: imageUrl,
      image: imageUrl,
      generatedImage: imageUrl,

      model: MODEL,
      aspectRatio,
      size,

      message:
        "OBITREND photorealistic fashion image generated successfully.",
    });
  } catch (error) {
    console.error(
      "OBITREND GENERATION ERROR:",
      error
    );

    const status =
      error?.status &&
      Number.isInteger(error.status)
        ? error.status
        : 500;

    let message =
      error?.message ||
      "The image generation service failed.";

    /*
      Make the frontend error useful instead of the old
      generic "invalid response" message.
    */

    if (status === 401) {
      message =
        "OpenAI API authentication failed. Check OPENAI_API_KEY in Vercel.";
    } else if (status === 403) {
      message =
        "The OpenAI account or API key is not permitted to use this image service.";
    } else if (status === 429) {
      message =
        "OpenAI API rate limit or billing limit reached. Please check your API usage and billing.";
    } else if (status >= 500) {
      message =
        "The image service temporarily failed. Please try generating again.";
    }

    return res.status(status).json({
      ok: false,
      error: message,
      diagnostic: {
        status,
        model: MODEL,
        type: error?.type || null,
        code: error?.code || null,
        name: error?.name || null,
      },
    });
  }
}
