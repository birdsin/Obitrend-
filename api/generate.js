import OpenAI, { toFile } from "openai";

import {
  spendCredit,
  refundCredit,
  getProStatus,
  getRedisConfig,
  getAuthenticatedUser,
} from "./credits.js";

/*
=========================================================
OBITREND AI FASHION CREATOR
COMPLETE /api/generate.js REPLACEMENT

FIXES ONLY:
- Accepts imageBase64 from the existing frontend
- Keeps image/uploadedImage/clothingImage compatibility
- Uses the existing credit system
- Correctly checks spendCredit().success
- Keeps existing Pro workflow
- Keeps existing colour workflow
- Keeps existing pose workflow
- Keeps existing response fields
- Refunds the charged credit if generation fails
- Preserves uploaded garment as the primary reference
=========================================================
*/

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "12mb",
    },
  },
};

export const maxDuration = 300;

const MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
const MAX_COLOUR_IMAGES = 4;
const MAX_IMAGE_BYTES = 9 * 1024 * 1024;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* =========================================================
HELPERS
========================================================= */

function clean(value, fallback = "") {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return String(value).trim();
}

function getValue(body, ...names) {
  for (const name of names) {
    if (
      body?.[name] !== undefined &&
      body?.[name] !== null &&
      body?.[name] !== ""
    ) {
      return body[name];
    }
  }

  return "";
}

function getBoolean(body, ...names) {
  for (const name of names) {
    const value = body?.[name];

    if (
      value === true ||
      value === "true" ||
      value === 1 ||
      value === "1"
    ) {
      return true;
    }

    if (
      value === false ||
      value === "false" ||
      value === 0 ||
      value === "0"
    ) {
      return false;
    }
  }

  return false;
}

/* =========================================================
BASE64
========================================================= */

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

  return value.length >= 100 ? value : null;
}

/* =========================================================
MIME
========================================================= */

function getMimeType(input) {
  const match = String(input || "").match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,/i
  );

  return match
    ? match[1].toLowerCase()
    : "image/jpeg";
}

function extensionFromMime(mime) {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}

/* =========================================================
IMAGE SIZE
========================================================= */

function getImageSize(value) {
  const ratio = clean(value, "5:4").toLowerCase();

  if (
    ratio.includes("1:1") ||
    ratio.includes("square")
  ) {
    return "1024x1024";
  }

  if (
    ratio.includes("9:16") ||
    ratio.includes("portrait")
  ) {
    return "1024x1536";
  }

  return "1536x1024";
}

/* =========================================================
COLOUR SUPPORT
========================================================= */

function getColourList(body) {
  const raw = getValue(
    body,
    "clothingColors",
    "clothingColours",
    "garmentColors",
    "garmentColours",
    "colors",
    "colours",
    "selectedColors",
    "selectedColours",
    "colourCollection",
    "colorCollection"
  );

  let list = [];

  if (Array.isArray(raw)) {
    list = raw;
  } else if (
    typeof raw === "string" &&
    raw.trim()
  ) {
    list = raw
      .split(",")
      .map((item) => item.trim());
  }

  return [
    ...new Set(
      list
        .map((value) => String(value).trim())
        .filter(Boolean)
    ),
  ].slice(0, MAX_COLOUR_IMAGES);
}

/* =========================================================
REQUEST IMAGE EXTRACTION
========================================================= */

function getNestedImageInput(body) {
  let imageInput = getValue(
    body,
    "imageBase64",
    "uploadedImage",
    "image",
    "clothingImage",
    "referenceImage"
  );

  if (
    !imageInput &&
    body?.data &&
    typeof body.data === "object"
  ) {
    imageInput = getValue(
      body.data,
      "imageBase64",
      "uploadedImage",
      "image",
      "clothingImage",
      "referenceImage"
    );
  }

  if (
    !imageInput &&
    body?.input &&
    typeof body.input === "object"
  ) {
    imageInput = getValue(
      body.input,
      "imageBase64",
      "uploadedImage",
      "image",
      "clothingImage",
      "referenceImage"
    );
  }

  return imageInput;
}

