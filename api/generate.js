import OpenAI from "openai";

import {
  spendCredit,
  refundCredit,
  getRedisConfig,
  getProStatus
} from "./credits.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
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
   SCENE OPTIONS
========================================================= */

const locations = [
  "luxury beachfront resort",
  "premium five-star hotel entrance",
  "luxury hotel pool",
  "modern rooftop lounge",
  "high-end shopping district",
  "designer fashion boutique",
  "luxury restaurant terrace",
  "tropical beach club",
  "private yacht marina",
  "modern luxury apartment",
  "professional fashion showroom",
  "premium airport lounge",
  "European fashion boulevard",
  "modern African luxury hotel",
  "Dubai luxury boulevard",
  "Miami beachfront promenade",
  "Lagos upscale shopping district",
  "Abuja luxury hotel",
  "Paris-inspired fashion street",
  "London luxury street",
  "New York fashion district",
  "Milan fashion street",
  "luxury resort garden",
  "professional fashion studio",
];

const lightingStyles = [
  "clean natural daylight",
  "soft morning sunlight",
  "warm afternoon sunlight",
  "golden hour sunlight",
  "cinematic evening light",
  "bright editorial daylight",
  "soft luxury hotel lighting",
  "professional studio lighting",
];

const cameraStyles = [
  "professional full-frame fashion photography",
  "high-end commercial fashion photography",
  "premium editorial photography",
  "luxury ecommerce photography",
  "premium lifestyle campaign photography",
  "85mm fashion portrait photography",
  "50mm commercial fashion photography",
];

const poses = [
  "natural full-body standing fashion pose",
  "walking naturally toward the camera",
  "relaxed standing editorial pose",
  "natural seated fashion pose",
  "standing beside a pool",
  "walking through a premium shopping district",
  "relaxed luxury resort pose",
  "natural three-quarter fashion pose",
  "professional catalog pose",
];
/* =========================================================
   PRODUCT / GARMENT PRESENTATION MODES
========================================================= */

const presentationModes = [
  "professional fashion model wearing the exact uploaded garment",
  "luxury mannequin product display showing the exact uploaded garment",
  "premium hanging garment product photography",
  "professional boutique clothing display",
  "high-end ecommerce catalog product photography",
  "fashion showroom garment presentation",
  "clean studio garment photography on a mannequin",
  "front-facing garment product showcase",
  "multi-angle garment product presentation",
  "close-up garment detail photography"
];
/* =========================================================
   MASTER PHOTOREALISM PROMPT
========================================================= */

