import OpenAI, { toFile } from "openai";

import {
  spendCredit,
  refundCredit,
  getProStatus,
  getRedisConfig,
  getAuthenticatedUser
} from "./credits.js";

/*
===========================================================
 OBITREND AI — SECURE IMAGE GENERATION API
===========================================================

 FREE
   Uses free credits.

 WEEKLY STANDARD PRO
   Uses Standard Pro credits.

 MONTHLY FULL PRO
   Uses Full Pro credits.

 IMPORTANT
   The authenticated Supabase user is the only identity
   trusted by this API.

   userId/email supplied by the browser are NOT trusted.

===========================================================
*/

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "12mb"
    }
  }
};

export const maxDuration = 300;

/*
-----------------------------------------------------------
 OPENAI IMAGE MODEL
-----------------------------------------------------------
*/

const MODEL =
  process.env.OPENAI_IMAGE_MODEL ||
  "gpt-image-1";

/*
-----------------------------------------------------------
 OPENAI CLIENT
-----------------------------------------------------------
*/

function getOpenAI() {
  const apiKey =
    String(
      process.env.OPENAI_API_KEY || ""
    ).trim();

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not configured."
    );
  }

  return new OpenAI({
    apiKey
  });
}

/*
===========================================================
 HELPERS
===========================================================
*/

function clean(value) {
  return String(value ?? "").trim();
}

function send(res, status, data) {
  return res.status(status).json(data);
}

function getBody(req) {
  if (!req.body) return {};

  if (
    typeof req.body === "object" &&
    !Buffer.isBuffer(req.body)
  ) {
    return req.body;
  }

  try {
    return JSON.parse(
      String(req.body)
    );
  } catch {
    return {};
  }
}

/*
===========================================================
 IMAGE DATA NORMALIZATION
===========================================================
*/

function normalizeImageData(
  value
) {
  if (!value) return null;

  /*
  ---------------------------------------------------------
   Already a data URL
  ---------------------------------------------------------
  */

  if (
    typeof value === "string" &&
    value.startsWith("data:image/")
  ) {
    return value;
  }

  /*
  ---------------------------------------------------------
   Base64 only
  ---------------------------------------------------------
  */

  if (
    typeof value === "string" &&
    /^[A-Za-z0-9+/=\s]+$/.test(value) &&
    value.length > 100
  ) {
    return `data:image/png;base64,${value}`;
  }

  return null;
}

/*
===========================================================
 CREATE OPENAI FILE
===========================================================
*/

async function createImageFile(
  imageData
) {
  const dataUrl =
    normalizeImageData(imageData);

  if (!dataUrl) {
    return null;
  }

  const match =
    dataUrl.match(
      /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/s
    );

  if (!match) {
    return null;
  }

  const mimeType =
    match[1];

  const base64 =
    match[2];

  const buffer =
    Buffer.from(
      base64,
      "base64"
    );

  if (!buffer.length) {
    return null;
  }

  let extension = "png";

  if (
    mimeType === "image/jpeg" ||
    mimeType === "image/jpg"
  ) {
    extension = "jpg";
  } else if (
    mimeType === "image/webp"
  ) {
    extension = "webp";
  }

  return toFile(
    buffer,
    `obitrend-garment.${extension}`,
    {
      type: mimeType
    }
  );
}

/*
===========================================================
 EXTRACT IMAGE FROM REQUEST
===========================================================
*/

function getUploadedImage(body) {
  return (
    body.image ||
    body.imageData ||
    body.garmentImage ||
    body.uploadedImage ||
    body.photo ||
    body.base64 ||
    null
  );
}

/*
===========================================================
 BUILD FASHION PROMPT
===========================================================
*/

