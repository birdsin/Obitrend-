import OpenAI from "openai";
import {
  spendCredit,
  refundCredit,
  getRedisConfig
} from "./credits.js";
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

const MODEL =
  process.env.OPENAI_IMAGE_MODEL || "gpt-image-1.5";

/* =========================================================
   HELPERS
========================================================= */

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
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value).trim();
}

function normalizeBase64(input) {
  if (!input) return null;

  let value = String(input).trim();

  if (value.startsWith("data:image/")) {
    const comma = value.indexOf(",");

    if (comma !== -1) {
      value = value.slice(comma + 1);
    }
  }

  value = value.replace(/\s/g, "");

  if (value.length < 100) {
    return null;
  }

  return value;
}

function getMimeType(input) {
  const value = String(input || "");

  const match = value.match(
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

  return "jpg";
}

function pick(array, seed) {
  let hash = 0;

  for (let i = 0; i < seed.length; i++) {
    hash =
      (hash << 5) -
      hash +
      seed.charCodeAt(i);

    hash |= 0;
  }

  return array[Math.abs(hash) % array.length];
}

/* =========================================================
   SCENE OPTIONS
========================================================= */

const locations = [
  "luxury beachfront resort",
  "premium five-star hotel entrance",
  "luxury hotel pool",
  "modern rooftop lounge",
  "high-end shopping district",
  "designer fashion boutique",
  "luxury restaurant terrace",
  "tropical beach club",
  "private yacht marina",
  "modern luxury apartment",
  "professional fashion showroom",
  "premium airport lounge",
  "European fashion boulevard",
  "modern African luxury hotel",
  "Dubai luxury boulevard",
  "Miami beachfront promenade",
  "Lagos upscale shopping district",
  "Abuja luxury hotel",
  "Paris-inspired fashion street",
  "London luxury street",
  "New York fashion district",
  "Milan fashion street",
  "luxury resort garden",
  "professional fashion studio",
];

const lightingStyles = [
  "clean natural daylight",
  "soft morning sunlight",
  "warm afternoon sunlight",
  "golden hour sunlight",
  "cinematic evening light",
  "bright editorial daylight",
  "soft luxury hotel lighting",
  "professional studio lighting",
];

const cameraStyles = [
  "professional full-frame fashion photography",
  "high-end commercial fashion photography",
  "premium editorial photography",
  "luxury ecommerce photography",
  "premium lifestyle campaign photography",
  "85mm fashion portrait photography",
  "50mm commercial fashion photography",
];

const poses = [
  "natural full-body standing fashion pose",
  "walking naturally toward the camera",
  "relaxed standing editorial pose",
  "natural seated fashion pose",
  "standing beside a pool",
  "walking through a premium shopping district",
  "relaxed luxury resort pose",
  "natural three-quarter fashion pose",
  "professional catalog pose",
];

/* =========================================================
   MASTER PHOTOREALISM PROMPT
========================================================= */

function buildPrompt(body) {
  const seed =
    clean(body.seed) ||
    `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;

  const model = clean(
    body.model,
    "a professional adult fashion model"
  );

  const bodyType = clean(
    body.bodyType,
    "natural realistic proportions"
  );

  const face = clean(
    body.face,
    "natural photorealistic adult face"
  );

  const pose =
    clean(body.pose) ||
    pick(poses, seed);

  const fashionStyle = clean(
    body.fashionStyle || body.style,
    "premium commercial fashion campaign"
  );

  const camera =
    clean(body.camera) ||
    pick(cameraStyles, seed);

  const locationType =
    clean(body.locationType);

  const city =
    clean(body.city);

  const property =
    clean(body.property);

  const vehicle =
    clean(body.vehicle);

  const lighting =
    clean(body.lighting) ||
    pick(lightingStyles, seed);

  const creativeDirection = clean(
    body.creativeDirection ||
      body.creative,
    "luxury professional fashion campaign"
  );

  const garmentSelection = clean(
    body.garmentSelection ||
      body.garmentFocus,
    "the main garment or outfit selected by the user"
  );

  const location =
    [
      locationType,
      city,
      property,
    ]
      .filter(Boolean)
      .join(", ") ||
    pick(locations, seed);

  return `
OBITREND AI FASHION CREATOR

PHOTOREALISTIC GARMENT-TO-MODEL MASTER STANDARD

PRIMARY OBJECTIVE

Create one extremely photorealistic professional
fashion photograph using the uploaded clothing image
as the PRIMARY PHYSICAL GARMENT REFERENCE.

The uploaded garment is NOT merely inspiration.

Treat the uploaded garment as the actual physical
product that the model is wearing.

The generated image should look as if the exact same
physical garment was photographed on a real adult model
by a professional fashion photographer.

GARMENT FIDELITY IS THE HIGHEST PRIORITY.

USER GARMENT FOCUS:

${garmentSelection}


=========================================================
REFERENCE GARMENT PRESERVATION
=========================================================

Carefully inspect the uploaded garment before generating.

Preserve the visible garment design as accurately as
possible.

PRESERVE:

- exact garment category
- exact garment silhouette
- exact proportions
- exact garment length
- exact hem shape
- exact neckline
- exact sleeve shape
- exact sleeve length
- exact straps
- exact cuffs
- exact waist construction
- exact gathering
- exact ruching
- exact draping
- exact seams
- exact stitching
- exact buttons
- exact pearls
- exact buckles
- exact zippers
- exact pockets
- exact belt construction
- exact fabric texture
- exact ribbing
- exact knit structure
- exact denim texture
- exact woven texture
- exact color
- exact color placement
- exact color blocking
- exact stripes
- exact patterns
- exact prints
- exact graphics
- exact embroidery
- exact bows
- exact decorative details
- exact visible logos
- exact placement of visible design elements
- exact orientation of visible design elements

DO NOT redesign the garment.

DO NOT create a similar garment.

DO NOT replace the garment.

DO NOT simplify the garment.

DO NOT invent missing details.

DO NOT change the garment color.

DO NOT change the garment pattern.

DO NOT add details that are not present.

DO NOT remove visible details.

DO NOT add:

- belts
- buttons
- pockets
- collars
- zippers
- stripes
- bows
- graphics
- embroidery
- decorative panels

unless they are actually present in the uploaded
reference.

The final garment must visually correspond to the
uploaded garment.

=========================================================
REAL FABRIC PHYSICS
=========================================================

The garment must behave like real physical fabric.

Use:

- realistic folds
- realistic wrinkles
- realistic tension
- realistic compression
- realistic seams
- realistic stitching
- realistic fabric thickness
- realistic draping
- realistic highlights
- realistic shadows
- realistic contact with the body

No melted fabric.

No plastic fabric.

No artificial fabric.

No floating clothing.

No distorted clothing.

=========================================================
MODEL PHOTOREALISM
=========================================================

The model must look like a real adult human.

Use:

- realistic skin texture
- realistic facial structure
- realistic eyes
- realistic hair
- realistic hair strands
- realistic hands
- anatomically correct fingers
- realistic body proportions
- realistic posture
- realistic skin lighting
- realistic clothing interaction

Do not create:

- mannequin appearance
- doll appearance
- plastic skin
- CGI character
- cartoon
- anime
- illustration
- painted appearance
- artificial 3D character

=========================================================
ENVIRONMENT PHOTOREALISM
=========================================================

Everything in the environment must look physically real.

Preserve realistic:

- buildings
- architecture
- furniture
- vehicles
- roads
- pavement
- glass
- metal
- plants
- water
- reflections
- shadows
- perspective
- depth
- scale

The environment must look like a real place photographed
with a professional camera.

=========================================================
PHOTOGRAPHY STANDARD
=========================================================

The final image must look like a genuine photograph.

Use:

- professional full-frame camera appearance
- realistic lens rendering
- realistic depth of field
- realistic exposure
- realistic focus
- realistic shadows
- realistic reflections
- natural skin texture
- professional fashion lighting
- realistic perspective

Avoid:

- CGI look
- 3D render look
- AI-looking plastic skin
- artificial background
- oversharpening
- unrealistic blur
- distorted anatomy

=========================================================
CAMPAIGN SETTINGS
=========================================================

MODEL:
${model}

BODY TYPE:
${bodyType}

FACE:
${face}

POSE:
${pose}

FASHION STYLE:
${fashionStyle}

LOCATION:
${location}

VEHICLE:
${vehicle || "none unless naturally appropriate"}

LIGHTING:
${lighting}

CAMERA:
${camera}

CREATIVE DIRECTION:
${creativeDirection}

=========================================================
COMPOSITION
=========================================================

Show the garment clearly.

Do not crop away important garment details.

If the user requests a full-body image, show the complete
outfit naturally.

If the user requests a portrait or medium shot, make sure
the important garment details remain visible.

The model should naturally wear the garment.

=========================================================
ACCESSORIES
=========================================================

Accessories may be added only when compatible with the
selected campaign.

Accessories must never:

- replace the garment
- cover important garment details
- change the garment
- redesign the garment

=========================================================
TEXT
=========================================================

Do not add:

- captions
- watermarks
- labels
- artificial text
- promotional graphics

unless explicitly requested by the user.

=========================================================
FINAL QUALITY CHECK
=========================================================

Before returning the final image, prioritize:

1. Exact garment identity.
2. Exact garment colors.
3. Exact visible garment details.
4. Realistic garment construction.
5. Realistic fabric behavior.
6. Realistic adult model.
7. Realistic environment.
8. Professional photography.
9. Natural composition.

If any creative instruction conflicts with the uploaded
garment, ALWAYS preserve the uploaded garment.

The garment reference has priority over the creative scene.

FINAL RESULT:

A premium, believable, photorealistic fashion photograph
that looks like it was captured in the real world by a
professional fashion photographer.
`;
}

/* =========================================================
   IMAGE SIZE
========================================================= */

function getImageSize(value) {
  const ratio =
    clean(value, "4:5").toLowerCase();

  if (
    ratio.includes("1:1") ||
    ratio.includes("square")
  ) {
    return "1024x1024";
  }

  if (
    ratio.includes("16:9") ||
    ratio.includes("landscape")
  ) {
    return "1536x1024";
  }

  return "1024x1536";
}

/* =========================================================
   MAIN API
========================================================= */

export default async function handler(req, res) {
  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

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
      typeof req.body === "object" &&
      req.body !== null
        ? req.body
        : {};
const userId = clean(
  getValue(body, "userId", "obitrendUserId")
);

if (!userId) {
  return res.status(400).json({
    ok: false,
    error: "A valid OBITREND user ID is required."
  });
}

const redis = getRedisConfig();
let creditSpent = false;

if (!redis.url || !redis.token) {
  return res.status(500).json({
    ok: false,
    error: "OBITREND credit system is not configured."
  });
}
    const rawImage = getValue(
      body,
      "imageBase64",
      "uploadedImage",
      "image",
      "clothingImage",
      "referenceImage"
    );

    const imageBase64 =
      normalizeBase64(rawImage);

    if (!imageBase64) {
      return res.status(400).json({
        ok: false,
        error:
          "No valid clothing image was received. Upload a JPG, PNG or WEBP clothing photo and try again.",
      });
    }

    const mime =
      getMimeType(rawImage);

    if (!mime.startsWith("image/")) {
      return res.status(400).json({
        ok: false,
        error:
          "The uploaded file is not a valid image.",
      });
    }

    const buffer =
      Buffer.from(
        imageBase64,
        "base64"
      );

    if (
      buffer.length >
      9 * 1024 * 1024
    ) {
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

    const extension =
      extensionFromMime(mime);

    const imageFile = new File(
      [buffer],
      `obitrend-reference.${extension}`,
      {
        type: mime,
      }
    );

    const prompt =
      buildPrompt(body);

    const aspectRatio = clean(
      body.aspectRatio ||
        body.ratio,
      "4:5"
    );

    const size =
      getImageSize(aspectRatio);

    /*
      IMAGE EDIT MODE

      The uploaded garment is passed directly to the
      image editing model.

      High input fidelity is enabled to give the model
      stronger preservation of important input details.
    */
const creditResult = await spendCredit(userId, redis);

if (!creditResult.success) {
  return res.status(402).json({
    ok: false,
    error: "You have no OBITREND image generations remaining.",
    balance: creditResult.balance
  });
}

creditSpent = true;
    const result =
      await openai.images.edit({
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

    const image =
      result?.data?.[0];

    if (!image?.b64_json) {
  const responseKeys = Object.keys(image || {});

  const invalidImageError = new Error(
    "The image service returned an invalid image response."
  );

  invalidImageError.status = 502;
  invalidImageError.type = "invalid_image_response";
  invalidImageError.code = "MISSING_B64_JSON";
  invalidImageError.responseKeys = responseKeys;

  throw invalidImageError;
    }

    const imageUrl =
      `data:image/jpeg;base64,${image.b64_json}`;

    return res.status(200).json({
      ok: true,

      imageUrl,

      url: imageUrl,

      image: imageUrl,

      generatedImage:
        imageUrl,

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
    if (creditSpent) {
      try {
        await refundCredit(userId, redis);
      } catch (refundError) {
        console.error(
          "OBITREND CREDIT REFUND ERROR:",
          refundError
        );
      }
    }

    const status =
      error?.status &&
      Number.isInteger(
        error.status
      )
        ? error.status
        : 500;

    let message =
      error?.message ||
      "The image generation service failed.";

    if (status === 401) {
      message =
        "OpenAI API authentication failed. Check OPENAI_API_KEY in Vercel.";
    }

    else if (status === 403) {
      message =
        "The OpenAI account or API key is not permitted to use this image service.";
    }

    else if (status === 429) {
      message =
        "OpenAI API rate or billing limit reached. Check your OpenAI API usage and billing.";
    }

    else if (status >= 500) {
      message =
        "The image service temporarily failed. Please try again.";
    }

    return res.status(status).json({
      ok: false,

      error: message,

      diagnostic: {
        status,

        model: MODEL,

        type:
          error?.type || null,

        code:
          error?.code || null,

        name:
          error?.name || null,
      },
    });
  }
}