/* =========================================================
CLOTHING-PRESERVATION PROMPT
========================================================= */

function buildPrompt(
  body,
  variantColor = "",
  selectedPose = ""
) {
  const allowColourChange = getBoolean(
    body,
    "changeGarmentColor",
    "changeClothingColor",
    "allowGarmentColorChange",
    "variantColorChange"
  );

  const model = clean(
    getValue(
      body,
      "model",
      "lady",
      "selectedModel"
    ),
    "adult fashion model"
  );

  const bodyStyle = clean(
    getValue(
      body,
      "bodyStyle",
      "body",
      "body_type"
    ),
    "natural balanced"
  );

  const pose = clean(
    selectedPose || getValue(body, "pose"),
    "standing confidently"
  );

  const fashionStyle = clean(
    getValue(
      body,
      "fashionStyle",
      "style"
    ),
    "luxury editorial"
  );

  const country = clean(
    getValue(body, "country")
  );

  const city = clean(
    getValue(body, "city")
  );

  const scene = clean(
    getValue(
      body,
      "scene",
      "background"
    ),
    "luxury fashion studio"
  );

  const car = clean(
    getValue(
      body,
      "car",
      "vehicle"
    ),
    "no vehicle unless appropriate"
  );

  const camera = clean(
    getValue(
      body,
      "camera",
      "lighting"
    ),
    "high-end commercial fashion photography"
  );

  const ratio = clean(
    getValue(
      body,
      "aspectRatio",
      "ratio"
    ),
    "5:4"
  );

  const extra = clean(
    getValue(
      body,
      "extra",
      "additionalPrompt"
    )
  );

  const userPrompt = clean(
    getValue(
      body,
      "prompt",
      "description"
    )
  );

  const location = [
    city,
    country,
  ]
    .filter(Boolean)
    .join(", ");

  const companionMode = getBoolean(
    body,
    "hasCompanion",
    "companionMode",
    "preserveCompanion"
  );

  return `
OBITREND STRICT GARMENT REPRODUCTION MODE.

The uploaded image is the PRIMARY AND STRICT VISUAL REFERENCE
for the GARMENT.

Create a new photorealistic fashion photograph where the selected
adult model is actually wearing the SAME garment shown in the
uploaded reference.

DO NOT treat the uploaded garment as loose inspiration.
DO NOT invent a replacement outfit.

=========================================================
REFERENCE IMAGE INTERPRETATION
=========================================================

Use the uploaded image to identify the garment.

Ignore the original person's:

- identity
- face
- body
- age
- pose
- hairstyle
- accessories
- handbag
- shoes
- background
- location

Preserve the GARMENT.

If the reference image contains a collage or multiple views,
use every visible view to understand the garment's front, back,
side construction and details.

=========================================================
GARMENT MUST MATCH
=========================================================

Preserve as faithfully as possible:

- exact garment category
- exact garment type
- exact silhouette
- exact proportions
- exact length
- neckline
- collar
- straps
- sleeves or sleeveless construction
- arm openings
- waist shaping
- darts
- seams
- stitching
- panels
- pleats
- gathers
- folds
- draping
- hem shape
- button count and placement
- zipper placement
- ties
- belts only if present in the reference
- pockets
- embroidery
- prints
- artwork
- logos
- labels
- lettering
- stripes
- checks
- patterns
- borders
- trim
- fabric texture
- fabric finish
- color
- color relationships
- front construction
- back construction
- visible fastening details

Do not simplify the garment.

Do not replace it with a generic luxury outfit.

=========================================================
CRITICAL EXAMPLE
=========================================================

If the uploaded reference shows a pink-and-white striped
sleeveless button-up top, the generated model MUST wear a
pink-and-white striped sleeveless button-up top matching that
reference.

It must NOT become:

- cream clothing
- white clothing
- beige clothing
- a jumpsuit
- a blazer
- a dress
- a different blouse
- a generic luxury outfit
- a newly designed outfit

The uploaded garment's visual identity has priority over the
requested fashion style, location or vehicle.

=========================================================
ABSOLUTE PROHIBITIONS
=========================================================

Never:

- redesign the garment
- replace the garment
- recolor the garment
- change its category
- change its neckline
- change its collar
- add sleeves that are not present
- remove sleeves that are present
- add a belt that is not present
- remove a belt that is present
- change buttons
- change stripe direction
- change stripe spacing
- change print placement
- change embroidery
- remove logos or lettering
- invent new garment panels
- turn the garment into another outfit
- substitute a cream, beige or white outfit
- use the phrase "inspired by" as permission to redesign it

=========================================================
MODEL
=========================================================

Model:
${model}

Body style:
${bodyStyle}

Pose:
${pose}

Fashion style:
${fashionStyle}

The model is an adult fashion model.

=========================================================
SCENE
=========================================================

Setting:
${scene}

${location ? `Location: ${location}` : ""}

Vehicle:
${car}

The scene must support the fashion campaign without changing
the garment.

=========================================================
PHOTOGRAPHY
=========================================================

Camera:
${camera}

Requested aspect ratio:
${ratio}

Create:

- photorealistic adult human anatomy
- realistic hands
- realistic face
- realistic skin texture
- realistic hair
- realistic garment-to-body contact
- realistic fabric folds
- realistic seams
- realistic shadows
- realistic reflections
- physically plausible lighting
- realistic materials
- premium commercial fashion photography
- high-end fashion magazine quality
- natural depth of field
- professional camera rendering

Avoid:

- CGI appearance
- plastic skin
- fake fabric
- distorted anatomy
- extra fingers
- distorted hands
- melted garment details
- random text
- watermark

=========================================================
COMPANION HANDLING
=========================================================

${
  companionMode
    ? `
The uploaded reference may contain another person or child.
Keep that person only if the frontend explicitly requested a
companion. Do not let the companion replace or alter the garment
worn by the adult model. Any child must remain age-appropriate.
`
    : `
Do not copy unrelated people from the reference image.
The garment is the important reference.
`
}

=========================================================
COLOUR VARIANT
=========================================================

${
  variantColor
    ? `
Requested garment colour:
${variantColor}

${
  allowColourChange
    ? `
Change ONLY the garment colour.

Keep identical:

- garment category
- silhouette
- construction
- stripes
- graphics
- buttons
- seams
- trims
- fabric
- proportions
- all other garment details

Do not redesign the garment.
`
    : `
Preserve the selected garment colour exactly as represented by
the uploaded reference and frontend selection.
Do not redesign the garment.
`
}
`
    : ""
}

=========================================================
USER REQUEST
=========================================================

${
  userPrompt
    ? `
${userPrompt}
`
    : ""
}

=========================================================
EXTRA DIRECTION
=========================================================

${
  extra
    ? `
${extra}
`
    : ""
}

=========================================================
FINAL PRIORITY
=========================================================

PRIORITY ORDER:

1. Uploaded garment accuracy
2. Garment construction and visible details
3. Photorealistic model and garment fit
4. Requested pose
5. Requested scene/location
6. Requested vehicle
7. Fashion styling

If a scene or styling instruction conflicts with the garment,
preserve the garment.

The final image must visibly look like the SAME garment from the
uploaded photograph, realistically worn by the selected adult
model.

Do not substitute a different outfit.
`;
}