function buildPrompt(body) {
  const model =
    clean(
      body.model ||
      body.lady ||
      body.modelName
    );

  const clothingType =
    clean(
      body.clothingType ||
      body.garmentType ||
      "fashion garment"
    );

  const clothingStyle =
    clean(
      body.clothingStyle ||
      body.style ||
      "premium fashion"
    );

  const bodyType =
    clean(
      body.body ||
      body.bodyType ||
      "natural adult female body"
    );

  const face =
    clean(
      body.face ||
      body.faceStyle ||
      "beautiful natural adult female face"
    );

  const pose =
    clean(
      body.pose ||
      "natural professional fashion pose"
    );

  const footwear =
    clean(
      body.footwear ||
      "fashion footwear appropriate for the outfit"
    );

  const camera =
    clean(
      body.camera ||
      "professional fashion photography"
    );

  const lighting =
    clean(
      body.lighting ||
      "professional natural-looking studio lighting"
    );

  const location =
    clean(
      body.location ||
      body.locationType ||
      "luxury fashion environment"
    );

  const background =
    clean(
      body.background ||
      body.backgroundPreset ||
      "premium realistic fashion background"
    );

  const city =
    clean(
      body.city ||
      "beautiful modern city"
    );

  const property =
    clean(
      body.property ||
      ""
    );

  const vehicle =
    clean(
      body.vehicle ||
      ""
    );

  const creative =
    clean(
      body.creative ||
      ""
    );

  const country =
    clean(
      body.country ||
      ""
    );

  /*
  =========================================================
   CLOTHING PRESERVATION
  =========================================================

   This section is intentionally extremely explicit.
   The uploaded garment is the primary visual reference.
  */

  const clothingPreservation = `
ABSOLUTE CLOTHING PRESERVATION REQUIREMENT:

Use the uploaded clothing image as the PRIMARY and AUTHORITATIVE
visual reference for the garment.

Preserve the garment's actual design as accurately as possible.

Preserve:

- exact garment silhouette
- exact garment shape
- exact cut
- exact neckline
- exact collar
- exact sleeves
- exact sleeve length
- exact hemline
- exact seams
- exact stitching
- exact panels
- exact pockets
- exact buttons
- exact zippers
- exact fasteners
- exact straps
- exact belts
- exact embroidery
- exact graphics
- exact logos when visible
- exact printed artwork
- exact patterns
- exact fabric appearance
- exact texture
- exact material
- exact color
- exact color placement
- exact proportions
- exact construction details

DO NOT redesign the uploaded garment.

DO NOT invent a different garment.

DO NOT replace the garment with a similar garment.

DO NOT simplify the garment.

DO NOT remove visible design details.

DO NOT add decorations that do not exist.

DO NOT change the garment's color.

DO NOT change the garment's pattern.

DO NOT change the garment's proportions.

The model, pose, environment, camera and lighting may change,
but the uploaded garment itself must remain visually faithful
to the reference.

If the reference garment contains distinctive construction
details, those details must remain visible in the final image.
`;

  /*
  =========================================================
   REAL PERSON PHOTOGRAPHY
  =========================================================
  */

  const realism = `
PHOTOREALISM REQUIREMENT:

Create a highly realistic fashion photograph of an adult woman.

The subject must look like a real adult human being photographed
by a professional fashion photographer.

Use:

- realistic skin texture
- realistic pores
- natural facial detail
- natural hair
- realistic eyes
- realistic hands
- realistic fingers
- natural body proportions
- realistic fabric behavior
- realistic folds
- realistic shadows
- realistic reflections
- realistic perspective
- realistic depth of field
- realistic lens characteristics
- realistic environmental lighting

Avoid:

- cartoon appearance
- illustration appearance
- plastic skin
- artificial mannequin appearance
- distorted anatomy
- extra fingers
- missing fingers
- duplicated limbs
- warped clothing
- floating objects
- unnatural shadows
- fake-looking skin
- CGI-looking faces
`;
  
  /*
  =========================================================
   MODEL DESCRIPTION
  =========================================================
  */

  const modelDescription = `
ADULT FASHION MODEL:

${model || "beautiful adult female fashion model"}

Body type:
${bodyType}

Face:
${face}

Pose:
${pose}

Footwear:
${footwear}
`;

  /*
  =========================================================
   ENVIRONMENT
  =========================================================
  */

  const environment = `
FASHION ENVIRONMENT:

Location:
${location}

Country:
${country}

City:
${city}

Background:
${background}

Property:
${property}

Vehicle:
${vehicle}

Creative direction:
${creative}
`;

  /*
  =========================================================
   CAMERA
  =========================================================
  */

  const cameraDirection = `
CAMERA:

${camera}

Professional fashion photography.

Use realistic camera perspective and optical depth.

Maintain correct human proportions and natural perspective.

Produce premium commercial/editorial fashion photography
quality.
`;

  /*
  =========================================================
   FINAL PROMPT
  =========================================================
  */

  return `
OBITREND AI FASHION CREATOR

Create a premium professional fashion photograph using the
uploaded garment reference.

${clothingPreservation}

${realism}

${modelDescription}

Clothing type:
${clothingType}

Clothing style:
${clothingStyle}

${environment}

Lighting:
${lighting}

${cameraDirection}

FINAL QUALITY:

The final result should look like a genuine high-end fashion
campaign photograph captured by a professional photographer.

The uploaded garment is the most important visual element.

Prioritize garment fidelity over creative reinterpretation.

The result must look photographic, premium, realistic,
commercially usable and professionally composed.

${creative}
`;
}

