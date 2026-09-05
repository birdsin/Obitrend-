// =====================================================
// OBITREND AI FASHION CREATOR
// PREMIUM IMAGE GENERATION
//
// Compatible with the current credits.js:
//
//   spendCredit()
//   refundCredit()
//   getProStatus()
//   getRedisConfig()
//   getAuthenticatedUser()
//
// IMPORTANT:
// This file does NOT use reserveCredit,
// commitCredit, or releaseCreditReservation.
// =====================================================

import OpenAI, { toFile } from "openai";

import {
  spendCredit,
  refundCredit,
  getRedisConfig,
  getAuthenticatedUser,
} from "./credits.js";

/* =====================================================
   VERCEL CONFIG
===================================================== */

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "12mb",
    },
  },
};

export const maxDuration = 300;

/* =====================================================
   OPENAI
===================================================== */

const MODEL =
  process.env.OPENAI_IMAGE_MODEL ||
  "gpt-image-2";

const MAX_IMAGE_BYTES =
  9 * 1024 * 1024;

const openai = new OpenAI({
  apiKey:
    process.env.OPENAI_API_KEY,
});

/* =====================================================
   HELPERS
===================================================== */

function clean(value, fallback = "") {
  if (
    value === undefined ||
    value === null
  ) {
    return fallback;
  }

  const result =
    String(value).trim();

  return result || fallback;
}

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

/* =====================================================
   BASE64
===================================================== */

function normalizeBase64(value) {
  if (!value) {
    return "";
  }

  const text =
    String(value).trim();

  if (
    text.startsWith("data:")
  ) {
    const comma =
      text.indexOf(",");

    if (comma !== -1) {
      return text.slice(
        comma + 1
      );
    }
  }

  return text
    .replace(/\s/g, "");
}

/* =====================================================
   MIME TYPE
===================================================== */

function getMimeType(value) {
  const text =
    String(value || "").trim();

  const match =
    text.match(
      /^data:(image\/(?:png|jpeg|jpg|webp));base64,/i
    );

  if (!match) {
    return "image/jpeg";
  }

  const mime =
    match[1].toLowerCase();

  if (mime === "image/jpg") {
    return "image/jpeg";
  }

  return mime;
}

/* =====================================================
   FILE EXTENSION
===================================================== */

function extensionFromMime(mime) {
  if (
    mime === "image/png"
  ) {
    return "png";
  }

  if (
    mime === "image/webp"
  ) {
    return "webp";
  }

  return "jpg";
}

/* =====================================================
   BASE64 SIZE
===================================================== */

function estimateBase64Bytes(base64) {
  if (!base64) {
    return 0;
  }

  const padding =
    base64.endsWith("==")
      ? 2
      : base64.endsWith("=")
      ? 1
      : 0;

  return Math.max(
    0,
    Math.floor(
      (base64.length * 3) /
        4
    ) - padding
  );
}

/* =====================================================
   IMAGE SIZE
===================================================== */

function getImageSize(value) {
  const ratio =
    clean(
      value,
      "4:5"
    ).toLowerCase();

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

  if (
    ratio.includes("4:5") ||
    ratio.includes("5:4") ||
    ratio.includes("9:16") ||
    ratio.includes("portrait") ||
    ratio.includes("vertical")
  ) {
    return "1024x1536";
  }

  return "1024x1536";
}

/* =====================================================
   COLOURS
===================================================== */

function getColourList(body) {
  const result = [];

  const values = [
    body?.garmentColor,
    body?.garmentColour,
    body?.topColor,
    body?.topColour,

    body?.trouserColor,
    body?.trouserColour,
    body?.pantsColor,
    body?.pantsColour,

    body?.bottomColor,
    body?.bottomColour,
  ];

  for (const value of values) {
    if (!value) {
      continue;
    }

    if (Array.isArray(value)) {
      result.push(
        ...value
          .map(clean)
          .filter(Boolean)
      );
    } else {
      result.push(
        ...String(value)
          .split(",")
          .map(clean)
          .filter(Boolean)
      );
    }
  }

  return [
    ...new Set(result),
  ].slice(0, 4);
}

/* =====================================================
   PROMPT
===================================================== */