/* =========================================================
OUTPUT / POSE SELECTION
========================================================= */

function getOutputCount(body) {
  const raw = getValue(
    body,
    "outputCount",
    "numberOfOutputs",
    "imageCount",
    "numberOfImages",
    "poseCount",
    "numberOfPoses",
    "selectedPoseCount"
  );

  const n = Number(raw);

  if (!Number.isFinite(n) || n < 1) {
    return 1;
  }

  return Math.min(Math.floor(n), 10);
}

function getPoseList(body, count) {
  const raw = getValue(
    body,
    "poses",
    "poseList"
  );

  let list = [];

  if (Array.isArray(raw)) {
    list = raw;
  } else if (
    typeof raw === "string" &&
    raw.trim()
  ) {
    list = raw.split(",");
  } else {
    const single = clean(
      getValue(body, "pose")
    );

    if (single) {
      list = [single];
    }
  }

  list = list
    .map((value) => String(value).trim())
    .filter(Boolean);

  const defaults = [
    "confident editorial standing pose, full body, natural hands",
    "natural three-quarter standing pose, elegant posture",
    "fashion walking pose with natural movement",
    "relaxed editorial seated pose, garment clearly visible",
    "side-angle editorial pose showing garment silhouette",
    "confident over-the-shoulder fashion pose",
    "natural candid fashion pose, relaxed arms",
    "strong runway-inspired standing pose",
    "elegant movement pose with realistic fabric motion",
    "premium campaign pose with clear garment visibility"
  ];

  const result = [];

  for (const pose of list) {
    if (!result.includes(pose)) {
      result.push(pose);
    }

    if (result.length >= count) {
      break;
    }
  }

  for (const pose of defaults) {
    if (result.length >= count) {
      break;
    }

    if (!result.includes(pose)) {
      result.push(pose);
    }
  }

  return result.slice(0, count);
}

