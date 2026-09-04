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

   FIXES:
   - Full-body head-to-toe fashion photography
   - Both feet and shoes visible
   - No head, body or garment cropping
   - 9:16 portrait full-body composition
   - Realistic lifestyle/social-media fashion photography
   - Strict garment preservation
   - Hides raw OpenAI errors from customers
   - Correct Pro/free credit charging
   - Exact credit refund after failed generation
   - Secure Supabase authentication
   - Preserves existing frontend field names
   - Preserves garment-reference workflow
========================================================= */

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "12mb",
    },
  },
};

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
  const ratio = clean(
    value,
    "9:16"
  ).toLowerCase();

  if (
    ratio.includes("9:16") ||
    ratio.includes("portrait") ||
    ratio.includes("vertical")
  ) {
    return "1024x1536";
  }

  if (
    ratio.includes("1:1") ||
    ratio.includes("square")
  ) {
    return "1024x1024";
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
  ].slice(0, MAX_COLOUR_IMAGES);
}

/* =========================================================
   GARMENT + FULL-BODY PROMPT
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
    "luxury fashion lifestyle location"
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
    "9:16"
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

  const companionMode =
    getBoolean(
      body,
      "hasCompanion",
      "companionMode",
      "preserveCompanion"
    );

  const location = [
    city,
    country,
  ]
    .filter(Boolean)
    .join(", ");

  return `
OBITREND STRICT GARMENT REPRODUCTION + FULL-BODY LIFESTYLE FASHION PHOTOGRAPHY.

The uploaded image is the PRIMARY AND STRICT VISUAL REFERENCE for the GARMENT.

Create a new photorealistic premium fashion photograph where the selected adult model is actually wearing the SAME garment shown in the uploaded reference.

DO NOT treat the uploaded garment as loose inspiration.

DO NOT invent a replacement outfit.

=========================================================
FULL-BODY FRAMING — ABSOLUTE REQUIREMENT
=========================================================

SHOW THE COMPLETE ADULT MODEL FROM HEAD TO TOE.

The entire model must fit naturally inside the frame.

The top of the head must be completely visible.

Both feet must be completely visible.

Both shoes must be completely visible when shoes are worn.

The entire outfit must be visible.

The entire upper garment must be visible.

The entire lower-body garment must be visible.

Do NOT crop:

- head
- hair
- forehead
- face
- neck
- shoulders
- arms
- hands
- fingers
- waist
- hips
- legs
- knees
- ankles
- feet
- shoes
- garment
- trousers
- jeans
- shorts
- skirt
- dress
- other lower-body clothing

Use a camera distance appropriate for professional full-length fashion photography.

The camera must be far enough away to comfortably capture the entire person.

Leave natural breathing room above the head.

Leave natural breathing room below both feet.

Leave enough space around both sides of the model.

If the model would otherwise be too large for the frame, make the model smaller in the composition.

NEVER crop the model simply to make her appear larger.

NEVER zoom in to fill the frame.

NEVER create a waist-up image.

NEVER create a chest-up image.

NEVER create a thigh-up image.

NEVER create a knee-up image.

NEVER create a three-quarter body crop.

NEVER cut off the feet.

NEVER cut off the shoes.

NEVER cut off the top of the head.

NEVER cut off any important part of the garment.

For 9:16 portrait output, prioritize a complete head-to-toe composition.

The model should occupy a natural portion of the portrait frame while the complete body remains visible.

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

If the reference contains a collage or multiple views, use every visible view to understand the garment's front, back, side construction and details.

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
- belts only if present
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
ABSOLUTE GARMENT PROHIBITIONS
=========================================================

Never:

- redesign the garment
- replace the garment
- recolor the garment unless a colour variant was explicitly selected
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
- use "inspired by" as permission to redesign it

The uploaded garment's visual identity has priority over the requested fashion style, location or vehicle.

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

Use realistic adult human proportions.

The selected pose must allow the complete body and complete garment to remain visible.

If the selected pose would cause cropping, adapt the camera distance and composition so the entire body remains visible.

=========================================================
LIFESTYLE FASHION PHOTOGRAPHY
=========================================================

Create the type of premium lifestyle fashion photograph used for professional social-media fashion campaigns.

The photograph should look like it was taken by a professional fashion photographer in a real location.

Use realistic environments such as:

- luxury hotel
- hotel balcony
- luxury restaurant
- elegant café
- city street
- shopping district
- fashion boutique
- premium mall
- resort
- beach
- airport
- luxury building
- outdoor terrace
- upscale residential location
- premium vehicle location

Use the selected scene when provided.

The model may naturally:

- stand
- walk
- lean against a wall
- pose beside a building
- adjust sunglasses
- adjust hair
- hold a handbag
- place one hand on the hip
- look toward the camera
- look naturally away from the camera
- stand naturally with one leg slightly forward
- interact naturally with the environment

The pose must remain realistic and must not hide or distort the garment.

Do not allow large objects, furniture, vehicles or foreground objects to cover important parts of the outfit.

=========================================================
SCENE
=========================================================

Setting:
${scene}

${location ? `Location: ${location}` : ""}

Vehicle:
${car}

The environment must look realistic and believable.

The scene must support the fashion campaign without changing the garment.

The background must not overpower the model.

The background must not cover the clothing.

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
- realistic fingers
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
- realistic lifestyle photography
- natural depth of field
- professional camera rendering
- natural perspective
- realistic lens characteristics

The final image should look like a real professional fashion photograph.

Avoid:

- CGI appearance
- plastic skin
- fake fabric
- distorted anatomy
- extra fingers
- distorted hands
- missing limbs
- duplicated limbs
- melted garment details
- artificial-looking background
- excessive blur
- unnatural body proportions
- watermark

=========================================================
SOCIAL-MEDIA FASHION COMPOSITION
=========================================================

Create a premium Instagram-style fashion campaign photograph.

Use a strong full-length composition.

The complete adult model must remain the main subject.

The complete garment must remain clearly visible.

For portrait 9:16:

- complete head visible
- complete hair visible
- complete torso visible
- complete garment visible
- complete hips visible
- complete legs visible
- both ankles visible
- both feet visible
- both shoes visible when applicable
- natural space above head
- natural space below feet
- natural space around the body

Do not crop the model to fill the portrait frame.

A smaller complete model is always preferable to a larger cropped model.

=========================================================
COMPANION HANDLING
=========================================================

${
  companionMode
    ? `
The uploaded reference may contain another person or child.

Keep that person only if the frontend explicitly requested a companion.

Do not let the companion replace or alter the garment worn by the adult model.

Any child must remain age-appropriate.

The primary adult model and the complete garment must remain clearly visible.
`
    : `
Do not copy unrelated people from the reference image.

The garment is the important reference.
`
}

${
  variantColor
    ? `
=========================================================
COLOUR VARIANT
=========================================================

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

The complete garment must remain visible in the full-body composition.
`
    : ""
}

${
  userPrompt
    ? `
=========================================================
USER REQUEST
=========================================================

${userPrompt}
`
    : ""
}

${
  extra
    ? `
=========================================================
EXTRA DIRECTION
=========================================================

${extra}
`
    : ""
}

=========================================================
FINAL QUALITY CHECK
=========================================================

Before producing the final image, ensure:

1. The complete adult model is visible.
2. The top of the head is visible.
3. Both feet are visible.
4. Both shoes are visible when applicable.
5. The complete outfit is visible.
6. The complete upper garment is visible.
7. The complete lower-body garment is visible.
8. The uploaded garment matches the generated garment.
9. The garment colour is correct.
10. The garment construction is preserved.
11. Important garment details are not hidden.
12. The selected pose is followed.
13. The selected location is realistic.
14. The image looks professionally photographed.
15. The composition is suitable for social media.
16. No body part is accidentally cropped.

If there is a choice between making the model larger and cropping the body, ALWAYS choose the smaller model and keep the COMPLETE BODY visible.

=========================================================
FINAL PRIORITY
=========================================================

PRIORITY ORDER:

1. Complete head-to-toe body framing
2. Uploaded garment accuracy
3. Garment construction and visible details
4. Photorealistic model and garment fit
5. Requested pose
6. Requested scene/location
7. Requested vehicle
8. Fashion styling

If a scene, pose or styling instruction conflicts with full-body visibility or garment accuracy, preserve full-body visibility and the garment.

The final image must visibly look like the SAME garment from the uploaded photograph, realistically worn by the selected adult model.

FULL BODY.
HEAD TO TOE.
BOTH FEET VISIBLE.
COMPLETE OUTFIT VISIBLE.
9:16 PORTRAIT WHEN PORTRAIT IS REQUESTED.
NO CROPPING.
NO CUT-OFF HEAD.
NO CUT-OFF FEET.
NO CUT-OFF SHOES.
NO CUT-OFF GARMENT.
NO WAIST-UP IMAGE.
NO KNEE-UP IMAGE.
NO THREE-QUARTER BODY CROP.
`;
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
  const inputBuffer = Buffer.from(
    imageBase64,
    "base64"
  );

  if (!inputBuffer.length) {
    throw new Error(
      "Uploaded clothing image is empty."
    );
  }

  if (
    inputBuffer.length >
    MAX_IMAGE_BYTES
  ) {
    throw new Error(
      "Uploaded clothing image is too large."
    );
  }

  const imageFile = await toFile(
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
      "OpenAI did not return an image."
    );
  }

  return `data:image/png;base64,${b64}`;
}

/* =========================================================
   SAFE CUSTOMER ERROR
========================================================= */

