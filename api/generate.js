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
SECURE IMAGE GENERATION API

REALISTIC CAMERA EDITION

PRESERVES:
- Authentication
- Credit system
- Pro system
- Uploaded garment
- Colour workflow
- Trouser colour workflow
- Pose workflow
- Existing response aliases
- Credit refund
- Aspect ratios
- Existing frontend compatibility

ADDED:
- Realistic camera system
- Camera type
- Lens
- Shot/framing
- Camera angle
- Camera distance
- Lighting
- Focus
- People around main model
- Adult / children / mixed groups
- Realistic photographic composition
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

const MAX_COLOUR_IMAGES = 4;
const MAX_IMAGE_BYTES = 9 * 1024 * 1024;

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
BASE64
========================================================= */

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

  return value.length >= 100 ? value : null;
}

/* =========================================================
MIME
========================================================= */

function getMimeType(input) {
  const match = String(input || "").match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,/i
  );

  return match
    ? match[1].toLowerCase()
    : "image/jpeg";
}

function extensionFromMime(mime) {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}

/* =========================================================
IMAGE SIZE
========================================================= */

function getImageSize(value) {
  const ratio =
    clean(value, "5:4").toLowerCase();

  if (
    ratio.includes("1:1") ||
    ratio.includes("square")
  ) {
    return "1024x1024";
  }

  if (
    ratio.includes("9:16") ||
    ratio.includes("portrait") ||
    ratio.includes("4:5")
  ) {
    return "1024x1536";
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
COLOURS
========================================================= */

function getColourList(body) {
  const raw = getValue(
    body,
    "clothingColors",
    "clothingColours",
    "garmentColors",
    "garmentColours",
    "colors",
    "colours",
    "selectedColors",
    "selectedColours",
    "colourCollection",
    "colorCollection"
  );

  let list = [];

  if (Array.isArray(raw)) {
    list = raw;
  } else if (
    typeof raw === "string" &&
    raw.trim()
  ) {
    list = raw
      .split(",")
      .map((item) => item.trim());
  }

  return [
    ...new Set(
      list
        .map((value) => String(value).trim())
        .filter(Boolean)
    ),
  ].slice(0, MAX_COLOUR_IMAGES);
}

/* =========================================================
IMAGE INPUT
========================================================= */

function getNestedImageInput(body) {
  let imageInput = getValue(
    body,
    "imageBase64",
    "uploadedImage",
    "image",
    "clothingImage",
    "referenceImage"
  );

  if (
    !imageInput &&
    body?.data &&
    typeof body.data === "object"
  ) {
    imageInput = getValue(
      body.data,
      "imageBase64",
      "uploadedImage",
      "image",
      "clothingImage",
      "referenceImage"
    );
  }

  if (
    !imageInput &&
    body?.input &&
    typeof body.input === "object"
  ) {
    imageInput = getValue(
      body.input,
      "imageBase64",
      "uploadedImage",
      "image",
      "clothingImage",
      "referenceImage"
    );
  }

  return imageInput;
}

/* =========================================================
REALISTIC CAMERA
========================================================= */

function getCameraSettings(body) {
  const peopleMode = clean(
    getValue(
      body,
      "peopleMode",
      "peopleInScene",
      "companionMode",
      "surroundingPeople"
    ),
    "main adult model only"
  );

  const peopleCountRaw = Number(
    getValue(
      body,
      "peopleCount",
      "numberOfPeople",
      "companionCount"
    )
  );

  const peopleCount =
    Number.isFinite(peopleCountRaw) &&
    peopleCountRaw >= 1
      ? Math.min(
          Math.floor(peopleCountRaw),
          10
        )
      : 1;

  const cameraType = clean(
    getValue(
      body,
      "realisticCamera",
      "cameraType",
      "advancedCamera",
      "camera"
    ),
    "Professional Full-Frame Camera"
  );

  const lens = clean(
    getValue(
      body,
      "cameraLens",
      "lens"
    ),
    "50mm professional fashion lens"
  );

  const shot = clean(
    getValue(
      body,
      "cameraShot",
      "shotType",
      "framing",
      "composition"
    ),
    "Classic full-body fashion campaign"
  );

  const angle = clean(
    getValue(
      body,
      "cameraAngle",
      "angle"
    ),
    "eye-level"
  );

  const distance = clean(
    getValue(
      body,
      "cameraDistance",
      "distance"
    ),
    "medium"
  );

  const focus = clean(
    getValue(
      body,
      "cameraFocus",
      "focus"
    ),
    "main model and garment"
  );

  const cameraLighting = clean(
    getValue(
      body,
      "cameraLighting",
      "lighting"
    ),
    "natural professional fashion lighting"
  );

  const realism = clean(
    getValue(
      body,
      "realism",
      "realismLevel"
    ),
    "professional photorealism"
  );

  return {
    peopleMode,
    peopleCount,
    cameraType,
    lens,
    shot,
    angle,
    distance,
    focus,
    cameraLighting,
    realism,
  };
}

/* =========================================================
PEOPLE PROMPT
========================================================= */

function buildPeoplePrompt(camera) {
  const mode =
    camera.peopleMode.toLowerCase();

  if (
    mode.includes("children") &&
    mode.includes("adult")
  ) {
    return `
SURROUNDING PEOPLE MODE:
Create a realistic adult fashion environment containing
the main adult fashion model plus ${camera.peopleCount}
additional people.

The additional people may include adults and children.

Children must be clearly age-appropriate and presented only
in normal family, lifestyle, shopping, travel or everyday
environmental situations.

Do not sexualize children.

Do not use children as fashion subjects for adult clothing.

Keep the MAIN ADULT MODEL and the uploaded garment as the
primary visual subject.

Place additional people naturally in the background or
midground.

They should have realistic scale, realistic anatomy,
natural poses and believable interaction with the location.

Do not allow background people to obscure the uploaded garment.
`;
  }

  if (
    mode.includes("children")
  ) {
    return `
SURROUNDING PEOPLE MODE:
Create a realistic environment with the main adult fashion
model and ${Math.max(1, camera.peopleCount)}
age-appropriate children naturally present in the scene.

Children should appear only in ordinary family, lifestyle,
shopping, travel, outdoor or everyday environments.

Children must remain fully age-appropriate.

Keep children secondary to the adult model.

Never make the children the focus of adult fashion styling.

Do not allow children to obscure the main garment.
`;
  }

  if (
    mode.includes("adult")
  ) {
    return `
SURROUNDING PEOPLE MODE:
Create a realistic environment containing the main adult
fashion model plus ${Math.max(
      1,
      camera.peopleCount
    )} additional adults.

Place them naturally around the environment.

Use believable walking, sitting, talking, shopping,
waiting or casual lifestyle poses.

Keep them secondary to the main model.

Do not allow background adults to obscure the uploaded garment.
`;
  }

  return `
SURROUNDING PEOPLE MODE:
Show only the primary adult fashion model.

Do not add unnecessary background people.
`;
}

/* =========================================================
FULL GARMENT PROMPT
========================================================= */

function buildPrompt(
  body,
  variantColor = "",
  selectedPose = ""
) {
  const camera =
    getCameraSettings(body);

  const allowColourChange =
    getBoolean(
      body,
      "changeGarmentColor",
      "changeClothingColor",
      "allowGarmentColorChange",
      "variantColorChange"
    );

  const model = clean(
    getValue(
      body,
      "model",
      "lady",
      "selectedModel"
    ),
    "adult fashion model"
  );

  const bodyStyle = clean(
    getValue(
      body,
      "bodyStyle",
      "body",
      "bodyType",
      "body_type"
    ),
    "natural balanced adult proportions"
  );

  const face = clean(
    getValue(
      body,
      "face",
      "beauty"
    ),
    "natural elegant adult face"
  );

  const footwear = clean(
    getValue(
      body,
      "footwear"
    ),
    "appropriate footwear"
  );

  const clothingType = clean(
    getValue(
      body,
      "clothingType"
    ),
    "automatically detect from reference"
  );

  const clothingStyle = clean(
    getValue(
      body,
      "clothingStyle"
    ),
    "luxury editorial"
  );

  const pose = clean(
    selectedPose ||
      getValue(body, "pose"),
    "standing confidently"
  );

  const fashionStyle = clean(
    getValue(
      body,
      "fashionStyle",
      "style"
    ),
    "luxury editorial"
  );

  const country = clean(
    getValue(body, "country")
  );

  const city = clean(
    getValue(body, "city")
  );

  const locationType = clean(
    getValue(
      body,
      "locationType"
    ),
    "premium fashion location"
  );

  const scene = clean(
    getValue(
      body,
      "scene",
      "background",
      "backgroundPreset"
    ),
    "luxury fashion studio"
  );

  const property = clean(
    getValue(
      body,
      "property"
    ),
    "none"
  );

  const car = clean(
    getValue(
      body,
      "car",
      "vehicle"
    ),
    "none"
  );

  const creative = clean(
    getValue(
      body,
      "creative",
      "creativeDirection"
    ),
    "luxury fashion campaign"
  );

  const ratio = clean(
    getValue(
      body,
      "aspectRatio",
      "ratio"
    ),
    "5:4"
  );

  const extra = clean(
    getValue(
      body,
      "extra",
      "additionalPrompt"
    )
  );

  const userPrompt = clean(
    getValue(
      body,
      "prompt",
      "description"
    )
  );

  const garmentColours =
    getColourList(body);

  const trousers = getValue(
    body,
    "trouserColor",
    "trousersColor",
    "pantsColor"
  );

  const trousersColour =
    Array.isArray(trousers)
      ? trousers.join(", ")
      : clean(
          trousers,
          "Original Colour"
        );

  const location = [
    city,
    country,
  ]
    .filter(Boolean)
    .join(", ");

  return `
OBITREND AI FASHION CREATOR
REALISTIC CAMERA + STRICT GARMENT PRESERVATION MODE

=========================================================
PRIMARY IMAGE REFERENCE
=========================================================

The uploaded image is the PRIMARY and AUTHORITATIVE visual
reference for the garment.

The garment is the actual product.

Do not treat it as inspiration.

Do not redesign it.

Do not replace it.

Do not create a similar garment.

Reproduce the visible garment as faithfully as the reference
allows.

=========================================================
GARMENT PRESERVATION
=========================================================

Preserve:

- exact garment category
- silhouette
- proportions
- length
- neckline
- collar
- sleeves
- straps
- cuffs
- waist
- seams
- stitching
- panels
- pockets
- buttons
- zippers
- fasteners
- pleats
- gathers
- folds
- draping
- hem
- slits
- trim
- embroidery
- graphics
- artwork
- lettering
- logos
- labels
- stripes
- checks
- patterns
- pattern scale
- fabric texture
- material
- surface finish
- colour arrangement
- visible construction details

Do not simplify the garment.

Do not invent missing fashion details.

Do not replace it with a generic luxury outfit.

=========================================================
COLOUR
=========================================================

GARMENT COLOUR:
${
  garmentColours.join(", ") ||
  "Original Colour"
}

TROUSERS / PANTS COLOUR:
${trousersColour}

The trousers/pants colour is independent from the garment.

Never transfer trouser colour onto the garment.

${
  variantColor
    ? `
REQUESTED GARMENT COLOUR VARIANT:
${variantColor}

${
  allowColourChange
    ? `
Change only the garment colour while preserving every other
garment characteristic.
`
    : `
Do not change the original garment colour.
`
}
`
    : ""
}

=========================================================
MAIN MODEL
=========================================================

Model:
${model}

Body:
${bodyStyle}

Face:
${face}

Footwear:
${footwear}

Pose:
${pose}

Clothing type:
${clothingType}

Clothing style:
${clothingStyle}

Fashion style:
${fashionStyle}

The main fashion model is an ADULT.

=========================================================
LOCATION
=========================================================

Location type:
${locationType}

Background:
${scene}

${location ? `City / Country: ${location}` : ""}

Property:
${property}

Vehicle:
${car}

Creative direction:
${creative}

=========================================================
REALISTIC CAMERA SYSTEM
=========================================================

CAMERA TYPE:
${camera.cameraType}

LENS:
${camera.lens}

SHOT / FRAMING:
${camera.shot}

CAMERA ANGLE:
${camera.angle}

CAMERA DISTANCE:
${camera.distance}

FOCUS:
${camera.focus}

LIGHTING:
${camera.cameraLighting}

REALISM:
${camera.realism}

The image must look as if it was captured by a real professional
photographer using the selected camera and lens.

Do not create a CGI-looking image.

Do not create a mannequin.

Do not create plastic skin.

Do not create an illustration.

Do not create an artificial 3D render.

Create physically believable:

- perspective
- lens compression
- depth of field
- focus falloff
- natural skin texture
- fabric texture
- fabric folds
- realistic shadows
- realistic reflections
- realistic lighting
- natural proportions
- realistic environmental scale
- realistic camera distance
- realistic photographic exposure

=========================================================
FULL-BODY REQUIREMENT
=========================================================

The main adult model must be completely visible whenever the
selected composition is a full-body composition.

Show:

- complete head
- hair
- shoulders
- arms
- hands
- torso
- waist
- hips
- legs
- ankles
- both feet

Do not crop the main model's head.

Do not crop the uploaded garment.

Do not crop the feet in a full-body shot.

Use sufficient camera distance to fit the complete model.

Leave natural breathing room around the model.

=========================================================
PEOPLE AROUND THE MODEL
=========================================================

${buildPeoplePrompt(camera)}

Background people must remain secondary.

Do not let background people cover:

- the main garment
- the main model's face
- important garment details
- the main model's hands
- the main model's body silhouette

Background people must not be pasted together,
duplicated or malformed.

Give every visible person believable anatomy.

=========================================================
CHILD SAFETY / AGE APPROPRIATENESS
=========================================================

If children are present:

- keep them clearly age-appropriate
- use normal everyday poses
- use ordinary family/lifestyle settings
- use age-appropriate clothing
- keep them secondary
- do not sexualize them
- do not place them in adult fashion poses
- do not make them the focus of adult fashion styling

=========================================================
PHOTOGRAPHIC QUALITY
=========================================================

Create a premium commercial fashion photograph.

The final result should resemble a genuine photograph from
a professional fashion campaign.

Use:

- realistic human anatomy
- realistic hands
- realistic feet
- realistic facial proportions
- realistic skin
- realistic hair
- realistic fabric
- realistic garment fit
- realistic shadows
- realistic lighting
- realistic depth of field
- realistic environment
- professional composition

Avoid:

- extra fingers
- malformed hands
- duplicated people
- floating objects
- distorted faces
- plastic skin
- melted fabric
- distorted garment construction
- random lettering
- fake logos
- watermarks
- CGI appearance
- cartoon appearance

=========================================================
ASPECT RATIO
=========================================================

${ratio}

=========================================================
USER DIRECTION
=========================================================

${userPrompt}

=========================================================
EXTRA DIRECTION
=========================================================

${extra}

=========================================================
PRIORITY ORDER
=========================================================

1. Uploaded garment accuracy
2. Garment construction
3. Garment colour
4. Main adult model
5. Camera realism
6. Full-body visibility
7. Pose
8. People placement
9. Location
10. Vehicle
11. Styling

If any instruction conflicts with the uploaded garment,
PRESERVE THE UPLOADED GARMENT.

The final image must visibly represent the same uploaded garment
being realistically worn by the main adult model.
`;
}

/* =========================================================
OUTPUT COUNT
========================================================= */

function getOutputCount(body) {
  const raw = getValue(
    body,
    "outputCount",
    "numberOfOutputs",
    "imageCount",
    "numberOfImages",
    "poseCount",
    "numberOfPoses",
    "selectedPoseCount"
  );

  const n = Number(raw);

  if (
    !Number.isFinite(n) ||
    n < 1
  ) {
    return 1;
  }

  return Math.min(
    Math.floor(n),
    10
  );
}

/* =========================================================
POSES
========================================================= */

function getPoseList(
  body,
  count
) {
  const raw = getValue(
    body,
    "poses",
    "poseList"
  );

  let list = [];

  if (Array.isArray(raw)) {
    list = raw;
  } else if (
    typeof raw === "string" &&
    raw.trim()
  ) {
    list = raw.split(",");
  } else {
    const single = clean(
      getValue(body, "pose")
    );

    if (single) {
      list = [single];
    }
  }

  list = list
    .map((value) =>
      String(value).trim()
    )
    .filter(Boolean);

  const defaults = [
    "confident editorial standing pose, full body, natural hands",
    "natural three-quarter standing pose, elegant posture",
    "fashion walking pose with natural movement",
    "relaxed editorial seated pose with garment clearly visible",
    "side-angle editorial pose showing garment silhouette",
    "confident over-the-shoulder fashion pose",
    "natural candid fashion pose, relaxed arms",
    "strong runway-inspired standing pose",
    "elegant movement pose with realistic fabric motion",
    "premium campaign pose with clear garment visibility",
  ];

  const result = [];

  for (const pose of list) {
    if (!result.includes(pose)) {
      result.push(pose);
    }

    if (
      result.length >= count
    ) {
      break;
    }
  }

  for (const pose of defaults) {
    if (
      result.length >= count
    ) {
      break;
    }

    if (!result.includes(pose)) {
      result.push(pose);
    }
  }

  return result.slice(
    0,
    count
  );
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
PRO
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
      error?.message || error
    );

    return false;
  }
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
  const inputBuffer =
    Buffer.from(
      imageBase64,
      "base64"
    );

  if (!inputBuffer.length) {
    throw new Error(
      "The uploaded clothing image is empty."
    );
  }

  if (
    inputBuffer.length >
    MAX_IMAGE_BYTES
  ) {
    throw new Error(
      "The uploaded clothing image is too large. Please upload a smaller image."
    );
  }

  const imageFile =
    await toFile(
      inputBuffer,
      `obitrend-clothing-reference.${extensionFromMime(
        mimeType
      )}`,
      {
        type: mimeType,
      }
    );

  const result =
    await openai.images.edit({
      model: MODEL,
      image: imageFile,
      prompt,
      size,