/* =========================================================
REDIS
========================================================= */

function getRedisOrNull() {
  try {
    const redis = getRedisConfig();

    if (
      redis?.url &&
      redis?.token
    ) {
      return redis;
    }

    return null;
  } catch {
    return null;
  }
}

/* =========================================================
PRO STATUS
========================================================= */

async function proActiveFor(userId, redis) {
  if (
    !redis ||
    !userId ||
    userId === "guest"
  ) {
    return false;
  }

  try {
    const status = await getProStatus(
      userId,
      redis
    );

    return Boolean(status?.active);
  } catch (error) {
    console.warn(
      "OBITREND Pro status check failed:",
      error?.message || error
    );

    return false;
  }
}

/* =========================================================
OPENAI IMAGE EDIT
========================================================= */

async function generateOne(
  imageBase64,
  mimeType,
  prompt,
  size
) {
  const inputBuffer = Buffer.from(
    imageBase64,
    "base64"
  );

  if (!inputBuffer.length) {
    throw new Error(
      "The uploaded clothing image is empty."
    );
  }

  if (inputBuffer.length > MAX_IMAGE_BYTES) {
    throw new Error(
      "The uploaded clothing image is too large. Please upload a smaller image."
    );
  }

  const imageFile = await toFile(
    inputBuffer,
    `obitrend-clothing-reference.${extensionFromMime(mimeType)}`,
    {
      type: mimeType,
    }
  );

  /*
  IMPORTANT:
  The uploaded clothing image is sent directly to OpenAI
  as the image-edit reference.
  */

  const result = await openai.images.edit({
    model: MODEL,
    image: imageFile,
    prompt,
    size,
    quality: "high",
    output_format: "png",
  });

  const b64 =
    result?.data?.[0]?.b64_json;

  if (!b64) {
    throw new Error(
      "OpenAI did not return a generated image."
    );
  }

  return `data:image/png;base64,${b64}`;
}

/* =========================================================
API HANDLER
========================================================= */

