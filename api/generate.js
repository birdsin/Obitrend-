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
   SECURE IMAGE GENERATION API

   CREDIT RULE:
   1 generated image = 1 credit.

   Every image is charged immediately before generation.
   If that individual generation fails, only that credit
   is refunded.

   User identity ALWAYS comes from the verified Supabase
   access token. Client-provided user IDs are ignored.
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
   CONFIG
========================================================= */

const MODEL =
  process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";

const MAX_COLOUR_IMAGES = 4;
const MAX_IMAGE_BYTES = 9 * 1024 * 1024;
const MAX_PROMPT_LENGTH = 4000;

/* =========================================================
   HELPERS
========================================================= */

function clean(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value)
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, MAX_PROMPT_LENGTH);
}

function normalize(value) {
  return clean(value).toLowerCase();
}

function getModelGender(body) {
  const raw = normalize(
    body.modelGender ||
    body.gender ||
    body.model ||
    "woman"
  );

  if (
    raw === "man" ||
    raw === "male" ||
    raw === "boy" ||
    raw === "adult man"
  ) {
    return "adult male";
  }

  if (
    raw === "woman" ||
    raw === "female" ||
    raw === "girl" ||
    raw === "adult woman"
  ) {
    return "adult female";
  }

  return "adult female";
}

function getMimeType(dataUrl) {
  const match = String(dataUrl || "").match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,/i
  );

  if (!match) {
    return "image/jpeg";
  }

  const mime = match[1].toLowerCase();

  const allowed = new Set([
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
  ]);

  return allowed.has(mime)
    ? mime
    : "image/jpeg";
}

function dataUrlToBuffer(dataUrl) {
  if (typeof dataUrl !== "string") {
    throw new Error("Invalid image.");
  }

  const commaIndex = dataUrl.indexOf(",");

  if (commaIndex === -1) {
    throw new Error("Invalid image data.");
  }

  const base64 = dataUrl.slice(commaIndex + 1);

  if (!base64) {
    throw new Error("Empty image.");
  }

  const buffer = Buffer.from(base64, "base64");

  if (!buffer.length) {
    throw new Error("Invalid image.");
  }

  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("Image is too large.");
  }

  return buffer;
}

function getImageSize(body) {
  const ratio = normalize(
    body.aspectRatio ||
    body.ratio ||
    body.imageRatio ||
    "5:4"
  );

  if (ratio === "9:16" || ratio === "portrait") {
    return "1024x1536";
  }

  if (ratio === "16:9" || ratio === "landscape") {
    return "1536x1024";
  }

  if (
    ratio === "1:1" ||
    ratio === "square"
  ) {
    return "1024x1024";
  }

  if (ratio === "4:5") {
    return "1024x1536";
  }

  return "1536x1024";
}

function getColourList(body) {
  const possible = [
  body.garmentColours,
  body.garmentColors,
  body.clothingColors,
  body.clothingColours,
  body.colours,
  body.colors,
  body.selectedColours,
  body.selectedColors,
  body.colourCollection,
  body.colorCollection,
];

  let value = possible.find(
    (item) =>
      Array.isArray(item) ||
      typeof item === "string"
  );

  if (!value) {
    return [];
  }

  let list = Array.isArray(value)
    ? value
    : value
        .split(",")
        .map((item) => item.trim());

  list = list
    .map((item) => clean(item))
    .filter(Boolean);

  const unique = [];

  for (const colour of list) {
    const exists = unique.some(
      (item) =>
        normalize(item) === normalize(colour)
    );

    if (!exists) {
      unique.push(colour);
    }
  }

  return unique.slice(0, MAX_COLOUR_IMAGES);
}

/* =========================================================
   CLOTHING-PRESERVATION PROMPT
========================================================= */

