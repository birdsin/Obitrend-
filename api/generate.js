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
  "beautiful adult woman with oval facial structure and natural realistic features",
  "beautiful adult woman with softly defined facial features",
  "adult woman with refined high-fashion facial structure",
  "adult woman with elegant symmetrical facial proportions",
  "adult woman with naturally rounded facial features",
  "adult woman with softly angular facial structure",
  "adult woman with defined cheekbones and natural features",
  "adult woman with subtle cheekbones and realistic proportions",
  "adult woman with a graceful oval face",
  "adult woman with a heart-shaped face",
  "adult woman with a softly square face",
  "adult woman with a naturally elongated face",
  "adult woman with a balanced facial structure",
  "adult woman with a refined editorial fashion face",
  "adult woman with a commercial fashion-model face",
  "adult woman with a natural relaxed expression",
  "adult woman with a confident professional expression",
  "adult woman with a subtle friendly expression",
  "adult woman with a sophisticated editorial expression",
  "adult woman with a calm natural expression",
  "adult African woman with natural realistic facial features",
  "adult West African woman with realistic facial proportions",
  "adult Black woman with natural facial features",
  "adult woman with deep natural skin tone and realistic features",
  "adult woman with rich brown skin and realistic facial structure",
  "adult woman with warm brown skin and natural features",
  "adult woman with medium-brown skin and realistic features",
  "adult woman with golden-brown skin and natural features",
  "adult woman with light-brown skin and realistic facial proportions",
  "adult woman with fair skin and natural realistic features",
  "adult woman with realistic high-fashion editorial facial structure",
  "adult woman with realistic commercial beauty-model facial structure",
  "adult woman with natural runway-model facial structure",
  "adult woman with realistic lifestyle-model facial structure",
  "adult woman with polished professional fashion-model features",
  "adult woman with naturally imperfect realistic facial features",
  "adult woman with realistic human facial asymmetry",
  "adult woman with authentic natural facial proportions",
  "adult woman with photorealistic adult facial anatomy",
  "adult woman with unique natural facial identity"
];

const femaleBodies = [
  "slim natural adult female body",
  "tall slim adult female fashion-model body",
  "tall elegant adult female body",
  "petite adult female body",
  "petite slim adult female body",
  "medium-build adult female body",
  "lean athletic adult female body",
  "fit athletic adult female body",
  "toned adult female body",
  "curvy adult female body with natural proportions",
  "soft-curvy adult female body",
  "hourglass adult female body with realistic proportions",
  "balanced hourglass adult female body",
  "pear-shaped adult female body",
  "straight natural adult female body",
  "rectangle-shaped adult female body",
  "athletic fashion-model physique",
  "slender editorial fashion-model physique",
  "tall runway-model physique",
  "commercial fashion-model physique",
  "natural everyday adult female physique",
  "medium-height natural female physique",
  "long-legged adult female fashion-model body",
  "long-torso adult female body",
  "short-torso adult female body",
  "full-figure adult female fashion-model body",
  "plus-size adult female fashion-model body",
  "strong athletic adult female physique",
  "natural soft-bodied adult female physique",
  "realistic proportional adult female body"
];