export default async function handler(
  req,
  res
) {
  if (req.method !== "POST") {
    res.setHeader(
      "Allow",
      "POST"
    );

    return res.status(405).json({
      success: false,
      error: "Method not allowed.",
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      success: false,
      error:
        "OPENAI_API_KEY is not configured.",
    });
  }

  try {
    const body = req.body || {};

    /* =====================================================
    FIX:
    The frontend sends imageBase64.
    Accept it first while keeping all previous field names.
    ===================================================== */

    const imageInput =
      getNestedImageInput(body);

    const imageBase64 =
      normalizeBase64(imageInput);

    if (!imageBase64) {
      return res.status(400).json({
        success: false,
        error:
          "Please upload a clothing image first.",
      });
    }

    const mimeType =
      getMimeType(imageInput);

    /* =====================================================
    AUTHENTICATION
    ===================================================== */

    const auth =
      await getAuthenticatedUser(req);

    if (!auth.ok) {
      return res.status(
        auth.status
      ).json({
        success: false,
        error: auth.error,
      });
    }

    const userId =
      auth.user.id;

    const redis =
      getRedisOrNull();

    /* =====================================================
    EXISTING CREDIT SYSTEM

    IMPORTANT:
    spendCredit() returns success, not ok.
    ===================================================== */

    const charge = redis
      ? await spendCredit(
          userId,
          redis
        )
      : {
          success: false,
          balance: 0,
          reason: "credits_unavailable",
        };

    if (!charge.success) {
      const proFinished =
        charge.reason === "no_pro_credits" ||
        charge.reason === "pro_exhausted";

      const message =
        proFinished
          ? "🔒 Your OBITREND Pro credits are finished. Renew Pro to continue."
          : charge.reason ===
              "no_free_credits"
            ? "Your free generations are finished. Upgrade to OBITREND Pro to continue."
            : "Unable to access OBITREND credits right now.";

      return res.status(402).json({
        success: false,
        error: message,
        upgradeRequired: true,
        proActive:
          charge.proActive === true,
        proExhausted:
          proFinished,
        balance:
          charge.balance ?? 0,
        proCredits:
          charge.proCredits ?? 0,
      });
    }

    const proActive =
      charge.creditType === "pro" &&
      charge.proActive === true;

    /* =====================================================
    OUTPUT / POSE SELECTION
    ===================================================== */

    const outputCount =
      getOutputCount(body);

    const poses =
      getPoseList(
        body,
        outputCount
      );

    const colours =
      getColourList(body);

    const size =
      getImageSize(
        getValue(
          body,
          "aspectRatio",
          "ratio"
        )
      );

    const images = [];

    /* =====================================================
    GENERATION

    One OpenAI request per selected pose.
    Existing workflow preserved.
    ===================================================== */

    try {
      for (
        let index = 0;
        index < poses.length;
        index += 1
      ) {
        const pose =
          poses[index];

        const variantColor =
          colours.length > 0
            ? colours[
                index %
                  colours.length
              ]
            : "";

        const prompt =
          buildPrompt(
            body,
            variantColor,
            pose
          );

        const singleImagePrompt =
          `${prompt}

=========================================================
ONE IMAGE / ONE POSE ONLY
=========================================================

Generate EXACTLY ONE finished photograph in this request.

Show EXACTLY ONE adult model.

Show EXACTLY ONE pose.

Do NOT create a collage.

Do NOT create a split screen.

Do NOT place multiple poses in one image.

Do NOT show before/after panels.

Do NOT show multiple frames.

The selected pose for this image is:

${pose}

The uploaded clothing reference remains the primary source
of truth for the garment.
`;

        const generated =
          await generateOne(
            imageBase64,
            mimeType,
            singleImagePrompt,
            size
          );

        images.push(
          generated
        );
      }
    } catch (generationError) {
      /*
      Refund the credit consumed by this request if generation
      fails.
      */

      if (
        charge.usedCredit &&
        redis
      ) {
        try {
          await refundCredit(
            userId,
            redis,
            charge
          );
        } catch (
          refundError
        ) {
          console.error(
            "OBITREND credit refund failed:",
            refundError
          );
        }
      }

      throw generationError;
    }

    /* =====================================================
    RESPONSE

    Keep all existing response aliases so the frontend
    workflow does not need to change.
    ===================================================== */

    const firstImage =
      images[0];

    return res.status(200).json({
      success: true,
      ok: true,

      model: MODEL,

      image:
        firstImage,

      imageUrl:
        firstImage,

      url:
        firstImage,

      generatedImage:
        firstImage,

      images,

      colorImages:
        images,

      colourImages:
        images,

      balance:
        charge.balance,

      pro:
        proActive,

      proActive,

      proExhausted:
        charge.proExhausted === true,

      requestedImages:
        outputCount,

      generatedImages:
        images.length,

      imageCount:
        images.length,

      poseCount:
        poses.length,

      poses,

      poseImages:
        images,

      refunded: false,
    });
  } catch (error) {
    console.error(
      "OBITREND generation error:",
      error
    );

    const status =
      Number.isInteger(
        error?.status
      ) &&
      error.status >= 400
        ? error.status
        : 500;

    return res.status(status).json({
      success: false,
      error:
        error?.message ||
        "Image generation failed.",
    });
  }
}