function buildPrompt(body, selectedColour = "") {
  const gender = getModelGender(body);

  const age = clean(
    body.modelAge ||
    body.age ||
    body.ageGroup ||
    "adult"
  );

  const bodyStyle = clean(
    body.bodyStyle ||
    body.bodyType ||
    body.modelBody ||
    "natural fashion model"
  );

  const pose = clean(
    body.pose ||
    body.modelPose ||
    "confident professional fashion pose"
  );

  const fashionStyle = clean(
    body.fashionStyle ||
    body.style ||
    body.outfitStyle ||
    "luxury contemporary fashion"
  );

  const garment = clean(
    body.garment ||
    body.garmentType ||
    body.clothingType ||
    "the uploaded garment"
  );

  const background = clean(
    body.background ||
    body.scene ||
    body.location ||
    "luxury fashion studio"
  );

  const city = clean(
    body.city ||
    body.locationCity ||
    ""
  );

  const country = clean(
    body.country ||
    body.locationCountry ||
    ""
  );

  const vehicle = clean(
    body.vehicle ||
    body.car ||
    ""
  );

  const camera = clean(
    body.cameraStyle ||
    body.camera ||
    "professional fashion photography"
  );

  const lighting = clean(
    body.lighting ||
    "premium editorial lighting"
  );

  const extra = clean(
    body.prompt ||
    body.extraPrompt ||
    body.additionalPrompt ||
    ""
  );

  const colourInstruction = selectedColour
    ? `
SELECTED GARMENT COLOUR:
${selectedColour}

The uploaded garment must be rendered in the selected colour while preserving its original design, construction, silhouette, material appearance, seams, stitching, panels, trims, patterns, logos, graphics, and all other identifying details.
`
    : "";

  return `
Create a premium professional commercial fashion photograph using the uploaded clothing image as the PRIMARY AND AUTHORITATIVE REFERENCE for the garment.

CRITICAL CLOTHING FIDELITY REQUIREMENT:

The uploaded clothing design must be preserved as accurately as possible.

Treat the uploaded garment as a real physical product that must be reproduced faithfully.

DO NOT redesign the garment.

DO NOT invent a different garment.

DO NOT simplify the garment.

DO NOT replace the garment with a generic version.

DO NOT change the garment silhouette unless explicitly required by the uploaded reference.

DO NOT remove important construction details.

DO NOT add unnecessary pockets, buttons, zippers, belts, straps, seams, patterns, logos, graphics, panels, folds, trims, decorations, or accessories that are not present in the uploaded garment.

Preserve:

- exact garment type
- overall silhouette
- proportions
- neckline
- collar
- sleeves
- sleeve length
- cuffs
- waist construction
- hems
- pockets
- seams
- stitching
- panels
- closures
- buttons
- zippers
- belts
- trims
- graphics
- logos
- patterns
- fabric appearance
- texture
- thickness
- drape
- distinctive construction details

The uploaded garment is the source of truth.

If the uploaded image contains a top, reproduce that exact top.

If the uploaded image contains trousers, reproduce those exact trousers.

If the uploaded image contains a complete outfit, preserve the complete outfit.

Never substitute unrelated clothing.

MODEL:

Use an ${age} ${gender} fashion model.

Body style:
${bodyStyle}

The model should look like a professional adult commercial fashion model.

Pose:
${pose}

FASHION DIRECTION:

Fashion style:
${fashionStyle}

Garment:
${garment}

${colourInstruction}

MODEL PRESENTATION:

Show the complete model whenever reasonably possible.

Prefer a full-body fashion composition from head to feet.

Do not crop the model's head, garment, legs, or footwear unnecessarily.

The clothing must remain clearly visible and be the primary visual subject.

Use realistic anatomy.

Use realistic hands and fingers.

Use realistic facial proportions.

Use natural skin texture.

Use realistic fabric physics.

The model must actually wear the uploaded garment.

Do not merely place the garment beside the model.

Do not turn the garment into a floating object.

Do not create duplicate garments.

Do not create duplicate people.

BACKGROUND:

Create the requested environment:

${background}

${city ? `City: ${city}` : ""}
${country ? `Country: ${country}` : ""}
${vehicle ? `Vehicle: ${vehicle}` : ""}

The background should look premium, realistic, professionally photographed, and appropriate for a fashion campaign.

The environment must support the fashion image without distracting from the garment.

CAMERA:

${camera}

LIGHTING:

${lighting}

Use realistic professional photography.

Use natural shadows.

Use realistic highlights.

Use accurate fabric lighting.

Avoid plastic-looking skin.

Avoid artificial-looking fabric.

Avoid excessive blur over the garment.

Avoid excessive depth of field that hides garment details.

IMAGE QUALITY:

Create a high-end commercial fashion campaign image.

Photorealistic.

Sharp garment details.

Accurate material rendering.

Realistic proportions.

Professional composition.

Luxury editorial quality.

The result must look like a real photograph rather than an illustration, cartoon, 3D render, or synthetic mannequin.

USER'S ADDITIONAL INSTRUCTIONS:

${extra || "Follow the selected fashion controls and preserve the uploaded garment faithfully."}

FINAL PRIORITY:

1. Preserve the uploaded garment.
2. Make the garment clearly visible.
3. Follow the selected model requirements.
4. Follow the selected fashion style.
5. Follow the selected background/location.
6. Produce a realistic premium commercial fashion photograph.

If any instruction conflicts with the uploaded garment's actual design, prioritize the uploaded garment's visible construction and appearance.

Do not modify the identity-defining design features of the uploaded clothing.
`;
}