const maleFaces = [
  "handsome adult male face with natural realistic features",
  "adult man with a strong defined jawline",
  "adult man with a softly defined jawline",
  "adult man with an angular facial structure",
  "adult man with an oval facial structure",
  "adult man with a naturally square face",
  "adult man with refined facial proportions",
  "adult man with balanced masculine facial features",
  "adult man with defined cheekbones",
  "adult man with subtle natural cheekbones",
  "adult man with a confident professional expression",
  "adult man with a relaxed natural expression",
  "adult man with a sophisticated editorial expression",
  "adult man with a calm natural expression",
  "adult man with a commercial fashion-model face",
  "adult man with a high-fashion editorial face",
  "adult man with a professional runway-model facial structure",
  "adult man with a natural lifestyle-model face",
  "adult man with a clean-shaven professional face",
  "adult man with short neatly groomed beard",
  "adult man with light natural stubble",
  "adult man with neatly groomed moustache and beard",
  "adult man with subtle beard and defined facial features",
  "adult African man with natural realistic facial features",
  "adult West African man with realistic facial proportions",
  "adult Black man with natural realistic facial features",
  "adult man with deep natural skin tone and realistic features",
  "adult man with rich brown skin and realistic facial structure",
  "adult man with warm brown skin and natural features",
  "adult man with medium-brown skin and realistic features",
  "adult man with golden-brown skin and natural features",
  "adult man with light-brown skin and realistic facial proportions",
  "adult man with fair natural skin and realistic features",
  "adult man with realistic high-fashion editorial facial structure",
  "adult man with realistic commercial fashion-model facial structure",
  "adult man with realistic lifestyle-model facial structure",
  "adult man with polished professional fashion-model features",
  "adult man with naturally imperfect realistic facial features",
  "adult man with realistic human facial asymmetry",
  "adult man with authentic natural facial proportions",
  "adult man with photorealistic adult facial anatomy",
  "adult man with unique natural facial identity"
];

const maleBodies = [
  "lean athletic adult male body",
  "slim adult male fashion-model body",
  "tall athletic adult male body",
  "tall slim adult male body",
  "broad-shouldered athletic adult male body",
  "muscular adult male body with natural proportions",
  "medium-build adult male body",
  "slender adult male body",
  "fit masculine adult male body",
  "strong athletic adult male physique",
  "relaxed natural adult male physique",
  "tall slim editorial male physique",
  "broad-chested fashion-model physique",
  "balanced commercial-model physique",
  "natural everyday adult male physique",
  "lean runway-model physique",
  "toned athletic adult male physique",
  "long-legged adult male fashion-model body",
  "medium-height athletic adult male body",
  "natural proportional adult male body",
  "slightly muscular adult male body",
  "athletic lifestyle-model physique",
  "slim commercial fashion-model physique",
  "strong masculine fashion-model physique",
  "natural realistic adult male proportions",
  "fit lean adult male physique",
  "tall elegant adult male physique",
  "medium-build commercial male physique",
  "natural relaxed male physique",
  "realistic proportional adult male body"
];

const poses = [
  "confident natural full-body standing pose",
  "relaxed editorial standing pose",
  "full-body professional fashion pose",
  "walking naturally toward the camera",
  "walking naturally across the scene",
  "standing with one hand naturally positioned",
  "standing with both arms naturally relaxed",
  "casual streetwear fashion pose",
  "professional ecommerce catalog pose",
  "three-quarter fashion pose",
  "relaxed seated fashion pose",
  "confident runway-inspired pose",
  "natural fashion campaign pose",
  "premium commercial fashion pose",
  "elegant editorial fashion pose",
  "natural candid fashion pose",
  "standing beside a luxury vehicle",
  "standing beside a modern building",
  "standing naturally inside a luxury hotel",
  "standing naturally inside a premium boutique",
  "standing naturally inside a shopping mall",
  "natural pose inside a modern restaurant",
  "natural pose on a city street",
  "natural pose at a luxury resort",
  "natural poolside fashion pose",
  "natural beach-resort fashion pose",
  "walking through a luxury hotel lobby",
  "standing near a modern architectural background",
  "confident professional catalog pose",
  "relaxed luxury lifestyle pose",
  "modern urban fashion pose",
  "high-end campaign standing pose",
  "natural full-body lifestyle pose",
  "professional front-facing catalog pose",
  "professional three-quarter catalog pose",
  "natural side-angle fashion pose",
  "walking editorial fashion pose",
  "relaxed standing editorial pose",
  "confident commercial campaign pose",
  "natural seated lifestyle pose",
  "elegant seated editorial pose",
  "natural leaning pose",
  "professional pose beside architectural surroundings",
  "luxury campaign pose beside a premium vehicle",
  "natural pose near a swimming pool",
  "natural pose on a rooftop",
  "natural pose inside a modern apartment",
  "natural pose inside a luxury house",
  "natural pose in a premium showroom",
  "natural pose inside a modern airport",
  "confident fashion campaign pose with natural posture"
];

