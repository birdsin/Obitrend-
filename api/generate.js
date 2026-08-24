import OpenAI, { toFile } from "openai";

import {
  spendCredit,
  refundCredit,
  getProStatus,
  getRedisConfig,
} from "./credits.js";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "12mb",
    },
  },
};

export const maxDuration = 60;

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
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
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
  if (mime.includes("png")) {
    return "png";
  }

  if (mime.includes("webp")) {
    return "webp";
  }

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
    "colors",
    "selectedColors"
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
   USER ID
========================================================= */

function getUserId(body, req) {
  const supplied = getValue(
    body,
    "userId",
    "uid",
    "clientId"
  );

  if (supplied) {
    return clean(supplied)
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 100);
  }

  const headerId = clean(
    req?.headers?.["x-obitrend-user-id"] || ""
  )
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 100);

  return headerId || "guest";
}


/* =========================================================
   CLOTHING-PRESERVATION PROMPT
========================================================= */

function buildPrompt(body, variantColor = "") {

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
    getValue(body, "pose"),
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


  return `
OBITREND CLOTHING-PRESERVATION MODE.

The uploaded image is the STRICT VISUAL SOURCE OF TRUTH for the GARMENT.

Create a new photorealistic fashion photograph in which the model is wearing the SAME physical garment shown in the uploaded reference.

The uploaded garment is NOT merely inspiration.

The uploaded garment MUST be reproduced as the clothing worn by the model.

The original person in the uploaded image is NOT the person to copy.

IGNORE:
- original person's identity
- original person's face
- original person's body
- original person's pose
- original person's accessories
- original background
- original environment

STUDY AND PRESERVE THE GARMENT ITSELF.

=========================================================
EXACT GARMENT PRESERVATION
=========================================================

PRESERVE EXACTLY:

- garment category
- garment silhouette
- neckline
- collar
- straps
- sleeve construction
- garment length
- hem shape
- garment proportions
- exact colors
- color relationships
- stripes
- checks
- prints
- artwork
- borders
- buttons
- button placement
- zippers
- ties
- seams
- stitching
- panels
- darts
- waist shaping
- folds
- draping
- embroidery
- logos
- labels
- visible lettering
- placement of every visible detail
- orientation of every visible detail
- scale of every visible detail
- fabric texture
- fabric finish
- front construction
- back construction

=========================================================
VERY IMPORTANT
=========================================================

If the uploaded garment is a pink-and-white striped sleeveless
button-up shirt/top, reproduce THAT SAME pink-and-white striped
sleeveless button-up garment.

Do NOT turn it into:
- a white jumpsuit
- a cream outfit
- a blazer
- a dress
- a blouse with different construction
- a different shirt
- a generic luxury outfit
- a new outfit inspired by the reference

The garment must remain visually recognizable as the same garment.

=========================================================
DO NOT REDESIGN
=========================================================

DO NOT:

- redesign the garment
- replace the garment
- recolor the garment
- simplify the garment
- change the clothing category
- invent a new outfit
- remove garment details
- move garment details
- add garment details
- add a belt that does not exist
- add sleeves that do not exist
- remove sleeves
- change the neckline
- change the collar
- change the hem
- change the button layout
- change the stripe pattern
- change the print
- change the fabric appearance
- turn the clothing into generic luxury fashion

NEVER use a generic cream, beige or white outfit as a substitute
for the uploaded garment.

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

=========================================================
LOCATION
=========================================================

Setting:
${scene}

${location ? `Location: ${location}` : ""}

Vehicle:
${car}

=========================================================
PHOTOGRAPHY
=========================================================

Camera:
${camera}

Output framing:
${ratio}

Create:

- photorealistic human anatomy
- realistic hands
- realistic skin texture
- realistic facial proportions
- realistic fabric folds
- realistic garment contact with body
- realistic shadows
- realistic reflections
- physically correct lighting
- realistic materials
- premium commercial fashion photography
- luxury fashion magazine quality
- natural depth of field
- professional camera rendering
- realistic skin
- realistic hair

Avoid:

- CGI appearance
- plastic skin
- artificial fabric
- distorted hands
- distorted anatomy
- fake clothing
- fantasy clothing
- watermark

=========================================================
COLOUR VARIANT
=========================================================

${
  variantColor
    ? `
Change ONLY the garment color to:

${variantColor}

Keep absolutely everything else identical:

- garment design
- silhouette
- construction
- stripes
- graphics
- buttons
- seams
- trims
- fabric
- proportions

Do not redesign the garment.
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

GARMENT ACCURACY HAS HIGHER PRIORITY THAN SCENE STYLING.

If any instruction conflicts with the uploaded garment,
PRESERVE THE UPLOADED GARMENT.

The final image must look like the SAME garment from the
uploaded photograph, now realistically worn by the selected
model in the selected environment.
`;
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

async function proActiveFor(
  userId,
  redis
) {

  if (
    !redis ||
    !userId ||
    userId === "guest"
  ) {
    return false;
  }

  try {

    const status =
      await getProStatus(
        userId,
        redis
      );

    return Boolean(
      status?.active
    );

  } catch (error) {

    console.warn(
      "OBITREND Pro status check failed:",
      error?.message || error
    );

    return false;
  }
}


/* =========================================================
   CREDIT
========================================================= */

async function spendIfNeeded(
  userId,
  proActive,
  redis
) {

  if (
    proActive ||
    !redis
  ) {
    return {
      success: true,
      balance: null,
      usedCredit: false
    };
  }

  const spent =
    await spendCredit(
      userId,
      redis
    );

  return {
    ...spent,
    usedCredit: Boolean(
      spent?.success
    )
  };
}


/* =========================================================
   OPENAI IMAGE GENERATION
========================================================= */

async function generateOne(
  imageBase64,
  mimeType,
  prompt,
  size
) {

  const inputBuffer =
    Buffer.from(
      imageBase64,
      "base64"
    );

  if (
    !inputBuffer.length
  ) {
    throw new Error(
      "The uploaded clothing image is empty."
    );
  }

  if (
    inputBuffer.length >
    MAX_IMAGE_BYTES
  ) {
    throw new Error(
      "The compressed clothing image is too large."
    );
  }

  const imageFile =
    await toFile(
      inputBuffer,
      `clothing-reference.${extensionFromMime(
        mimeType
      )}`,
      {
        type: mimeType
      }
    );

  const result =
    await openai.images.edit({
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
      "OpenAI did not return an image."
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

  if (
    req.method !== "POST"
  ) {

    res.setHeader(
      "Allow",
      "POST"
    );

    return res.status(405).json({
      success: false,
      error: "Method not allowed."
    });
  }


  if (
    !process.env.OPENAI_API_KEY
  ) {

    return res.status(500).json({
      success: false,
      error:
        "OPENAI_API_KEY is not configured."
    });
  }


  try {

    const body =
      req.body || {};


    /* =====================================================
       ACCEPT ALL EXISTING FRONTEND IMAGE FIELD NAMES
    ===================================================== */

    const imageInput =
      getValue(
        body,
        "imageBase64",
        "uploadedImage",
        "image",
        "clothingImage",
        "referenceImage"
      );


    const imageBase64 =
      normalizeBase64(
        imageInput
      );


    if (!imageBase64) {

      return res.status(400).json({
        success: false,
        error:
          "Please upload a clothing image first."
      });
    }


    const mimeType =
      getMimeType(
        imageInput
      );


    /* =====================================================
       USER / PRO / CREDITS
    ===================================================== */

    const userId =
      getUserId(
        body,
        req
      );

    const redis =
      getRedisOrNull();

    const proActive =
      await proActiveFor(
        userId,
        redis
      );

    const charge =
      await spendIfNeeded(
        userId,
        proActive,
        redis
      );


    if (
      !charge.success
    ) {

      return res.status(402).json({

        success: false,

        error:
          "Your free generations are finished. Upgrade to OBITREND Pro to continue.",

        upgradeRequired: true,

        balance:
          charge.balance,

      });
    }


    /* =====================================================
       MULTI-COLOUR
    ===================================================== */

    const colours =
      getColourList(
        body
      );


    const prompts =
      colours.length
        ? colours.map(
            (color) =>
              buildPrompt(
                body,
                color
              )
          )
        : [
            buildPrompt(body)
          ];


    /* =====================================================
       ASPECT RATIO
    ===================================================== */

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
       GENERATE
    ===================================================== */

    try {

      for (
        const prompt
        of prompts.slice(
          0,
          MAX_COLOUR_IMAGES
        )
      ) {

        images.push(
          await generateOne(
            imageBase64,
            mimeType,
            prompt,
            size
          )
        );

      }

    } catch (
      generationError
    ) {

      /* ===================================================
         REFUND CREDIT IF GENERATION FAILS
      =================================================== */

      if (
        charge.usedCredit &&
        redis
      ) {

        try {

          await refundCredit(
            userId,
            redis
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

    });


  } catch (error) {

    console.error(
      "OBITREND generation error:",
      error
    );

    return res.status(500).json({

      success: false,

      error:
        error?.message ||
        "Image generation failed.",

    });
  }
}
