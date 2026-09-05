import OpenAI, { toFile } from "openai";

import {
  spendCredit,
  refundCredit,
  getProStatus,
  getRedisConfig,
  getAuthenticatedUser,
} from "./credits.js";

/* =========================================================
   OBITREND AI FASHION CREATOR
   COMPLETE /api/generate.js REPLACEMENT

   Keeps:
   - Existing /api/generate endpoint
   - Existing Supabase authentication
   - Existing sign-in pattern
   - Existing Pro system
   - Existing credit system
   - Existing image field names
   - Existing response field names
   - Existing garment preservation workflow
   - Existing colour workflow
   - Existing model/background controls
   - Existing aspect-ratio controls

   FIXES:
   - Uses the authenticated Supabase user only
   - Never trusts browser userId for authentication
   - Preserves the exact credit type for refunds
   - Prevents credit loss when image generation fails
   - Handles the uploaded garment as the primary reference
   - Supports existing frontend image field names
   - Supports existing frontend response aliases
========================================================= */

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "12mb",
    },
  },
};

export const maxDuration = 60;

/* =========================================================
   OPENAI
========================================================= */

const MODEL =
  process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";

const MAX_COLOUR_IMAGES = 4;
const MAX_IMAGE_BYTES = 9 * 1024 * 1024;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* =========================================================
   GENERAL HELPERS
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
   IMAGE INPUT
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

  if (value.length < 100) {
    return null;
  }

  return value;
}

function getMimeType(input) {
  const match = String(input || "").match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,/i
  );

  if (match) {
    return match[1].toLowerCase();
  }

  return "image/jpeg";
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
   ASPECT RATIO
========================================================= */

function getImageSize(value) {
  const ratio = clean(
    value,
    "5:4"
  ).toLowerCase();

  if (
    ratio.includes("1:1") ||
    ratio.includes("square")
  ) {
    return "1024x1024";
  }

  if (
    ratio.includes("9:16") ||
    ratio.includes("4:5") ||
    ratio.includes("portrait") ||
    ratio.includes("story")
  ) {
    return "1024x1536";
  }

  return "1536x1024";
}

/* =========================================================
   COLOURS
========================================================= */