const cameraStyles = [
  "professional full-frame mirrorless fashion photograph",
  "professional DSLR fashion campaign photograph",
  "85mm professional portrait lens with natural perspective",
  "50mm professional fashion lens",
  "35mm realistic lifestyle fashion photograph",
  "24mm wide-angle professional fashion photograph",
  "70mm editorial fashion lens",
  "90mm high-end portrait fashion lens",
  "professional studio fashion photography",
  "premium commercial fashion photography",
  "luxury editorial fashion photography",
  "high-end fashion campaign photography",
  "professional ecommerce catalog photography",
  "natural daylight fashion photography",
  "cinematic fashion photography",
  "sharp realistic fashion photography",
  "full-body professional fashion photograph",
  "three-quarter professional fashion photograph",
  "street-style fashion photography",
  "luxury lifestyle fashion photography"
];

const lightingStyles = [
  "soft natural daylight with realistic shadows",
  "bright natural daylight with balanced exposure",
  "professional studio softbox lighting",
  "premium fashion studio lighting",
  "cinematic natural lighting",
  "luxury editorial lighting",
  "high-end commercial fashion lighting",
  "soft window light with realistic falloff",
  "golden hour natural sunlight",
  "bright overcast daylight",
  "realistic indoor boutique lighting",
  "realistic luxury hotel lighting",
  "professional outdoor fashion lighting",
  "soft diffused daylight",
  "clean ecommerce catalog lighting",
  "natural street photography lighting",
  "dramatic but realistic editorial lighting",
  "balanced skin-tone lighting",
  "subtle rim lighting with natural shadows",
  "photorealistic three-point studio lighting"
];

