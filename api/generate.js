import OpenAI, { toFile } from "openai";

import {
  spendCredit,
  refundCredit,
  getProStatus,
  getRedisConfig,
} from "./credits.js";

/*
=========================================================
OBITREND AI FASHION CREATOR
COMPLETE /api/generate.js REPLACEMENT

COMPATIBILITY:
- Existing /api/generate frontend endpoint
- Existing credits.js
- Existing Pro entitlement
- Existing Paystack/Pro system
- Existing image/imageBase64/uploadedImage/clothingImage/
  referenceImage field names
- Existing image/imageUrl/url/generatedImage/images/
  colorImages/colourImages response fields

ADDED:
- Garment reference type guidance
- Flat-lay garment references
- Hanger garment references
- Fully covered mannequin references
- Different clothing types
- Different adult model variations
- Output/image selection
- 1 image = 1 image
- 1 image = 2 images
- 1 image = 3 images
- 1 image = 4 images
- One API call = one photograph
- One photograph = one pose
- No collage
- No split-screen
- No multiple poses inside one output

IMPORTANT:
The uploaded clothing image remains the PRIMARY garment
reference and is not treated as generic inspiration.
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

const MAX_COLOUR_IMAGES = 4;

const MAX_OUTPUT_IMAGES = 4;

const MAX_IMAGE_BYTES =
  9 * 1024 * 1024;

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

/* =========================================================
BODY NORMALIZATION
========================================================= */