/* =========================================================
   OPENAI IMAGE GENERATION
========================================================= */

async function generateOne({
  openai,
  imageBuffer,
  mimeType,
  prompt,
  size,
}) {
  const extension =
    mimeType === "image/png"
      ? "png"
      : mimeType === "image/webp"
      ? "webp"
      : "jpg";

  const file = await toFile(
    imageBuffer,
    `obitrend-garment.${extension}`,
    {
      type: mimeType,
    }
  );

  const result = await openai.images.edit({
    model: MODEL,
    image: file,
    prompt,
    size,
    quality: "high",
    output_format: "png",
  });

  const item =
    result?.data?.[0];

  if (!item) {
    throw new Error(
      "Image generation returned no result."
    );
  }

  if (item.b64_json) {
    return {
      dataUrl:
        `data:image/png;base64,${item.b64_json}`,
      b64_json: item.b64_json,
    };
  }

  if (item.url) {
    return {
      dataUrl: item.url,
      url: item.url,
    };
  }

  throw new Error(
    "Image generation returned an invalid image."
  );
}

/* =========================================================
   SAFE ERROR
========================================================= */

function safeErrorMessage(error) {
  const message =
    error?.message ||
    String(error || "");

  const lower = message.toLowerCase();

  if (
    lower.includes("content policy") ||
    lower.includes("safety") ||
    lower.includes("policy")
  ) {
    return "The image request could not be completed because it did not meet the image generation safety requirements.";
  }

  if (
    lower.includes("rate limit") ||
    lower.includes("429")
  ) {
    return "Image generation is temporarily busy. Please try again shortly.";
  }

  if (
    lower.includes("timeout") ||
    lower.includes("timed out")
  ) {
    return "Image generation took too long. Please try again.";
  }

  if (
    lower.includes("image") &&
    (
      lower.includes("invalid") ||
      lower.includes("unsupported")
    )
  ) {
    return "The uploaded image could not be processed. Please upload a clear JPG, PNG, or WEBP image.";
  }

  return "Image generation failed. Please try again.";
}