const locations = [
  "luxury fashion boutique",
  "premium designer clothing showroom",
  "modern shopping mall",
  "luxury hotel lobby",
  "five-star hotel interior",
  "luxury hotel rooftop",
  "modern luxury apartment",
  "premium luxury house",
  "modern mansion interior",
  "luxury restaurant",
  "premium rooftop restaurant",
  "modern coffee shop",
  "high-end fashion studio",
  "professional photography studio",
  "modern city street",
  "luxury city boulevard",
  "tropical beach resort",
  "luxury swimming pool",
  "private yacht",
  "luxury marina",
  "airport terminal",
  "premium airport lounge",
  "modern shopping district",
  "designer fashion mall",
  "luxury car showroom",
  "modern office lobby",
  "architectural modern building",
  "rooftop city view",
  "luxury garden",
  "premium outdoor terrace",
  "fashion campaign set",
  "modern urban plaza",
  "luxury resort lobby",
  "beachfront luxury hotel",
  "modern waterfront promenade",
  "high-end department store",
  "premium beauty and fashion store",
  "luxury event venue",
  "modern entertainment district",
  "elegant indoor lifestyle setting"
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
    clean(body.seed) ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const gender =
    clean(
      body.gender ||
      body.modelGender ||
      body.sex ||
      "female"
    ).toLowerCase();

  const isMale =
    ["male", "man", "men"].includes(gender);

  const model =
    clean(body.model) ||
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

  const pose =
    clean(body.pose) ||
    pick(poses, seed + "-pose");

  const camera =
    clean(body.camera) ||
    pick(cameraStyles, seed + "-camera");

  const lighting =
    clean(body.lighting) ||
    pick(lightingStyles, seed + "-lighting");

  const location =
    [
      clean(body.locationType),
      clean(body.city),
      clean(body.property),
      clean(body.location)
    ]
      .filter(Boolean)
      .join(", ") ||
    pick(locations, seed + "-location");

  const footwear =
    clean(
      body.footwear ||
      body.shoe ||
      body.shoes ||
      "realistic footwear that naturally matches the selected outfit"
    );

  const clothingType =
    clean(
      body.clothingType ||
      body.garmentType ||
      body.outfitType ||
      "the exact uploaded garment"
    );

  const clothingColor =
    clean(
      body.clothingColor ||
      body.color ||
      "the original color shown in the uploaded garment"
    );

  const clothingStyle =
    clean(
      body.clothingStyle ||
      body.style ||
      "professional fashion styling without changing the garment construction"
    );

  const creativeDirection =
    clean(
      body.creativeDirection ||
      body.creative ||
      "realistic professional commercial fashion photography"
    );

  return `
OBITREND AI FASHION CREATOR

CREATE ONE EXTREMELY PHOTOREALISTIC PROFESSIONAL FASHION PHOTOGRAPH.

THE UPLOADED GARMENT IS THE PRIMARY AND AUTHORITATIVE
GARMENT REFERENCE.

The uploaded garment is the ACTUAL PRODUCT.

It is NOT inspiration.
It is NOT a style suggestion.
It must NOT be redesigned.
It must NOT be replaced.

==================================================
ABSOLUTE GARMENT PRESERVATION
==================================================

Preserve the uploaded garment with maximum possible visual fidelity.

Preserve EXACTLY:

- garment type
- garment identity
- silhouette
- overall shape
- length
- proportions
- neckline
- collar
- sleeve length
- sleeve shape
- cuffs
- waistband
- seams
- stitching
- pockets
- buttons
- zippers
- straps
- folds
- fabric texture
- fabric appearance
- pattern
- print
- stripes
- graphics
- logos
- decorative elements
- construction details
- panel placement
- stitching placement
- original design details

DO NOT redesign the garment.

DO NOT simplify the garment.

DO NOT add new garment details.

DO NOT remove garment details.

DO NOT change the garment construction.

DO NOT substitute the garment with another garment.

DO NOT invent a similar garment.

The generated image must show the SAME REAL-WORLD
GARMENT represented by the uploaded reference.

==================================================
COLOR FIDELITY
==================================================

GARMENT TYPE:
${clothingType}

GARMENT COLOR:
${clothingColor}

GARMENT STYLE:
${clothingStyle}

The uploaded garment's original color is authoritative.

Preserve the exact visible color, tone, shade and color relationships
of the uploaded garment.

Do not randomly recolor the garment.

Do not change the garment color because of the background,
lighting, model or creative direction.

If the user specifically selected a color, apply that requested color
to the garment while preserving the garment's exact design,
construction, proportions and details.

==================================================
MODEL
==================================================

MODEL GENDER:
${gender}

MODEL DESCRIPTION:
${model}

BODY TYPE:
${bodyType}

Create a photorealistic ADULT fashion model.

Use realistic human anatomy, realistic proportions,
realistic skin texture, realistic hair, realistic hands,
realistic fingers and realistic feet.

No cartoon appearance.
No anime appearance.
No CGI appearance.
No plastic-looking skin.

==================================================
POSE
==================================================

${pose}

The pose must look natural and physically believable.

Hands, arms, legs and feet must be anatomically correct.

Avoid distorted hands, duplicated limbs, malformed fingers,
floating body parts or unnatural posture.

==================================================
FOOTWEAR
==================================================

${footwear}

Footwear must be realistic, anatomically attached to the feet
and physically touching the ground naturally.

Do not create floating shoes.

Do not create duplicated shoes.

Do not create malformed footwear.

==================================================
LOCATION
==================================================

LOCATION:
${location}

Use the selected location as a realistic professional fashion
photography environment.

The environment must support the garment without distracting
from it.

==================================================
CAMERA
==================================================

${camera}

Use realistic professional photography optics,
natural perspective, realistic depth of field,
accurate proportions and believable photographic detail.

==================================================
LIGHTING
==================================================

${lighting}

Lighting must remain photorealistic.

Preserve realistic shadows, reflections, skin tones,
fabric texture and garment color.

==================================================
CREATIVE DIRECTION
==================================================

${creativeDirection}

Create a polished premium fashion campaign photograph
suitable for a professional fashion brand.

The result should look like a real photograph captured
with a high-end professional camera.

==================================================
PHOTOREALISM
==================================================

The final image must look like a real professional photograph.

Use realistic:

- skin pores
- facial features
- hair
- hands
- fingers
- feet
- body proportions
- fabric texture
- garment folds
- shadows
- reflections
- lighting
- perspective
- depth of field

NO cartoon.
NO anime.
NO painting.
NO illustration.
NO plastic skin.
NO CGI appearance.
NO distorted anatomy.
NO extra fingers.
NO duplicated limbs.
NO floating objects.

==================================================
FINAL GARMENT PRIORITY
==================================================

GARMENT FIDELITY HAS HIGHER PRIORITY THAN:

- model appearance
- body shape
- pose
- camera angle
- background
- location
- vehicle
- lighting
- hairstyle
- accessories
- creative direction

If any creative instruction conflicts with the uploaded garment:

ALWAYS PRIORITIZE THE UPLOADED GARMENT.

==================================================
FINAL RESULT
==================================================

Create ONE believable professional fashion photograph
of THIS EXACT GARMENT on a real ADULT model.

No garment redesign.

No garment substitution.

No length change.

No silhouette change.

No pattern change.

No construction change.

No unauthorized color change.

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

const body = req.body || {};
    const requestedImageCount = Number(
  getValue(
    body,
    "imageCount",
    "numberOfImages",
    "count"
  ) || 1
);

const imageCount = Math.min(
  4,
  Math.max(
    1,
    Number.isFinite(requestedImageCount)
      ? Math.floor(requestedImageCount)
      : 1
  )
);


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

    const images = (result?.data || [])
  .map((item) => {
    if (item?.b64_json) {
      return `data:image/png;base64,${item.b64_json}`;
    }

    if (item?.url) {
      return item.url;
    }

    return null;
  })
  .filter(Boolean);

if (!images.length) {
  const imageError = new Error(
    "The image service returned no valid generated images."
  );

  imageError.status = 502;
  imageError.type = "invalid_image_response";
  imageError.code = "MISSING_IMAGE_DATA";

  throw imageError;
}

const imageUrls = images;

const imageUrl = imageUrls[0];

return res.status(200).json({
  ok: true,
  success: true,

  // FIRST IMAGE — keeps existing compatibility
  imageUrl,
  url: imageUrl,
  image: imageUrl,
  generatedImage: imageUrl,

  // ALL GENERATED IMAGES
  images: imageUrls,

  count: imageUrls.length,

  model: MODEL,
  aspectRatio,
  size,

  message:
    "OBITREND exact-garment photorealistic fashion images generated successfully."
});

=======
    quality: "high",

    output_format: "png",

    n: 4,
  });

const images =
  (result?.data || [])
    .filter(item => item?.b64_json)
    .map(item =>
      `data:image/png;base64,${item.b64_json}`
    );

if (images.length === 0) {
  const responseKeys =
    Object.keys(result || {});

  const invalidImageError =
    new Error(
      "The image service returned no valid images."
    );

  invalidImageError.status = 502;
  invalidImageError.type =
    "invalid_image_response";
  invalidImageError.code =
    "MISSING_B64_JSON";
  invalidImageError.responseKeys =
    responseKeys;

  throw invalidImageError;
}

const imageUrl = images[0];

    return res.status(200).json({
  ok: true,

  images,

  imageCount: images.length,

  imageUrl: images[0],

  url: images[0],

  image: images[0],

  generatedImage: images[0],

  model: MODEL,

  aspectRatio,

  size,

  message:
    `OBITREND generated ${images.length} photorealistic fashion images successfully.`,
})

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
