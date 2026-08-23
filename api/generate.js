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
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";

  return "jpg";
}


/* =========================================================
   MODEL OPTIONS
========================================================= */

const femaleFaces = [
  "beautiful adult female fashion model with realistic facial features",
  "natural adult woman with realistic facial proportions",
  "professional adult female commercial model",
  "elegant adult female fashion model",
  "adult African female fashion model with natural features",
  "natural-looking adult woman with realistic skin texture"
];

const femaleBodies = [
  "slim natural adult female body",
  "tall slim adult female fashion-model body",
  "curvy adult female body with natural proportions",
  "hourglass adult female body with realistic proportions",
  "athletic adult female body",
  "medium-build adult female body",
  "full-figure adult female fashion-model body",
  "petite adult female body"
];

const maleFaces = [
  "handsome adult male fashion model with realistic facial features",
  "natural adult man with realistic facial proportions",
  "professional adult male commercial model",
  "adult African male fashion model with natural features",
  "natural-looking adult man with realistic skin texture"
];

const maleBodies = [
  "lean athletic adult male body",
  "slim adult male fashion-model body",
  "tall athletic adult male body",
  "broad-shouldered athletic adult male body",
  "medium-build adult male body",
  "muscular adult male body with natural proportions"
];

const poses = [
  "natural full-body standing pose",
  "natural three-quarter standing pose",
  "walking naturally toward the camera",
  "relaxed professional fashion pose",
  "professional ecommerce fashion pose",
  "natural street-fashion pose",
  "standing naturally inside a clothing shop",
  "casual editorial fashion pose"
];

const cameraStyles = [
  "professional full-frame mirrorless camera photograph",
  "professional DSLR fashion photograph",
  "85mm professional portrait lens",
  "50mm professional fashion lens",
  "35mm realistic lifestyle photograph",
  "commercial fashion photography",
  "professional editorial photography"
];

const lightingStyles = [
  "natural window light",
  "soft natural daylight",
  "realistic indoor store lighting",
  "bright natural daylight",
  "soft afternoon sunlight",
  "realistic mall lighting",
  "professional softbox lighting"
];

const locations = [
  "real clothing shop",
  "modern fashion boutique",
  "shopping mall clothing store",
  "designer clothing showroom",
  "premium shopping mall",
  "real apartment interior",
  "modern city street",
  "luxury hotel lobby",
  "beach resort",
  "poolside resort",
  "restaurant terrace",
  "professional photography studio"
];


/* =========================================================
   DETERMINISTIC RANDOM PICK
========================================================= */

function pick(list, seed) {
  if (!list.length) return "";

  let hash = 0;

  for (let i = 0; i < seed.length; i++) {
    hash =
      (hash << 5) -
      hash +
      seed.charCodeAt(i);

    hash |= 0;
  }

  return list[Math.abs(hash) % list.length];
}


/* =========================================================
   BUILD PROMPT
========================================================= */