function getColourList(body) {
  const raw = getValue(
    body,
    "clothingColors",
    "clothingColours",
    "colors",
    "colours",
    "selectedColors",
    "selectedColours"
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

  const cleaned = [
    ...new Set(
      list
        .map((value) =>
          String(value).trim()
        )
        .filter(Boolean)
    ),
  ];

  /*
   * Original Colour means preserve the uploaded
   * garment colour exactly.
   *
   * If Original Colour is selected together with
   * another colour, Original Colour takes priority.
   */

  if (
    cleaned.some(
      (value) =>
        value.toLowerCase() ===
        "original colour"
    ) ||
    cleaned.some(
      (value) =>
        value.toLowerCase() ===
        "original color"
    )
  ) {
    return [];
  }

  return cleaned.slice(
    0,
    MAX_COLOUR_IMAGES
  );
}

/* =========================================================
   CLOTHING PRESERVATION PROMPT
========================================================= */

function buildPrompt(
  body,
  variantColor = ""
) {
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
      "bodyType",
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
      "background",
      "backgroundPreset"
    ),
    "luxury fashion studio"
  );

  const property = clean(
    getValue(
      body,
      "property"
    )
  );

  const vehicle = clean(
    getValue(
      body,
      "vehicle",
      "car"
    ),
    "no vehicle unless appropriate"
  );

  const camera = clean(
    getValue(
      body,
      "camera"
    ),
    "high-end commercial fashion photography"
  );

  const lighting = clean(
    getValue(
      body,
      "lighting"
    ),
    "professional fashion lighting"
  );

  const ratio = clean(
    getValue(
      body,
      "aspectRatio",
      "ratio"
    ),
    "5:4"
  );

  const footwear = clean(
    getValue(
      body,
      "footwear"
    ),
    "appropriate fashion footwear"
  );

  const clothingType = clean(
    getValue(
      body,
      "clothingType"
    ),
    "automatically detected garment"
  );

  const clothingStyle = clean(
    getValue(
      body,
      "clothingStyle"
    ),
    "premium fashion"
  );

  const creativeDirection = clean(
    getValue(
      body,
      "creativeDirection",
      "creative",
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

  const companion = clean(
    getValue(
      body,
      "companion"
    ),
    "none"
  );

  const location = [
    city,
    country,
  ]
    .filter(Boolean)
    .join(", ");

  const colourInstruction =
    variantColor
      ? `
GARMENT COLOUR VARIANT:

Change ONLY the visible colour of the uploaded garment to:

${variantColor}

Keep absolutely unchanged:
- garment category
- garment shape
- silhouette
- proportions
- length
- neckline
- collar
- sleeves
- straps
- seams
- stitching
- panels
- pockets
- buttons
- zippers
- closures
- belts
- prints
- graphics
- embroidery
- logos
- labels
- patterns
- fabric
- texture
- material
- construction
- draping

Do not redesign the garment.
`
      : `
ORIGINAL GARMENT COLOUR:

Preserve the uploaded garment's original colours exactly as shown.

Do not recolour it.
`;

  return `
OBITREND AI FASHION CREATOR.

STRICT GARMENT REFERENCE MODE.

The uploaded image is the PRIMARY AND AUTHORITATIVE
REFERENCE for the clothing product.

The generated image must show the selected adult model
wearing the SAME GARMENT shown in the uploaded reference.

The uploaded clothing is NOT inspiration.
The uploaded clothing is NOT a suggestion.
The uploaded clothing is the actual product reference.

=========================================================
GARMENT FIDELITY
=========================================================

Preserve the uploaded garment as faithfully as possible.

Preserve:

- exact garment category
- exact garment type
- exact silhouette
- exact proportions
- exact length
- exact width
- neckline
- collar
- straps
- sleeves
- cuffs
- arm openings
- waist shaping
- darts
- seams
- stitching
- panels
- pockets
- buttons
- button placement
- zippers
- closures
- ties
- belts if present
- pleats
- gathers
- ruching
- folds
- draping
- hem
- slits
- trim
- borders
- embroidery
- artwork
- graphics
- logos
- labels
- lettering
- stripes
- checks
- patterns
- pattern direction
- pattern scale
- fabric texture
- fabric finish
- material
- visible construction
- colour arrangement

Do not simplify the garment.

Do not invent missing garment details.

Do not replace the garment with another outfit.

Do not turn the garment into a generic luxury outfit.

Do not redesign the garment.

Do not change the garment category.

Do not change its construction.

Do not add sleeves that are not present.

Do not remove sleeves that are present.

Do not add a belt that is not present.

Do not remove a belt that is present.

Do not change buttons.

Do not change pockets.

Do not change the neckline.

Do not change the collar.

Do not change prints.

Do not change embroidery.

Do not change logos.

Do not change lettering.

Do not change stripe direction.

Do not change pattern placement.

Do not invent a new design.

${colourInstruction}

=========================================================
REFERENCE PERSON
=========================================================

Use the uploaded image primarily to understand the garment.

Do NOT copy the original person's:

- identity
- face
- body
- hairstyle
- pose
- accessories
- shoes
- handbag
- background
- location

unless the frontend specifically requests a companion.

The selected OBITREND model should be the person
wearing the garment.

=========================================================
MODEL
=========================================================

MODEL:
${model}

BODY STYLE:
${bodyStyle}

POSE:
${pose}

FOOTWEAR:
${footwear}

AGE:
${clean(
  getValue(body, "ageGroup"),
  "adult"
)}

GENDER:
${clean(
  getValue(body, "gender"),
  "appropriate adult fashion model"
)}

=========================================================
CLOTHING
=========================================================

CLOTHING TYPE:
${clothingType}

CLOTHING STYLE:
${clothingStyle}

FASHION STYLE:
${fashionStyle}

=========================================================
LOCATION
=========================================================

LOCATION TYPE:
${clean(
  getValue(body, "locationType"),
  "fashion campaign location"
)}

BACKGROUND:
${scene}

${location ? `CITY / COUNTRY:\n${location}` : ""}

PROPERTY:
${property || "None unless appropriate"}

VEHICLE:
${vehicle}

=========================================================
PHOTOGRAPHY
=========================================================

CAMERA:
${camera}

LIGHTING:
${lighting}

ASPECT RATIO:
${ratio}

Create a premium commercial fashion photograph.

Use:

- realistic adult human anatomy
- realistic hands
- realistic feet
- realistic skin
- realistic hair
- realistic fabric behaviour
- realistic garment-to-body contact
- realistic folds
- realistic seams
- realistic shadows
- realistic reflections
- physically plausible lighting
- realistic perspective
- realistic materials
- premium commercial photography
- high-end fashion editorial quality
- professional camera rendering
- natural depth of field

Avoid:

- cartoon appearance
- anime appearance
- illustration appearance
- CGI appearance
- plastic skin
- distorted hands
- extra fingers
- extra limbs
- warped anatomy
- warped clothing
- melted garment details
- invented patterns
- random text
- fake logos
- watermarks
- generic replacement clothing

=========================================================
COMPANION
=========================================================

${companion !== "none"
  ? `
Include the requested companion naturally and safely.

The companion must NOT replace the selected main model.

The uploaded garment must remain the primary clothing
reference for the main model.

Keep the scene family-friendly and age-appropriate.
`
  : `
No companion.

The selected main model appears alone.
`}

=========================================================
CREATIVE DIRECTION
=========================================================

${creativeDirection || "Create a polished premium fashion campaign."}

=========================================================
USER REQUEST
=========================================================

${userPrompt || ""}

=========================================================
FINAL PRIORITY
=========================================================

Priority order:

1. Uploaded garment accuracy
2. Garment construction
3. Garment visible details
4. Garment colour accuracy
5. Realistic garment fit
6. Selected adult model
7. Requested pose
8. Requested background
9. Requested location
10. Requested vehicle
11. Fashion styling
12. Creative direction

If any instruction conflicts with the uploaded garment,
PRESERVE THE UPLOADED GARMENT.

The final image must visibly show the same garment
from the uploaded photograph, realistically worn by
the selected model.

Do not substitute another outfit.
`;
}

/* =========================================================
   REDIS
========================================================= */

function getRedisOrNull() {
  try {
    const redis =
      getRedisConfig();

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
    !userId
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
  } catch {
    return false;
  }
}

/* =========================================================
   SPEND CREDIT
========================================================= */

async function spendIfNeeded(
  userId,
  redis
) {
  if (!redis) {
    return {
      success: false,
      balance: 0,
      usedCredit: false,
      reason: "redis_unavailable",
      upgradeRequired: false,
    };
  }

  const spent =
    await spendCredit(
      userId,
      redis
    );

  return {
    ...spent,
    usedCredit:
      Boolean(spent?.success),
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

  if (!inputBuffer.length) {
    throw new Error(
      "The uploaded clothing image could not be processed."
    );
  }

  if (
    inputBuffer.length >
    MAX_IMAGE_BYTES
  ) {
    throw new Error(
      "The clothing image is too large. Please upload a smaller image."
    );
  }

  const imageFile =
    await toFile(
      inputBuffer,
      `clothing-reference.${extensionFromMime(
        mimeType
      )}`,
      {
        type: mimeType,
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
      "The image service did not return an image."
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
  /* -------------------------------------------------------
     POST ONLY
  ------------------------------------------------------- */

  if (req.method !== "POST") {
    res.setHeader(
      "Allow",
      "POST"
    );

    return res.status(405).json({
      success: false,
      error:
        "This request is not supported.",
    });
  }

  /* -------------------------------------------------------
     OPENAI KEY
  ------------------------------------------------------- */

  if (
    !process.env.OPENAI_API_KEY
  ) {
    return res.status(500).json({
      success: false,
      error:
        "Image generation is not configured.",
    });
  }

  try {
    const body =
      req.body || {};

    /* -----------------------------------------------------
       IMAGE INPUT

       Accept all existing OBITREND field names.
    ----------------------------------------------------- */

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
          "Please upload a clothing image first.",
      });
    }

    const mimeType =
      getMimeType(
        imageInput
      );

    /* -----------------------------------------------------
       AUTHENTICATION

       IMPORTANT:
       The browser userId is NEVER used to authenticate.

       The existing Supabase session token remains
       the authentication source.
    ----------------------------------------------------- */

    const auth =
      await getAuthenticatedUser(
        req
      );

    if (!auth.ok) {
      return res.status(
        auth.status
      ).json({
        success: false,
        error: auth.error,
      });
    }

    /*
     * Only the authenticated Supabase ID is used.
     */
    const userId =
      auth.user.id;

    /* -----------------------------------------------------
       REDIS
    ----------------------------------------------------- */

    const redis =
      getRedisOrNull();

    if (!redis) {
      return res.status(500).json({
        success: false,
        error:
          "OBITREND credits are temporarily unavailable.",
      });
    }

    /* -----------------------------------------------------
       CREDIT

       One generation request consumes one credit.

       The returned creditType is retained so that if
       OpenAI generation fails, the SAME credit bucket
       receives the refund.
    ----------------------------------------------------- */

    const charge =
      await spendIfNeeded(
        userId,
        redis
      );

    if (!charge.success) {
      const isPro =
        charge.proActive === true;

      return res.status(402).json({
        success: false,

        error:
          isPro
            ? "Your OBITREND Pro credits are finished. Renew your Pro plan to continue."
            : "Your free generations are finished. Upgrade to OBITREND Pro to continue.",

        upgradeRequired: true,

        balance:
          charge.balance ?? 0,

        proActive:
          isPro,

        proCredits:
          charge.proCredits ?? 0,

        reason:
          charge.reason ||
          "no_credit",
      });
    }

    const proActive =
      charge.proActive === true;

    /* -----------------------------------------------------
       COLOURS
    ----------------------------------------------------- */

    const colours =
      getColourList(
        body
      );

    /*
     * No colour selection:
     * generate the original garment.
     *
     * Colour selection:
     * generate one variant per selected colour.
     */

    const prompts =
      colours.length
        ? colours.map(
            (colour) =>
              buildPrompt(
                body,
                colour
              )
          )
        : [
            buildPrompt(
              body
            ),
          ];

    /* -----------------------------------------------------
       IMAGE SIZE
    ----------------------------------------------------- */

    const size =
      getImageSize(
        getValue(
          body,
          "aspectRatio",
          "ratio"
        )
      );

    const images = [];

    /* -----------------------------------------------------
       GENERATE
    ----------------------------------------------------- */

    try {
      for (
        const prompt of prompts.slice(
          0,
          MAX_COLOUR_IMAGES
        )
      ) {
        const generated =
          await generateOne(
            imageBase64,
            mimeType,
            prompt,
            size
          );

        images.push(
          generated
        );
      }
    } catch (
      generationError
    ) {
      /*
       * IMPORTANT FIX:
       *
       * Refund the exact credit bucket that was
       * charged for this request.
       *
       * This prevents a Pro credit from being
       * accidentally returned to the free balance.
       */

      if (
        charge.usedCredit &&
        charge.creditType
      ) {
        try {
          await refundCredit(
            userId,
            redis,
            charge.creditType
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

    /* -----------------------------------------------------
       RESULT
    ----------------------------------------------------- */

    const firstImage =
      images[0];

    if (!firstImage) {
      /*
       * Safety refund if somehow no image was produced.
       */

      if (
        charge.usedCredit &&
        charge.creditType
      ) {
        try {
          await refundCredit(
            userId,
            redis,
            charge.creditType
          );
        } catch {}
      }

      return res.status(500).json({
        success: false,
        error:
          "No image was generated.",
      });
    }

    /* -----------------------------------------------------
       SUCCESS

       Keep all existing response aliases so the
       current index.html continues working.
    ----------------------------------------------------- */

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
    /*
     * Keep the user-facing response simple.
     * No internal authentication details,
     * Redis credentials, request headers,
     * or API secrets are exposed.
     */

    console.error(
      "OBITREND generation error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        error?.message ||
        "Image generation could not be completed.",
    });
  }
}
