import OpenAI from "openai";

import {
  spendCredit,
  refundCredit,
  getRedisConfig,
} from "./credits.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "12mb",
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
  if (!array.length) return "";

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
   REAL-WORLD CAMERA LOCATIONS
========================================================= */

const realLocations = [
  "real clothing shop",
  "busy clothing market",
  "modern fashion boutique",
  "local fashion store",
  "upscale clothing boutique",
  "shopping mall clothing store",
  "street fashion shop",
  "African clothing boutique",
  "busy fashion marketplace",
  "real department store",
  "modern retail store",
  "designer clothing showroom",
  "hotel fashion boutique",
  "urban shopping street",
  "premium shopping mall",
  "outdoor fashion market",
  "clean professional photography studio",
  "real apartment interior",
  "modern city street",
  "luxury hotel lobby",
  "beach resort",
  "poolside resort",
  "restaurant terrace",
];

/* =========================================================
   REAL CAMERA STYLES
========================================================= */

const cameraStyles = [
  "professional full-frame mirrorless camera photograph",
  "professional DSLR fashion photograph",
  "85mm professional portrait lens",
  "50mm professional fashion lens",
  "35mm realistic lifestyle photograph",
  "commercial fashion photography",
  "professional editorial photography",
  "natural documentary-style fashion photograph",
];

/* =========================================================
   LIGHTING
========================================================= */

const lightingStyles = [
  "natural window light",
  "soft natural daylight",
  "realistic indoor store lighting",
  "bright natural daylight",
  "soft afternoon sunlight",
  "natural overcast daylight",
  "realistic mall lighting",
  "professional softbox lighting",
  "subtle studio lighting",
];

/* =========================================================
   FEMALE MODEL OPTIONS
========================================================= */

const femaleFaces = [
  "natural adult female fashion model with realistic facial features",
  "beautiful adult woman with natural facial proportions",
  "professional adult female commercial model",
  "elegant adult female fashion model",
  "natural-looking adult woman with realistic skin texture",
  "adult African female fashion model with natural features",
  "adult woman with refined fashion-model features",
  "adult woman with realistic everyday beauty",
];

const femaleBodies = [
  "slim natural adult female body",
  "tall slim adult female fashion-model body",
  "curvy adult female body with natural proportions",
  "hourglass adult female body with realistic proportions",
  "athletic adult female body",
  "medium-build adult female body",
  "full-figure adult female fashion-model body",
  "petite adult female body",
  "natural pear-shaped adult female body",
  "balanced feminine adult body proportions",
];

const femaleHair = [
  "natural curly hair",
  "long wavy hair",
  "medium wavy hair",
  "long straight hair",
  "short natural hair",
  "natural afro hairstyle",
  "long braids",
  "medium braids",
  "shoulder-length hairstyle",
  "sleek straight hairstyle",
  "short bob hairstyle",
  "long layered hairstyle",
  "natural textured hairstyle",
];

/* =========================================================
   MALE MODEL OPTIONS
========================================================= */

const maleFaces = [
  "natural adult male fashion model with realistic facial features",
  "handsome adult male commercial model",
  "adult African male fashion model with natural features",
  "adult man with strong natural facial structure",
  "professional adult male fashion model",
  "natural-looking adult man with realistic skin texture",
];

const maleBodies = [
  "lean athletic adult male body",
  "slim adult male fashion-model body",
  "tall athletic adult male body",
  "broad-shouldered athletic adult male body",
  "medium-build adult male body",
  "muscular adult male body with natural proportions",
  "natural everyday adult male physique",
];

const maleHair = [
  "short textured haircut",
  "low fade haircut",
  "mid fade haircut",
  "short afro",
  "short curly hair",
  "clean buzz cut",
  "short waves",
  "modern tapered haircut",
  "natural textured hairstyle",
];

/* =========================================================
   POSES
========================================================= */