function buildPrompt(body) {
  const userPrompt =
    clean(
      getValue(
        body,
        "prompt",
        "description"
      )
    );

  const model =
    clean(
      getValue(
        body,
        "model",
        "lady",
        "modelChoice"
      ),
      "professional adult fashion model"
    );

  const background =
    clean(
      getValue(
        body,
        "background",
        "location",
        "environment"
      ),
      "luxury real-world fashion environment"
    );

  const pose =
    clean(
      getValue(
        body,
        "pose",
        "modelPose"
      ),
      "natural professional full-body fashion pose"
    );

  const garmentType =
    clean(
      getValue(
        body,
        "garmentType",
        "clothingType",
        "outfit"
      ),
      "the uploaded garment"
    );

  const colours =
    getColourList(body);

  return `
OBITREND AI FASHION CREATOR
PREMIUM COMMERCIAL FASHION PHOTOGRAPH

The uploaded clothing image is the PRIMARY
AND STRICT VISUAL REFERENCE.

The uploaded garment is the source of truth.

Create a realistic professional fashion
photograph showing the SAME physical garment
being worn by an adult fashion model.

=========================================================
GARMENT PRESERVATION — HIGHEST PRIORITY
=========================================================

Preserve the uploaded garment as accurately
as the image model allows.

Preserve:

- exact overall garment silhouette
- garment construction
- neckline
- collar
- sleeve shape
- sleeve length
- cuffs
- hems
- seams
- stitching
- fabric texture
- fabric weight
- fabric appearance
- garment proportions
- colour
- colour blocking
- stripes
- borders
- artwork
- graphics
- logos actually visible
- labels actually visible
- lettering actually visible
- decorative details
- graphic orientation
- graphic placement
- graphic scale

DO NOT redesign the garment.

DO NOT reinterpret the garment.

DO NOT create a similar garment.

DO NOT replace the garment with another
fashion design.

DO NOT add details that are not present.

DO NOT add:

- belts
- waistbands
- stripes
- piping
- ribbing
- pockets
- buttons
- zippers
- embroidery
- decorative panels
- logos
- artwork
- text

unless those details are actually visible
in the uploaded reference.

Do not change artwork colours.

Do not move artwork.

Do not remove artwork.

Do not invent lettering.

Do not invent logos.

Do not simplify graphics.

The result must look like the SAME physical
garment from the uploaded image.

=========================================================
USER SELECTIONS
=========================================================

MODEL:
${model}

GARMENT:
${garmentType}

BACKGROUND:
${background}

POSE:
${pose}

COLOURS:
${
  colours.length
    ? colours.join(", ")
    : "Preserve the original uploaded garment colours."
}

USER REQUEST:
${
  userPrompt ||
  "Create a premium professional fashion campaign photograph."
}

=========================================================
FULL BODY
=========================================================

Show the adult model from head to toe.

Both feet visible.

Both shoes visible.

Do not crop the head.

Do not crop the garment.

Do not crop the legs.

Do not crop the feet.

The clothing must remain large enough to
clearly inspect.

Avoid excessive empty floor.

Avoid excessive empty ceiling.

Use realistic professional fashion-camera
perspective.

Maintain realistic adult human anatomy.

=========================================================
PHOTOREALISM
=========================================================

The final image must look like a genuine
professional photograph.

Use:

- realistic human anatomy
- realistic adult proportions
- realistic skin texture
- natural skin pores
- realistic eyes
- realistic facial detail
- realistic hair
- realistic hands
- realistic fingers
- realistic nails
- realistic feet
- realistic posture
- realistic fabric
- realistic fabric folds
- realistic garment tension
- realistic stitching
- realistic shadows
- realistic reflections
- realistic perspective
- realistic lighting
- realistic highlights
- realistic depth of field
- realistic environmental detail
- realistic exposure
- realistic colour rendition

The model must look like a real adult person.

The clothing must look like real physical
fabric being worn by the person.

The environment must look physically real.

=========================================================
DO NOT CREATE
=========================================================

Do not make the image:

- CGI
- 3D rendered
- cartoon
- anime
- illustration
- painting
- plastic
- mannequin-like
- wax-like
- doll-like
- videogame-like
- artificial
- excessively smooth
- excessively sharpened
- excessive HDR
- beauty-filtered
- distorted

Avoid:

- extra fingers
- missing fingers
- distorted hands
- distorted feet
- malformed anatomy
- floating objects
- impossible reflections
- impossible shadows
- unrealistic fabric
- unrealistic lighting

=========================================================
CAMERA
=========================================================

Create the visual characteristics of a
professional commercial fashion photograph
captured with a modern professional camera.

Use believable:

- lens perspective
- depth of field
- lighting
- exposure
- focus
- shadows
- reflections
- environmental separation

The model must appear physically present
inside the selected environment.

=========================================================
FINAL QUALITY CHECK
=========================================================

Prioritize:

1. Uploaded garment accuracy
2. Garment colour accuracy
3. Garment artwork accuracy
4. Garment construction accuracy
5. Realistic model anatomy
6. Realistic fabric behaviour
7. Realistic lighting
8. Realistic environment
9. Professional fashion photography

The final result should look like:

REAL PERSON.
REAL GARMENT.
REAL FABRIC.
REAL ENVIRONMENT.
REAL LIGHT.
REAL CAMERA.
REAL FASHION PHOTOGRAPH.
`;
}

/* =====================================================
   OPENAI IMAGE GENERATION
===================================================== */