function normalizeBody(body) {
  if (!body) {
    return {};
  }

  if (
    typeof body ===
    "string"
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
    String(
      input || ""
    ).match(
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
    getValue(
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
USER ID
========================================================= */

function getUserId(
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
    return clean(
      supplied
    )
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
OUTPUT / POSE SELECTION
========================================================= */

function getOutputCount(
  body
) {
  const raw =
    getValue(
      body,
      "imageCount",
      "outputCount",
      "numberOfImages",
      "imagesCount",
      "generationCount",
      "poseCount",
      "numberOfPoses",
      "outputs",
      "generationMode",
      "outputMode"
    );

  const text =
    String(
      raw || "1"
    ).trim();

  /*
  Accept:

  1
  2
  3
  4

  and:

  1 image = 1 image
  1 image = 2 images
  1 image = 3 images
  1 image = 4 images
  */

  const equalsMatch =
    text.match(
      /(?:=|→|to)\s*(\d+)/i
    );

  const parsed =
    Number.parseInt(
      equalsMatch?.[1] ||
        text,
      10
    );

  if (
    !Number.isFinite(
      parsed
    )
  ) {
    return 1;
  }

  return Math.min(
    Math.max(
      parsed,
      1
    ),
    MAX_OUTPUT_IMAGES
  );
}

/* =========================================================
POSE SELECTION
========================================================= */

function getSelectedPoses(
  body,
  count
) {
  const defaults = [
    "standing naturally in a confident fashion pose",

    "a clearly different three-quarter fashion pose with natural body positioning",

    "a relaxed walking or movement-inspired fashion pose",

    "a refined editorial pose with a natural change in stance and hand position",
  ];

  const rawList =
    getValue(
      body,
      "poses",
      "poseList"
    );

  let supplied = [];

  if (
    Array.isArray(
      rawList
    )
  ) {
    supplied =
      rawList;
  } else if (
    typeof rawList ===
      "string" &&
    rawList.trim()
  ) {
    supplied =
      rawList
        .split(",")
        .map(
          (item) =>
            item.trim()
        )
        .filter(Boolean);
  }

  const result = [];

  for (
    let i = 0;
    i < count;
    i += 1
  ) {
    const numbered =
      getValue(
        body,
        `pose${i + 1}`,
        `pose_${i + 1}`,
        `pose${i + 1}Description`
      );

    result.push(
      clean(
        numbered ||
          supplied[i],
        defaults[i] ||
          "a natural professional fashion pose different from the previous output"
      )
    );
  }

  return result;
}

/* =========================================================
DIFFERENT ADULT MODELS
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
GARMENT REFERENCE TYPE: FLAT-LAY

The uploaded reference is a professional flat-lay
garment/product reference.

Treat the garment itself as the authoritative visual reference.

Ignore:
- flat-lay surface
- surrounding props
- unrelated objects
- original background
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

The uploaded reference is a hanging garment/product reference.

Treat the hanging garment as the authoritative garment reference.

Ignore:
- hanger
- wall
- room
- background
- surrounding objects
- unrelated shadows

Infer the actual garment shape and construction from the
visible reference.

Do not reproduce the hanger as part of the final outfit.
`;
  }

  if (
    referenceType ===
    "fully covered mannequin"
  ) {
    return `
GARMENT REFERENCE TYPE: FULLY COVERED MANNEQUIN

The uploaded reference shows the garment on a fully covered
fashion mannequin.

Treat the garment as the primary reference.

Ignore the mannequin's:
- identity
- face
- body identity
- pose
- surface
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
- another legitimate clothing/product presentation

Regardless of presentation, extract the garment itself as
the primary visual reference.

Ignore unrelated background, props, people and objects.
`;
}

/* =========================================================
CLOTHING TYPE
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

If no clothing type was explicitly specified, identify the
garment category from the uploaded reference.

Support the visible clothing category accurately, including:

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
- other clearly visible clothing categories

Never change one garment category into another.
`;
}

/* =========================================================
MODEL
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

The main model is an adult fashion model.

MODEL VARIATION:

${
  differentModels
    ? `
For separate output photographs, use visually distinct adult
fashion models while keeping the exact same garment identity.

Output 1 model:
${model}

Output 2 model:
${model2}

The models may naturally differ in:
- face
- hairstyle
- skin tone
- body proportions
- adult appearance

BUT the garment must remain the same.

Never place multiple main models into one frame unless the
frontend explicitly requests a companion.
`
    : `
Use the selected adult model direction consistently across
the requested separate photographs unless different models
were explicitly requested.
`
}
`;
}

/* =========================================================
REALISTIC OBJECTS
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
when they improve realism.

Examples:
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

Do not allow objects to cover important garment details.

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

Reproduce the environment as closely as possible while
creating a new fashion photograph.

Preserve where visible:

- architecture
- layout
- major structures
- furniture
- colors
- lighting direction
- perspective
- spatial relationships
- recognizable environmental details

Do not copy unrelated people as subjects.

Place the fashion model naturally into the referenced
environment.

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
    companion ===
      "none"
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
  totalOutputs = 1,
  differentModels = false,
  hasBackgroundReference = false
) {
  const model =
    clean(
      getValue(
        body,
        "model",
        "lady",
        "selectedModel"
      ),
      "adult fashion model"
    );

  const bodyStyle =
    clean(
      getValue(
        body,
        "bodyStyle",
        "body",
        "body_type"
      ),
      "natural balanced"
    );

  const fashionStyle =
    clean(
      getValue(
        body,
        "fashionStyle",
        "style"
      ),
      "luxury editorial"
    );

  const country =
    clean(
      getValue(
        body,
        "country"
      )
    );

  const city =
    clean(
      getValue(
        body,
        "city"
      )
    );

  const scene =
    clean(
      getValue(
        body,
        "scene",
        "background"
      ),
      "luxury fashion studio"
    );

  const car =
    clean(
      getValue(
        body,
        "car",
        "vehicle"
      ),
      "no vehicle unless appropriate"
    );

  const camera =
    clean(
      getValue(
        body,
        "camera",
        "lighting"
      ),
      "high-end commercial fashion photography"
    );

  const ratio =
    clean(
      getValue(
        body,
        "aspectRatio",
        "ratio"
      ),
      "5:4"
    );

  const extra =
    clean(
      getValue(
        body,
        "extra",
        "additionalPrompt"
      )
    );

  const userPrompt =
    clean(
      getValue(
        body,
        "prompt",
        "description"
      )
    );

  const location = [
    city,
    country,
  ]
    .filter(Boolean)
    .join(", ");

  const selectedPose =
    clean(
      poseText,
      poseNumber === 1
        ? "standing naturally in a confident fashion pose"
        : "a clearly different natural fashion pose"
    );

  return `
=========================================================
OBITREND STRICT GARMENT REPRODUCTION MODE
=========================================================

Create a new professional photorealistic fashion photograph.

The uploaded image is the PRIMARY AND STRICT VISUAL REFERENCE
for the GARMENT.

Create a new photograph where the selected adult model is
wearing the SAME garment shown in the uploaded reference.

DO NOT treat the garment as loose inspiration.

DO NOT invent a replacement outfit.

DO NOT redesign the garment.

=========================================================
REFERENCE IMAGE INTERPRETATION
=========================================================

${buildGarmentReferenceInstruction(
  getGarmentReferenceType(
    body
  )
)}

Use the uploaded image to identify the garment.

Ignore the original person's:

- identity
- face
- body
- age
- pose
- hairstyle
- accessories
- handbag
- shoes
- background
- location

Preserve the GARMENT.

If the reference image contains multiple legitimate views
of the garment, use all visible garment views to understand
its construction.

=========================================================
CLOTHING TYPE
=========================================================

${buildClothingTypeInstruction(
  body
)}

=========================================================
GARMENT MUST MATCH
=========================================================

Preserve as faithfully as possible:

- exact garment category
- exact garment type
- exact silhouette
- exact proportions
- exact length
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
- hem shape
- button count
- button placement
- zipper placement
- ties
- belts only when actually present
- pockets
- embroidery
- prints
- artwork
- logos
- labels
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
- front construction
- back construction
- visible fastening details

Do not simplify the garment.

Do not replace it with a generic luxury outfit.

Do not change its category.

Do not invent a new design.

Do not add sleeves that are not present.

Do not remove sleeves that are present.

Do not change buttons.

Do not change stripe direction.

Do not change pattern placement.

Do not remove visible artwork.

Do not turn the garment into another outfit.

The uploaded garment has priority over styling, location,
vehicle and creative direction.

=========================================================
MODEL
=========================================================

${buildModelInstruction(
  body,
  differentModels
)}

Primary model:
${model}

Body style:
${bodyStyle}

=========================================================
POSE / OUTPUT SELECTION
=========================================================

This API call creates ONE complete fashion photograph only.

Output:
${poseNumber} of ${totalOutputs}

Pose for this photograph:

${selectedPose}

STRICT OUTPUT RULES:

- One API call = one complete photograph.
- One photograph = one coherent model composition.
- Never create a split screen.
- Never create a collage.
- Never create a contact sheet.
- Never create multiple panels.
- Never put two poses into one image.
- Never duplicate the main model inside one image.
- Never create before/after layouts.
- Never place two separate poses into one frame.
- If multiple images are requested, each image is generated
  separately.
- Every separate output must have its own pose.
- Every separate output must remain a complete photograph.
- Keep the uploaded garment identical across outputs.

${
  differentModels
    ? `
Different adult models may be used between separate outputs.

Never put multiple main models into one output frame.
`
    : ""
}

=========================================================
FASHION STYLE
=========================================================

${fashionStyle}

Use the requested fashion style only to influence:

- composition
- styling
- atmosphere
- photography direction
- appropriate accessories

Do not let fashion styling redesign the uploaded garment.

=========================================================
SCENE
=========================================================

Setting:

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

${car}

The scene must look physically real.

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
- realistic hands
- realistic fingers
- realistic face
- realistic skin texture
- realistic hair
- realistic garment-to-body contact
- realistic fabric folds
- realistic fabric tension
- realistic seams
- realistic stitching
- realistic shadows
- realistic reflections
- realistic materials
- realistic perspective
- physically plausible lighting
- natural depth of field
- realistic background separation
- premium commercial fashion photography
- high-end fashion magazine quality
- professional camera rendering

=========================================================
REAL CAMERA LOOK
=========================================================

The final image must look like a genuine photograph captured
with a professional full-frame camera.

Avoid:

- CGI appearance
- plastic skin
- wax-like skin
- fake fabric
- cartoon appearance
- illustration appearance
- artificial-looking rendering
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
- warped garment details
- melted garment details
- random text
- watermark
- artificial-looking environment

Use realistic:

- lens perspective
- exposure
- depth of field
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

- handbag
- sunglasses
- simple jewelry
- watch
- shoes
- tasteful fashion accessories

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
Create this requested garment color variant:

${variantColor}

Change ONLY the garment color.

Keep identical:

- garment category
- silhouette
- construction
- stripes
- graphics
- buttons
- seams
- trims
- fabric
- proportions
- all other garment details

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

Before producing the photograph, verify:

1. The garment is the same garment as the reference.
2. The garment category is unchanged.
3. Major visible details are preserved.
4. Color is accurate.
5. The model is an adult when an adult model is requested.
6. The pose is natural.
7. The output is ONE complete photograph.
8. There is NO collage.
9. There is NO split-screen.
10. There are NO multiple poses inside one frame.
11. Objects are physically realistic.
12. The environment is believable.
13. The image looks like professional camera photography.

If styling conflicts with garment accuracy,
PRESERVE THE GARMENT.

=========================================================
PRIORITY ORDER
=========================================================

1. Uploaded garment identity
2. Garment construction
3. Garment color and pattern
4. Garment details
5. Photorealistic adult model
6. Realistic garment fit
7. Requested pose
8. Background/reference environment
9. Realistic objects
10. Fashion styling
11. Vehicle
12. Creative direction

The final image must visibly look like the SAME GARMENT from
the uploaded photograph, realistically worn by the selected
adult fashion model.

Do not substitute a different outfit.
`;
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
IMAGE GENERATION
========================================================= */

async function generateOne(
  imageBase64,
  mimeType,
  prompt,
  size
) {
  const inputBuffer =
    Buffer.from(
      imageBase64,
      "base64"
    );

  if (
    !inputBuffer.length
  ) {
    throw new Error(
      "The uploaded clothing image is empty."
    );
  }

  if (
    inputBuffer.length >
    MAX_IMAGE_BYTES
  ) {
    throw new Error(
      "The compressed clothing image is too large. Please upload a smaller image."
    );
  }

  const imageFile =
    await toFile(
      inputBuffer,
      `clothing-reference.${extensionFromMime(
        mimeType
      )}`,
      {
        type: mimeType,
      }
    );

  /*
  IMPORTANT:

  There is NO n=2 here.

  One API call produces ONE image.

  This prevents the model from putting two poses,
  two panels or two photographs into one output.
  */

  const result =
    await openai.images.edit({
      model: MODEL,

      image:
        imageFile,

      prompt,

      size,

      quality: "high",

      output_format: "png",
    });

  const b64 =
    result?.data?.[0]
      ?.b64_json;

  if (!b64) {
    throw new Error(
      "OpenAI did not return an image."
    );
  }

  return `data:image/png;base64,${b64}`;
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

    /*
    ---------------------------------------------------------
    CLOTHING IMAGE
    ---------------------------------------------------------
    */

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
      });
    }

    const mimeType =
      getMimeType(
        imageInput
      );

    /*
    ---------------------------------------------------------
    OPTIONAL BACKGROUND REFERENCE
    ---------------------------------------------------------
    */

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

    const hasBackgroundReference =
      Boolean(
        backgroundBase64
      );

    /*
    ---------------------------------------------------------
    USER
    ---------------------------------------------------------
    */

    userId =
      getUserId(
        body,
        req
      );

    /*
    ---------------------------------------------------------
    REDIS
    ---------------------------------------------------------
    */

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

    /*
    ---------------------------------------------------------
    PRO
    ---------------------------------------------------------
    */

    const proActive =
      await proActiveFor(
        userId,
        redis
      );

    /*
    ---------------------------------------------------------
    CREDIT
    ---------------------------------------------------------

    IMPORTANT:

    One request/campaign = ONE credit.

    Whether the user selects:
      1 output
      2 outputs
      3 outputs
      4 outputs

    the credit system is still charged once.
    */

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

    /*
    ---------------------------------------------------------
    OUTPUT COUNT
    ---------------------------------------------------------
    */

    const requestedOutputCount =
      getOutputCount(
        body
      );

    /*
    ---------------------------------------------------------
    POSES
    ---------------------------------------------------------
    */

    const poses =
      getSelectedPoses(
        body,
        requestedOutputCount
      );

    /*
    ---------------------------------------------------------
    MODEL VARIATION
    ---------------------------------------------------------
    */

    const differentModels =
      getDifferentModels(
        body
      );

    /*
    ---------------------------------------------------------
    COLOURS
    ---------------------------------------------------------
    */

    const colours =
      getColourList(
        body
      );

    const selectedColours =
      colours.length
        ? colours.slice(
            0,
            MAX_COLOUR_IMAGES
          )
        : [""];

    /*
    ---------------------------------------------------------
    ASPECT RATIO
    ---------------------------------------------------------
    */

    const size =
      getImageSize(
        getValue(
          body,
          "aspectRatio",
          "ratio"
        )
      );

    const images = [];

    /*
    ---------------------------------------------------------
    GENERATION
    ---------------------------------------------------------

    VERY IMPORTANT:

    Each pose is generated using its OWN API call.

    Example:

      imageCount = 1
      -> generateOne()
      -> one image

      imageCount = 2
      -> generateOne()
      -> image 1

      -> generateOne()
      -> image 2

      imageCount = 4
      -> generateOne()
      -> image 1

      -> generateOne()
      -> image 2

      -> generateOne()
      -> image 3

      -> generateOne()
      -> image 4

    This is what prevents the previous split-screen problem.
    ---------------------------------------------------------
    */

    try {
      for (
        const color of
          selectedColours
      ) {
        for (
          let poseIndex = 0;
          poseIndex <
            requestedOutputCount;
          poseIndex += 1
        ) {
          /*
          One API call = exactly one photograph.
          */

          const prompt =
            buildPrompt(
              body,
              color,
              poseIndex + 1,
              poses[poseIndex],
              requestedOutputCount,
              differentModels,
              hasBackgroundReference
            );

          const generated =
            await generateOne(
              imageBase64,
              mimeType,
              prompt,
              size
            );

          images.push(
            generated
          );

          /*
          Keep existing maximum response size.
          */

          if (
            images.length >=
            MAX_COLOUR_IMAGES
          ) {
            break;
          }
        }

        if (
          images.length >=
          MAX_COLOUR_IMAGES
        ) {
          break;
        }

        /*
        If no colors were selected,
        the requested pose/image count
        has been completed.
        */

        if (
          !colours.length
        ) {
          break;
        }
      }
    } catch (
      generationError
    ) {
      /*
      Refund free credit if generation fails.
      */

      if (
        charge.usedCredit &&
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
            "OBITREND credit refund failed:",
            refundError
          );
        }
      }

      throw generationError;
    }

    /*
    ---------------------------------------------------------
    VALIDATION
    ---------------------------------------------------------
    */

    if (
      !images.length
    ) {
      return res.status(500).json({
        success: false,
        error:
          "Image generation failed because no image was returned.",
      });
    }

    const firstImage =
      images[0];

    /*
    ---------------------------------------------------------
    RESPONSE
    ---------------------------------------------------------

    Existing frontend fields remain intact.

    image:
      first generated image

    images:
      all generated images
    ---------------------------------------------------------
    */

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

      images,

      colorImages:
        images,

      colourImages:
        images,

      /*
      New selection information.
      */

      outputCount:
        images.length,

      requestedOutputCount:
        requestedOutputCount,

      poseCount:
        Math.min(
          images.length,
          requestedOutputCount
        ),

      poses,

      differentModels,

      garmentReferenceType:
        getGarmentReferenceType(
          body
        ),

      backgroundReferenceUsed:
        hasBackgroundReference,

      /*
      Existing account information.
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
    });
  } catch (error) {
    console.error(
      "OBITREND generation error:",
      error
    );

    return res.status(500).json({
      success: false,

      ok: false,

      error:
        error?.message ||
        "Image generation failed.",
    });
  }
}