/*
===========================================================
 GENERATE IMAGE
===========================================================
*/

async function generateImage(
  body,
  uploadedImage
) {
  const openai =
    getOpenAI();

  const prompt =
    buildPrompt(body);

  const imageFile =
    await createImageFile(
      uploadedImage
    );

  if (!imageFile) {
    throw new Error(
      "Please upload a valid garment image before generating."
    );
  }

  /*
  ---------------------------------------------------------
   OpenAI image edit

   The uploaded garment is supplied directly as the visual
   reference.
  ---------------------------------------------------------
  */

  const result =
    await openai.images.edit({
      model: MODEL,

      image: imageFile,

      prompt,

      size:
        clean(
          body.size ||
          body.outputSize ||
          "1024x1024"
        ),

      quality:
        clean(
          body.quality ||
          "high"
        ),

      background:
        clean(
          body.backgroundMode ||
          "auto"
        )
    });

  /*
  ---------------------------------------------------------
   Extract generated image.
  ---------------------------------------------------------
  */

  const item =
    result?.data?.[0];

  if (!item) {
    throw new Error(
      "OpenAI returned no generated image."
    );
  }

  /*
  ---------------------------------------------------------
   Base64 output
  ---------------------------------------------------------
  */

  if (item.b64_json) {
    return {
      imageUrl:
        `data:image/png;base64,${item.b64_json}`
    };
  }

  /*
  ---------------------------------------------------------
   URL output
  ---------------------------------------------------------
  */

  if (item.url) {
    return {
      imageUrl:
        item.url
    };
  }

  throw new Error(
    "OpenAI returned an unsupported image response."
  );
}

/*
===========================================================
 MAIN HANDLER
===========================================================
*/

