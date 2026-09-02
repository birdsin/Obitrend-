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

OUTPUT / POSE SYSTEM

1 selected pose  = 1 image  = 1 OBITREND credit
2 selected poses = 2 images = 1 OBITREND credit
3 selected poses = 3 images = 1 OBITREND credit
4 selected poses = 4 images = 1 OBITREND credit
etc.

IMPORTANT:
Each requested pose is generated with its OWN image-edit
request.

This prevents:
- split-screen images
- collages
- two poses inside one image
- duplicated models inside one frame

EXISTING COMPATIBILITY:
- /api/generate
- credits.js
- Pro
- Redis
- authentication
- Paystack / Pro workflow
- imageBase64
- uploadedImage
- image
- clothingImage
- referenceImage
- image
- imageUrl
- url
- generatedImage
- images
- colorImages
- colourImages

ADDED:
- selectable pose count
- selectable image count
- multiple separate images
- flat-lay garment reference
- hanger garment reference
- fully covered mannequin reference
- automatic garment type recognition
- different adult model support
- realistic objects
- background reference support
- strict garment preservation
- professional real-camera appearance
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
  process.env.OPENAI_IMAGE_MODEL ||
  "gpt-image-2";

const IMAGE_QUALITY = "high";

const MAX_IMAGE_BYTES =
  9 * 1024 * 1024;

const MAX_TOTAL_REFERENCE_BYTES =
  9 * 1024 * 1024;

const MAX_OUTPUT_IMAGES = 10;

const MAX_COLOUR_IMAGES = 4;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* =========================================================
HELPERS
========================================================= */

function clean(
  value,
  fallback = ""
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return fallback;
  }

  return String(value).trim();
}