/* =========================================================
   METHOD
========================================================= */

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader(
      "Allow",
      "POST"
    );

    return res.status(405).json({
      ok: false,
      error: "Method not allowed.",
    });
  }

  /* =======================================================
     AUTHENTICATE FIRST
  ======================================================= */

  let auth;

  try {
    auth = await getAuthenticatedUser(req);
  } catch (error) {
    return res.status(401).json({
      ok: false,
      error: "Authentication required.",
    });
  }

  if (!auth?.user?.id) {
    return res.status(401).json({
      ok: false,
      error: "Authentication required.",
    });
  }

  const userId = auth.user.id;
  const userEmail =
    auth.user.email || "";

  /* =======================================================
     OPENAI CONFIG
  ======================================================= */

  const apiKey =
    process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.error(
      "OBITREND: OPENAI_API_KEY is missing."
    );

    return res.status(500).json({
      ok: false,
      error:
        "Image generation service is not configured.",
    });
  }

  /* =======================================================
     REDIS
  ======================================================= */

  let redis;

  try {
    redis = getRedisConfig();
  } catch (error) {
    console.error(
      "OBITREND Redis configuration error:",
      error
    );

    return res.status(500).json({
      ok: false,
      error:
        "Credit service is temporarily unavailable.",
    });
  }

  /* =======================================================
     BODY
  ======================================================= */

  const body =
    req.body &&
    typeof req.body === "object"
      ? req.body
      : {};

  /*
   * IMPORTANT:
   * Do NOT trust body.userId.
   * The authenticated Supabase user above is authoritative.
   */

  const imageData =
  body.imageBase64 ||
  body.image ||
  body.imageData ||
  body.uploadedImage ||
  body.garmentImage ||
  body.clothingImage ||
  body.referenceImage;

  if (
    typeof imageData !== "string" ||
    !imageData.startsWith("data:image/")
  ) {
    return res.status(400).json({
      ok: false,
      error:
        "Please upload a clothing image before generating.",
    });
  }

  let imageBuffer;
  let mimeType;

  try {
    imageBuffer =
      dataUrlToBuffer(imageData);

    mimeType =
      getMimeType(imageData);
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error:
        "The uploaded image is invalid or too large.",
    });
  }

  /* =======================================================
     GENERATION OPTIONS
  ======================================================= */

  const colours =
    getColourList(body);

  const prompts =
    colours.length
      ? colours.map((colour) =>
          buildPrompt(body, colour)
        )
      : [
          buildPrompt(
            body,
            ""
          ),
        ];

  const size =
    getImageSize(body);

  const openai =
    new OpenAI({
      apiKey,
    });

  /* =======================================================
     GENERATION STATE
  ======================================================= */

  const images = [];

  let remainingBalance = null;
  let usedPaidCredit = false;
  let successfulCount = 0;
  let failedCount = 0;
  let stoppedBecauseCredits = false;

  const failedImages = [];

  /* =======================================================
     GENERATE ONE IMAGE AT A TIME

     IMPORTANT:

     CREDIT IS SPENT IMMEDIATELY BEFORE EACH IMAGE.

     THIS PREVENTS:
       4 images = 1 credit

     AND ENSURES:

       image 1 = 1 credit
       image 2 = 1 credit
       image 3 = 1 credit
       image 4 = 1 credit
  ======================================================= */

  for (
    let index = 0;
    index < prompts.length &&
    index < MAX_COLOUR_IMAGES;
    index++
  ) {
    const prompt =
      prompts[index];

    let charge = null;

    /* -----------------------------------------------------
       CHARGE EXACTLY ONE CREDIT
    ----------------------------------------------------- */

    try {
      charge =
        await spendCredit(
          userId,
          redis
        );
    } catch (error) {
      console.error(
        "OBITREND credit service error:",
        error
      );

      if (images.length === 0) {
        return res.status(503).json({
          ok: false,
          error:
            "Credit service is temporarily unavailable. Please try again.",
        });
      }

      stoppedBecauseCredits = true;
      break;
    }

    /* -----------------------------------------------------
       NO CREDIT AVAILABLE
    ----------------------------------------------------- */

    if (charge?.success !== true) {
      if (images.length === 0) {
        return res.status(
          charge?.code === "EXPIRED"
            ? 403
            : 402
        ).json({
          ok: false,
          error:
            charge?.error ||
            "You do not have enough credits to generate this image.",
          code:
            charge?.code ||
            "NO_CREDITS",
          balance:
            charge?.balance ?? 0,
          pro:
            charge?.proActive === true,
          proActive:
            charge?.proActive === true,
          proExhausted:
            charge?.proExhausted === true,
        });
      }

      /*
       * Previous images are valid and should not be lost.
       */
      stoppedBecauseCredits = true;
      remainingBalance =
        charge?.balance ?? 0;

      break;
    }

    /* -----------------------------------------------------
       REMEMBER THE EXACT CREDIT TYPE

       This is critical for correct refunds.
    ----------------------------------------------------- */

    const creditType =
      charge.creditType === "pro"
        ? "pro"
        : "free";

    if (
      creditType === "pro"
    ) {
      usedPaidCredit = true;
    }

    remainingBalance =
      charge.balance ?? 0;

    /* -----------------------------------------------------
       GENERATE THE IMAGE
    ----------------------------------------------------- */

    try {
      const generated =
        await generateOne({
          openai,
          imageBuffer,
          mimeType,
          prompt,
          size,
        });

      images.push({
        image:
          generated.dataUrl,
        imageUrl:
          generated.dataUrl,
        url:
          generated.dataUrl,
        generatedImage:
          generated.dataUrl,

        color:
          colours[index] ||
          null,

        colour:
          colours[index] ||
          null,

        index,
      });

      successfulCount++;
    } catch (error) {
      failedCount++;

      console.error(
        "OBITREND image generation failed:",
        error
      );

      /* ---------------------------------------------------
         REFUND ONLY THE CREDIT USED FOR THIS FAILED IMAGE
      --------------------------------------------------- */

      try {
        const refund =
          await refundCredit(
            userId,
            redis,
            creditType
          );

        if (
          refund?.ok &&
          typeof refund.balance ===
            "number"
        ) {
          remainingBalance =
            refund.balance;
        } else {
          remainingBalance =
            Math.min(
              Number(
                remainingBalance ?? 0
              ) + 1,
              Number(
                charge.balance ?? 0
              ) + 1
            );
        }
      } catch (refundError) {
        /*
         * VERY IMPORTANT:
         * Never expose internal Redis/refund
         * details to the customer.
         */
        console.error(
          "OBITREND credit refund failed:",
          refundError
        );
      }

      failedImages.push({
        index,
        color:
          colours[index] ||
          null,
        colour:
          colours[index] ||
          null,
      });

      /*
       * Continue to the next requested image.
       *
       * The failed generation has already been refunded.
       * Successful previous images remain valid.
       */
      continue;
    }
  }

  /* =======================================================
     NO SUCCESSFUL IMAGES
  ======================================================= */

  if (images.length === 0) {
    return res.status(500).json({
      ok: false,
      error:
        failedCount > 0
          ? "Image generation failed. Your credit for the failed generation was refunded. Please try again."
          : "No image was generated.",
      balance:
        remainingBalance ?? 0,
      pro:
        usedPaidCredit,
      proActive:
        usedPaidCredit,
      generatedImages: 0,
      requestedImages:
        prompts.length,
    });
  }

  /* =======================================================
     FINAL STATUS
  ======================================================= */

  let finalProActive =
    usedPaidCredit;

  let finalProExhausted =
    false;

  /*
   * Read the paid status again when possible.
   *
   * This does not control authorization.
   * It only makes the returned UI status more accurate.
   */
  try {
    const status =
      await getProStatus(
        userId,
        redis
      );

    finalProActive =
      status?.proActive === true;

    finalProExhausted =
      status?.proExhausted === true;
  } catch (error) {
    console.error(
      "OBITREND final credit status lookup failed:",
      error
    );
  }

  /* =======================================================
     RESPONSE COMPATIBILITY

     Keep multiple aliases so existing frontend workflow
     continues working.
  ======================================================= */

  const primaryImage =
    images[0]?.image ||
    images[0]?.imageUrl ||
    null;

  const imageUrls =
    images.map(
      (item) =>
        item.imageUrl
    );

  return res.status(200).json({
    ok: true,
    success: true,

    /* Existing single-image compatibility */
    image:
      primaryImage,

    imageUrl:
      primaryImage,

    url:
      primaryImage,

    generatedImage:
      primaryImage,

    /* Multiple images */
    images,

    colorImages:
      images,

    colourImages:
      images,

    imageUrls,

    /* Credit information */
    balance:
      remainingBalance ?? 0,

    pro:
      usedPaidCredit,

    proActive:
      finalProActive,

    proExhausted:
      finalProExhausted,

    /* Generation information */
    model:
      MODEL,

    requestedImages:
      prompts.length,

    generatedImages:
      successfulCount,

    failedImages:
      failedImages,

    failedCount,

    partial:
      successfulCount <
      prompts.length,

    stoppedBecauseCredits,

    remainingRequested:
      Math.max(
        0,
        prompts.length -
          successfulCount -
          failedCount
      ),

    email:
      userEmail || undefined,
  });
}