function publicGenerationError(
  error
) {
  const status =
    Number.isInteger(error?.status)
      ? error.status
      : 500;

  const code = String(
    error?.code || ""
  ).toLowerCase();

  const type = String(
    error?.type || ""
  ).toLowerCase();

  const message = String(
    error?.message || ""
  ).toLowerCase();

  /*
   * NEVER expose OpenAI billing,
   * quota, API-key, endpoint or
   * internal error details.
   */

  const billingOrQuotaError =
    status === 429 ||
    code.includes("quota") ||
    code.includes("credit_balance") ||
    code.includes("spend_limit") ||
    code.includes("usage_limit") ||
    type.includes("quota") ||
    message.includes(
      "you have no credits remaining"
    ) ||
    message.includes(
      "insufficient_quota"
    ) ||
    message.includes(
      "credit_balance_exhausted"
    ) ||
    message.includes(
      "organization_spend_limit_exceeded"
    ) ||
    message.includes(
      "project_spend_limit_exceeded"
    ) ||
    message.includes(
      "organization_usage_limit_exceeded"
    ) ||
    message.includes(
      "platform.openai.com"
    );

  if (billingOrQuotaError) {
    return {
      status: 503,
      error:
        "Generation temporarily unavailable. Your credit has been returned. Please try again shortly.",
    };
  }

  if (status === 400) {
    return {
      status: 400,
      error:
        "We could not generate this image. Please check the uploaded clothing image and try again.",
    };
  }

  if (status === 413) {
    return {
      status: 413,
      error:
        "The uploaded clothing image is too large. Please upload a smaller image.",
    };
  }

  /*
   * Do not expose 401/403/404/500
   * OpenAI details to customers.
   */

  return {
    status: 503,
    error:
      "Generation temporarily unavailable. Your credit has been returned. Please try again shortly.",
  };
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

  /*
   * Do not expose whether the API
   * key exists or reveal its name
   * to customers.
   */

  if (!process.env.OPENAI_API_KEY) {
    console.error(
      "OBITREND: OpenAI configuration is missing."
    );

    return res.status(503).json({
      success: false,
      error:
        "Generation temporarily unavailable. Please try again shortly.",
    });
  }

  let redis = null;
  let userId = "";
  let charge = null;

  try {
    /* =======================================================
       SECURE AUTHENTICATION
    ======================================================= */

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

    userId =
      auth.user.id;

    const body =
      req.body || {};

    /* =======================================================
       IMAGE INPUT
    ======================================================= */

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

    /* =======================================================
       REDIS
    ======================================================= */

    redis =
      getRedisConfig();

    if (
      !redis?.url ||
      !redis?.token
    ) {
      console.error(
        "OBITREND: Redis configuration is missing."
      );

      return res.status(503).json({
        success: false,
        error:
          "Generation temporarily unavailable. Please try again shortly.",
      });
    }

    /* =======================================================
       PRO STATUS
    ======================================================= */

    const pro =
      await getProStatus(
        userId,
        redis
      );

    /* =======================================================
       COLOUR REQUESTS
    ======================================================= */

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

    const size =
      getImageSize(
        getValue(
          body,
          "aspectRatio",
          "ratio"
        )
      );

    const images = [];

    /* =======================================================
       GENERATE

       IMPORTANT:
       One OBITREND credit =
       one generated image.
    ======================================================= */

    for (
      const prompt of prompts.slice(
        0,
        MAX_COLOUR_IMAGES
      )
    ) {
      /*
       * Spend the correct credit
       * BEFORE each image generation.
       *
       * spendCredit() automatically
       * chooses Pro credits for an
       * active Pro user and free
       * credits for a free user.
       */

      charge =
        await spendCredit(
          userId,
          redis
        );

      if (
        !charge?.success
      ) {
        const noCreditMessage =
          charge?.proActive
            ? "Your OBITREND Pro credits are finished. Please renew your Pro plan to continue."
            : "Your free OBITREND generations are finished. Upgrade to OBITREND Pro to continue.";

        return res.status(402).json({
          success: false,
          error:
            noCreditMessage,
          upgradeRequired:
            true,
          balance:
            charge?.balance ??
            0,
          proCredits:
            charge?.proCredits ??
            0,
        });
      }

      try {
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

        /*
         * Generation succeeded.
         * The credit remains spent.
         */
        charge = null;
      } catch (
        generationError
      ) {
        /*
         * Log the real error ONLY
         * on the server/Vercel.
         */
        console.error(
          "OBITREND OpenAI generation error:",
          generationError
        );

        /*
         * Refund the EXACT credit
         * type that was charged.
         */
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
            "OBITREND credit refund error:",
            refundError
          );
        }

        charge = null;

        throw generationError;
      }
    }

    /* =======================================================
       FINAL BALANCE
    ======================================================= */

    const finalStatus =
      await getProStatus(
        userId,
        redis
      );

    const firstImage =
      images[0];

    /* =======================================================
       EXISTING RESPONSE COMPATIBILITY
    ======================================================= */

    return res.status(200).json({
      success: true,
      ok: true,

      model:
        MODEL,

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
        finalStatus.active
          ? finalStatus.proCredits
          : null,

      pro:
        finalStatus.active,

      proCredits:
        finalStatus.active
          ? finalStatus.proCredits
          : 0,

      message:
        "OBITREND fashion image generated successfully.",
    });
  } catch (
    error
  ) {
    /*
     * Keep the real technical
     * error server-side only.
     */
    console.error(
      "OBITREND GENERATION ERROR:",
      error
    );

    /*
     * Safety refund.
     *
     * Normally the inner generation
     * catch already refunded it and
     * set charge = null.
     *
     * This protects against an
     * unexpected failure occurring
     * after the credit was charged.
     */
    if (
      charge?.success &&
      redis &&
      userId
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
          "OBITREND SAFETY REFUND ERROR:",
          refundError
        );
      }
    }

    const safe =
      publicGenerationError(
        error
      );

    return res.status(
      safe.status
    ).json({
      success: false,
      error:
        safe.error,
    });
  }
}