export default async function handler(
  req,
  res
) {
  res.setHeader(
    "Cache-Control",
    "no-store, max-age=0"
  );

  res.setHeader(
    "X-Content-Type-Options",
    "nosniff"
  );

  /*
  ---------------------------------------------------------
   Only POST generation requests are accepted.
  ---------------------------------------------------------
  */

  if (req.method !== "POST") {
    res.setHeader(
      "Allow",
      "POST"
    );

    return send(res, 405, {
      success: false,
      error: "Method not allowed."
    });
  }

  let creditUsed = false;

  let userId = "";

  let redis = null;

  try {
    /*
    =======================================================
     AUTHENTICATE USER
    =======================================================
    */

    const auth =
      await getAuthenticatedUser(req);

    if (!auth.ok) {
      return send(
        res,
        auth.status,
        {
          success: false,
          error: auth.error
        }
      );
    }

    userId =
      auth.user.id;

    /*
    =======================================================
     REDIS
    =======================================================
    */

    redis =
      getRedisConfig();

    if (
      !redis?.url ||
      !redis?.token
    ) {
      return send(res, 500, {
        success: false,
        error:
          "Redis environment variables are missing in Vercel."
      });
    }

    /*
    =======================================================
     GET CURRENT PRO STATUS
    =======================================================
    */

    const pro =
      await getProStatus(
        userId,
        redis
      );

    /*
    =======================================================
     SPEND ONE CREDIT
    =======================================================
    */

    const credit =
      await spendCredit(
        userId,
        redis
      );

    if (!credit.success) {
      /*
      -----------------------------------------------------
       PRO CREDIT EXHAUSTED
      -----------------------------------------------------
      */

      if (
        credit.reason ===
          "no_pro_credits" ||
        credit.creditType ===
          "pro"
      ) {
        return send(res, 402, {
          success: false,

          error:
            "Your OBITREND Pro credits are finished. Renew your Pro plan to continue.",

          code:
            "PRO_CREDITS_EXHAUSTED",

          proActive:
            true,

          plan:
            pro.plan,

          planTier:
            pro.planTier,

          proCredits:
            0,

          upgradeRequired:
            true
        });
      }

      /*
      -----------------------------------------------------
       FREE CREDIT EXHAUSTED
      -----------------------------------------------------
      */

      return send(res, 402, {
        success: false,

        error:
          "Your free generations are finished. Upgrade to OBITREND Pro to continue.",

        code:
          "FREE_CREDITS_EXHAUSTED",

        proActive:
          false,

        upgradeRequired:
          true,

        resetAt:
          credit.resetAt ||
          null
      });
    }

    creditUsed = true;

    /*
    =======================================================
     REQUEST BODY
    =======================================================
    */

    const body =
      getBody(req);

    /*
    =======================================================
     IMAGE
    =======================================================
    */

    const uploadedImage =
      getUploadedImage(body);

    if (!uploadedImage) {
      return send(res, 400, {
        success: false,
        error:
          "Please upload a garment image first."
      });
    }

    /*
    =======================================================
     GENERATE
    =======================================================
    */

    const generated =
      await generateImage(
        body,
        uploadedImage
      );

    /*
    =======================================================
     SUCCESS
    =======================================================
    */

    return send(res, 200, {
      success: true,

      imageUrl:
        generated.imageUrl,

      image:
        generated.imageUrl,

      creditType:
        credit.creditType,

      creditsRemaining:
        credit.balance,

      proActive:
        pro.active,

      plan:
        pro.plan,

      planTier:
        pro.planTier,

      proCredits:
        credit.creditType === "pro"
          ? credit.balance
          : pro.proCredits,

      message:
        "OBITREND image generated successfully."
    });
  } catch (error) {
    console.error(
      "OBITREND generation error:",
      error
    );

    /*
    =======================================================
     REFUND CREDIT WHEN GENERATION FAILS
    =======================================================
    */

    if (
      creditUsed &&
      userId &&
      redis
    ) {
      try {
        await refundCredit(
          userId,
          redis
        );
      } catch (refundError) {
        console.error(
          "OBITREND credit refund failed:",
          refundError
        );
      }
    }

    /*
    =======================================================
     FRIENDLY OPENAI ERRORS
    =======================================================
    */

    const message =
      clean(error?.message);

    if (
      message.toLowerCase().includes(
        "insufficient_quota"
      ) ||
      message.toLowerCase().includes(
        "quota"
      ) ||
      message.toLowerCase().includes(
        "billing"
      )
    ) {
      return send(res, 402, {
        success: false,

        code:
          "OPENAI_BILLING_REQUIRED",

        error:
          "OBITREND could not generate the image because the OpenAI API account needs available API credits."
      });
    }

    if (
      message.toLowerCase().includes(
        "rate limit"
      ) ||
      message.includes("429")
    ) {
      return send(res, 429, {
        success: false,

        code:
          "OPENAI_RATE_LIMIT",

        error:
          "The image service is temporarily busy. Please try again shortly."
      });
    }

    if (
      message.toLowerCase().includes(
        "invalid api key"
      ) ||
      message.toLowerCase().includes(
        "authentication"
      )
    ) {
      return send(res, 500, {
        success: false,

        code:
          "OPENAI_CONFIGURATION_ERROR",

        error:
          "OBITREND's image service is not configured correctly."
      });
    }

    return send(res, 500, {
      success: false,

      code:
        "IMAGE_GENERATION_FAILED",

      error:
        message ||
        "OBITREND could not generate the image. Your generation credit has been returned."
    });
  }
}
