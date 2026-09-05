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

WORKFLOW PRESERVED:
- Existing Supabase authentication
- Existing credits system
- Existing Pro system
- Existing Paystack/Pro system
- Existing clothing upload fields
- Existing fashion selections
- Existing colour selections
- Existing aspect-ratio selections
- Existing garment-preservation prompt
- Existing response aliases
- Existing frontend compatibility

FIXES:
- Longer Vercel execution window
- Correct credit refund bucket
- No technical error codes exposed to users
- Safer generation failure handling
=========================================================
*/

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "12mb",
    },
  },
};

/*
 * Image generation can legitimately take longer than 60 seconds.
 * Keep this within the normal Vercel function limits.
 */
export const maxDuration = 300;

const MODEL =
  process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";

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
  if (!input) {
    return null;
  }

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
        .map((value) =>
          String(value).trim()
        )
        .filter(Boolean)
    ),
  ].slice(
    0,
    MAX_COLOUR_IMAGES
  );
}

/* =========================================================
   CLOTHING-PRESERVATION PROMPT
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

  const companionMode =
    getBoolean(
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
Create this requested garment colour variant:

${variantColor}

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
   CREDIT
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
   OPENAI IMAGE EDIT
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
      "The uploaded clothing image is empty."
    );
  }

  if (
    inputBuffer.length >
    MAX_IMAGE_BYTES
  ) {
    throw new Error(
      "The uploaded clothing image is too large. Please upload a smaller image."
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
      "The image could not be generated. Please try again."
    );
  }

  return `data:image/png;base64,${b64}`;
}

/* =========================================================
   USER-FACING ERROR MESSAGE
========================================================= */

function getSafeUserMessage(error) {
  const message =
    String(
      error?.message || ""
    ).toLowerCase();

  if (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("failed to fetch") ||
    message.includes("fetch")
  ) {
    return "The image is taking longer than expected. Please try again.";
  }

  if (
    message.includes("billing") ||
    message.includes("quota") ||
    message.includes("rate limit")
  ) {
    return "The image service is temporarily unavailable. Please try again later.";
  }

  if (
    message.includes("authentication") ||
    message.includes("api key") ||
    message.includes("unauthorized")
  ) {
    return "The image service is temporarily unavailable. Please try again later.";
  }

  if (
    message.includes("too large") ||
    message.includes("payload")
  ) {
    return "The uploaded image is too large. Please upload a smaller image.";
  }

  if (
    message.includes("invalid") ||
    message.includes("unsupported")
  ) {
    return "Please check the uploaded image and your selected options, then try again.";
  }

  return (
    error?.message ||
    "The image could not be generated. Please try again."
  );
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
      error:
        "Please use the image generation button to continue.",
    });
  }

  if (
    !process.env.OPENAI_API_KEY
  ) {
    return res.status(500).json({
      success: false,
      error:
        "The image service is temporarily unavailable. Please try again later.",
    });
  }

  let creditSpent = false;
  let creditType = "";
  let userId = "";
  let redis = null;

  try {
    const body =
      req.body || {};

    /*
    ---------------------------------------------------------
    Existing image field compatibility
    ---------------------------------------------------------
    */

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

    /*
    ---------------------------------------------------------
    Existing authentication workflow
    ---------------------------------------------------------
    */

    const auth =
      await getAuthenticatedUser(
        req
      );

    if (!auth.ok) {
      return res.status(
        auth.status
      ).json({
        success: false,
        error:
          "Please sign in again to continue.",
      });
    }

    /*
    Never trust a browser-supplied user ID.
    */

    userId =
      auth.user.id;

    redis =
      getRedisOrNull();

    /*
    ---------------------------------------------------------
    Existing credit workflow
    ---------------------------------------------------------
    */

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
        error: isPro
          ? "Your OBITREND Pro credits are finished. Renew your Pro plan to continue."
          : "Your free generations are finished. Upgrade to OBITREND Pro to continue.",
        upgradeRequired: true,
        balance:
          charge.balance ?? 0,
        proActive: isPro,
        proCredits:
          charge.proCredits ?? 0,
        reason:
          charge.reason ||
          "no_credit",
      });
    }

    creditSpent = true;

    /*
     * IMPORTANT:
     * Remember exactly which credit bucket was charged.
     * This prevents a refund from going into the wrong bucket.
     */
    creditType =
      charge.creditType ||
      (charge.proActive
        ? "pro"
        : "free");

    const proActive =
      charge.proActive === true;

    /*
    ---------------------------------------------------------
    Multi-colour support
    ---------------------------------------------------------
    */

    const colours =
      getColourList(body);

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
            buildPrompt(body),
          ];

    /*
    ---------------------------------------------------------
    Aspect ratio
    ---------------------------------------------------------
    */

    const size =
      getImageSize(
        getValue(
          body,
          "aspectRatio",
          "ratio"
        )
      );

    const images = [];

    /*
    ---------------------------------------------------------
    Generate
    ---------------------------------------------------------
    */

    try {
      for (
        const prompt of prompts.slice(
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
    } catch (generationError) {

      /*
      -------------------------------------------------------
      IMPORTANT CREDIT FIX
      -------------------------------------------------------

      Refund the EXACT bucket that was charged.

      This is important when Pro expires while an image is
      being generated. The refund must not accidentally go
      into the free-credit bucket.
      */

      if (
        creditSpent &&
        redis &&
        userId
      ) {
        try {
          await refundCredit(
            userId,
            redis,
            creditType
          );
        } catch (refundError) {
          console.error(
            "OBITREND credit refund failed:",
            refundError
          );
        }

        /*
         * Prevent the outer catch from attempting another
         * refund.
         */
        creditSpent = false;
      }

      throw generationError;
    }

    /*
    ---------------------------------------------------------
    Make sure an image exists
    ---------------------------------------------------------
    */

    if (
      !images.length
    ) {
      throw new Error(
        "The image could not be generated. Please try again."
      );
    }

    const firstImage =
      images[0];

    /*
    ---------------------------------------------------------
    Existing response aliases preserved
    ---------------------------------------------------------
    */

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

    /*
    ---------------------------------------------------------
    Safety refund
    ---------------------------------------------------------

    If an error happened AFTER the credit was charged but
    BEFORE the generation-specific refund handled it, return
    the credit here.
    */

    if (
      creditSpent &&
      redis &&
      userId
    ) {
      try {
        await refundCredit(
          userId,
          redis,
          creditType
        );
      } catch (refundError) {
        console.error(
          "OBITREND credit refund failed:",
          refundError
        );
      }
    }

    /*
    ---------------------------------------------------------
    USER-FACING RESPONSE
    ---------------------------------------------------------

    No technical error codes.
    No diagnostic object.
    No OpenAI internal codes.
    No model/error-code information.
    */

    return res.status(500).json({
      success: false,
      error:
        getSafeUserMessage(
          error
        ),
    });
  }
}
