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

ADDED:
- Flat-lay garment references
- Hanger garment references
- Fully covered mannequin references
- Automatic clothing-type recognition
- Different adult fashion model variations
- Exactly 2 separate fashion poses/images
- Realistic environmental objects
- Optional background reference image
- Strong garment identity/design preservation
- Professional real-camera photography appearance

COMPATIBILITY:
- Existing /api/generate endpoint
- Existing credits.js
- Existing Pro system
- Existing Redis system
- Existing authentication
- Existing image field names
- Existing response aliases

BACKWARD COMPATIBILITY:
- image = first generated image
- imageUrl = first generated image
- url = first generated image
- generatedImage = first generated image
- images = both generated images
- colorImages = generated images
- colourImages = generated images
=========================================================
*/

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

const IMAGE_QUALITY = "high";

const MAX_COLOUR_IMAGES = 4;

const MAX_IMAGE_BYTES =
  9 * 1024 * 1024;

const MAX_TOTAL_REFERENCE_BYTES =
  9 * 1024 * 1024;

const NUMBER_OF_POSES = 2;

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
BODY NORMALIZATION
========================================================= */

function normalizeBody(body) {
  if (!body) {
    return {};
  }

  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }

  return body;
}

/* =========================================================
BASE64
========================================================= */

function normalizeBase64(input) {
  if (!input) {
    return null;
  }

  let value = String(input).trim();

  if (
    value.startsWith("data:image/")
  ) {
    const comma =
      value.indexOf(",");

    if (comma !== -1) {
      value =
        value.slice(comma + 1);
    }
  }

  value =
    value.replace(/\s/g, "");

  return value.length >= 100
    ? value
    : null;
}

/* =========================================================
MIME
========================================================= */