function buildPrompt(body) {
  const seed =
    clean(body.seed) ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const model = clean(
    body.model,
    "a professional adult fashion model"
  );

  const bodyType = clean(
    body.bodyType,
    "natural realistic proportions"
  );

  const face = clean(
    body.face,
    "natural photorealistic adult face"
  );

  const pose =
    clean(body.pose) ||
    pick(poses, seed);

  const fashionStyle = clean(
    body.fashionStyle || body.style,
    "premium commercial fashion campaign"
  );

  const camera =
    clean(body.camera) ||
    pick(cameraStyles, seed);

  const lighting =
    clean(body.lighting) ||
    pick(lightingStyles, seed);

  const location =
    [
      clean(body.locationType),
      clean(body.city),
      clean(body.property)
    ]
      .filter(Boolean)
      .join(", ") ||
    pick(locations, seed);

  const vehicle =
    clean(body.vehicle) ||
    "none unless naturally appropriate";

  const creativeDirection = clean(
    body.creativeDirection || body.creative,
    "luxury professional fashion campaign"
  );

  const presentationMode =
    clean(body.presentationMode) ||
    pick(presentationModes, seed);

  const garmentSelection = clean(
  body.garmentSelection ||
  body.garmentFocus ||
  "the main garment selected by the user"
);

// =============================
// MODEL GENDER
// =============================
const gender = clean(
  body.gender ||
  body.modelGender ||
  body.sex ||
  "woman"
);

// =============================
// FOOTWEAR
// =============================
const footwear = clean(
  body.footwear ||
  body.shoe ||
  body.shoes ||
  "automatically selected footwear that matches the outfit"
);
// =============================
// CLOTHING OPTIONS
// =============================
const clothingType = clean(
  body.clothingType ||
  body.garmentType ||
  body.outfitType ||
  "the exact uploaded garment"
);

const clothingColor = clean(
  body.clothingColor ||
  body.color ||
  "the exact color of the uploaded garment"
);

const clothingStyle = clean(
  body.clothingStyle ||
  body.style ||
  "premium fashion styling"
);

// =============================
// CLOTHING PRESERVATION
// =============================
const clothingInstruction = `
CLOTHING CATEGORY:
${clothingType}

CLOTHING COLOR:
${clothingColor}

CLOTHING STYLE:
${clothingStyle}

The uploaded garment is the SOURCE OF TRUTH.

Preserve the exact:
- garment type
- silhouette
- color
- pattern
- print
- logo
- fabric texture
- seams
- stitching
- buttons
- zippers
- pockets
- waistband
- neckline
- sleeves
- cuffs
- proportions

Do not redesign the uploaded garment.
Do not randomly change its color.
Do not replace it with another garment.
`;

// =============================
// ULTRA PHOTOREALISTIC STANDARD
// =============================
const photorealisticInstruction = `
The final image must look like a real professional fashion
photograph, not an illustration or CGI image.

Use realistic:
- human skin
- skin pores
- facial features
- hair
- hands
- fingers
- feet
- body proportions
- fabric texture
- clothing folds
- footwear
- shadows
- reflections
- lighting
- perspective
- depth of field

No cartoon.
No anime.
No painting.
No plastic skin.
No CGI appearance.
No distorted hands.
No extra fingers.
No malformed feet.
No floating shoes.
No duplicated limbs.

When footwear is selected, show the complete footwear clearly
and preferably use a full-body composition.
`;
// =============================
// PHOTOREALISTIC FOOTWEAR RULE
// =============================
const footwearInstruction = footwear.toLowerCase() === "none"
  ? "Do not add visible footwear."
  : `
FOOTWEAR:
Use ${footwear}.

The footwear must be completely photorealistic and anatomically
correct. It must be properly attached to the feet and physically
touch the ground naturally.

Preserve realistic:
- shoe shape
- sole
- laces
- straps
- buckles
- stitching
- leather/fabric texture
- reflections
- shadows
- proportions

Do not create floating shoes, distorted shoes, duplicated shoes,
extra feet, malformed toes or unrealistic footwear.
`;

// =============================
// MALE / FEMALE MODEL RULE
// =============================
const modelGenderValue = gender.toLowerCase();

const modelGenderInstruction =
  modelGenderValue === "man" ||
  modelGenderValue === "male" ||
  modelGenderValue === "men"
    ? `
MODEL GENDER: ADULT MAN

Create a photorealistic adult male fashion model.

Use realistic masculine anatomy, realistic proportions,
natural facial features, realistic skin texture, realistic hair,
realistic hands and realistic feet.

The man must look like a real professional fashion model
photographed with a high-end professional camera.
`
    : `
MODEL GENDER: ADULT WOMAN

Create a photorealistic adult female fashion model.

Use realistic feminine anatomy, realistic proportions,
natural facial features, realistic skin texture, realistic hair,
realistic hands and realistic feet.

The woman must look like a real professional fashion model
photographed with a high-end professional camera.
`;

return `
OBITREND AI FASHION CREATOR
${modelGenderInstruction}

${clothingInstruction}

${photorealisticInstruction}

FASHION OPTIONS SELECTED BY USER

MODEL GENDER:
${gender}

FOOTWEAR:
${footwear}

CLOTHING TYPE:
${clothingType}

CLOTHING COLOR:
${clothingColor}

CLOTHING STYLE:
${clothingStyle}

The selected options must be followed while preserving the
uploaded garment as the primary physical reference.
PHOTOREALISTIC GARMENT-TO-MODEL MASTER STANDARD

PRIMARY OBJECTIVE

Create one extremely photorealistic professional fashion
photograph using the uploaded clothing image as the
PRIMARY PHYSICAL GARMENT REFERENCE.

The uploaded garment is the ACTUAL PRODUCT.

It is NOT inspiration.
It is NOT a style suggestion.
It must NOT be redesigned.

The generated image should look like the SAME real-world
garment photographed on a different professional adult model.

=========================================================
ABSOLUTE GARMENT FIDELITY RULE
=========================================================

THE UPLOADED GARMENT IS THE SOURCE OF TRUTH.

GARMENT FIDELITY HAS HIGHER PRIORITY THAN:

- model
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

If any creative instruction conflicts with the garment,
PRESERVE THE GARMENT.

=========================================================
EXACT GARMENT IDENTITY
=========================================================

Preserve the exact:

- garment category
- silhouette
- overall shape
- garment length
- garment width
- shoulder width
- chest width
- waist width
- sleeve length
- sleeve width
- cuff shape
- cuff size
- neckline
- collar shape
- collar size
- button count
- button placement
- button spacing
- button placket
- pocket count
- pocket position
- pocket size
- pocket shape
- side seams
- hem shape
- hem position
- front panels
- back construction
- stitching
- seams
- folds
- draping
- gathers
- ruching
- pleats
- ruffles
- straps
- zippers
- buckles
- bows
- decorative elements
- logos
- embroidery
- prints
- graphics
- patterns
- fabric texture
- fabric thickness
- transparency
- color
- color distribution
- stripe direction
- stripe spacing
- stripe width

=========================================================
GARMENT GEOMETRY LOCK
=========================================================

The garment's physical geometry is FIXED.

Do NOT:

- stretch the garment
- shrink the garment
- lengthen the garment
- shorten the garment
- widen the garment
- narrow the garment
- taper the garment
- slim the garment
- cinch the garment
- reshape the garment
- move the hem
- move the pocket
- resize the pocket
- change button spacing
- change collar dimensions
- change sleeve dimensions
- change cuff dimensions
- change stripe spacing
- change stripe direction
- change the garment category

The garment must maintain the same apparent
length-to-width relationship as the reference.

REFERENCE GARMENT DIMENSIONS > MODEL BODY FIT.

=========================================================
BODY ADAPTATION RULE
=========================================================

ADAPT THE MODEL TO THE GARMENT.

NEVER ADAPT THE GARMENT TO THE MODEL.

If the selected model is:

- slimmer
- wider
- taller
- shorter
- curvier
- narrower

the garment must still retain its original dimensions.

The model's body must naturally fit INSIDE the garment.

Do not make the garment follow the model's waist,
bust, hips or torso.

=========================================================
RELAXED / OVERSIZED FIT LOCK
=========================================================

If the uploaded garment is loose or oversized,
KEEP IT LOOSE OR OVERSIZED.

Do not automatically make it:

- fitted
- tailored
- slim
- body-hugging
- waist-shaped
- tapered

Preserve the original side-to-side width.

Preserve the original distance between:

- left side seam
- right side seam
- armholes
- chest
- waist
- hem

If the model is narrower than the garment,
leave natural relaxed space.

=========================================================
PATTERN AND STRIPE LOCK
=========================================================

If the reference contains stripes, preserve:

- stripe direction
- stripe width
- stripe spacing
- stripe colors
- stripe order
- stripe alignment

Do NOT automatically straighten, widen, narrow,
rotate or redesign the stripe pattern.

If a pattern crosses a seam or pocket,
preserve its visual relationship to the garment.

=========================================================
FINE GARMENT DETAIL PRESERVATION LOCK
=========================================================

Treat every visible garment detail in the reference as
intentional product information.

Preserve small details even when they are subtle or partially
obscured.

PRIORITY DETAILS:

- exact seam placement
- seam direction
- stitching lines
- topstitching
- piping
- edge finishing
- hems
- cuffs
- neckline edges
- collar edges
- straps
- loops
- rings
- buckles
- buttons
- snaps
- zippers
- pockets
- pocket openings
- pocket flaps
- decorative hardware
- brooches
- beads
- embroidery
- logos
- labels when they belong to the garment
- printed graphics
- woven patterns
- repeated motifs
- color blocking
- fabric texture
- fabric grain
- ruching
- gathers
- pleats
- draping

DO NOT simplify small details because the model image is
photorealistic.

DO NOT replace difficult garment construction with a generic
fashion design.

DO NOT create a "similar" garment.

The output must remain identifiable as the SAME physical
product shown in the reference.

=========================================================
DETAIL SCALE LOCK
=========================================================

Preserve the relative scale of garment details.

A small pocket must remain small.

A large pocket must remain large.

A narrow strap must remain narrow.

A wide strap must remain wide.

Small buttons must remain small.

Large buttons must remain large.

Do not enlarge decorative elements merely to make them
more visible.

Do not remove details merely because they are small.

=========================================================
EMBELLISHMENT LOCK
=========================================================

If the garment contains jewelry-like decoration that is
physically attached to the garment, preserve it as part of
the garment.

Examples:

- brooch
- flower decoration
- crystal decoration
- beadwork
- metallic ornament
- sewn-on applique
- embroidery

Do not move it to another location.

Do not duplicate it.

Do not invent additional decoration.

=========================================================
COLOR AND MATERIAL LOCK
=========================================================

Preserve the actual garment material appearance.

Maintain:

- base color
- secondary colors
- color boundaries
- pattern colors
- sheen
- matte appearance
- translucency
- texture
- weave appearance

Lighting may change how the material is illuminated,
but MUST NOT change the garment's actual color.

Do not convert:

- matte fabric into shiny fabric
- shiny fabric into matte fabric
- woven fabric into plastic
- textured fabric into smooth fabric
- opaque fabric into transparent fabric

=========================================================
IDENTITY CHECK
=========================================================

Before finalizing the image, mentally compare the generated
garment with the reference as a PRODUCT, not merely as an
outfit.

Ask:

"Would a customer recognize these as the same garment?"

If the answer is NO, prioritize correcting the garment.

The model, pose, background and styling are secondary.

=========================================================

=========================================================
POCKET / BUTTON / COLLAR LOCK
=========================================================

Every visible pocket must remain.

Every visible button must remain.

The collar must remain the same shape.

The button placket must remain in the same position.

Do not invent additional:

- pockets
- buttons
- collars
- zippers
- belts
- stripes
- bows
- graphics
- embroidery

unless they are actually visible in the reference.

=========================================================
REFERENCE IMAGE HANDLING
=========================================================

The uploaded image may contain:

- mannequin
- hanger
- jewelry
- necklace
- tags
- store fixtures
- background objects
- hands
- other clothing

Identify the ACTUAL GARMENT.

Do not transfer unrelated objects onto the model.

A mannequin may be used only to understand:

- garment shape
- construction
- length
- width
- proportions
- front
- back

If multiple views show the same garment,
treat them as different views of ONE garment.

Use all visible views to understand the same physical product.

=========================================================
PRESENTATION MODE
=========================================================

${presentationMode}

The presentation mode may change HOW the garment is displayed.

It MUST NOT change the garment itself.

If a model is requested:
show the exact uploaded garment naturally worn by a realistic
professional adult model.

If mannequin/product presentation is requested:
show the exact garment as the product.

If ecommerce/showroom presentation is requested:
keep the garment clearly visible as the primary product.

=========================================================
USER GARMENT FOCUS
=========================================================

${garmentSelection}

=========================================================
MODEL
=========================================================

${model}

BODY TYPE:
${bodyType}

FACE:
${face}

POSE:
${pose}

=========================================================
SCENE
=========================================================

LOCATION:
${location}

VEHICLE:
${vehicle}

LIGHTING:
${lighting}

CAMERA:
${camera}

FASHION STYLE:
${fashionStyle}

CREATIVE DIRECTION:
${creativeDirection}

=========================================================
REAL FABRIC PHYSICS
=========================================================

The garment must behave like real physical fabric.

Use:

- realistic folds
- realistic wrinkles
- realistic tension
- realistic compression
- realistic stitching
- realistic seams
- realistic thickness
- realistic draping
- realistic highlights
- realistic shadows
- realistic contact with the body

Do not create:

- melted fabric
- plastic fabric
- floating clothing
- distorted clothing
- impossible fabric folds

=========================================================
PHOTOREALISTIC MODEL
=========================================================

Use a realistic adult human model.

Preserve:

- realistic skin
- realistic face
- realistic hair
- realistic hands
- realistic fingers
- realistic anatomy
- realistic posture
- realistic lighting

Avoid:

- mannequin appearance
- doll appearance
- CGI appearance
- cartoon appearance
- anime appearance
- artificial plastic skin

=========================================================
PHOTOGRAPHY
=========================================================

Create a genuine professional fashion photograph.

Use:

- realistic full-frame camera appearance
- realistic lens rendering
- realistic depth of field
- realistic exposure
- realistic focus
- realistic shadows
- realistic reflections
- realistic perspective
- natural skin texture
- professional fashion lighting

Avoid:

- CGI look
- 3D render look
- excessive sharpening
- artificial blur
- distorted anatomy
- fake-looking environments

=========================================================
FINAL GARMENT VERIFICATION
=========================================================

Before completing the image, compare the generated garment
against the uploaded reference.

Verify:

1. Same garment category.
2. Same silhouette.
3. Same length.
4. Same width.
5. Same neckline.
6. Same collar.
7. Same sleeves.
8. Same cuffs.
9. Same buttons.
10. Same button spacing.
11. Same pockets.
12. Same pocket position.
13. Same hem.
14. Same stripe/pattern arrangement.
15. Same colors.
16. Same construction.
17. Same visible details.
18. Same overall proportions.

If ANY garment feature has changed,
correct the garment before completing the image.

=========================================================
FINAL PRIORITY
=========================================================

GARMENT REFERENCE
>
GARMENT GEOMETRY
>
GARMENT CONSTRUCTION
>
GARMENT COLOR/PATTERN
>
GARMENT DETAILS
>
MODEL
>
POSE
>
LOCATION
>
LIGHTING
>
CREATIVE STYLING

The final image must look like the SAME physical garment
photographed in a new professional fashion scene.

No redesign.
No substitution.
No simplification.
No unnecessary fitting.
No geometry changes.

Create a premium, believable, photorealistic fashion photograph.
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

  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        ok: false,
        error:
          "OPENAI_API_KEY is missing from Vercel Environment Variables.",
      });
    }

    const body =
      typeof req.body === "object" &&
      req.body !== null
        ? req.body
        : {};
const userId = clean(
  getValue(body, "userId", "obitrendUserId")
);

if (!userId) {
  return res.status(400).json({
    ok: false,
    error: "A valid OBITREND user ID is required."
  });
}

const redis = getRedisConfig();
    const proStatus = await getProStatus(
  userId,
  redis
);
let creditSpent = false;

if (!redis.url || !redis.token) {
  return res.status(500).json({
    ok: false,
    error: "OBITREND credit system is not configured."
  });
}
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
          "No valid clothing image was received. Upload a JPG, PNG or WEBP clothing photo and try again.",
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

    const extension =
      extensionFromMime(mime);

    const imageFile = new File(
      [buffer],
      `obitrend-reference.${extension}`,
      {
        type: mime,
      }
    );

    const prompt =
      buildPrompt(body);

    const aspectRatio = clean(
      body.aspectRatio ||
        body.ratio,
      "4:5"
    );

    const size =
      getImageSize(aspectRatio);

    /*
      IMAGE EDIT MODE

      The uploaded garment is passed directly to the
      image editing model.

      High input fidelity is enabled to give the model
      stronger preservation of important input details.
    */
const creditResult = await spendCredit(userId, redis);

if (!creditResult.success) {
  return res.status(402).json({
    ok: false,
    error: "You have no OBITREND image generations remaining.",
    balance: creditResult.balance
  });
}

creditSpent = true;
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

    const image =
      result?.data?.[0];

    if (!image?.b64_json) {
  const responseKeys = Object.keys(image || {});

  const invalidImageError = new Error(
    "The image service returned an invalid image response."
  );

  invalidImageError.status = 502;
  invalidImageError.type = "invalid_image_response";
  invalidImageError.code = "MISSING_B64_JSON";
  invalidImageError.responseKeys = responseKeys;

  throw invalidImageError;
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
        "OBITREND photorealistic fashion image generated successfully.",
    });

  } catch (error) {
    console.error(
      "OBITREND GENERATION ERROR:",
      error
    );
    if (creditSpent) {
      try {
        await refundCredit(userId, redis);
      } catch (refundError) {
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

    if (status === 401) {
      message =
        "OpenAI API authentication failed. Check OPENAI_API_KEY in Vercel.";
    }

    else if (status === 403) {
      message =
        "The OpenAI account or API key is not permitted to use this image service.";
    }

    else if (status === 429) {
      message =
        "OpenAI API rate or billing limit reached. Check your OpenAI API usage and billing.";
    }

    else if (status >= 500) {
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