function getValue(
  body,
  ...names
) {
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

function getBoolean(
  body,
  ...names
) {
  for (const name of names) {
    const value =
      body?.[name];

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

function normalizeBody(body) {
  if (!body) {
    return {};
  }

  if (
    typeof body === "string"
  ) {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }

  return body;
}

/* =========================================================
NESTED VALUES
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
BASE64
========================================================= */

function normalizeBase64(
  input
) {
  if (!input) {
    return null;
  }

  let value =
    String(input).trim();

  if (
    value.startsWith(
      "data:image/"
    )
  ) {
    const comma =
      value.indexOf(",");

    if (comma !== -1) {
      value =
        value.slice(
          comma + 1
        );
    }
  }

  value =
    value.replace(
      /\s/g,
      ""
    );

  return value.length >= 100
    ? value
    : null;
}

/* =========================================================
MIME
========================================================= */

function getMimeType(
  input
) {
  const match =
    String(input || "")
      .match(
        /^data:(image\/[a-zA-Z0-9.+-]+);base64,/i
      );

  return match
    ? match[1].toLowerCase()
    : "image/jpeg";
}

function extensionFromMime(
  mime
) {
  if (
    mime.includes("png")
  ) {
    return "png";
  }

  if (
    mime.includes("webp")
  ) {
    return "webp";
  }

  if (
    mime.includes("gif")
  ) {
    return "gif";
  }

  return "jpg";
}

/* =========================================================
IMAGE SIZE
========================================================= */

function getImageSize(
  value
) {
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

function getColourList(
  body
) {
  const raw =
    getNestedValue(
      body,
      "clothingColors",
      "colors",
      "selectedColors"
    );

  let list = [];

  if (
    Array.isArray(raw)
  ) {
    list = raw;
  } else if (
    typeof raw ===
      "string" &&
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
OUTPUT COUNT
========================================================= */

function getOutputCount(
  body
) {
  /*
  Supported frontend names:
  - poseCount
  - numberOfPoses
  - imageCount
  - numberOfImages
  - outputCount
  - numberOfOutputs
  - selectedPoseCount
  */

  const raw =
    getNestedValue(
      body,
      "outputCount",
      "numberOfOutputs",
      "imageCount",
      "numberOfImages",
      "poseCount",
      "numberOfPoses",
      "selectedPoseCount"
    );

  let count =
    Number(raw);

  /*
  If the frontend supplies an array of poses,
  use its length when no numeric count is supplied.
  */

  if (
    (!Number.isFinite(count) ||
      count < 1) &&
    Array.isArray(
      getNestedValue(
        body,
        "poses",
        "poseList"
      )
    )
  ) {
    count =
      getNestedValue(
        body,
        "poses",
        "poseList"
      ).length;
  }

  if (
    !Number.isFinite(count) ||
    count < 1
  ) {
    count = 1;
  }

  count =
    Math.floor(count);

  return Math.min(
    Math.max(
      count,
      1
    ),
    MAX_OUTPUT_IMAGES
  );
}

/* =========================================================
POSE LIST
========================================================= */

function getPoseList(
  body,
  outputCount
) {
  const raw =
    getNestedValue(
      body,
      "poses",
      "poseList"
    );

  let poses = [];

  if (
    Array.isArray(raw)
  ) {
    poses =
      raw
        .map(
          (item) =>
            clean(item)
        )
        .filter(Boolean);
  }

  if (
    typeof raw ===
      "string" &&
    raw.trim()
  ) {
    poses =
      raw
        .split(",")
        .map(
          (item) =>
            item.trim()
        )
        .filter(Boolean);
  }

  const singlePose =
    clean(
      getNestedValue(
        body,
        "pose"
      )
    );

  if (
    poses.length === 0 &&
    singlePose
  ) {
    poses = [
      singlePose,
    ];
  }

  const defaults = [
    "standing naturally in a confident professional fashion pose",
    "a clearly different elegant fashion pose with natural posture",
    "a stylish editorial walking pose",
    "a relaxed three-quarter fashion pose",
    "a confident seated fashion pose when appropriate to the location",
    "a natural side-angle fashion pose",
    "a sophisticated full-length campaign pose",
    "a relaxed candid luxury fashion pose",
    "a strong editorial stance with natural body language",
    "a refined fashion pose with subtle movement",
  ];

  while (
    poses.length <
    outputCount
  ) {
    poses.push(
      defaults[
        poses.length %
          defaults.length
      ]
    );
  }

  return poses.slice(
    0,
    outputCount
  );
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
    "differentAdultModels",
    "modelVariation"
  );
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
    value.includes(
      "flat"
    )
  ) {
    return "flat-lay";
  }

  if (
    value.includes(
      "hanger"
    )
  ) {
    return "hanger";
  }

  if (
    value.includes(
      "mannequin"
    )
  ) {
    return "fully covered mannequin";
  }

  return "auto";
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
GARMENT REFERENCE: FLAT-LAY

Treat the uploaded flat-lay garment photograph as a professional
product reference.

The GARMENT itself is authoritative.

Ignore:
- table
- floor
- background
- surrounding props
- unrelated objects
- unrelated shadows

Extract the actual garment shape, construction, color, fabric,
pattern and visible details.

Recreate that same garment naturally on the selected model.
`;
  }

  if (
    referenceType ===
    "hanger"
  ) {
    return `
GARMENT REFERENCE: HANGER

Treat the uploaded hanging garment as a professional clothing
product reference.

The GARMENT itself is authoritative.

Ignore:
- hanger
- wall
- room
- background
- unrelated objects
- unrelated shadows

Infer the actual garment shape and construction from the visible
reference.

Do not place the hanger in the final fashion photograph.
`;
  }

  if (
    referenceType ===
    "fully covered mannequin"
  ) {
    return `
GARMENT REFERENCE: FULLY COVERED MANNEQUIN

Treat the uploaded fully covered mannequin photograph as a
professional garment reference.

The GARMENT itself is authoritative.

Ignore:
- mannequin identity
- mannequin face
- mannequin body identity
- mannequin surface
- mannequin pose
- background
- unrelated objects

Use the visible clothing construction to reproduce the same
garment naturally on the selected adult fashion model.
`;
  }

  return `
GARMENT REFERENCE: AUTO

Determine whether the uploaded clothing reference is primarily:
- flat-lay
- hanger
- fully covered mannequin
- another legitimate clothing/product presentation.

Regardless of presentation, treat the GARMENT itself as the
primary visual reference.

Ignore unrelated people, backgrounds, props and objects.
`;
}

/* =========================================================
CLOTHING TYPE
========================================================= */

function buildClothingTypeInstruction(
  body
) {
  const type =
    clean(
      getNestedValue(
        body,
        "clothingType",
        "outfitType",
        "garmentType",
        "category"
      ),
      "automatically detect the garment type from the reference"
    );

  return `
CLOTHING TYPE

${type}

If no clothing type is supplied, identify it from the reference.

Accurately support different legitimate fashion categories,
including:
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
- other visible clothing categories

Never change the garment into another category.
`;
}

/* =========================================================
MODEL PROMPT
========================================================= */

function buildModelInstruction(
  body,
  differentModels,
  poseNumber
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

  const model2 =
    clean(
      getNestedValue(
        body,
        "model2",
        "secondModel",
        "selectedModel2"
      ),
      "different adult fashion model"
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

  if (
    differentModels
  ) {
    return `
ADULT MODEL

Output number:
${poseNumber}

Use adult fashion models only.

Primary model direction:
${model}

Body style:
${bodyStyle}

Different-model mode is enabled.

For variation between generated photographs, use visually
different adult fashion models.

Alternative model:
${model2}

Models may naturally differ in:
- face
- hairstyle
- skin tone
- body proportions
- overall adult appearance

IMPORTANT:

The MODEL may change.

The GARMENT MUST NOT change.

Every generated photograph must use the same uploaded garment
identity and construction.
`;
  }

  return `
ADULT MODEL

Use an adult fashion model.

Model:
${model}

Body style:
${bodyStyle}

Keep the selected model direction consistent across the campaign
unless the frontend explicitly requests different models.
`;
}

/* =========================================================
OBJECTS
========================================================= */

function buildObjectsInstruction(
  body
) {
  const requested =
    clean(
      getNestedValue(
        body,
        "objects",
        "props",
        "environmentObjects"
      )
    );

  return `
REALISTIC ENVIRONMENTAL OBJECTS

${
  requested
    ? `
Requested objects:
${requested}
`
    : `
Use natural, scene-appropriate objects when appropriate.

Examples:
- tables
- chairs
- handbags
- shopping bags
- plants
- lamps
- fashion racks
- hotel furniture
- restaurant settings
- café objects
- airport furniture
- pool furniture
- architectural details
- realistic street objects
- cars
- tasteful decorative elements
`
}

Objects must have:
- correct perspective
- realistic scale
- realistic materials
- realistic shadows
- realistic reflections
- correct depth
- believable placement
- natural occlusion

Do not add random clutter.

Do not allow objects to cover important garment details.

Do not merge objects into the model or garment.
`;
}

/* =========================================================
BACKGROUND
========================================================= */

function buildBackgroundInstruction(
  hasBackgroundReference
) {
  if (
    hasBackgroundReference
  ) {
    return `
BACKGROUND REFERENCE IMAGE PROVIDED

Use the supplied background image as the primary environment
reference.

Reproduce it as closely as possible while creating a new fashion
photograph.

Preserve where visible:
- architecture
- layout
- furniture
- major structures
- colors
- lighting direction
- perspective
- spatial relationships
- recognizable environmental details

Do not copy unrelated people as the fashion subject.

Place the model naturally inside the environment.

The garment remains the highest-priority visual reference.
`;
  }

  return `
NO BACKGROUND REFERENCE PROVIDED

Create the requested environment naturally and photorealistically.

The location must look like a real physical place.
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
    companion ===
      "none"
  ) {
    return `
COMPANION

No companion requested.

Create only the main adult fashion model.

Do not add unrelated people.
`;
  }

  return `
COMPANION

Requested companion:
${companion}

Keep the companion secondary to the main fashion model.

The companion must be fully clothed and age-appropriate.

Do not allow the companion to cover, replace or modify the
main garment.
`;
}

/* =========================================================
MAIN PROMPT
========================================================= */

function buildPrompt(
  body,
  options
) {
  const {
    poseNumber,
    poseText,
    outputCount,
    differentModels,
    hasBackgroundReference,
    variantColor,
  } = options;

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

  const vehicle =
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

  const userPrompt =
    clean(
      getNestedValue(
        body,
        "prompt",
        "description"
      )
    );

  const extra =
    clean(
      getNestedValue(
        body,
        "extra",
        "additionalPrompt"
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
OBITREND PROFESSIONAL FASHION PHOTOGRAPHY
=========================================================

Create ONE complete photorealistic fashion photograph.

THIS REQUEST REPRESENTS ONE SINGLE OUTPUT IMAGE.

This is output:
${poseNumber}

Total requested photographs:
${outputCount}

IMPORTANT:

This image must contain ONE coherent photograph.

NEVER create:
- split screen
- collage
- contact sheet
- before/after layout
- two photographs inside one frame
- multiple poses inside one frame
- duplicate models
- multiple copies of the same person

ONE API REQUEST = ONE COMPLETE PHOTOGRAPH.

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
STRICT GARMENT PRESERVATION
=========================================================

The uploaded clothing image is the PRIMARY visual reference
for the garment.

Do NOT treat it as loose inspiration.

Reproduce the SAME garment.

Preserve as accurately as possible:

- exact garment category
- exact garment type
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
- darts
- seams
- stitching
- panels
- pleats
- gathers
- folds
- draping
- hem
- buttons
- button placement
- zipper placement
- ties
- belts only when actually present
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
- original color
- color relationships
- front construction
- back construction
- visible fastening details

Do not simplify the garment.

Do not redesign the garment.

Do not replace it with a generic luxury outfit.

Do not change its category.

Do not change its proportions.

Do not add sleeves that do not exist.

Do not remove sleeves that exist.

Do not invent buttons.

Do not remove important buttons.

Do not change stripe direction.

Do not change pattern placement.

Do not remove important graphics.

Do not replace the garment with another garment.

=========================================================
MODEL
=========================================================

${buildModelInstruction(
  body,
  differentModels,
  poseNumber
)}

=========================================================
POSE
=========================================================

THIS IS ONE SINGLE POSE.

Pose number:
${poseNumber}

Pose:
${poseText}

Create exactly ONE natural fashion pose in this photograph.

The pose must be physically believable.

The model must have:
- natural posture
- realistic body mechanics
- realistic hands
- realistic arms
- realistic legs
- realistic garment movement
- realistic fabric tension

This photograph must NOT contain the other poses.

The other poses are generated separately as separate images.

=========================================================
FASHION STYLE
=========================================================

${fashionStyle}

Fashion styling may influence:
- composition
- atmosphere
- accessories
- lighting
- location
- editorial direction

BUT styling must NEVER redesign the uploaded garment.

=========================================================
LOCATION
=========================================================

Scene:
${scene}

${
  location
    ? `
Location:
${location}
`
    : ""
}

Vehicle:
${vehicle}

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

Camera:
${camera}

Aspect ratio:
${ratio}

Make the result look like a real professional camera photograph.

Use:

- realistic adult anatomy
- realistic face
- realistic skin texture
- realistic hair
- realistic hands
- realistic fingers
- realistic eyes
- realistic garment fit
- realistic garment-to-body contact
- realistic fabric folds
- realistic seams
- realistic stitching
- realistic shadows
- realistic reflections
- realistic materials
- physically plausible lighting
- natural depth of field
- professional lens rendering
- natural perspective
- realistic background separation
- premium commercial photography
- high-end fashion editorial quality

=========================================================
REAL CAMERA APPEARANCE
=========================================================

The final image should look like it was captured by a
professional photographer using a high-quality full-frame camera.

Avoid:

- CGI appearance
- plastic skin
- wax skin
- artificial fabric
- cartoon appearance
- illustration appearance
- fake 3D rendering
- excessive sharpening
- artificial glow
- impossible reflections
- impossible shadows
- distorted anatomy
- extra fingers
- fused fingers
- malformed hands
- duplicated limbs
- warped seams
- melted garment details
- random text
- watermark

=========================================================
ACCESSORIES
=========================================================

Accessories may complement the fashion campaign naturally.

Examples:
- handbag
- sunglasses
- tasteful jewelry
- watch
- appropriate footwear
- fashion accessories

Do not allow accessories to cover important garment details.

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
Requested garment color variant:

${variantColor}

Change ONLY the garment color.

Keep:
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
- all other garment details

Do not redesign the garment.
`
    : `
Preserve the garment's original color exactly as shown in the
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
FINAL QUALITY CHECK
=========================================================

Before producing this image, verify:

1. ONE photograph only.
2. ONE pose only.
3. ONE coherent model composition.
4. No collage.
5. No split screen.
6. No duplicate model.
7. Garment matches the uploaded reference.
8. Garment category is unchanged.
9. Garment color is accurate.
10. Garment construction is preserved.
11. Model anatomy is realistic.
12. Hands are realistic.
13. Objects are realistic.
14. Environment is realistic.
15. Lighting is physically believable.
16. Final appearance resembles professional camera photography.

If any creative direction conflicts with garment accuracy,
PRESERVE THE GARMENT.

=========================================================
PRIORITY ORDER
=========================================================

1. Uploaded garment identity
2. Garment construction
3. Garment color and pattern
4. Garment details
5. One coherent photograph
6. Photorealistic adult model
7. Realistic garment fit
8. Selected pose
9. Background
10. Realistic objects
11. Fashion styling
12. Vehicle
13. Creative direction

=========================================================
FINAL COMMAND
=========================================================

GENERATE EXACTLY ONE COMPLETE PHOTOGRAPH FOR THIS REQUEST.

DO NOT PLACE MULTIPLE POSES OR MULTIPLE PHOTOGRAPHS INSIDE
THIS IMAGE.

THE NEXT POSE, IF REQUESTED, WILL BE GENERATED SEPARATELY.
=========================================================
`;
}

/* =========================================================
GENERATE ONE IMAGE
========================================================= */

async function generateOneImage({
  clothingBase64,
  clothingMimeType,
  backgroundBase64,
  backgroundMimeType,
  prompt,
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
      "The uploaded clothing image is too large. Please upload a smaller image."
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
        type:
          clothingMimeType,
      }
    );

  const images = [
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
          type:
            backgroundMimeType,
        }
      );

    images.push(
      backgroundFile
    );
  }

  /*
  IMPORTANT:

  There is deliberately NO n: 2 here.

  Each pose gets its own separate OpenAI image-edit request.

  That prevents the model from placing two poses inside one
  image.
  */

  const result =
    await openai.images.edit({
      model: MODEL,

      image:
        images.length === 1
          ? images[0]
          : images,

      prompt,

      size,

      quality:
        IMAGE_QUALITY,

      output_format:
        "png",
    });

  const base64 =
    result?.data?.[0]
      ?.b64_json;

  if (!base64) {
    throw new Error(
      "OpenAI did not return an image."
    );
  }

  return `data:image/png;base64,${base64}`;
}

/* =========================================================
SAFETY ERROR
========================================================= */

function getSafetyError(
  error
) {
  const message =
    String(
      error?.message ||
        ""
    );

  let serialized = "";

  try {
    serialized =
      JSON.stringify(
        error
      );
  } catch {
    serialized = "";
  }

  const combined =
    `${message} ${serialized}`
      .toLowerCase();

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
    OPTIONAL BACKGROUND
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
          "Authentication is required.",
      });
    }

    userId =
      auth.user.id;

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

    const proStatus =
      await getProStatus(
        userId,
        redis
      );

    const proActive =
      Boolean(
        proStatus?.active
      );

    /* =====================================================
    ONE CREDIT FOR THE WHOLE REQUEST
    ===================================================== */

    /*
    VERY IMPORTANT:

    The credit is spent ONCE here.

    It does NOT matter whether the user requests:
    1 image
    2 images
    3 images
    4 images
    etc.

    All images generated by this request use the same single
    credit deduction.

    Pro users are not charged by this credit system.
    */

    if (proActive) {
      charge = {
        success: true,
        balance: null,
        usedCredit: false,
      };
    } else {
      charge =
        await spendCredit(
          userId,
          redis
        );

      charge = {
        ...charge,
        usedCredit:
          Boolean(
            charge?.success
          ),
      };
    }

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

        usedFreeCredit:
          false,
      });
    }

    /* =====================================================
    OUTPUT COUNT
    ===================================================== */

    const requestedOutputCount =
      getOutputCount(
        body
      );

    /* =====================================================
    POSES
    ===================================================== */

    const poses =
      getPoseList(
        body,
        requestedOutputCount
      );

    /* =====================================================
    MODEL VARIATION
    ===================================================== */

    const differentModels =
      getDifferentModels(
        body
      );

    /* =====================================================
    COLORS
    ===================================================== */

    const colours =
      getColourList(
        body
      );

    /*
    Preserve existing colour behavior.

    If no colors were supplied:
    generate the selected number of poses.

    If colors were supplied:
    preserve the colour workflow while keeping the whole request
    under one OBITREND credit.
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
    BACKGROUND
    ===================================================== */

    const hasBackgroundReference =
      Boolean(
        backgroundBase64
      );

    /* =====================================================
    GENERATE ALL IMAGES
    ===================================================== */

    const images = [];

    try {
      /*
      Normal workflow:

      Each pose is a separate API call.

      Therefore:

      Pose 1 -> API call -> Image 1
      Pose 2 -> API call -> Image 2
      Pose 3 -> API call -> Image 3
      etc.

      No multiple poses are sent together.
      */

      for (
        let poseIndex = 0;
        poseIndex <
          requestedOutputCount;
        poseIndex++
      ) {
        const poseNumber =
          poseIndex + 1;

        const poseText =
          poses[
            poseIndex
          ];

        /*
        Use the first requested color for the primary campaign
        image generation.

        Existing multi-colour fields remain accepted.
        */

        const variantColor =
          colourVariants[0] ||
          "";

        const prompt =
          buildPrompt(
            body,
            {
              poseNumber,
              poseText,
              outputCount:
                requestedOutputCount,
              differentModels,
              hasBackgroundReference,
              variantColor,
            }
          );

        const generated =
          await generateOneImage({
            clothingBase64:
              imageBase64,

            clothingMimeType:
              mimeType,

            backgroundBase64:
              backgroundBase64,

            backgroundMimeType:
              backgroundMimeType,

            prompt,

            size,
          });

        images.push(
          generated
        );
      }
    } catch (generationError) {
      const safety =
        getSafetyError(
          generationError
        );

      /*
      Refund the ONE credit if any part of the campaign fails.
      */

      let refunded = false;

      if (
        charge?.usedCredit &&
        redis
      ) {
        try {
          await refundCredit(
            userId,
            redis
          );

          refunded = true;
        } catch (
          refundError
        ) {
          console.error(
            "OBITREND credit refund failed:",
            refundError
          );
        }
      }

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

          requestedImages:
            requestedOutputCount,

          generatedImages:
            images.length,
        });
      }

      throw generationError;
    }

    /* =====================================================
    VALIDATE OUTPUT
    ===================================================== */

    if (
      images.length === 0
    ) {
      let refunded = false;

      if (
        charge?.usedCredit &&
        redis
      ) {
        try {
          await refundCredit(
            userId,
            redis
          );

          refunded = true;
        } catch (
          refundError
        ) {
          console.error(
            "OBITREND credit refund failed:",
            refundError
          );
        }
      }

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

    /* =====================================================
    FIRST IMAGE
    ===================================================== */

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

      /*
      BACKWARD COMPATIBILITY

      Existing frontend can continue displaying `image`.
      */

      image:
        firstImage,

      imageUrl:
        firstImage,

      url:
        firstImage,

      generatedImage:
        firstImage,

      /*
      ALL GENERATED IMAGES
      */

      images,

      poseImages:
        images,

      colorImages:
        images,

      colourImages:
        images,

      /*
      COUNTS
      */

      requestedImages:
        requestedOutputCount,

      generatedImages:
        images.length,

      imageCount:
        images.length,

      poseCount:
        images.length,

      /*
      POSE INFORMATION
      */

      poses:
        poses.slice(
          0,
          images.length
        ),

      /*
      ACCOUNT
      */

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

      /*
      REFERENCE INFORMATION
      */

      garmentReferenceType:
        getGarmentReferenceType(
          body
        ),

      backgroundReferenceUsed:
        hasBackgroundReference,

      differentModels,
    });
  } catch (error) {
    console.error(
      "OBITREND generation error:",
      error
    );

    const safety =
      getSafetyError(
        error
      );

    let refunded = false;

    /*
    Refund only the ONE credit used for the entire request.
    */

    if (
      charge?.usedCredit &&
      redis
    ) {
      try {
        await refundCredit(
          userId,
          redis
        );

        refunded = true;
      } catch (
        refundError
      ) {
        console.error(
          "OBITREND credit refund failed:",
          refundError
        );
      }
    }

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

/* =========================================================
END OF OBITREND /api/generate.js
========================================================= */