function getMimeType(input) {
  const match =
    String(input || "").match(
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

  if (mime.includes("gif")) {
    return "gif";
  }

  return "jpg";
}

/* =========================================================
IMAGE SIZE
========================================================= */

function getImageSize(value) {
  const ratio =
    clean(
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
  const raw =
    getValue(
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
    list =
      raw
        .split(",")
        .map(
          (item) =>
            item.trim()
        );
  }

  return [
    ...new Set(
      list
        .map(
          (value) =>
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
USER ID
========================================================= */

function getFallbackUserId(
  body,
  req
) {
  const supplied =
    getValue(
      body,
      "userId",
      "uid",
      "clientId"
    );

  if (supplied) {
    return clean(supplied)
      .replace(
        /[^a-zA-Z0-9_-]/g,
        ""
      )
      .slice(0, 100);
  }

  const headerId =
    clean(
      req?.headers?.[
        "x-obitrend-user-id"
      ] || ""
    )
      .replace(
        /[^a-zA-Z0-9_-]/g,
        ""
      )
      .slice(0, 100);

  return (
    headerId ||
    "guest"
  );
}

/* =========================================================
OPTIONAL NESTED BODY VALUE
========================================================= */

function getNestedValue(
  body,
  ...names
) {
  const direct =
    getValue(
      body,
      ...names
    );

  if (direct) {
    return direct;
  }

  if (
    body?.data &&
    typeof body.data ===
      "object"
  ) {
    const nested =
      getValue(
        body.data,
        ...names
      );

    if (nested) {
      return nested;
    }
  }

  if (
    body?.input &&
    typeof body.input ===
      "object"
  ) {
    const nested =
      getValue(
        body.input,
        ...names
      );

    if (nested) {
      return nested;
    }
  }

  return "";
}

/* =========================================================
GARMENT REFERENCE TYPE
========================================================= */

function getGarmentReferenceType(
  body
) {
  const value =
    clean(
      getNestedValue(
        body,
        "garmentReferenceType",
        "referenceType",
        "clothingReferenceType",
        "garmentView"
      ),
      "auto"
    ).toLowerCase();

  if (
    value.includes("flat")
  ) {
    return "flat-lay";
  }

  if (
    value.includes("hanger")
  ) {
    return "hanger";
  }

  if (
    value.includes("mannequin")
  ) {
    return "fully covered mannequin";
  }

  return "auto";
}

/* =========================================================
MODEL VARIATION
========================================================= */

function getDifferentModels(
  body
) {
  return getBoolean(
    body,
    "differentModels",
    "differentModel",
    "modelVariation",
    "differentAdultModels"
  );
}

/* =========================================================
POSES
========================================================= */

function getPoseInstructions(
  body
) {
  const requested =
    getNestedValue(
      body,
      "poses",
      "poseList"
    );

  if (
    Array.isArray(requested) &&
    requested.length >= 2
  ) {
    return [
      clean(
        requested[0],
        "standing naturally in a confident editorial pose"
      ),
      clean(
        requested[1],
        "a clearly different natural fashion pose"
      ),
    ];
  }

  if (
    typeof requested ===
      "string" &&
    requested.trim()
  ) {
    const list =
      requested
        .split(",")
        .map(
          (item) =>
            item.trim()
        )
        .filter(Boolean);

    if (list.length >= 2) {
      return [
        list[0],
        list[1],
      ];
    }
  }

  const pose =
    clean(
      getNestedValue(
        body,
        "pose"
      ),
      "natural confident fashion pose"
    );

  return [
    pose,
    "a clearly different natural fashion pose"
  ];
}

/* =========================================================
REDIS
========================================================= */

function getRedisOrNull() {
  try {
    const redis =
      getRedisConfig();

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
    !userId ||
    userId === "guest"
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
  } catch (error) {
    console.warn(
      "OBITREND Pro status check failed:",
      error?.message ||
        error
    );

    return false;
  }
}

/* =========================================================
CREDIT
========================================================= */

async function spendIfNeeded(
  userId,
  proActive,
  redis
) {
  if (
    proActive ||
    !redis
  ) {
    return {
      success: true,
      balance: null,
      usedCredit: false,
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
      Boolean(
        spent?.success
      ),
  };
}

/* =========================================================
CREDIT REFUND
========================================================= */

async function refundIfNeeded(
  charge,
  userId,
  redis
) {
  if (
    !charge?.usedCredit ||
    !redis
  ) {
    return false;
  }

  try {
    await refundCredit(
      userId,
      redis
    );

    return true;
  } catch (error) {
    console.error(
      "OBITREND credit refund failed:",
      error
    );

    return false;
  }
}

/* =========================================================
GARMENT REFERENCE PROMPT
========================================================= */

function buildGarmentReferenceInstruction(
  referenceType
) {
  if (
    referenceType ===
    "flat-lay"
  ) {
    return `
GARMENT REFERENCE TYPE: FLAT-LAY

The uploaded reference is intended to be interpreted as a
professional flat-lay garment/product reference.

Treat the garment itself as the authoritative visual reference.

Ignore:
- the flat-lay surface
- surrounding props
- unrelated objects
- the original background
- unrelated shadows

Use the visible garment construction, proportions, color,
pattern, fabric appearance, seams and details to reproduce
the same garment realistically on the selected model.
`;
  }

  if (
    referenceType ===
    "hanger"
  ) {
    return `
GARMENT REFERENCE TYPE: HANGER

The uploaded reference is intended to be interpreted as a
professional hanging-garment/product reference.

Treat the hanging garment as the authoritative garment reference.

Ignore:
- hanger identity
- wall/background
- room
- surrounding objects
- unrelated shadows

Infer the garment's actual shape and construction from the
visible front, side and other available details.

Do not reproduce the hanger as part of the final outfit.
`;
  }

  if (
    referenceType ===
    "fully covered mannequin"
  ) {
    return `
GARMENT REFERENCE TYPE: FULLY COVERED MANNEQUIN

The uploaded reference is intended to show the garment on a
fully covered fashion mannequin.

Treat the garment as the primary reference.

Ignore the mannequin's:
- identity
- face
- body identity
- surface
- pose
- background

Use the visible garment construction to recreate the same
clothing naturally on the selected adult fashion model.
`;
  }

  return `
GARMENT REFERENCE TYPE: AUTO-DETECT

Determine whether the uploaded garment reference is primarily:
- a flat-lay garment
- a hanging garment on a hanger
- a fully covered mannequin garment
- or another legitimate clothing/product presentation.

Regardless of presentation, extract the garment itself as the
primary visual reference.

Ignore unrelated background, props, people and objects.
`;
}

/* =========================================================
CLOTHING TYPE INSTRUCTION
========================================================= */

function buildClothingTypeInstruction(
  body
) {
  const clothingType =
    clean(
      getNestedValue(
        body,
        "clothingType",
        "outfitType",
        "garmentType",
        "category"
      ),
      "automatically detect the garment type from the uploaded reference"
    );

  return `
CLOTHING TYPE:

${clothingType}

If the clothing type was not explicitly specified, identify it
from the uploaded garment reference.

Support the visible garment category accurately, including
appropriate fashion categories such as:
- tops
- shirts
- blouses
- jackets
- coats
- dresses
- skirts
- trousers
- jeans
- shorts
- suits
- knitwear
- traditional/cultural garments
- sportswear
- outerwear
- other clearly visible clothing categories.

Never change one garment category into another.
`;
}

/* =========================================================
MODEL INSTRUCTION
========================================================= */

function buildModelInstruction(
  body,
  differentModels
) {
  const model =
    clean(
      getNestedValue(
        body,
        "model",
        "lady",
        "selectedModel"
      ),
      "adult fashion model"
    );

  const bodyStyle =
    clean(
      getNestedValue(
        body,
        "bodyStyle",
        "body",
        "body_type"
      ),
      "natural balanced adult body proportions"
    );

  const model2 =
    clean(
      getNestedValue(
        body,
        "model2",
        "secondModel",
        "selectedModel2"
      ),
      "a different adult fashion model"
    );

  return `
ADULT MODEL DIRECTION:

Primary model:
${model}

Body style:
${bodyStyle}

The model must be an adult fashion model.

MODEL VARIATION:
${
  differentModels
    ? `
For the two separate outputs, create two visually distinct
adult fashion models while keeping the exact same garment
identity and garment construction.

Output 1 model:
${model}

Output 2 model:
${model2}

The two models may differ naturally in:
- face
- hairstyle
- skin tone
- body proportions
- overall adult appearance

BUT the garment must remain the same.
`
    : `
Use the selected adult model direction consistently across
the two outputs unless the frontend explicitly requests
different models.
`
}
`;
}

/* =========================================================
OBJECTS / ENVIRONMENT
========================================================= */

function buildObjectsInstruction(
  body
) {
  const objects =
    clean(
      getNestedValue(
        body,
        "objects",
        "props",
        "environmentObjects"
      )
    );

  return `
REALISTIC OBJECTS AND ENVIRONMENT:

${
  objects
    ? `Requested objects:
${objects}`
    : `
Use only natural, scene-appropriate environmental objects
when they improve the realism of the selected location.

Examples can include:
- tables
- chairs
- fashion racks
- handbags
- shopping bags
- tasteful decor
- plants
- lamps
- architectural details
- cars
- café objects
- hotel furniture
- airport furniture
- pool furniture
- restaurant table settings
- realistic street objects
`
}

Every object must obey:
- correct perspective
- correct scale
- realistic material properties
- natural shadows
- realistic reflections
- correct depth
- believable physical placement
- proper occlusion

Do not add random clutter.
Do not let objects cover important garment details.
Do not allow objects to merge into the model or garment.
`;
}

/* =========================================================
BACKGROUND REFERENCE
========================================================= */

function buildBackgroundInstruction(
  hasBackgroundReference
) {
  if (
    hasBackgroundReference
  ) {
    return `
BACKGROUND REFERENCE IMAGE IS PROVIDED.

Use the supplied background reference as the authoritative
visual guide for the environment.

Reproduce the background as closely as possible while creating
a new fashion photograph.

Preserve, where visible:
- architecture
- layout
- major structures
- furniture
- colors
- lighting direction
- perspective
- spatial relationships
- recognizable environmental details

Do NOT copy unrelated people as subjects.

Place the fashion model naturally into the referenced environment.

The garment remains the highest-priority visual reference.
`;
  }

  return `
NO BACKGROUND REFERENCE IMAGE WAS PROVIDED.

Create the requested background/location naturally and
photorealistically.

The environment must look like a real physical place.
`;
}

/* =========================================================
COMPANION
========================================================= */

function buildCompanionInstruction(
  body
) {
  const companion =
    clean(
      getNestedValue(
        body,
        "companion",
        "childCompanion",
        "companionType"
      ),
      "none"
    ).toLowerCase();

  if (
    !companion ||
    companion === "none"
  ) {
    return `
COMPANION:
No companion requested.

Create only the requested main adult fashion model.
Do not add an unrelated second person.
`;
  }

  return `
COMPANION:

A companion was explicitly requested:
${companion}

Keep the companion secondary to the main fashion model.

The companion must be fully clothed and age-appropriate.

The companion must not alter, cover or replace the main garment.
`;
}

/* =========================================================
MAIN PROMPT
========================================================= */

function buildPrompt(
  body,
  variantColor = "",
  poseNumber = 1,
  poseText = "",
  differentModels = false,
  hasBackgroundReference = false
) {
  const fashionStyle =
    clean(
      getNestedValue(
        body,
        "fashionStyle",
        "style"
      ),
      "luxury editorial fashion"
    );

  const country =
    clean(
      getNestedValue(
        body,
        "country"
      )
    );

  const city =
    clean(
      getNestedValue(
        body,
        "city"
      )
    );

  const scene =
    clean(
      getNestedValue(
        body,
        "scene",
        "background"
      ),
      "luxury fashion photography location"
    );

  const car =
    clean(
      getNestedValue(
        body,
        "car",
        "vehicle"
      ),
      "no vehicle unless requested or naturally appropriate"
    );

  const camera =
    clean(
      getNestedValue(
        body,
        "camera",
        "lighting"
      ),
      "professional full-frame commercial fashion photography"
    );

  const ratio =
    clean(
      getNestedValue(
        body,
        "aspectRatio",
        "ratio"
      ),
      "5:4"
    );

  const extra =
    clean(
      getNestedValue(
        body,
        "extra",
        "additionalPrompt"
      )
    );

  const userPrompt =
    clean(
      getNestedValue(
        body,
        "prompt",
        "description"
      )
    );

  const referenceType =
    getGarmentReferenceType(
      body
    );

  const location =
    [
      city,
      country,
    ]
      .filter(Boolean)
      .join(", ");

  return `
=========================================================
OBITREND STRICT FASHION PHOTOGRAPHY MODE
=========================================================

Create a completely new professional fashion photograph.

The uploaded clothing image is the PRIMARY VISUAL REFERENCE
FOR THE GARMENT.

The result must look like a real photograph captured by a
professional fashion photographer with a high-end camera.

This is not a generic outfit-generation instruction.

The garment identity has the highest priority.

=========================================================
GARMENT REFERENCE
=========================================================

${buildGarmentReferenceInstruction(
  referenceType
)}

${buildClothingTypeInstruction(
  body
)}

=========================================================
GARMENT PRESERVATION
=========================================================

Preserve the uploaded garment as accurately as possible.

Match:
- garment category
- garment type
- silhouette
- proportions
- length
- neckline
- collar
- straps
- sleeves
- sleeveless construction
- arm openings
- waist shaping
- seams
- stitching
- panels
- pleats
- gathers
- folds
- draping
- hem
- buttons
- zippers
- ties
- belts when actually present
- pockets
- embroidery
- artwork
- graphics
- logos
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
- visible front construction
- visible back construction
- visible fastening details

Do not simplify the garment.

Do not replace the garment with a generic fashion outfit.

Do not redesign the garment.

Do not change the garment category.

Do not invent missing design elements.

Do not add sleeves that are not present.

Do not remove sleeves that are present.

Do not add buttons that are not present.

Do not remove important buttons.

Do not change stripe direction.

Do not change pattern placement.

Do not remove visible artwork or lettering.

Do not turn the garment into another outfit.

The uploaded garment is more important than the requested
location, car, styling or creative direction.

=========================================================
MODEL
=========================================================

${buildModelInstruction(
  body,
  differentModels
)}

=========================================================
POSE OUTPUT
=========================================================

This is OUTPUT ${poseNumber} of ${NUMBER_OF_POSES}.

Requested pose:
${poseText}

Generate a complete natural fashion pose.

IMPORTANT:
The two requested outputs must be TWO SEPARATE PHOTOGRAPHS.

Do not combine two poses into one image.

Do not create a split-screen.

Do not create a collage.

Do not show multiple copies of the model in one frame.

Each output must contain one coherent fashion photograph.

Pose ${poseNumber} must be clearly different from the other
requested pose while preserving the same garment identity.

The garment must remain naturally fitted to the model's body
with physically believable fabric folds.

=========================================================
FASHION STYLE
=========================================================

${fashionStyle}

Use this style only to influence:
- composition
- styling
- location atmosphere
- photography direction
- accessories when appropriate

It must NOT redesign the garment.

=========================================================
LOCATION
=========================================================

Scene:
${scene}

${
  location
    ? `Location:
${location}`
    : ""
}

Vehicle:
${car}

The location must look physically real.

=========================================================
BACKGROUND
=========================================================

${buildBackgroundInstruction(
  hasBackgroundReference
)}

=========================================================
REALISTIC OBJECTS
=========================================================

${buildObjectsInstruction(
  body
)}

=========================================================
PHOTOGRAPHY
=========================================================

Camera direction:
${camera}

Requested aspect ratio:
${ratio}

Create:
- realistic adult human anatomy
- realistic face
- realistic skin
- realistic hair
- realistic hands
- realistic fingers
- realistic eyes
- realistic teeth when visible
- realistic garment-to-body contact
- realistic fabric tension
- realistic fabric folds
- realistic seams
- realistic stitching
- realistic shadows
- realistic reflections
- physically plausible lighting
- realistic depth
- realistic perspective
- realistic materials
- natural skin texture
- natural hair texture
- professional lens rendering
- realistic depth of field
- realistic background separation
- professional fashion composition
- premium commercial photography
- high-end editorial quality

The final result should look like a genuine photograph captured
with a professional full-frame camera.

=========================================================
REAL CAMERA LOOK
=========================================================

Avoid:
- CGI appearance
- plastic skin
- wax-like skin
- artificial-looking fabric
- cartoon appearance
- illustration appearance
- obvious synthetic rendering
- excessive sharpening
- fake HDR
- unnatural glow
- impossible reflections
- impossible shadows
- distorted anatomy
- extra fingers
- fused fingers
- malformed hands
- duplicated limbs
- warped garment seams
- melted clothing details
- random text
- watermark
- artificial-looking background

Use realistic:
- lens perspective
- exposure
- depth of field
- motion-free detail
- natural highlights
- natural shadows
- realistic color response
- subtle photographic imperfections
- professional editorial framing

=========================================================
ACCESSORIES
=========================================================

Accessories may be added only when they naturally complement
the requested fashion campaign.

Examples:
- tasteful handbag
- sunglasses
- simple jewelry
- watch
- shoes
- fashion accessories

Do not allow accessories to cover or modify important garment
details.

=========================================================
COMPANION
=========================================================

${buildCompanionInstruction(
  body
)}

=========================================================
COLOR VARIANT
=========================================================

${
  variantColor
    ? `
Create the requested garment color variant:

${variantColor}

Change ONLY the garment color.

Keep identical:
- garment category
- silhouette
- construction
- proportions
- pattern
- graphics
- buttons
- seams
- trims
- fabric
- all other visible garment details.

Do not redesign the garment.
`
    : `
Preserve the original garment color exactly as shown in the
uploaded reference.
`
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
FINAL QUALITY CONTROL
=========================================================

Before producing the image, internally verify:

1. Is the garment the same garment as the reference?
2. Is the garment category unchanged?
3. Are the major visible details preserved?
4. Is the color accurate?
5. Is the model an adult when an adult model is requested?
6. Is the pose natural?
7. Is this one complete photograph rather than a collage?
8. Are the objects physically realistic?
9. Is the environment believable?
10. Does the image look like a real professional camera photograph?

If any styling instruction conflicts with garment accuracy,
PRESERVE THE GARMENT.

=========================================================
PRIORITY ORDER
=========================================================

1. Uploaded garment identity
2. Garment construction
3. Garment color and pattern
4. Garment details
5. Photorealistic model
6. Realistic garment fit
7. Requested pose
8. Background/reference environment
9. Realistic objects
10. Fashion styling
11. Vehicle
12. Creative direction

The final image must visibly show the SAME GARMENT from the
uploaded reference, realistically worn by the selected adult
fashion model.

=========================================================
END OBITREND PROMPT
=========================================================
`;
}

/* =========================================================
IMAGE INPUT CREATION
========================================================= */

async function createImageFile(
  base64,
  mimeType,
  filename
) {
  const buffer =
    Buffer.from(
      base64,
      "base64"
    );

  if (!buffer.length) {
    throw new Error(
      "The uploaded image is empty."
    );
  }

  if (
    buffer.length >
    MAX_IMAGE_BYTES
  ) {
    throw new Error(
      "The uploaded reference image is too large. Please upload a smaller image."
    );
  }

  return toFile(
    buffer,
    filename,
    {
      type: mimeType,
    }
  );
}

/* =========================================================
OPENAI IMAGE GENERATION
========================================================= */

async function generateTwoImages({
  clothingBase64,
  clothingMimeType,
  backgroundBase64,
  backgroundMimeType,
  prompts,
  size,
}) {
  const clothingBuffer =
    Buffer.from(
      clothingBase64,
      "base64"
    );

  if (
    !clothingBuffer.length
  ) {
    throw new Error(
      "The uploaded clothing image is empty."
    );
  }

  if (
    clothingBuffer.length >
    MAX_IMAGE_BYTES
  ) {
    throw new Error(
      "The uploaded clothing image is too large."
    );
  }

  let totalBytes =
    clothingBuffer.length;

  const clothingFile =
    await toFile(
      clothingBuffer,
      `clothing-reference.${extensionFromMime(
        clothingMimeType
      )}`,
      {
        type: clothingMimeType,
      }
    );

  const inputImages = [
    clothingFile,
  ];

  if (
    backgroundBase64
  ) {
    const backgroundBuffer =
      Buffer.from(
        backgroundBase64,
        "base64"
      );

    if (
      !backgroundBuffer.length
    ) {
      throw new Error(
        "The background reference image is empty."
      );
    }

    totalBytes +=
      backgroundBuffer.length;

    if (
      backgroundBuffer.length >
      MAX_IMAGE_BYTES
    ) {
      throw new Error(
        "The background reference image is too large. Please upload a smaller image."
      );
    }

    if (
      totalBytes >
      MAX_TOTAL_REFERENCE_BYTES
    ) {
      throw new Error(
        "The clothing and background reference images are too large together. Please use smaller images."
      );
    }

    const backgroundFile =
      await toFile(
        backgroundBuffer,
        `background-reference.${extensionFromMime(
          backgroundMimeType
        )}`,
        {
          type: backgroundMimeType,
        }
      );

    inputImages.push(
      backgroundFile
    );
  }

  /*
  GPT-Image-2 receives the garment reference and, when supplied,
  the background reference.

  n=2 requests two separate output images.
  */

  const result =
    await openai.images.edit({
      model: MODEL,

      image:
        inputImages.length === 1
          ? inputImages[0]
          : inputImages,

      prompt: prompts.join(
        "\n\n=========================================================\n\n"
      ),

      size,

      quality:
        IMAGE_QUALITY,

      n:
        NUMBER_OF_POSES,

      output_format:
        "png",
    });

  const outputImages =
    Array.isArray(
      result?.data
    )
      ? result.data
          .map(
            (item) =>
              item?.b64_json
                ? `data:image/png;base64,${item.b64_json}`
                : null
          )
          .filter(Boolean)
      : [];

  if (
    !outputImages.length
  ) {
    throw new Error(
      "OpenAI did not return any generated images."
    );
  }

  return outputImages;
}

/* =========================================================
SAFETY ERROR NORMALIZATION
========================================================= */

function getGenerationErrorMessage(
  error
) {
  const message =
    String(
      error?.message ||
        ""
    );

  const serialized =
    (() => {
      try {
        return JSON.stringify(
          error
        );
      } catch {
        return "";
      }
    })();

  const combined =
    `${message} ${serialized}`.toLowerCase();

  if (
    combined.includes(
      "safety"
    ) &&
    (
      combined.includes(
        "sexual"
      ) ||
      combined.includes(
        "violation"
      )
    )
  ) {
    return {
      status: 400,
      code:
        "UNSUITABLE_FASHION_REFERENCE",
      message:
        "The uploaded reference image could not be used for this fashion generation. Please upload a clothing-only reference such as a flat-lay garment, garment on a hanger, or a fully covered mannequin.",
    };
  }

  return null;
}

/* =========================================================
API HANDLER
========================================================= */

export default async function handler(
  req,
  res
) {
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

  if (
    !process.env.OPENAI_API_KEY
  ) {
    return res.status(500).json({
      success: false,
      error:
        "OPENAI_API_KEY is not configured.",
    });
  }

  let charge = null;
  let redis = null;
  let userId = null;

  try {
    const body =
      normalizeBody(
        req.body
      );

    /* =====================================================
    CLOTHING IMAGE
    ===================================================== */

    const imageInput =
      getNestedValue(
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
        code:
          "MISSING_CLOTHING_IMAGE",
      });
    }

    const mimeType =
      getMimeType(
        imageInput
      );

    /* =====================================================
    OPTIONAL BACKGROUND REFERENCE
    ===================================================== */

    const backgroundInput =
      getNestedValue(
        body,
        "backgroundReferenceImage",
        "backgroundImage",
        "sceneReferenceImage",
        "referenceBackground",
        "backgroundReference"
      );

    const backgroundBase64 =
      normalizeBase64(
        backgroundInput
      );

    const backgroundMimeType =
      backgroundBase64
        ? getMimeType(
            backgroundInput
          )
        : null;

    /* =====================================================
    AUTHENTICATION
    ===================================================== */

    let auth = null;

    try {
      auth =
        await getAuthenticatedUser(
          req
        );
    } catch (authError) {
      console.error(
        "OBITREND authentication error:",
        authError
      );
    }

    if (
      auth &&
      auth.ok
    ) {
      userId =
        auth.user?.id ||
        null;
    } else {
      /*
      Keep compatibility with the existing workflow if the
      authentication helper is not available for a particular
      deployment configuration.
      */
      userId =
        getFallbackUserId(
          body,
          req
        );
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        error:
          "Authentication is required.",
      });
    }

    /* =====================================================
    REDIS
    ===================================================== */

    redis =
      getRedisOrNull();

    if (!redis) {
      return res.status(500).json({
        success: false,
        error:
          "OBITREND credits service is not configured.",
        code:
          "REDIS_NOT_CONFIGURED",
      });
    }

    /* =====================================================
    PRO
    ===================================================== */

    const proActive =
      await proActiveFor(
        userId,
        redis
      );

    /* =====================================================
    CREDIT
    ===================================================== */

    charge =
      await spendIfNeeded(
        userId,
        proActive,
        redis
      );

    if (
      !charge.success
    ) {
      return res.status(402).json({
        success: false,
        error:
          "Your free generations are finished. Upgrade to OBITREND Pro to continue.",
        upgradeRequired:
          true,
        balance:
          charge.balance,
      });
    }

    /* =====================================================
    COLOR
    ===================================================== */

    const colours =
      getColourList(
        body
      );

    /*
    If colors are supplied, keep the existing multi-colour
    workflow.

    Otherwise create one campaign with two poses.
    */

    const colourVariants =
      colours.length
        ? colours
        : [""];

    /* =====================================================
    SIZE
    ===================================================== */

    const size =
      getImageSize(
        getNestedValue(
          body,
          "aspectRatio",
          "ratio"
        )
      );

    /* =====================================================
    POSES
    ===================================================== */

    const poses =
      getPoseInstructions(
        body
      );

    const differentModels =
      getDifferentModels(
        body
      );

    const hasBackgroundReference =
      Boolean(
        backgroundBase64
      );

    /* =====================================================
    GENERATION
    ===================================================== */

    let images = [];

    try {
      /*
      The normal workflow generates two separate images.

      If multiple colors are requested, the first two outputs
      represent the two pose campaign for the requested color.
      Additional colors remain compatible with the old color
      workflow but are capped by MAX_COLOUR_IMAGES.
      */

      for (
        const color of colourVariants.slice(
          0,
          MAX_COLOUR_IMAGES
        )
      ) {
        const prompts =
          [
            buildPrompt(
              body,
              color,
              1,
              poses[0],
              differentModels,
              hasBackgroundReference
            ),

            buildPrompt(
              body,
              color,
              2,
              poses[1],
              differentModels,
              hasBackgroundReference
            ),
          ];

        const generated =
          await generateTwoImages({
            clothingBase64:
              imageBase64,

            clothingMimeType:
              mimeType,

            backgroundBase64:
              backgroundBase64,

            backgroundMimeType:
              backgroundMimeType,

            prompts,

            size,
          });

        images.push(
          ...generated
        );

        /*
        For the normal no-colour workflow, stop after the
        requested two outputs.
        */
        if (
          !colours.length
        ) {
          break;
        }

        /*
        Keep the existing colour-image cap.
        */
        if (
          images.length >=
          MAX_COLOUR_IMAGES
        ) {
          break;
        }
      }
    } catch (generationError) {
      const safety =
        getGenerationErrorMessage(
          generationError
        );

      const refunded =
        await refundIfNeeded(
          charge,
          userId,
          redis
        );

      if (safety) {
        return res.status(
          safety.status
        ).json({
          success: false,
          ok: false,
          error:
            safety.message,
          code:
            safety.code,
          refunded,
          usedFreeCredit:
            false,
        });
      }

      throw generationError;
    }

    /* =====================================================
    FINAL VALIDATION
    ===================================================== */

    if (
      !images.length
    ) {
      const refunded =
        await refundIfNeeded(
          charge,
          userId,
          redis
        );

      return res.status(500).json({
        success: false,
        ok: false,
        error:
          "Image generation failed because no image was returned.",
        refunded,
        usedFreeCredit:
          false,
      });
    }

    const firstImage =
      images[0];

    /* =====================================================
    RESPONSE
    ===================================================== */

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

      /*
      Two-pose output.
      */
      images,

      poseImages:
        images,

      colorImages:
        images,

      colourImages:
        images,

      poseCount:
        Math.min(
          images.length,
          NUMBER_OF_POSES
        ),

      poses: [
        poses[0],
        poses[1],
      ],

      balance:
        charge.balance,

      pro:
        proActive,

      usedFreeCredit:
        Boolean(
          charge.usedCredit
        ),

      refunded:
        false,

      garmentReferenceType:
        getGarmentReferenceType(
          body
        ),

      backgroundReferenceUsed:
        hasBackgroundReference,
    });
  } catch (error) {
    console.error(
      "OBITREND generation error:",
      error
    );

    const safety =
      getGenerationErrorMessage(
        error
      );

    const refunded =
      await refundIfNeeded(
        charge,
        userId,
        redis
      );

    if (safety) {
      return res.status(
        safety.status
      ).json({
        success: false,
        ok: false,
        error:
          safety.message,
        code:
          safety.code,
        refunded,
        usedFreeCredit:
          false,
      });
    }

    return res.status(500).json({
      success: false,
      ok: false,
      error:
        error?.message ||
        "Image generation failed.",
      refunded,
      usedFreeCredit:
        false,
    });
  }
}