function buildPrompt(body) {

  const seed =
    clean(
      body.seed,
      `${Date.now()}-${Math.random()}`
    );

  const gender =
    clean(
      body.gender ||
      body.modelGender ||
      body.sex,
      "female"
    ).toLowerCase();

  const isMale =
    ["male", "man", "men"].includes(gender);


  const face =
    clean(body.face) ||
    pick(
      isMale
        ? maleFaces
        : femaleFaces,
      seed + "face"
    );


  const bodyType =
    clean(body.bodyType) ||
    pick(
      isMale
        ? maleBodies
        : femaleBodies,
      seed + "body"
    );


  const pose =
    clean(body.pose) ||
    pick(
      poses,
      seed + "pose"
    );


  const camera =
    clean(body.camera) ||
    pick(
      cameraStyles,
      seed + "camera"
    );


  const lighting =
    clean(body.lighting) ||
    pick(
      lightingStyles,
      seed + "light"
    );


  const location =
    [
      clean(body.locationType),
      clean(body.city),
      clean(body.property)
    ]
      .filter(Boolean)
      .join(", ") ||
    pick(
      locations,
      seed + "location"
    );


  const footwear =
    clean(
      body.footwear ||
      body.shoe ||
      body.shoes,
      "realistic footwear that naturally matches the selected outfit"
    );


  const clothingType =
    clean(
      body.clothingType ||
      body.garmentType ||
      body.outfitType,
      "the exact uploaded garment"
    );


  const clothingColor =
    clean(
      body.clothingColor ||
      body.color,
      "the original color shown in the uploaded garment"
    );


  const clothingStyle =
    clean(
      body.clothingStyle,
      "professional fashion styling without changing the garment construction"
    );


  const creativeDirection =
    clean(
      body.creativeDirection ||
      body.creative,
      "realistic commercial fashion photography"
    );


  return `

OBITREND AI FASHION CREATOR

EXACT GARMENT + USER COLOR MODE


CREATE ONE EXTREMELY PHOTOREALISTIC PHOTOGRAPH.

The uploaded image is the PRIMARY and AUTHORITATIVE
GARMENT REFERENCE.

The uploaded garment is the exact physical product.

========================================================
ABSOLUTE GARMENT PRESERVATION
========================================================

Preserve the uploaded garment's physical construction.

Keep exactly:

- garment category
- original length
- original hemline
- original silhouette
- original proportions
- original width
- original neckline
- original collar
- original sleeve length
- original sleeve shape
- original cuffs
- original seams
- original stitching
- original pockets
- original pocket positions
- original buttons
- original button positions
- original graphics
- original logos
- original stripe layout
- original pattern
- original fabric appearance
- original texture
- original construction

========================================================
CRITICAL LENGTH LOCK
========================================================

THE GARMENT LENGTH MUST NOT CHANGE.

The generated garment must have the SAME LENGTH
as the uploaded garment.

The hemline must remain at the SAME relative
position on the model's body as shown in the
uploaded reference.

DO NOT shorten the garment.

DO NOT lengthen the garment.

DO NOT turn a T-shirt into a dress.

DO NOT turn a shirt into a tunic.

DO NOT turn a top into a gown.

DO NOT turn shorts into trousers.

DO NOT turn trousers into shorts.

DO NOT change the garment category.

DO NOT change the silhouette.

DO NOT redesign the garment to fit the model.

ADAPT THE MODEL TO THE GARMENT.

DO NOT ADAPT THE GARMENT TO THE MODEL.

If the garment is oversized, keep it oversized.

If it is loose, keep it loose.

If it is fitted, keep it fitted.

If it is cropped, keep it cropped.

If it is long, keep it long.

If it is short, keep it short.

========================================================
USER COLOR CONTROL
========================================================

USER SELECTED COLOR:

${clothingColor}

If the user selected a specific color,
perform a RECOLOR operation.

CHANGE ONLY THE PRIMARY GARMENT COLOR.

Keep everything else unchanged.

Keep:

- same garment length
- same hemline
- same silhouette
- same proportions
- same pattern
- same stripes
- same print
- same logo
- same collar
- same neckline
- same sleeves
- same cuffs
- same seams
- same pockets
- same buttons
- same fabric texture
- same construction

DO NOT redesign the garment.

DO NOT change the garment length.

DO NOT change the garment shape.

DO NOT change the garment category.

DO NOT change the pattern.

DO NOT change stripe arrangement.

DO NOT change the collar.

DO NOT change the sleeves.

DO NOT change the hemline.

Only recolor the garment.

If the selected color is
"Original", "Keep Original", or equivalent,
preserve the uploaded color.

========================================================
CLOTHING REQUEST
========================================================

GARMENT TYPE:

${clothingType}

REQUESTED COLOR:

${clothingColor}

STYLE DIRECTION:

${clothingStyle}

FOOTWEAR:

${footwear}

========================================================
REAL ADULT MODEL
========================================================

Create a realistic ADULT
${isMale ? "MAN" : "WOMAN"}.

FACE:

${face}

BODY:

${bodyType}

The model must look like a real adult human.

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
POSE
========================================================

${pose}

The pose must be physically natural.

Prefer a full-body or three-quarter view.

The entire garment must be visible.

The complete garment length and hemline
must be clearly visible.

========================================================
REAL CAMERA PHOTOGRAPHY
========================================================

CAMERA:

${camera}

LIGHTING:

${lighting}

The result must look like an actual photograph
taken by a professional photographer.

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

Do not make it look like CGI.

Do not make it look like a 3D render.

Do not make skin excessively smooth.

Do not create unrealistic symmetry.

========================================================
REAL ENVIRONMENT
========================================================

LOCATION:

${location}

Create a believable physical environment.

Use realistic perspective.

Use realistic lighting.

Keep background objects secondary
to the model and garment.

========================================================
CREATIVE DIRECTION
========================================================

${creativeDirection}

Create a professional fashion photograph
while keeping the uploaded garment as
the most important product.

========================================================
FINAL GARMENT VERIFICATION
========================================================

Before finalizing, compare the generated
garment against the uploaded reference.

Verify:

1. Same garment type.
2. Same LENGTH.
3. Same HEMLINE.
4. Same SILHOUETTE.
5. Same PROPORTIONS.
6. Same COLLAR.
7. Same NECKLINE.
8. Same SLEEVE LENGTH.
9. Same SLEEVE SHAPE.
10. Same PATTERN.
11. Same STRIPES.
12. Same POCKETS.
13. Same BUTTONS.
14. Same FABRIC APPEARANCE.
15. USER REQUESTED COLOR applied correctly.

If there is a conflict between fashion styling
and garment preservation:

ALWAYS PRIORITIZE THE UPLOADED GARMENT.

FINAL RESULT:

A believable real-camera photograph of
THIS EXACT GARMENT on a real adult model.

No garment redesign.

No garment substitution.

No length change.

No silhouette change.

No pattern change.

No construction change.

OBITREND EXACT GARMENT
+ USER COLOR MODE.

`;
}