const poses = [
  "natural full-body standing pose",
  "natural three-quarter standing pose",
  "walking naturally toward the camera",
  "relaxed fashion pose",
  "professional ecommerce fashion pose",
  "natural street-fashion pose",
  "standing naturally inside a clothing shop",
  "walking through a clothing boutique",
  "casual editorial fashion pose",
  "natural seated fashion pose",
];

/* =========================================================
   BUILD PROMPT
========================================================= */

function buildPrompt(body) {
  const seed =
    clean(body.seed) ||
    `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;

  const gender = clean(
    body.gender ||
      body.modelGender ||
      body.sex ||
      "woman"
  ).toLowerCase();

  const isMale =
    gender === "male" ||
    gender === "man" ||
    gender === "men";

  const modelFace =
    clean(body.face) ||
    pick(
      isMale ? maleFaces : femaleFaces,
      seed + "-face"
    );

  const bodyType =
    clean(body.bodyType) ||
    pick(
      isMale ? maleBodies : femaleBodies,
      seed + "-body"
    );

  const hair =
    clean(body.hairStyle) ||
    pick(
      isMale ? maleHair : femaleHair,
      seed + "-hair"
    );

  const pose =
    clean(body.pose) ||
    pick(poses, seed + "-pose");

  const location =
    [
      clean(body.locationType),
      clean(body.city),
      clean(body.property),
    ]
      .filter(Boolean)
      .join(", ") ||
    pick(realLocations, seed + "-location");

  const camera =
    clean(body.camera) ||
    pick(cameraStyles, seed + "-camera");

  const lighting =
    clean(body.lighting) ||
    pick(lightingStyles, seed + "-lighting");

  const footwear =
    clean(
      body.footwear ||
        body.shoe ||
        body.shoes
    ) ||
    "realistic footwear that naturally matches the outfit";

  const clothingType =
    clean(
      body.clothingType ||
        body.garmentType ||
        body.outfitType
    ) ||
    "the exact uploaded garment";

  const clothingColor =
    clean(
      body.clothingColor ||
        body.color
    ) ||
    "the exact color shown in the uploaded garment";

  const clothingStyle =
    clean(
      body.clothingStyle ||
        body.style
    ) ||
    "natural professional fashion styling";

  const creativeDirection =
    clean(
      body.creativeDirection ||
        body.creative
    ) ||
    "realistic commercial fashion photography";

  return `
OBITREND AI FASHION CREATOR

CREATE ONE EXTREMELY PHOTOREALISTIC REAL-CAMERA PHOTOGRAPH.

The uploaded image is the PRIMARY PRODUCT REFERENCE.

The garment in the uploaded image is the actual product.

Do not redesign it.

Do not replace it.

Do not create a similar garment.

Do not invent another garment.

========================================================
ABSOLUTE GARMENT PRESERVATION
========================================================

Preserve the uploaded garment as accurately as possible.

Keep the same:

- garment category
- color
- pattern
- print
- polka dots
- stripes
- graphics
- logo
- collar
- neckline
- sleeves
- cuffs
- buttons
- button placement
- pockets
- pocket placement
- seams
- stitching
- hem
- silhouette
- proportions
- fabric appearance
- texture
- construction
- decorative details

The garment must remain recognizable as the SAME physical
garment shown in the uploaded image.

Do not change its color.

Do not change its pattern.

Do not add decorations.

Do not remove decorations.

Do not add pockets.

Do not remove pockets.

Do not change the collar.

Do not change the sleeves.

Do not change the buttons.

Do not turn the garment into another clothing type.

========================================================
MODEL
========================================================

Create a REALISTIC ADULT ${isMale ? "MAN" : "WOMAN"}.

FACE:
${modelFace}

BODY:
${bodyType}

HAIR:
${hair}

The person must look like a real adult human photographed
with a professional camera.

Natural skin texture.

Natural pores.

Natural hair.

Natural hands.

Natural fingers.

Natural feet.

Natural anatomy.

Natural body proportions.

No mannequin.

No doll.

No plastic skin.

No CGI human.

No cartoon.

No anime.

========================================================
CLOTHING
========================================================

CLOTHING TYPE:
${clothingType}

CLOTHING COLOR:
${clothingColor}

CLOTHING STYLE:
${clothingStyle}

FOOTWEAR:
${footwear}

The footwear must look physically real and correctly attached
to the feet.

No floating shoes.

No duplicated shoes.

No malformed feet.

========================================================
REAL CAMERA LOOK
========================================================

The image must look like an actual photograph taken by a
professional photographer.

CAMERA:
${camera}

LIGHTING:
${lighting}

Use realistic:

- exposure
- perspective
- lens rendering
- depth of field
- shadows
- reflections
- fabric folds
- wrinkles
- skin texture
- hair texture
- environmental details

The image should contain the tiny imperfections normally found
in real photography.

Do not make it look like an AI render.

Do not make it look like CGI.

Do not make it look like a 3D model.

Do not make the skin excessively smooth.

Do not use unrealistic perfect symmetry.

Do not use excessive artificial blur.

========================================================
REAL ENVIRONMENT
========================================================

LOCATION:
${location}

Create a believable physical environment.

If the location is a clothing shop or market, include realistic
background clothing, racks, shelves, hangers, signs and store
details where appropriate.

Background objects must remain secondary to the model and
garment.

The environment must have realistic perspective and lighting.

========================================================
POSE
========================================================

POSE:
${pose}

The pose must look physically natural.

Hands must be anatomically correct.

Feet must be anatomically correct.

The model must stand or move naturally.

========================================================
FASHION DIRECTION
========================================================

${creativeDirection}

Create a professional commercial fashion photograph while
keeping the uploaded garment as the most important element.

========================================================
IMPORTANT PHOTO STYLE
========================================================

Aim for the visual realism of a real photograph taken in an
ordinary clothing store or real-world location.

Natural camera perspective.

Natural ambient light.

Real background clutter.

Real fabric wrinkles.

Real clothing folds.

Real shadows.

Real skin texture.

Realistic depth of field.

Realistic color.

Realistic imperfections.

The final image must NOT look like a polished CGI advertisement
unless the user specifically selected a studio/editorial style.

========================================================
GARMENT FIT
========================================================

Adapt the MODEL to the garment.

Do NOT redesign the garment to fit the model.

If the garment is loose, keep it loose.

If the garment is oversized, keep it oversized.

If the garment is fitted, keep it fitted.

Preserve the original garment silhouette and proportions.

========================================================
FINAL QUALITY CHECK
========================================================

Before finalizing, compare the generated garment against the
uploaded reference.

Check:

1. Same garment type.
2. Same color.
3. Same pattern.
4. Same print.
5. Same collar.
6. Same sleeves.
7. Same cuffs.
8. Same buttons.
9. Same pockets.
10. Same silhouette.
11. Same length.
12. Same proportions.
13. Same important details.
14. Same fabric appearance.

If any of these change unnecessarily, prioritize the uploaded
garment reference.

FINAL RESULT:

A believable, high-quality photograph that looks as though a
real photographer used a professional camera to photograph
this exact garment on a real adult model.

No redesign.
No substitution.
No cartoon.
No CGI.
No plastic skin.
No mannequin.

OBITREND REAL CAMERA PHOTOGRAPHY MODE.
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

  /*
    Portrait:
    4:5, 5:4 portrait-style requests,
    9:16 and other vertical requests
    use the supported portrait canvas.
  */
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

  let creditSpent = false;
  let userId = "";
  let redis = null;

  try {
    /* =====================================================
       API KEY
    ===================================================== */

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        ok: false,
        error:
          "OPENAI_API_KEY is missing from Vercel Environment Variables.",
      });
    }

    /* =====================================================
       REQUEST BODY
    ===================================================== */

    const body =
      typeof req.body === "object" &&
      req.body !== null
        ? req.body
        : {};

    userId = clean(
      getValue(
        body,
        "userId",
        "obitrendUserId"
      )
    );

    if (!userId) {
      return res.status(400).json({
        ok: false,
        error:
          "A valid OBITREND user ID is required.",
      });
    }

    /* =====================================================
       REDIS / CREDITS
    ===================================================== */

    redis = getRedisConfig();

    if (!redis?.url || !redis?.token) {
      return res.status(500).json({
        ok: false,
        error:
          "OBITREND credit system is not configured.",
      });
    }

    /* =====================================================
       IMAGE INPUT
    ===================================================== */

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
          "No valid clothing image was received. Upload a JPG, PNG or WEBP image and try again.",
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

    const buffer = Buffer.from(
      imageBase64,
      "base64"
    );

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

    /* =====================================================
       FILE
    ===================================================== */

    const extension =
      extensionFromMime(mime);

    const imageFile = new File(
      [buffer],
      `obitrend-reference.${extension}`,
      {
        type: mime,
      }
    );

    /* =====================================================
       PROMPT / SIZE
    ===================================================== */

    const prompt =
      buildPrompt(body);

    const aspectRatio = clean(
      body.aspectRatio ||
        body.ratio,
      "4:5"
    );

    const size =
      getImageSize(aspectRatio);

    /* =====================================================
       SPEND CREDIT
    ===================================================== */

    const creditResult =
      await spendCredit(
        userId,
        redis
      );

    if (!creditResult?.success) {
      return res.status(402).json({
        ok: false,
        error:
          "You have no OBITREND image generations remaining.",
        balance:
          creditResult?.balance ?? 0,
      });
    }

    creditSpent = true;

    /* =====================================================
       OPENAI IMAGE EDIT
    ===================================================== */

    const result =
      await openai.images.edit({
        model: MODEL,

        image: imageFile,

        prompt,

        input_fidelity: "high",

        size,

        quality: "high",

        output_format: "png",

        n: 1,
      });

    /* =====================================================
       RESPONSE
    ===================================================== */

    const image =
      result?.data?.[0];

    if (!image?.b64_json) {
      const invalidImageError =
        new Error(
          "The image service returned an invalid image response."
        );

      invalidImageError.status = 502;
      invalidImageError.type =
        "invalid_image_response";
      invalidImageError.code =
        "MISSING_B64_JSON";

      throw invalidImageError;
    }

    const imageUrl =
      `data:image/png;base64,${image.b64_json}`;

    return res.status(200).json({
      ok: true,

      imageUrl,

      url: imageUrl,

      image: imageUrl,

      generatedImage: imageUrl,

      model: MODEL,

      aspectRatio,

      size,

      message:
        "OBITREND real-camera photorealistic fashion image generated successfully.",
    });

  } catch (error) {
    console.error(
      "OBITREND GENERATION ERROR:",
      error
    );

    /* =====================================================
       REFUND CREDIT AFTER FAILED GENERATION
    ===================================================== */

    if (
      creditSpent &&
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
          "OBITREND CREDIT REFUND ERROR:",
          refundError
        );
      }
    }

    /* =====================================================
       ERROR STATUS
    ===================================================== */

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

    if (status === 400) {
      message =
        error?.message ||
        "The image request was rejected. Check the uploaded image and generation options.";
    }

    if (status === 401) {
      message =
        "OpenAI API authentication failed. Check OPENAI_API_KEY in Vercel.";
    }

    if (status === 403) {
      message =
        "The OpenAI account or API key is not permitted to use this image service.";
    }

    if (status === 404) {
      message =
        `The image model "${MODEL}" was not found or is not available to this API key.`;
    }

    if (status === 413) {
      message =
        "The uploaded image or request is too large.";
    }

    if (status === 429) {
      message =
        "OpenAI API rate or billing limit reached. Check your OpenAI API usage and billing.";
    }

    if (status >= 500) {
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
