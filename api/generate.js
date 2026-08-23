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

export const maxDuration = 60;

const MODEL =
  process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";


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

  return value.length >= 100
    ? value
    : null;
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
   IMAGE SIZE
========================================================= */

function getImageSize(value) {

  const ratio = clean(
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
    ratio.includes("5:4") ||
    ratio.includes("landscape")
  ) {
    return "1536x1024";
  }


  return "1024x1536";
}


/* =========================================================
   BUILD PROMPT
========================================================= */

function buildPrompt(body) {

  const gender = clean(
    getValue(
      body,
      "gender",
      "modelGender",
      "sex"
    ),
    "woman"
  );


  const model = clean(
    getValue(body, "model"),
    "professional adult fashion model"
  );


  const bodyType = clean(
    getValue(
      body,
      "bodyType",
      "body"
    ),
    "natural proportional adult fashion-model body"
  );


  const face = clean(
    getValue(body, "face"),
    "natural realistic adult facial features"
  );


  const pose = clean(
    getValue(body, "pose"),
    "confident natural full-body fashion pose"
  );


  const footwear = clean(
    getValue(
      body,
      "footwear",
      "shoe",
      "shoes"
    ),
    "realistic footwear that naturally matches the outfit"
  );


  const clothingType = clean(
    getValue(
      body,
      "clothingType",
      "garmentType",
      "outfitType"
    ),
    "the exact uploaded garment"
  );


  const clothingColor = clean(
    getValue(
      body,
      "clothingColor",
      "color"
    ),
    "original colour"
  );


  const clothingStyle = clean(
    getValue(
      body,
      "clothingStyle",
      "style"
    ),
    "premium fashion styling"
  );


  const fashionStyle = clean(
    getValue(
      body,
      "fashionStyle"
    ),
    "luxury fashion editorial"
  );


  const creativeDirection = clean(
    getValue(
      body,
      "creativeDirection",
      "creative"
    ),
    "professional commercial fashion campaign"
  );


  const location =
    [
      clean(body.locationType),
      clean(body.city),
      clean(body.property),
    ]
      .filter(Boolean)
      .join(", ") ||
    "premium modern fashion location";


  const vehicle = clean(
    getValue(body, "vehicle"),
    "no vehicle required"
  );


  const camera = clean(
    getValue(body, "camera"),
    "professional full-frame fashion photography"
  );


  const lighting = clean(
    getValue(body, "lighting"),
    "soft natural daylight with realistic shadows"
  );


  const recolorInstruction =
    clothingColor.toLowerCase() === "original" ||
    clothingColor.toLowerCase() === "original colour" ||
    clothingColor.toLowerCase() === "auto detect"

      ? "Preserve the original garment colors exactly as shown in the reference."

      : `Change ONLY the garment color to ${clothingColor}. Preserve every other garment detail exactly.`;


  return `
OBITREND AI FASHION CREATOR

PROFESSIONAL GARMENT REFERENCE EDIT

Create ONE extremely photorealistic professional
fashion photograph using the uploaded image as the
PRIMARY and AUTHORITATIVE clothing reference.

THE UPLOADED GARMENT IS THE ACTUAL PRODUCT.

Do not treat it as inspiration.

Do not replace it with a similar garment.


==================================================
ABSOLUTE GARMENT FIDELITY
==================================================

Preserve the exact garment identity.

Preserve:

- garment type
- garment shape
- garment silhouette
- garment length
- garment proportions
- neckline
- collar
- sleeves
- sleeve length
- cuffs
- waistband
- hem
- pockets
- buttons
- zippers
- straps
- seams
- stitching
- fabric texture
- fabric appearance
- folds
- pattern
- stripes
- checks
- graphics
- prints
- logos
- decorative elements
- construction details
- panel placement

Do NOT redesign the garment.

Do NOT simplify the garment.

Do NOT replace the garment.

Do NOT invent another garment.

Do NOT shorten the garment.

Do NOT lengthen the garment.

Do NOT crop the garment.

Do NOT change the garment construction.

Do NOT remove garment details.

Do NOT add unauthorized garment details.

Keep the uploaded garment clearly recognizable
as the same real-world garment.


==================================================
COLOR CONTROL
==================================================

Selected garment color:

${clothingColor}

${recolorInstruction}

If recoloring is requested:

- Change ONLY the garment color.
- Preserve the exact garment design.
- Preserve the exact garment pattern.
- Preserve stripes.
- Preserve graphics.
- Preserve seams.
- Preserve stitching.
- Preserve neckline.
- Preserve sleeves.
- Preserve proportions.
- Preserve original garment length.
- Preserve fabric appearance.

Do not redesign the garment while recoloring it.


==================================================
MODEL
==================================================

MODEL GENDER:

${gender}

MODEL DESCRIPTION:

${model}

FACE:

${face}

BODY TYPE:

${bodyType}

Create a realistic ADULT fashion model.

Use realistic:

- human anatomy
- facial features
- skin texture
- hair
- hands
- fingers
- feet
- body proportions


==================================================
POSE
==================================================

${pose}

The pose must be:

- natural
- physically believable
- professional
- commercially suitable

Avoid:

- distorted hands
- duplicated fingers
- duplicated limbs
- malformed feet
- unnatural posture
- floating body parts


==================================================
FOOTWEAR
==================================================

${footwear}

Footwear must:

- look realistic
- match the outfit
- be correctly attached to the feet
- touch the ground naturally

Do not create:

- floating shoes
- duplicated shoes
- malformed shoes


==================================================
LOCATION
==================================================

${location}

Use the selected location as a realistic
professional fashion photography environment.

The environment must support the garment
without distracting from it.

Vehicle context if appropriate:

${vehicle}


==================================================
CAMERA
==================================================

${camera}

Use:

- realistic perspective
- realistic depth of field
- accurate proportions
- professional photographic detail
- natural lens behavior


==================================================
LIGHTING
==================================================

${lighting}

Preserve:

- realistic shadows
- realistic reflections
- accurate skin tones
- accurate garment colors
- realistic fabric texture


==================================================
FASHION DIRECTION
==================================================

Fashion style:

${fashionStyle}

Creative direction:

${creativeDirection}

Create a premium professional fashion
campaign photograph suitable for a real
fashion brand.


==================================================
PHOTOREALISM
==================================================

The final result must look like a real
professional photograph.

Use realistic:

- skin pores
- facial anatomy
- hair
- hands
- fingers
- feet
- body proportions
- garment folds
- fabric texture
- shadows
- reflections
- lighting
- perspective
- depth of field

NO cartoon.

NO anime.

NO illustration.

NO painting.

NO plastic skin.

NO CGI appearance.

NO distorted anatomy.

NO extra fingers.

NO duplicated limbs.

NO malformed hands.

NO warped clothing.


==================================================
COMMERCIAL PRESENTATION
==================================================

Use an adult model aged 18+.

Make the fashion presentation:

- natural
- confident
- professional
- non-sexual
- suitable for a commercial clothing advertisement


==================================================
PRIORITY ORDER
==================================================

1. EXACT UPLOADED GARMENT
2. GARMENT VISIBILITY
3. GARMENT CONSTRUCTION
4. PHOTOREALISTIC HUMAN ANATOMY
5. MODEL
6. POSE
7. FOOTWEAR
8. LOCATION
9. LIGHTING
10. CREATIVE DIRECTION

If any creative instruction conflicts
with the uploaded garment:

ALWAYS PRIORITIZE THE UPLOADED GARMENT.


==================================================
FINAL RESULT
==================================================

Create ONE believable professional fashion
photograph of THIS EXACT UPLOADED GARMENT
on a real adult model.

No garment redesign.

No garment substitution.

No length change.

No silhouette change.

No unauthorized pattern change.

No construction change.

No unauthorized color change.

OBITREND EXACT GARMENT.
`;
}