async function generateOne({
  imageBase64,
  mimeType,
  prompt,
  size,
}) {
  if (!imageBase64) {
    throw new Error(
      "No clothing image was supplied."
    );
  }

  const extension =
    extensionFromMime(
      mimeType
    );

  const imageBuffer =
    Buffer.from(
      imageBase64,
      "base64"
    );

  if (
    !imageBuffer.length
  ) {
    throw new Error(
      "The uploaded clothing image could not be decoded."
    );
  }

  const imageFile =
    await toFile(
      imageBuffer,
      `obitrend-garment.${extension}`,
      {
        type: mimeType,
      }
    );

  console.log(
    "OBITREND OpenAI request:",
    {
      model: MODEL,
      size,
      mimeType,
      bytes: imageBuffer.length,
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

  const output =
    result?.data?.[0];

  const base64 =
    output?.b64_json;

  if (!base64) {
    console.error(
      "OpenAI image response:",
      {
        hasData:
          Array.isArray(
            result?.data
          ),
        dataLength:
          result?.data?.length || 0,
        firstItemKeys:
          output
            ? Object.keys(output)
            : [],
      }
    );

    throw new Error(
      "OpenAI returned no image data."
    );
  }

  return base64;
}

/* =====================================================
   SAFE ERROR MESSAGE
===================================================== */

function getOpenAIErrorMessage(
  error
) {
  if (!error) {
    return "Unknown OpenAI error.";
  }

  const status =
    error.status ||
    error.statusCode ||
    error.response?.status;

  const message =
    error?.error?.message ||
    error?.response?.data?.error?.message ||
    error?.message ||
    String(error);

  console.error(
    "OBITREND OpenAI details:",
    {
      status,
      message,
      name: error?.name,
      code:
        error?.code ||
        error?.error?.code ||
        null,
      type:
        error?.type ||
        error?.error?.type ||
        null,
    }
  );

  return message;
}

/* =====================================================
   MAIN HANDLER
===================================================== */

export default async function handler(
  req,
  res
) {
  let redis = null;
  let userId = null;

  /*
   * IMPORTANT:
   *
   * With the supplied credits.js there is
   * no reservation system.
   *
   * We therefore:
   *
   * 1. Check authentication.
   * 2. Spend exactly one credit.
   * 3. Generate the image.
   * 4. Refund the exact credit if generation fails.
   *
   * This keeps the existing credits.js compatible.
   */

  let spentCredit = null;

  try {
    /* =================================================
       METHOD
    ================================================= */

    if (
      req.method !== "POST"
    ) {
      res.setHeader(
        "Allow",
        "POST"
      );

      return res.status(405).json({
        success: false,
        error:
          "Method not allowed.",
      });
    }

    /* =================================================
       AUTHENTICATION
    ================================================= */

    const auth =
      await getAuthenticatedUser(
        req
      );

    if (
      !auth?.ok ||
      !auth?.user?.id
    ) {
      return res.status(
        auth?.status || 401
      ).json({
        success: false,
        error:
          auth?.error ||
          "Please sign in again.",
      });
    }

    userId =
      auth.user.id;

    /* =================================================
       OPENAI KEY
    ================================================= */

    if (
      !process.env.OPENAI_API_KEY
    ) {
      console.error(
        "OBITREND: OPENAI_API_KEY is missing."
      );

      return res.status(500).json({
        success: false,
        error:
          "OBITREND image generation is not configured on the server.",
      });
    }

    /* =================================================
       REQUEST BODY
    ================================================= */

    const body =
      req.body &&
      typeof req.body === "object"
        ? req.body
        : {};

    /* =================================================
       IMAGE
    ================================================= */

    const rawImage = getValue(
  body,
  "imageBase64",
  "garmentImage",
  "clothingImage",
  "image",
  "photo",
  "base64Image"
);

    const imageBase64 =
      normalizeBase64(
        rawImage
      );

    if (!imageBase64) {
      return res.status(400).json({
        success: false,
        error:
          "Please upload a clothing image first.",
      });
    }

    const imageBytes =
      estimateBase64Bytes(
        imageBase64
      );

    if (
      imageBytes >
      MAX_IMAGE_BYTES
    ) {
      return res.status(413).json({
        success: false,
        error:
          "The clothing image is too large. Please choose a smaller image.",
      });
    }

    if (
      imageBytes <= 0
    ) {
      return res.status(400).json({
        success: false,
        error:
          "The uploaded clothing image is invalid.",
      });
    }

    /* =================================================
       MIME
    ================================================= */

    const mimeType =
      getMimeType(
        rawImage
      );

    const allowedMimeTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (
      !allowedMimeTypes.includes(
        mimeType
      )
    ) {
      return res.status(400).json({
        success: false,
        error:
          "Please upload a JPG, PNG, or WebP clothing image.",
      });
    }

    /* =================================================
       SIZE
    ================================================= */

    const ratio =
      clean(
        getValue(
          body,
          "aspectRatio",
          "ratio"
        ),
        "4:5"
      );

    const size =
      getImageSize(
        ratio
      );

    /* =================================================
       REDIS
    ================================================= */

    redis =
      getRedisConfig();

    if (
      !redis?.url ||
      !redis?.token
    ) {
      console.error(
        "OBITREND: Redis configuration is missing."
      );

      return res.status(500).json({
        success: false,
        error:
          "OBITREND credits are temporarily unavailable. Please try again shortly.",
      });
    }

    /* =================================================
       CHECK + SPEND CREDIT
    ================================================= */

    spentCredit =
      await spendCredit(
        userId,
        redis
      );

    if (
      !spentCredit?.success
    ) {
      const reason =
        spentCredit?.reason;

      if (
        reason ===
        "no_pro_credits"
      ) {
        return res.status(402).json({
          success: false,
          error:
            "Your OBITREND Pro credits are finished.",
          credits: 0,
          proActive: true,
          proCredits: 0,
          upgradeRequired: true,
          expiresAt:
            spentCredit?.expiresAt ||
            null,
          plan:
            spentCredit?.plan ||
            null,
        });
      }

      if (
        reason ===
        "no_free_credits"
      ) {
        return res.status(402).json({
          success: false,
          error:
            "Your free OBITREND generations are finished. Upgrade to OBITREND Pro to continue.",
          credits: 0,
          proActive: false,
          upgradeRequired: true,
          resetAt:
            spentCredit?.resetAt ||
            null,
        });
      }

      return res.status(402).json({
        success: false,
        error:
          "You do not have enough OBITREND credits.",
        credits:
          spentCredit?.balance ??
          0,
        upgradeRequired:
          spentCredit?.upgradeRequired ??
          true,
      });
    }

    console.log(
      "OBITREND credit spent:",
      {
        userId,
        creditType:
          spentCredit.creditType,
        balance:
          spentCredit.balance,
      }
    );

    /* =================================================
       PROMPT
    ================================================= */

    const prompt =
      buildPrompt(
        body
      );

    /* =================================================
       GENERATE
    ================================================= */

    let generatedBase64;

    try {
      generatedBase64 =
        await generateOne({
          imageBase64,
          mimeType,
          prompt,
          size,
        });
    } catch (error) {
      const details =
        getOpenAIErrorMessage(
          error
        );

      console.error(
        "OBITREND image generation failed:",
        details
      );

      /* ===============================================
         REFUND EXACT CREDIT
      =============================================== */

      try {
        const refund =
          await refundCredit(
            userId,
            redis,
            spentCredit.creditType ||
              "free"
          );

        console.log(
          "OBITREND failed-generation refund:",
          refund
        );

      } catch (refundError) {
        console.error(
          "OBITREND credit refund failed:",
          refundError
        );
      }

      /*
       * Do not expose internal API
       * credentials or infrastructure
       * information to the customer.
       */

      return res.status(502).json({
        success: false,
        error:
          "Image generation could not be completed. Your OBITREND credit has been returned. Please try again.",
        creditRefunded:
          true,
      });
    }

    /* =================================================
       IMAGE DATA URL
    ================================================= */

    const dataUrl =
      `data:image/png;base64,${generatedBase64}`;

    /* =================================================
       SUCCESS
    ================================================= */

    return res.status(200).json({
      success: true,

      image:
        dataUrl,

      imageUrl:
        dataUrl,

      b64_json:
        generatedBase64,

      mimeType:
        "image/png",

      creditCommitted:
        true,

      creditType:
        spentCredit.creditType,

      creditsRemaining:
        spentCredit.balance,

      proCreditsRemaining:
        spentCredit.creditType ===
        "pro"
          ? spentCredit.balance
          : null,

      plan:
        spentCredit.plan ||
        null,

      expiresAt:
        spentCredit.expiresAt ||
        null,
    });

  } catch (error) {
    console.error(
      "OBITREND generation fatal error:",
      error
    );

    /*
     * If a credit was successfully
     * spent and something unexpected
     * happened afterwards, attempt to
     * return that exact credit.
     */

    if (
      spentCredit?.success &&
      redis &&
      userId
    ) {
      try {
        const refund =
          await refundCredit(
            userId,
            redis,
            spentCredit.creditType ||
              "free"
          );

        console.log(
          "OBITREND fatal-error refund:",
          refund
        );
      } catch (
        refundError
      ) {
        console.error(
          "OBITREND fatal-error refund failed:",
          refundError
        );
      }
    }

    return res.status(500).json({
      success: false,
      error:
        "OBITREND could not complete the image generation. Your credit has been returned if it was charged. Please try again.",
    });
  }
}
