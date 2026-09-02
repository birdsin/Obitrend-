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

POSE / OUTPUT SYSTEM:

1 selected image  = 1 separate photograph
2 selected images  = 2 separate photographs
3 selected images  = 3 separate photographs
4 selected images  = 4 separate photographs

IMPORTANT:
The entire request uses ONE free credit.

Example:
1 image  -> 1 credit
2 images -> 1 credit
3 images -> 1 credit
4 images -> 1 credit

Pro users remain unlimited.

Each requested pose is generated with a SEPARATE OpenAI
image-edit request.

This prevents:
- split screen
- collage
- two poses in one image
- duplicated model in one image
- multiple poses combined into one frame

Existing frontend response aliases are preserved.
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

const IMAGE_QUALITY = "medium";

const MAX_IMAGE_BYTES =
  9 * 1024 * 1024;

const MAX_OUTPUT_IMAGES = 4;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* =========================================================
LOCATION POOLS
========================================================= */

const LOCATION_POOLS = {
  restaurant: [
    "luxury rooftop restaurant",
    "elegant fine-dining restaurant",
    "modern luxury restaurant interior",
    "upscale contemporary restaurant",
    "high-end restaurant terrace",
  ],

  hotel: [
    "luxury hotel lobby",
    "five-star hotel entrance",
    "luxury hotel rooftop",
    "premium hotel lounge",
    "luxury hotel terrace",
    "five-star hotel suite",
  ],

  beach: [
    "luxury tropical beach",
    "private beach resort",
    "premium beachfront resort",
    "elegant beach club",
    "luxury oceanfront terrace",
  ],

  pool: [
    "luxury infinity pool",
    "five-star resort pool",
    "private luxury pool",
    "rooftop infinity pool",
    "premium hotel pool terrace",
  ],

  shopping: [
    "luxury shopping district",
    "premium fashion shopping street",
    "upscale shopping mall",
    "designer boutique district",
    "luxury retail boulevard",
  ],

  boutique: [
    "luxury fashion boutique",
    "modern designer boutique",
    "premium clothing showroom",
    "high-end fashion showroom",
    "exclusive fashion showroom",
  ],

  city: [
    "modern downtown city street",
    "luxury city boulevard",
    "premium urban district",
    "modern financial district",
    "upscale urban plaza",
  ],

  street: [
    "luxury city street",
    "upscale urban avenue",
    "modern downtown sidewalk",
    "premium city boulevard",
    "fashionable pedestrian street",
  ],

  studio: [
    "premium fashion photography studio",
    "luxury editorial studio",
    "minimalist fashion studio",
    "high-end editorial set",
    "professional fashion campaign studio",
  ],

  home: [
    "luxury modern living room",
    "high-end contemporary home",
    "luxury penthouse interior",
    "elegant modern apartment",
    "premium designer home",
  ],

  office: [
    "luxury executive office",
    "modern premium office",
    "high-end corporate lounge",
    "executive penthouse office",
  ],

  airport: [
    "premium airport terminal",
    "luxury airport lounge",
    "VIP airport lounge",
    "modern international airport",
    "private aviation lounge",
  ],

  stadium: [
    "modern football stadium exterior",
    "luxury stadium VIP area",
    "premium sports arena",
    "modern stadium entrance",
  ],

  church: [
    "elegant modern church interior",
    "beautiful church courtyard",
    "grand contemporary church entrance",
    "peaceful church exterior",
  ],

  outdoor: [
    "luxury outdoor fashion location",
    "modern architectural plaza",
    "premium garden terrace",
    "luxury resort courtyard",
    "elegant outdoor promenade",
  ],
};

/* =========================================================
VEHICLE RULES
========================================================= */

const VEHICLE_ALLOWED_TYPES =
  new Set([
    "city",
    "street",
    "outdoor",
    "hotel",
    "shopping",
    "boutique",
    "airport",
  ]);

const VEHICLE_FORBIDDEN_TYPES =
  new Set([
    "restaurant",
    "pool",
    "beach",
    "studio",
    "home",
    "office",
    "church",
    "stadium",
  ]);

/* =========================================================
BASIC HELPERS
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
BODY
========================================================= */

