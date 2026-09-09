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

REALISTIC CAMERA + REAL WORLD PEOPLE EDITION

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

CAMERA / SCENE:
- Realistic professional camera
- Camera type
- Lens
- Shot / framing
- Camera angle
- Camera distance
- Focus
- Lighting
- Photographic depth of field
- Natural perspective
- Real-world people
- Adults
- Men
- Women
- Parents
- Children
- Girls
- Boys
- Families
- Friends
- Couples
- Shoppers
- Hotel guests
- Pedestrians
- Natural activities
- Different people doing different things
- Realistic background behaviour
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
  /*
  If the frontend already sends these fields, they are used.

  If the frontend does not send them, realistic defaults
  are automatically applied.
  */

  const peopleMode = clean(
    getValue(
      body,
      "peopleMode",
      "peopleInScene",
      "companionMode",
      "surroundingPeople"
    ),
    "mixed natural people and families"
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
      : 4;

  const cameraType = clean(
    getValue(
      body,
      "realisticCamera",
      "cameraType",
      "advancedCamera",
      "camera"
    ),
    "Full-Frame Fashion Camera - 1/250s - f/4 - ISO 100 - Natural WB"
  );

  const lens = clean(
    getValue(
      body,
      "cameraLens",
      "lens"
    ),
    "50mm f/2.0 - Natural Perspective"
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
    "eye-level natural camera angle"
  );

  const distance = clean(
    getValue(
      body,
      "cameraDistance",
      "distance"
    ),
    "medium professional camera distance"
  );

  const focus = clean(
    getValue(
      body,
      "cameraFocus",
      "focus"
    ),
    "main adult model and uploaded garment"
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
    "true-to-life professional photography"
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
REALISTIC PEOPLE PROMPT
========================================================= */

function buildPeoplePrompt(camera, locationType = "", scene = "") {
  const mode =
    camera.peopleMode.toLowerCase();

  const count = Math.max(
    1,
    Math.min(camera.peopleCount || 4, 10)
  );

  const environment =
    `${locationType} ${scene}`.toLowerCase();

  const activities = `
NATURAL PEOPLE ACTIVITIES:

Do not make everyone do the same thing.

Different people may naturally be:

- walking
- talking
- shopping
- browsing products
- looking at clothing
- carrying shopping bags
- sitting
- standing
- waiting
- using a smartphone
- drinking coffee
- talking with friends
- talking with family
- taking photographs
- entering a building
- leaving a building
- walking toward another person
- looking at their surroundings
- sitting at a restaurant
- waiting for transportation
- relaxing
- walking with children
- pushing a stroller where appropriate
- casually interacting with the environment

Activities must make sense for the selected location.

People should NOT all face the camera.

People should NOT all look at the main model.

People should NOT stand in a perfectly arranged line.

People should behave independently like real people captured
in an unscripted professional photograph.
`;

  let locationActivity = "";

  if (
    environment.includes("hotel") ||
    environment.includes("resort")
  ) {
    locationActivity = `
HOTEL / RESORT BEHAVIOUR:

Guests may be:

- walking through the lobby
- checking in
- carrying luggage
- sitting in lounge areas
- talking
- walking beside family
- relaxing
- using phones
- entering elevators
- walking near hotel entrances
`;
  } else if (
    environment.includes("restaurant") ||
    environment.includes("cafe") ||
    environment.includes("coffee")
  ) {
    locationActivity = `
RESTAURANT / CAFE BEHAVIOUR:

People may be:

- sitting at tables
- drinking coffee
- eating
- talking
- waiting for food
- looking at menus
- entering or leaving
- sitting with friends
- sitting with family
`;
  } else if (
    environment.includes("shop") ||
    environment.includes("mall") ||
    environment.includes("boutique")
  ) {
    locationActivity = `
SHOPPING ENVIRONMENT:

People may be:

- browsing clothing
- carrying shopping bags
- looking at products
- talking with friends
- paying for items
- walking between stores
- comparing products
- waiting in line
`;
  } else if (
    environment.includes("beach") ||
    environment.includes("resort") ||
    environment.includes("pool")
  ) {
    locationActivity = `
LEISURE ENVIRONMENT:

People may be:

- walking
- relaxing
- talking
- sitting
- enjoying the environment
- walking with family
- taking photographs
- naturally interacting with the location
`;
  } else if (
    environment.includes("airport")
  ) {
    locationActivity = `
AIRPORT ENVIRONMENT:

People may be:

- walking with luggage
- checking phones
- waiting
- talking
- sitting
- walking toward gates
- travelling with family
`;
  } else if (
    environment.includes("city") ||
    environment.includes("street")
  ) {
    locationActivity = `
CITY ENVIRONMENT:

People may be:

- walking
- crossing the street
- talking
- using phones
- waiting
- shopping
- carrying bags
- entering buildings
- walking with friends
`;
  }

  if (
    mode.includes("family") ||
    mode.includes("mixed") ||
    mode.includes("people")
  ) {
    return `
=========================================================
REALISTIC SURROUNDING PEOPLE
=========================================================

Create approximately ${count} secondary people around the
PRIMARY ADULT FASHION MODEL.

The people should represent a believable cross-section of
real life.

Possible people include:

- adult women
- adult men
- mothers
- fathers
- girls
- boys
- families
- couples
- friends
- shoppers
- hotel guests
- tourists
- pedestrians
- restaurant customers

Use a NATURAL MIX rather than forcing every category into
every image.

For example, one scene may contain:

- a mother walking with her daughter
- a father talking with his son
- two women shopping
- a man using his phone
- a couple walking together

Another scene may contain different people.

Do not create identical people.

Do not clone faces.

Do not clone clothing.

Do not give everybody the same body shape.

Do not give everybody the same pose.

Do not make everybody look directly at the camera.

Do not make everybody look directly at the main model.

Place people naturally in foreground, midground and
background according to realistic camera perspective.

Some people may be partially outside the frame if that is
natural.

Some background people may be slightly out of focus.

The PRIMARY ADULT MODEL wearing the uploaded garment must
remain the dominant subject.

Do not allow secondary people to cover the garment.

Do not allow secondary people to cover the main model's face.

${activities}

${locationActivity}

=========================================================
FAMILY COMPOSITION
=========================================================

When families appear, realistic combinations may include:

- mother + daughter
- mother + son
- father + daughter
- father + son
- mother + father + children
- parents walking with children
- grandparents with family
- family shopping together
- family sitting together
- family walking through a hotel
- family visiting a restaurant
- family travelling

Families must look naturally related without identical faces.

=========================================================
CHILDREN
=========================================================

If children appear:

- they must be age-appropriate
- they must wear ordinary age-appropriate clothing
- they must perform normal everyday activities
- they must remain secondary to the adult fashion model
- they must not pose sexually
- they must not be presented as adult fashion models
- they must not be the focus of adult fashion styling

Keep children naturally integrated into the environment.

=========================================================
REAL HUMAN VARIETY
=========================================================

Secondary people should have natural differences in:

- age
- height
- hairstyle
- skin appearance
- clothing
- body proportions
- posture
- activity
- direction of movement
- distance from camera

The people should look like separate real humans who happened
to be present when the photograph was taken.
`;
  }

  if (
    mode.includes("children")
  ) {
    return `
REALISTIC CHILDREN AND FAMILY ENVIRONMENT

Create the PRIMARY ADULT FASHION MODEL plus approximately
${count} age-appropriate children and nearby adults where
appropriate.

Children may be:

- walking with parents
- holding a parent's hand
- playing normally
- sitting with family
- walking through a shop
- travelling with family
- talking with parents
- looking at their surroundings

Children remain secondary.

Never make children the focus of adult fashion styling.

${activities}

Do not allow children to obscure the uploaded garment.
`;
  }

  if (
    mode.includes("adult")
  ) {
    return `
REALISTIC ADULT ENVIRONMENT

Create the PRIMARY ADULT FASHION MODEL plus approximately
${count} additional adults.

The additional adults may include:

- women
- men
- couples
- friends
- shoppers
- tourists
- hotel guests
- pedestrians
- business people
- restaurant customers

Give each person a different appearance and activity.

${activities}

Keep all secondary adults behind or beside the main model
whenever possible.

Never allow them to cover the uploaded garment.
`;
  }

  return `
NATURAL BACKGROUND PEOPLE

The PRIMARY ADULT FASHION MODEL is the hero subject.

Add a small number of realistic people only when appropriate
for the selected location.

People may include adults, families, parents, children,
friends, shoppers or pedestrians.

They must behave naturally and independently.

${activities}

Keep the main garment completely visible.
`;
}

/* =========================================================
GENDER ENFORCEMENT
========================================================= */

function getModelGender(body) {

  const raw = clean(
    getValue(
      body,
      "gender",
      "modelGender",
      "selectedGender"
    ),
    ""
  ).toLowerCase();

  const ageGroup = clean(
    getValue(
      body,
      "ageGroup"
    ),
    ""
  ).toLowerCase();

  if (
    raw === "man" ||
    raw === "male" ||
    raw === "men" ||
    raw === "adult_man" ||
    raw === "adult male"
  ) {
    return "man";
  }

  if (
    raw === "woman" ||
    raw === "female" ||
    raw === "women" ||
    raw === "adult_woman" ||
    raw === "adult female"
  ) {
    return "woman";
  }

  if (
    ageGroup === "adult_man" ||
    ageGroup === "adult male"
  ) {
    return "man";
  }

  return "woman";
}

function getGenderModelFallback(gender) {

  return gender === "man"
    ? "professional adult male fashion model"
    : "professional adult female fashion model";
}

function getGenderBodyFallback(gender) {

  return gender === "man"
    ? "natural proportioned adult male fashion model"
    : "natural proportioned adult female fashion model";
}

function getGenderFaceFallback(gender) {

  return gender === "man"
    ? "handsome natural Nigerian male face with refined masculine features"
    : "beautiful natural Nigerian female face with elegant features";
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

  /* =======================================================
     MODEL GENDER IS AUTHORITATIVE
     ======================================================= */

  const gender =
    getModelGender(body);

  const isMale =
    gender === "man";

  const genderLabel =
    isMale
      ? "ADULT MAN — MALE"
      : "ADULT WOMAN — FEMALE";

  const allowColourChange =
    getBoolean(
      body,
      "changeGarmentColor",
      "changeClothingColor",
      "allowGarmentColorChange",
      "variantColorChange"
    );

  const suppliedModel = clean(
    getValue(
      body,
      "model",
      "lady",
      "selectedModel"
    ),
    ""
  );

  const suppliedBody = clean(
    getValue(
      body,
      "bodyStyle",
      "body",
      "bodyType",
      "body_type"
    ),
    ""
  );

  const suppliedFace = clean(
    getValue(
      body,
      "face",
      "beauty"
    ),
    ""
  );

  /*
  When Man is selected, the backend never falls back to
  a female model. When Woman is selected, it never falls
  back to a male model.
  */

  const model =
    isMale
      ? (
          suppliedModel &&
          !/amina|amara|zara|nia|imani|maya|kiara|aisha|leila|naomi|tara|lina|sofia|mila|chiamaka|ada|celine|diana|ella|grace|chinwe|amaka|favour|deborah|esther|joy|precious|victoria/i.test(
            suppliedModel
          )
            ? suppliedModel
            : getGenderModelFallback(gender)
        )
      : suppliedModel ||
        getGenderModelFallback(gender);

  const bodyStyle =
    suppliedBody ||
    getGenderBodyFallback(gender);

  const face =
    isMale
      ? (
          suppliedFace &&
          !/female|woman|beauty|feminine|lady|girl/i.test(
            suppliedFace
          )
            ? suppliedFace
            : getGenderFaceFallback(gender)
        )
      : suppliedFace ||
        getGenderFaceFallback(gender);

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

  const peoplePrompt =
    buildPeoplePrompt(
      camera,
      locationType,
      scene
    );

  return `
OBITREND AI FASHION CREATOR
REALISTIC CAMERA + REAL WORLD PEOPLE
STRICT GARMENT PRESERVATION MODE

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

Reproduce the visible garment as faithfully as possible.

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

Never transfer trouser colour onto the uploaded garment.

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
MAIN ADULT MODEL
=========================================================

SELECTED MODEL GENDER:
${genderLabel}

MODEL:
${model}

BODY:
${bodyStyle}

FACE:
${face}

=========================================================
STRICT GENDER ENFORCEMENT
=========================================================

The selected model gender is an AUTHORITATIVE instruction.

${
  isMale
    ? `
THE PRIMARY FASHION MODEL MUST BE AN ADULT MAN.

Generate a clearly adult male human fashion model.

The primary model must have realistic adult male anatomy,
male facial structure and masculine physical characteristics.

Do NOT generate a woman as the primary model.

Do NOT use female facial characteristics.

Do NOT use female body proportions.

Do NOT use feminine anatomy.

Do NOT use a female fashion model.

Do NOT substitute a woman because of the uploaded garment.

The uploaded garment must be realistically worn by the
ADULT MALE MODEL.

The garment does not determine the model's gender.

MODEL GENDER = MALE.
`
    : `
THE PRIMARY FASHION MODEL MUST BE AN ADULT WOMAN.

Generate a clearly adult female human fashion model.

The primary model must have realistic adult female anatomy,
female facial structure and feminine physical characteristics.

Do NOT generate a man as the primary model.

Do NOT use male facial characteristics.

Do NOT use male body proportions.

Do NOT use masculine anatomy.

Do NOT use a male fashion model.

The uploaded garment must be realistically worn by the
ADULT FEMALE MODEL.

The garment does not determine the model's gender.

MODEL GENDER = FEMALE.
`
}

The primary fashion model must remain the dominant subject.

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

The main model wearing the uploaded garment is always the
primary visual subject.

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
REALISTIC PROFESSIONAL CAMERA
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

Treat these as real photographic camera instructions.

The final image must look as though a professional fashion
photographer physically captured the scene with a real camera.

Use believable:

- focal length
- perspective
- camera distance
- depth of field
- focus falloff
- lens compression
- foreground separation
- background separation
- natural bokeh
- realistic exposure
- natural white balance
- realistic skin response
- realistic fabric response
- realistic shadows
- realistic highlights
- realistic reflections
- natural motion

Do not make the entire image equally sharp.

The main model and garment should receive the strongest
visual attention.

Background people can naturally become softer according
to their distance from the camera.

Do not create artificial CGI sharpness.

Do not create plastic skin.

Do not create a mannequin.

Do not create a 3D render.

Do not create an illustration.

Do not create impossible lens distortion.

=========================================================
REAL WORLD PEOPLE
=========================================================

${peoplePrompt}

=========================================================
FULL BODY
=========================================================

Whenever the selected composition is full-body, keep the
main adult model completely visible.

Show:

- head
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

Do not crop the feet in a full-body composition.

Use sufficient camera distance.

=========================================================
ANATOMY
=========================================================

All visible people must have believable:

- hands
- fingers
- arms
- legs
- feet
- faces
- body proportions
- posture

Avoid:

- extra fingers
- malformed hands
- duplicated limbs
- distorted faces
- fused people
- floating people
- unnatural poses
- cloned faces
- cloned bodies

=========================================================
CHILD AGE APPROPRIATENESS
=========================================================

If children appear:

- keep them clearly age-appropriate
- use normal everyday poses
- use ordinary family/lifestyle settings
- use age-appropriate clothing
- keep them secondary
- do not sexualize them
- do not place them in adult fashion poses
- do not make them the focus of adult fashion styling

=========================================================
GARMENT VISIBILITY
=========================================================

The uploaded garment must remain clearly visible.

Background people must not cover:

- the garment
- important garment details
- the main model's face
- the main model's hands
- the main model's body silhouette

If the scene becomes crowded, move secondary people farther
into the background rather than hiding the garment.

=========================================================
PHOTOGRAPHIC QUALITY
=========================================================

Create a premium commercial fashion photograph.

The result should resemble a genuine photograph from a
high-end professional fashion campaign.

Use:

- realistic human anatomy
- realistic hands
- realistic feet
- realistic skin
- realistic hair
- realistic fabric
- realistic garment fit
- realistic lighting
- realistic shadows
- realistic depth of field
- realistic environmental scale
- realistic people
- realistic perspective
- professional composition

Avoid:

- CGI
- cartoon rendering
- plastic skin
- mannequin appearance
- excessive HDR
- excessive sharpening
- fake bokeh
- impossible depth of field
- duplicated people
- cloned faces
- distorted people
- floating objects
- distorted garment construction
- random lettering
- fake logos
- watermarks

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
6. Garment visibility
7. Full-body visibility
8. Pose
9. Natural surrounding people
10. Location
11. Vehicle
12. Styling

If any instruction conflicts with the uploaded garment,
PRESERVE THE UPLOADED GARMENT.

The final image must visibly represent the same uploaded
garment being realistically worn by the main adult model.
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

  try {
    const result =
      await openai.images.edit({
        model: MODEL,
        image: imageFile,
        prompt,
        size,
        quality: "high",
        output_format: "png",
      });

    const b64 =
      result?.data?.[0]?.b64_json;

    if (!b64) {
      throw new Error(
        "OpenAI did not return a generated image."
      );
    }

    return `data:image/png;base64,${b64}`;
  } catch (error) {
    console.error(
      "OBITREND OpenAI image edit failed:",
      {
        message:
          error?.message || "Unknown OpenAI error",
        status:
          error?.status || null,
        code:
          error?.code || null,
        type:
          error?.type || null,
        param:
          error?.param || null,
      }
    );

    throw error;
  }
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
      error: "Method not allowed.",
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

  try {
    const body =
      req.body ||
      {};

    /* =====================================================
    IMAGE
    ===================================================== */

    const imageInput =
      getNestedImageInput(body);

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

    /* =====================================================
    AUTH
    ===================================================== */

    const auth =
      await getAuthenticatedUser(
        req
      );

    if (!auth.ok) {
      return res.status(
        auth.status
      ).json({
        success: false,
        error: auth.error,
      });
    }

    const userId =
      auth.user.id;

    const redis =
      getRedisOrNull();

    /* =====================================================
    CREDIT CHARGE
    ===================================================== */

    const charge = redis
      ? await spendCredit(
          userId,
          redis
        )
      : {
          success: false,
          balance: 0,
          reason:
            "credits_unavailable",
        };

    if (!charge.success) {
      const proFinished =
        charge.reason ===
          "no_pro_credits" ||
        charge.reason ===
          "pro_exhausted";

      const message =
        proFinished
          ? "🔒 Your OBITREND Pro credits are finished. Renew Pro to continue."
          : charge.reason ===
              "no_free_credits"
            ? "Your free generations are finished. Upgrade to OBITREND Pro to continue."
            : "Unable to access OBITREND credits right now.";

      return res.status(402).json({
        success: false,
        error: message,
        upgradeRequired: true,
        proActive:
          charge.proActive ===
          true,
        proExhausted:
          proFinished,
        balance:
          charge.balance ?? 0,
        proCredits:
          charge.proCredits ?? 0,
      });
    }

    const proActive =
      charge.creditType ===
        "pro" &&
      charge.proActive ===
        true;

    /* =====================================================
    GENERATION SETTINGS
    ===================================================== */

    const outputCount =
      getOutputCount(body);

    const poses =
      getPoseList(
        body,
        outputCount
      );

    const colours =
      getColourList(body);

    const size =
      getImageSize(
        getValue(
          body,
          "aspectRatio",
          "ratio"
        )
      );

    const camera =
      getCameraSettings(body);

    /* =====================================================
    FIX: DEFINE GENDER VALUES USED BY finalPrompt
    ===================================================== */

    const selectedGender =
      getModelGender(body);

    const isMale =
      selectedGender === "man";

    const genderLabel =
      isMale
        ? "ADULT MAN — MALE"
        : "ADULT WOMAN — FEMALE";

    const images = [];

    /* =====================================================
    GENERATE
    ===================================================== */

    try {
      for (
        let index = 0;
        index <
        poses.length;
        index += 1
      ) {
        const pose =
          poses[index];

        const variantColor =
          colours.length > 0
            ? colours[
                index %
                  colours.length
              ]
            : "";

        const prompt =
          buildPrompt(
            body,
            variantColor,
            pose
          );

        const finalPrompt = `
${prompt}

=========================================================
SINGLE FINAL IMAGE
=========================================================

Generate EXACTLY ONE finished photograph.

Do not generate a collage.

Do not generate a split screen.

Do not generate multiple panels.

Do not show before/after images.

Do not show multiple poses.

The selected pose for this image is:

${pose}

=========================================================
CAMERA EXECUTION
=========================================================

Use the selected camera settings as actual photographic
composition instructions.

Camera:
${camera.cameraType}

Lens:
${camera.lens}

Shot:
${camera.shot}

Angle:
${camera.angle}

Distance:
${camera.distance}

Focus:
${camera.focus}

Lighting:
${camera.cameraLighting}

Realism:
${camera.realism}

=========================================================
PEOPLE EXECUTION
=========================================================

Create a believable real-world scene.

Secondary people should behave independently.

Do not clone people.

Do not duplicate faces.

Do not give everyone the same clothing.

Do not give everyone the same pose.

Do not make everyone face the camera.

Do not make everyone look at the main model.

Some people can be walking.

Some can be talking.

Some can be shopping.

Some can be sitting.

Some can be using phones.

Some can be carrying bags.

Parents can naturally walk with children.

Families can naturally interact.

Men and women can naturally appear together.

Girls and boys can naturally appear with parents or family
when appropriate.

Children remain age-appropriate and secondary.

The main adult model wearing the uploaded garment remains the
hero subject.

=========================================================
PHOTOGRAPHIC DEPTH
=========================================================

Use real-camera depth relationships.

Foreground people can be larger.

Midground people can be naturally scaled.

Background people should be smaller according to perspective.

People farther away may naturally become softer.

The main garment should remain clear and visually dominant.

Do not paste people into the scene.

Make every person appear physically present in the same
environment.

=========================================================
FINAL GENDER CHECK
=========================================================

Before producing the image, verify the PRIMARY fashion model.

Selected gender:
${genderLabel}

${
  isMale
    ? `
The primary model MUST be an adult man.

If the generated primary model appears female, regenerate
the primary model as an adult male before completing the image.
`
    : `
The primary model MUST be an adult woman.

If the generated primary model appears male, regenerate
the primary model as an adult female before completing the image.
`
}

Do not allow the uploaded garment, background people,
location, styling or pose to override the selected primary
model gender.
=========================================================
FINAL QUALITY CHECK
=========================================================

Before producing the image, internally check:

1. Is the garment based on the uploaded reference?
2. Is the garment category correct?
3. Are major garment details preserved?
4. Is the main model an adult?
5. Are children age-appropriate?
6. Are surrounding people naturally positioned?
7. Are different people doing different natural activities?
8. Does camera perspective look physically believable?
9. Does depth of field look photographic?
10. Are hands realistic?
11. Are feet realistic?
12. Are faces realistic?
13. Is the image photographic rather than CGI?
14. Is the main garment unobscured?
15. Is the selected pose respected?
16. Is the selected location respected?

If any background element conflicts with the garment,
prioritize the garment.
`;

        const generated =
          await generateOne(
            imageBase64,
            mimeType,
            finalPrompt,
            size
          );

        images.push(
          generated
        );
      }
    } catch (
      generationError
    ) {
      if (
        charge.usedCredit &&
        redis
      ) {
        try {
          await refundCredit(
            userId,
            redis,
            charge
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

    /* =====================================================
    RESPONSE
    ===================================================== */

    const firstImage =
      images[0];

    return res.status(200).json({
      success: true,
      ok: true,

      model: MODEL,

      gender:
        getModelGender(body),

      modelGender:
        getModelGender(body),

      ageGroup:
        clean(
          getValue(
            body,
            "ageGroup"
          ),
          getModelGender(body)==="man"
            ?"adult_man"
            :"adult_woman"
        ),

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

      balance:
        charge.balance,

      pro:
        proActive,

      proActive,

      proExhausted:
        charge.proExhausted ===
        true,

      requestedImages:
        outputCount,

      generatedImages:
        images.length,

      imageCount:
        images.length,

      poseCount:
        poses.length,

      poses,

      poseImages:
        images,

      realisticCamera: {
        camera:
          camera.cameraType,
        lens:
          camera.lens,
        shot:
          camera.shot,
        angle:
          camera.angle,
        distance:
          camera.distance,
        focus:
          camera.focus,
        lighting:
          camera.cameraLighting,
        realism:
          camera.realism,
        peopleMode:
          camera.peopleMode,
        peopleCount:
          camera.peopleCount,
      },

      refunded: false,
    });
  } catch (error) {
    console.error(
      "OBITREND generation error:",
      {
        message:
          error?.message ||
          "Image generation failed.",
        status:
          error?.status ||
          null,
        code:
          error?.code ||
          null,
        type:
          error?.type ||
          null,
        param:
          error?.param ||
          null,
      }
    );

    return res.status(503).json({
      success: false,

      error:
        "✨ Generation is temporarily unavailable. Please purchase or renew an OBITREND Pro package to continue creating premium fashion images.",

      upgradeRequired: true,
    });
  }
}