/* =========================================================
   IMAGE SIZE
========================================================= */

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
    ratio.includes("landscape") ||
    ratio.includes("5:4")
  ) {
    return "1536x1024";
  }


  return "1024x1536";
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


  if (
    req.method === "OPTIONS"
  ) {
    return res.status(200).end();
  }


  if (
    req.method !== "POST"
  ) {

    return res.status(405).json({
      ok: false,
      error: "Method not allowed. Use POST."
    });

  }


  let creditSpent = false;

  let userId = "";

  let redis = null;


  try {

    if (
      !process.env.OPENAI_API_KEY
    ) {

      return res.status(500).json({
        ok: false,
        error:
          "OPENAI_API_KEY is missing from Vercel Environment Variables."
      });

    }


    const body =
      typeof req.body === "object" &&
      req.body !== null
        ? req.body
        : {};


    userId =
      clean(
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


    redis =
      getRedisConfig();


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


    const rawImage =
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
        rawImage
      );


    if (!imageBase64) {

      return res.status(400).json({
        ok: false,
        error:
          "No valid clothing image was received. Upload a JPG, PNG or WEBP image and try again."
      });

    }


    const mime =
      getMimeType(
        rawImage
      );


    if (
      !mime.startsWith("image/")
    ) {

      return res.status(400).json({
        ok: false,
        error:
          "The uploaded file is not a valid image."
      });

    }


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


    const extension =
      extensionFromMime(
        mime
      );


    const imageFile =
      new File(
        [buffer],
        `obitrend-reference.${extension}`,
        {
          type: mime
        }
      );


    const clothingColor = clean(
    getValue(body, "clothingColor"),
    "original colour"
);

const prompt = `
${buildPrompt(body)}

CLOTHING COLOR CONTROL:
The user selected: ${clothingColor}.

If the selected color is NOT "original colour":
- Recolor the uploaded garment to exactly the selected color.
- Change ONLY the garment's color.
- Preserve the exact garment design, pattern, stripes, graphics, fabric appearance, neckline, sleeves, seams, proportions, fit and ORIGINAL LENGTH.
- Do NOT shorten, lengthen, crop, reshape, redesign, replace or substitute the garment.
- If the garment has stripes or multiple color areas, preserve the exact pattern and apply the requested color naturally without destroying the pattern.
- Keep the garment clearly recognizable as the same uploaded garment.

If the selected color is "original colour":
- Preserve the garment's original colors exactly.
`;


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


    const result =
      await openai.images.edit({

        model: MODEL,

        image: imageFile,

        prompt,

        input_fidelity:
          "high",

        size,

        quality:
          "high",

        output_format:
          "png",

        n: 1

      });


    const image =
      result?.data?.[0];


    if (
      !image?.b64_json
    ) {

      const imageError =
        new Error(
          "The image service returned an invalid image response."
        );

      imageError.status =
        502;

      imageError.type =
        "invalid_image_response";

      imageError.code =
        "MISSING_B64_JSON";

      throw imageError;

    }


    const imageUrl =
      `data:image/png;base64,${image.b64_json}`;


    return res.status(200).json({

      ok: true,

      imageUrl,

      url: imageUrl,

      image: imageUrl,

      generatedImage:
        imageUrl,

      model: MODEL,

      aspectRatio,

      size,

      message:
        "OBITREND exact-garment photorealistic fashion image generated successfully."

    });


  } catch (error) {

    console.error(
      "OBITREND GENERATION ERROR:",
      error
    );


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


    if (
      status === 401
    ) {

      message =
        "OpenAI API authentication failed. Check OPENAI_API_KEY in Vercel.";

    }


    if (
      status === 403
    ) {

      message =
        "The OpenAI account or API key is not permitted to use this image service.";

    }


    if (
      status === 404
    ) {

      message =
        `The image model "${MODEL}" was not found or is not available to this API key.`;

    }


    if (
      status === 413
    ) {

      message =
        "The uploaded image or request is too large.";

    }


    if (
      status === 429
    ) {

      message =
        "OpenAI API rate or billing limit reached. Check your OpenAI API usage and billing.";

    }


    if (
      status >= 500
    ) {

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
          error?.name || null

      }

    });

  }

}