function normalizeBody(
  rawBody
) {
  if (
    rawBody &&
    typeof rawBody === "object"
  ) {
    return rawBody;
  }

  if (
    typeof rawBody === "string"
  ) {
    try {
      const parsed =
        JSON.parse(rawBody);

      return parsed &&
        typeof parsed ===
          "object"
        ? parsed
        : {};
    } catch {
      return {};
    }
  }

  return {};
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

  const comma =
    value.indexOf(",");

  if (
    value.startsWith(
      "data:image/"
    ) &&
    comma !== -1
  ) {
    value =
      value.slice(
        comma + 1
      );
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
  const value =
    String(
      input || ""
    ).toLowerCase();

  if (
    value.startsWith(
      "data:image/png"
    )
  ) {
    return "image/png";
  }

  if (
    value.startsWith(
      "data:image/webp"
    )
  ) {
    return "image/webp";
  }

  if (
    value.startsWith(
      "data:image/jpeg"
    ) ||
    value.startsWith(
      "data:image/jpg"
    )
  ) {
    return "image/jpeg";
  }

  return "image/jpeg";
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
COLOUR LIST
========================================================= */

function getColourList(
  body
) {
  const raw =
    getNestedValue(
      body,
      "clothingColors",
      "clothingColor",
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
          (item) =>
            String(
              item
            ).trim()
        )
        .filter(Boolean)
    ),
  ];
}

/* =========================================================
USER ID
========================================================= */