/* =========================================================
   MAIN API
========================================================= */

export default async function handler(
  req,
  res
) {

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
      error: "Method not allowed. Use POST."
    });

  }


  let creditSpent = false;

  let userId = "";

  let redis = null;


  try {

    /* =====================================================
       CHECK OPENAI KEY
    ===================================================== */

    if (!process.env.OPENAI_API_KEY) {

      return res.status(500).json({
        ok: false,
        error:
          "OPENAI_API_KEY is missing from Vercel Environment Variables."
      });

    }


    /* =====================================================
       REQUEST BODY
    ===================================================== */

    const body = req.body || {};


    /* =====================================================
       USER ID
    ===================================================== */

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
          "A valid OBITREND user ID is required."
      });

    }


    /* =====================================================
       REDIS
    ===================================================== */

    redis = getRedisConfig();


    if (
      !redis?.url ||
      !redis?.token
    ) {

      return res.status(500).json({
        ok: false,
        error:
          "OBITREND credit system is not configured."
      });

    }


    /* =====================================================
       GET UPLOADED IMAGE
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
          "No valid clothing image was received. Upload a JPG, PNG or WEBP image and try again."
      });

    }


    /* =====================================================
       IMAGE MIME TYPE
    ===================================================== */

    const mime =
      getMimeType(rawImage);


    if (!mime.startsWith("image/")) {

      return res.status(400).json({
        ok: false,
        error:
          "The uploaded file is not a valid image."
      });

    }


    /* =====================================================
       IMAGE BUFFER
    ===================================================== */

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
          "The clothing image is too large. Please use an image under 9MB."
      });

    }


    if (
      buffer.length < 1000
    ) {

      return res.status(400).json({
        ok: false,
        error:
          "The uploaded image appears to be empty or corrupted."
      });

    }


    /* =====================================================
       CREATE IMAGE FILE
    ===================================================== */

    const extension =
      extensionFromMime(mime);


    const imageFile =
      new File(
        [buffer],
        `obitrend-reference.${extension}`,
        {
          type: mime
        }
      );


    /* =====================================================
       PROMPT
    ===================================================== */

    const prompt =
      buildPrompt(body);


    /* =====================================================
       IMAGE RATIO
    ===================================================== */

    const aspectRatio =
      clean(
        body.aspectRatio ||
        body.ratio,
        "4:5"
      );


    const size =
      getImageSize(
        aspectRatio
      );


    /* =====================================================
       SPEND CREDIT
    ===================================================== */

    const creditResult =
      await spendCredit(
        userId,
        redis
      );


    if (
      !creditResult?.success
    ) {

      return res.status(402).json({
        ok: false,
        error:
          "You have no OBITREND image generations remaining.",
        balance:
          creditResult?.balance ?? 0
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

        size,

        quality: "medium",

      });


    /* =====================================================
       READ GENERATED IMAGE
    ===================================================== */

    const images =
      (result?.data || [])
        .map((item) => {

          if (
            item?.b64_json
          ) {

            return `data:image/png;base64,${item.b64_json}`;

          }


          if (
            item?.url
          ) {

            return item.url;

          }


          return null;

        })
        .filter(Boolean);


    /* =====================================================
       NO IMAGE RETURNED
    ===================================================== */

    if (
      !images.length
    ) {

      const imageError =
        new Error(
          "The image service returned no valid generated image data."
        );


      imageError.status =
        502;

      imageError.type =
        "invalid_image_response";

      imageError.code =
        "MISSING_IMAGE_DATA";


      throw imageError;

    }


    /* =====================================================
       SUCCESS
    ===================================================== */

    return res.status(200).json({

      ok: true,

      success: true,

      imageUrl:
        images[0],

      url:
        images[0],

      image:
        images[0],

      generatedImage:
        images[0],

      images,

      count:
        images.length,

      model:
        MODEL,

      aspectRatio,

      size,

      message:
        "OBITREND photorealistic fashion image generated successfully."

    });


  } catch (error) {

    console.error(
      "OBITREND GENERATION ERROR:",
      error
    );


    /* =====================================================
       REFUND CREDIT
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

      } catch (
        refundError
      ) {

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
      Number.isInteger(
        error?.status
      ) &&
      error.status >= 400

        ? error.status

        : 500;


    let message =
      typeof error?.message === "string" &&
      error.message

        ? error.message

        : "The image generation service failed.";


    /* =====================================================
       SPECIFIC ERRORS
    ===================================================== */

    if (
      status === 401
    ) {

      message =
        "OpenAI API authentication failed. Check OPENAI_API_KEY in Vercel.";

    }


    else if (
      status === 403
    ) {

      message =
        "The OpenAI account or API key is not permitted to use the selected image model.";

    }


    else if (
      status === 404
    ) {

      message =
        `The image model "${MODEL}" was not found or is not available to this API key.`;

    }


    else if (
      status === 413
    ) {

      message =
        "The uploaded image or request is too large.";

    }


    else if (
      status === 429
    ) {

      message =
        "OpenAI API rate or billing limit reached. Check your OpenAI API usage and billing.";

    }


    /* =====================================================
       RETURN ERROR
    ===================================================== */

    return res.status(status).json({

      ok: false,

      error:
        message,

      diagnostic: {

        status,

        model:
          MODEL,

        type:
          error?.type || null,

        code:
          error?.code || null,

        name:
          error?.name || null

      }

    });

  }

}