function fallbackUserId(
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
POSE COUNT
========================================================= */

function getPoseCount(
  body
) {
  const raw =
    getNestedValue(
      body,
      "poseCount",
      "numberOfPoses",
      "imageCount",
      "numberOfImages",
      "outputCount",
      "photoCount"
    );

  if (
    raw === undefined ||
    raw === null ||
    raw === ""
  ) {
    return 2;
  }

  const parsed =
    Number(raw);

  if (
    !Number.isFinite(
      parsed
    )
  ) {
    return 2;
  }

  return Math.min(
    MAX_OUTPUT_IMAGES,
    Math.max(
      1,
      Math.floor(parsed)
    )
  );
}

/* =========================================================
POSE LIST
========================================================= */

function getPoseList(
  body,
  count
) {
  const raw =
    getNestedValue(
      body,
      "poses",
      "poseList",
      "selectedPoses"
    );

  let list = [];

  if (
    Array.isArray(raw)
  ) {
    list =
      raw
        .map(
          (item) =>
            clean(item)
        )
        .filter(Boolean);
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
        )
        .filter(Boolean);
  }

  const defaults = [
    "standing confidently in a professional fashion pose",
    "a clearly different three-quarter fashion pose",
    "a natural walking or movement fashion pose",
    "an elegant relaxed editorial pose",
  ];

  const originalPose =
    clean(
      getNestedValue(
        body,
        "pose"
      )
    );

  if (
    originalPose &&
    !list.length
  ) {
    list.push(
      originalPose
    );
  }

  while (
    list.length <
    count
  ) {
    list.push(
      defaults[
        list.length
      ]
    );
  }

  return list.slice(
    0,
    count
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
LOCATION TYPE
========================================================= */

function normalizeLocationType(
  value
) {
  const text =
    clean(
      value,
      "studio"
    ).toLowerCase();

  if (
    text.includes(
      "restaurant"
    ) ||
    text.includes("cafe") ||
    text.includes("café") ||
    text.includes("dining")
  ) {
    return "restaurant";
  }

  if (
    text.includes("hotel") ||
    text.includes("resort")
  ) {
    return "hotel";
  }

  if (
    text.includes("beach") ||
    text.includes("ocean") ||
    text.includes("seaside")
  ) {
    return "beach";
  }

  if (
    text.includes("pool") ||
    text.includes("swimming")
  ) {
    return "pool";
  }

  if (
    text.includes(
      "shopping"
    ) ||
    text.includes("mall") ||
    text.includes("retail")
  ) {
    return "shopping";
  }

  if (
    text.includes(
      "boutique"
    ) ||
    text.includes(
      "showroom"
    ) ||
    text.includes(
      "fashion store"
    )
  ) {
    return "boutique";
  }

  if (
    text.includes("airport") ||
    text.includes("aviation")
  ) {
    return "airport";
  }

  if (
    text.includes("stadium") ||
    text.includes("football") ||
    text.includes("sports")
  ) {
    return "stadium";
  }

  if (
    text.includes("church")
  ) {
    return "church";
  }

  if (
    text.includes("office") ||
    text.includes("corporate")
  ) {
    return "office";
  }

  if (
    text.includes("home") ||
    text.includes("house") ||
    text.includes("villa") ||
    text.includes(
      "apartment"
    ) ||
    text.includes("bedroom")
  ) {
    return "home";
  }

  if (
    text.includes("street") ||
    text.includes("road") ||
    text.includes("avenue") ||
    text.includes(
      "boulevard"
    )
  ) {
    return "street";
  }

  if (
    text.includes("city") ||
    text.includes("downtown") ||
    text.includes("urban")
  ) {
    return "city";
  }

  if (
    text.includes("outdoor") ||
    text.includes("garden") ||
    text.includes(
      "terrace"
    ) ||
    text.includes("plaza")
  ) {
    return "outdoor";
  }

  return "studio";
}

/* =========================================================
RECENT LOCATIONS
========================================================= */

function normalizeRecentLocations(
  value
) {
  if (
    Array.isArray(value)
  ) {
    return value
      .map(
        (item) =>
          clean(item)
            .toLowerCase()
      )
      .filter(Boolean)
      .slice(-20);
  }

  if (
    typeof value ===
      "string"
  ) {
    return value
      .split(",")
      .map(
        (item) =>
          item
            .trim()
            .toLowerCase()
      )
      .filter(Boolean)
      .slice(-20);
  }

  return [];
}

/* =========================================================
LOCATION SELECTION
========================================================= */

function chooseLocation(
  type,
  recent = []
) {
  const pool =
    LOCATION_POOLS[
      type
    ] ||
    LOCATION_POOLS.studio;

  const recentSet =
    new Set(recent);

  const available =
    pool.filter(
      (item) =>
        !recentSet.has(
          item.toLowerCase()
        )
    );

  const candidates =
    available.length
      ? available
      : pool;

  return candidates[
    Math.floor(
      Math.random() *
        candidates.length
    )
  ];
}

function isAuto(
  value
) {
  const text =
    clean(
      value,
      "Auto Background"
    ).toLowerCase();

  return (
    !text ||
    text.includes("auto") ||
    text.includes("random") ||
    text.includes(
      "surprise"
    ) ||
    text.includes(
      "different"
    )
  );
}

/* =========================================================
SCENE
========================================================= */

function buildScene(
  body
) {
  const type =
    normalizeLocationType(
      getNestedValue(
        body,
        "locationType"
      )
    );

  const background =
    clean(
      getNestedValue(
        body,
        "backgroundPreset"
      ),
      "Auto Background"
    );

  const recent =
    normalizeRecentLocations(
      getNestedValue(
        body,
        "recentLocations",
        "usedLocations",
        "previousLocations",
        "locationHistory"
      )
    );

  const selectedLocation =
    isAuto(background)
      ? chooseLocation(
          type,
          recent
        )
      : background;

  let vehicle =
    clean(
      getNestedValue(
        body,
        "vehicle",
        "car"
      ),
      "none"
    );

  if (
    VEHICLE_FORBIDDEN_TYPES.has(
      type
    )
  ) {
    vehicle =
      "none";
  }

  return {
    type,
    selectedLocation,
    vehicle,
    city: clean(
      getNestedValue(
        body,
        "city"
      )
    ),
    property: clean(
      getNestedValue(
        body,
        "property"
      )
    ),
  };
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
        "garmentView",
        "clothingReferenceType"
      ),
      "auto"
    ).toLowerCase();

  if (
    value.includes("flat")
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
GARMENT REFERENCE INSTRUCTION
========================================================= */

function garmentReferenceInstruction(
  type
) {
  if (
    type ===
    "flat-lay"
  ) {
    return `
GARMENT REFERENCE: FLAT-LAY

Interpret the uploaded photograph as a clothing/product
flat-lay reference.

Use the garment itself as the authoritative reference.

Ignore:
- flat-lay surface
- unrelated props
- unrelated objects
- background
- surrounding environment

Extract the actual garment construction and reproduce that
same garment naturally on the selected model.
`;
  }

  if (
    type ===
    "hanger"
  ) {
    return `
GARMENT REFERENCE: HANGER

Interpret the uploaded photograph as a garment hanging
on a hanger.

Use the garment itself as the authoritative reference.

Ignore:
- hanger
- wall
- room
- background
- unrelated objects

Reconstruct the garment naturally on the selected model.
Do not include the hanger in the final fashion photograph.
`;
  }

  if (
    type ===
    "fully covered mannequin"
  ) {
    return `
GARMENT REFERENCE: FULLY COVERED MANNEQUIN

Interpret the uploaded photograph as a clothing reference
shown on a fully covered fashion mannequin.

Use the garment itself as the authoritative reference.

Ignore the mannequin as a person.

Preserve the garment's:
- shape
- construction
- proportions
- color
- patterns
- seams
- details
- fabric appearance

Place the same garment naturally on the selected adult
fashion model.
`;
  }

  return `
GARMENT REFERENCE: AUTO

Determine whether the uploaded clothing reference is a
flat-lay, hanger presentation, fully covered mannequin,
or another legitimate clothing/product presentation.

Regardless of presentation, the GARMENT ITSELF is the
primary visual reference.

Ignore unrelated people, backgrounds, props and objects.
`;
}

/* =========================================================
CLOTHING TYPE
========================================================= */

function clothingTypeInstruction(
  body
) {
  const type =
    clean(
      getNestedValue(
        body,
        "clothingType",
        "garmentType",
        "outfitType",
        "category"
      ),
      "automatically detect the clothing type from the uploaded reference"
    );

  return `
CLOTHING TYPE:

${type}

If no clothing type is specified, identify the clothing type
from the uploaded reference.

Support different legitimate fashion categories, including:

- tops
- shirts
- blouses
- tank tops
- jackets
- coats
- dresses
- skirts
- trousers
- jeans
- shorts
- suits
- knitwear
- traditional/cultural clothing
- sportswear
- outerwear
- other clearly visible garments

Never change the detected garment into another category.
`;
}

/* =========================================================
MODEL INSTRUCTION
========================================================= */

function modelInstruction(
  body,
  differentModels
) {
  const gender =
    clean(
      getNestedValue(
        body,
        "gender"
      ),
      "woman"
    );

  const model =
    clean(
      getNestedValue(
        body,
        "model",
        "lady",
        "selectedModel"
      ),
      "professional adult fashion model"
    );

  const bodyType =
    clean(
      getNestedValue(
        body,
        "bodyType",
        "bodyStyle",
        "body"
      ),
      "natural balanced adult proportions"
    );

  const ageGroup =
    clean(
      getNestedValue(
        body,
        "ageGroup"
      ),
      "adult_woman"
    );

  const face =
    clean(
      getNestedValue(
        body,
        "face"
      ),
      "natural elegant fashion beauty"
    );

  const footwear =
    clean(
      getNestedValue(
        body,
        "footwear"
      ),
      "footwear appropriate for the garment"
    );

  const secondModel =
    clean(
      getNestedValue(
        body,
        "model2",
        "secondModel",
        "selectedModel2"
      ),
      "a different professional adult fashion model"
    );

  return `
MODEL:

Gender:
${gender}

Primary model:
${model}

Body type:
${bodyType}

Face:
${face}

Age group:
${ageGroup}

Footwear:
${footwear}

The primary subject is an adult fashion model.

${
  differentModels
    ? `
MODEL VARIATION IS REQUESTED.

For different output images, use visually distinct adult
fashion models while keeping the SAME uploaded garment.

For later images, model variation may include:
- different adult face
- different hairstyle
- different adult appearance
- different natural body proportions

Second model direction:
${secondModel}

The garment must remain identical.
`
    : `
Keep the selected model direction consistent across all
requested photographs.
`
}
`;
}

/* =========================================================
OBJECTS
========================================================= */

function objectsInstruction(
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
REALISTIC ENVIRONMENTAL OBJECTS:

${
  requested
    ? `Requested objects:
${requested}`
    : `
Use only natural objects that belong in the selected
environment when appropriate.

Examples:
- tables
- chairs
- lamps
- plants
- handbags
- shopping bags
- fashion racks
- hotel furniture
- restaurant table settings
- café objects
- airport furniture
- pool furniture
- realistic architectural details
- tasteful decor
`
}

Every object must have:
- realistic scale
- realistic perspective
- realistic material
- realistic shadows
- realistic reflections
- realistic depth
- believable physical placement

Do not add random clutter.

Do not let objects cover important garment details.

Do not merge objects into the model or garment.
`;
}

/* =========================================================
BACKGROUND REFERENCE
========================================================= */

function backgroundInstruction(
  body
) {
  const background =
    getNestedValue(
      body,
      "backgroundReferenceImage",
      "backgroundImage",
      "sceneReferenceImage",
      "referenceBackground",
      "backgroundReference"
    );

  if (
    normalizeBase64(
      background
    )
  ) {
    return `
BACKGROUND REFERENCE IMAGE IS PROVIDED.

Use the supplied background reference as the visual
environment reference.

Preserve the visible:
- architecture
- layout
- furniture
- major structures
- lighting direction
- perspective
- colors
- spatial relationships

Create the fashion photograph naturally inside this environment.

Do not copy unrelated people from the reference as subjects.

The garment remains the highest-priority reference.
`;
  }

  return `
NO BACKGROUND REFERENCE IMAGE WAS PROVIDED.

Create the requested location naturally and photorealistically.
`;
}

/* =========================================================
COMPANION
========================================================= */

function companionInstruction(
  body
) {
  const companion =
    clean(
      getNestedValue(
        body,
        "companion",
        "companionType",
        "childCompanion"
      ),
      "none"
    );

  if (
    !companion ||
    companion ===
      "none"
  ) {
    return `
NO COMPANION.

Create only the requested main fashion model.
Do not add an unrelated second person.
`;
  }

  return `
COMPANION:

${companion}

Keep the companion secondary.

Do not duplicate people.

Do not merge bodies.

Do not allow the companion to cover or replace
the main garment.
`;
}

/* =========================================================
MAIN PROMPT
========================================================= */

function buildPrompt(
  body,
  scene,
  pose,
  poseNumber,
  totalPoses,
  variantColor = ""
) {
  const fashionStyle =
    clean(
      getNestedValue(
        body,
        "fashionStyle",
        "style"
      ),
      "luxury fashion editorial"
    );

  const clothingStyle =
    clean(
      getNestedValue(
        body,
        "clothingStyle"
      ),
      "premium fashion"
    );

  const camera =
    clean(
      getNestedValue(
        body,
        "camera"
      ),
      "professional full-frame fashion photography"
    );

  const lighting =
    clean(
      getNestedValue(
        body,
        "lighting"
      ),
      "soft professional fashion lighting"
    );

  const creative =
    clean(
      getNestedValue(
        body,
        "creativeDirection",
        "creative"
      ),
      "luxury fashion campaign"
    );

  const userPrompt =
    clean(
      getNestedValue(
        body,
        "prompt",
        "description"
      )
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

  const country =
    clean(
      getNestedValue(
        body,
        "country"
      )
    );

  const location =
    [
      scene.city,
      country,
    ]
      .filter(Boolean)
      .join(", ");

  const referenceType =
    getGarmentReferenceType(
      body
    );

  const differentModels =
    getDifferentModels(
      body
    );

  return `
=========================================================
OBITREND PROFESSIONAL FASHION PHOTOGRAPHY
=========================================================

THIS IS ONE SINGLE FASHION PHOTOGRAPH.

This request is producing:

POSE ${poseNumber}
OF ${totalPoses}

IMPORTANT:

Generate EXACTLY ONE coherent photograph.

DO NOT create:
- split screen
- collage
- side-by-side images
- multiple panels
- multiple copies of the model
- two poses in one frame
- before/after layout
- contact sheet
- picture-in-picture

ONE OUTPUT = ONE COMPLETE PHOTOGRAPH.

=========================================================
GARMENT REFERENCE
=========================================================

${garmentReferenceInstruction(
  referenceType
)}

THE UPLOADED GARMENT IS THE PRIMARY AND AUTHORITATIVE
VISUAL REFERENCE.

The model MUST wear the same garment shown in the
uploaded reference.

The uploaded garment is NOT generic inspiration.

=========================================================
CLOTHING TYPE
=========================================================

${clothingTypeInstruction(
  body
)}

=========================================================
GARMENT PRESERVATION
=========================================================

Preserve the same garment as accurately as possible.

Preserve:

- garment category
- garment type
- silhouette
- cut
- proportions
- length
- width
- neckline
- collar
- straps
- sleeves
- cuffs
- arm openings
- waist shaping
- darts
- seams
- stitching
- panels
- pleats
- gathers
- ruching
- folds
- draping
- hem
- slits
- pockets
- buttons
- zippers
- closures
- ties
- belts when present
- embroidery
- graphics
- artwork
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
- distinctive details

Do not simplify the garment.

Do not replace it with a similar garment.

Do not redesign it.

Do not change the category.

Do not add sleeves that are not present.

Do not remove sleeves that are present.

Do not invent buttons.

Do not remove important visible buttons.

Do not change pattern placement.

Do not change stripe direction.

Do not change graphics.

Do not replace the garment with generic luxury clothing.

=========================================================
MODEL
=========================================================

${modelInstruction(
  body,
  differentModels
)}

=========================================================
POSE
=========================================================

This is:

POSE ${poseNumber}
OF ${totalPoses}

Selected pose:

${pose}

This pose must be clearly expressed in ONE photograph.

The pose must not alter the garment.

The garment must remain naturally fitted to the model.

Maintain realistic:
- body posture
- fabric tension
- folds
- shadows
- garment-to-body contact

=========================================================
FASHION STYLE
=========================================================

Fashion style:
${fashionStyle}

Clothing style:
${clothingStyle}

Use the requested fashion style for presentation only.

Do NOT use the fashion style as permission to redesign
the uploaded garment.

=========================================================
LOCATION
=========================================================

Location category:
${scene.type}

Selected location:
${scene.selectedLocation}

${
  location
    ? `City / Country:
${location}`
    : ""
}

${
  scene.property
    ? `Property:
${scene.property}`
    : ""
}

Vehicle:
${scene.vehicle}

The environment must be physically coherent.

=========================================================
BACKGROUND
=========================================================

${backgroundInstruction(
  body
)}

=========================================================
REALISTIC OBJECTS
=========================================================

${objectsInstruction(
  body
)}

=========================================================
CAMERA
=========================================================

Camera:
${camera}

Lighting:
${lighting}

Aspect ratio:
${ratio}

Make this look like a real professional fashion
photograph captured with a high-end camera.

=========================================================
REAL PHOTOGRAPH APPEARANCE
=========================================================

Create:

- realistic human anatomy
- realistic adult face
- realistic skin
- realistic hands
- realistic fingers
- realistic hair
- realistic eyes
- realistic fabric
- realistic garment folds
- realistic stitching
- realistic seams
- realistic material properties
- realistic shadows
- realistic reflections
- realistic perspective
- realistic depth
- realistic exposure
- realistic lens rendering
- realistic depth of field
- professional fashion lighting
- commercial photography quality
- editorial photography quality

Avoid:

- CGI appearance
- cartoon appearance
- illustration
- plastic skin
- wax-like skin
- artificial fabric
- distorted anatomy
- extra fingers
- malformed hands
- duplicated people
- duplicated limbs
- warped clothing
- melted details
- random text
- watermark
- artificial-looking background

=========================================================
GARMENT VISIBILITY
=========================================================

The garment must remain clearly visible.

Do not hide important garment details behind:

- hands
- bags
- furniture
- vehicles
- objects
- companions
- excessive cropping

Use a natural fashion pose that allows the garment
to be inspected.

=========================================================
COMPANION
=========================================================

${companionInstruction(
  body
)}

=========================================================
COLOR
=========================================================

${
  variantColor
    ? `
Requested garment color:

${variantColor}

Change ONLY the garment color.

Preserve:
- garment type
- silhouette
- construction
- pattern
- graphics
- buttons
- seams
- trims
- fabric
- proportions
- all other details
`
    : `
Preserve the original garment color exactly as shown
in the uploaded reference.
`
}

=========================================================
CREATIVE DIRECTION
=========================================================

${creative}

=========================================================
USER REQUEST
=========================================================

${userPrompt}

=========================================================
FINAL QUALITY CONTROL
=========================================================

Before producing this photograph, verify:

1. It is ONE photograph.
2. It contains ONE coherent pose.
3. It does not contain a split screen.
4. It does not contain a collage.
5. It does not contain two poses in one frame.
6. The uploaded garment is the same garment.
7. The garment category is unchanged.
8. The garment construction is preserved.
9. The garment color is preserved unless recoloring was requested.
10. The model is appropriate for the selected age mode.
11. The environment looks physically real.
12. Objects have realistic scale and perspective.
13. The final image looks like professional camera photography.

=========================================================
PRIORITY
=========================================================

1. Uploaded garment identity
2. Garment construction
3. Garment details
4. Garment color and pattern
5. Realistic garment fit
6. Model
7. Pose
8. Background
9. Objects
10. Camera
11. Lighting
12. Styling
13. Vehicle

If any instruction conflicts with the uploaded garment,
PRESERVE THE UPLOADED GARMENT.

FINAL INSTRUCTION:

RETURN ONE SINGLE PHOTOREALISTIC FASHION PHOTOGRAPH
FOR THIS POSE.

NO COLLAGE.
NO SPLIT SCREEN.
NO MULTIPLE POSES IN ONE IMAGE.
NO MULTIPLE MODELS IN ONE FRAME.
`;
}

/* =========================================================
OPENAI GENERATION
========================================================= */

async function generateOne(
  imageBase64,
  mimeType,
  prompt,
  size
) {
  const buffer =
    Buffer.from(
      imageBase64,
      "base64"
    );

  if (!buffer.length) {
    throw new Error(
      "The uploaded clothing image is empty."
    );
  }

  if (
    buffer.length >
    MAX_IMAGE_BYTES
  ) {
    throw new Error(
      "The uploaded clothing image is too large. Please upload a smaller image."
    );
  }

  const file =
    await toFile(
      buffer,
      `obitrend-clothing-reference.${extensionFromMime(
        mimeType
      )}`,
      {
        type: mimeType,
      }
    );

  /*
  IMPORTANT:
  No n=2 here.

  Every pose gets its OWN API request.

  This is what prevents the split/collage problem.
  */

  const result =
    await openai.images.edit({
      model: MODEL,
      image: file,
      prompt,
      size,
      quality:
        IMAGE_QUALITY,
      output_format: "png",
    });

  const base64 =
    result?.data?.[0]?.b64_json;

  if (!base64) {
    throw new Error(
      "OpenAI did not return an image."
    );
  }

  return `data:image/png;base64,${base64}`;
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
REFUND
========================================================= */

async function refundGeneration(
  credit,
  userId,
  redis
) {
  if (
    !credit?.usedCredit ||
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
  } catch (
    refundError
  ) {
    console.error(
      "OBITREND credit refund failed:",
      refundError
    );

    return false;
  }
}

/* =========================================================
SAFETY ERROR
========================================================= */

function getSafetyMessage(
  error
) {
  const message =
    String(
      error?.message ||
        ""
    ).toLowerCase();

  let serialized = "";

  try {
    serialized =
      JSON.stringify(
        error
      ).toLowerCase();
  } catch {
    serialized = "";
  }

  const combined =
    `${message} ${serialized}`;

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
        "This clothing reference could not be used. Please upload a clothing-only reference such as a flat-lay garment, garment on a hanger, or a fully covered mannequin.",
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

  let credit =
    null;

  let redis =
    null;

  let userId =
    null;

  try {
    const body =
      normalizeBody(
        req.body
      );

    /* =====================================================
    CLOTHING IMAGE
    ===================================================== */

    let imageInput =
      getNestedValue(
        body,
        "imageBase64",
        "uploadedImage",
        "image",
        "clothingImage",
        "referenceImage"
      );

    if (!imageInput) {
      imageInput =
        getNestedValue(
          body,
          "clothing",
          "garment"
        );
    }

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
    AUTHENTICATION
    ===================================================== */

    const auth =
      await getAuthenticatedUser(
        req
      );

    if (!auth?.ok) {
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
      auth.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error:
          "Authenticated user was not found.",
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

    const pro =
      await getProStatus(
        userId,
        redis
      );

    const proActive =
      Boolean(
        pro?.active
      );

    /* =====================================================
    ONE CREDIT FOR ENTIRE REQUEST
    ===================================================== */

    if (proActive) {
      credit = {
        success: true,
        balance: null,
        usedCredit: false,
      };
    } else {
      credit =
        await spendCredit(
          userId,
          redis
        );

      credit.usedCredit =
        Boolean(
          credit?.success
        );

      if (
        !credit.success
      ) {
        return res.status(402).json({
          success: false,
          error:
            "Your free generations are finished. Upgrade to OBITREND Pro to continue.",
          upgradeRequired:
            true,
          balance:
            credit.balance,
          resetAt:
            credit.resetAt,
        });
      }
    }

    /* =====================================================
    SELECTED NUMBER OF POSES
    ===================================================== */

    const poseCount =
      getPoseCount(
        body
      );

    const poses =
      getPoseList(
        body,
        poseCount
      );

    /* =====================================================
    SCENE
    ===================================================== */

    const scene =
      buildScene(
        body
      );

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
    COLORS
    ===================================================== */

    const colours =
      getColourList(
        body
      );

    /*
    Keep existing color workflow.

    When colors are supplied, the selected colors are
    generated sequentially.

    When no colors are supplied, generate the selected
    number of separate poses.
    */

    const colorVariants =
      colours.length
        ? colours.slice(
            0,
            MAX_OUTPUT_IMAGES
          )
        : [""];

    const images =
      [];

    const generatedPoses =
      [];

    try {
      /*
      =====================================================
      NORMAL MODE

      1 pose  = 1 API request
      2 poses = 2 API requests
      3 poses = 3 API requests
      4 poses = 4 API requests

      ALL use the same single credit deduction.
      =====================================================
      */

      if (
        !colours.length
      ) {
        for (
          let i = 0;
          i < poseCount;
          i++
        ) {
          const prompt =
            buildPrompt(
              body,
              scene,
              poses[i],
              i + 1,
              poseCount
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

          generatedPoses.push(
            poses[i]
          );
        }
      } else {
        /*
        ===================================================
        COLOR MODE

        Preserve existing color generation behavior while
        still producing one separate photograph per request.
        ===================================================
        */

        let outputIndex =
          0;

        for (
          const color of colorVariants
        ) {
          if (
            outputIndex >=
            MAX_OUTPUT_IMAGES
          ) {
            break;
          }

          const pose =
            poses[
              outputIndex %
                poses.length
            ];

          const prompt =
            buildPrompt(
              body,
              scene,
              pose,
              outputIndex + 1,
              colorVariants.length,
              color
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

          generatedPoses.push(
            pose
          );

          outputIndex++;
        }
      }
    } catch (
      generationError
    ) {
      const safety =
        getSafetyMessage(
          generationError
        );

      const refunded =
        await refundGeneration(
          credit,
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
    NO IMAGE CHECK
    ===================================================== */

    if (
      !images.length
    ) {
      const refunded =
        await refundGeneration(
          credit,
          userId,
          redis
        );

      return res.status(500).json({
        success: false,
        ok: false,
        error:
          "No image was generated.",
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

    KEEP ALL EXISTING RESPONSE ALIASES.
    ===================================================== */

    return res.status(200).json({
      success: true,

      ok: true,

      model:
        MODEL,

      /*
      Backward compatibility:
      frontend can continue displaying image.
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
      All generated photographs.
      */

      images,

      poseImages:
        images,

      colorImages:
        images,

      colourImages:
        images,

      /*
      Selection information.
      */

      requestedPoseCount:
        poseCount,

      generatedImageCount:
        images.length,

      generatedPoseCount:
        generatedPoses.length,

      poses:
        generatedPoses,

      /*
      Credit information.
      */

      balance:
        credit.balance,

      pro:
        proActive,

      usedFreeCredit:
        Boolean(
          credit.usedCredit
        ),

      /*
      IMPORTANT:
      One request = one credit.
      */

      creditCost:
        proActive
          ? 0
          : 1,

      imagesPerCredit:
        proActive
          ? "unlimited"
          : "1-4",

      refunded:
        false,

      garmentReferenceType:
        getGarmentReferenceType(
          body
        ),

      location:
        scene.selectedLocation,

      locationType:
        scene.type,

      vehicle:
        scene.vehicle,
    });
  } catch (
    error
  ) {
    console.error(
      "OBITREND generation error:",
      error
    );

    const safety =
      getSafetyMessage(
        error
      );

    const refunded =
      await refundGeneration(
        credit,
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
