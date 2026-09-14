import OpenAI, { toFile } from "openai";

import {
  spendCredit,
  refundCredit,
  getProStatus,
  getRedisConfig,
  getAuthenticatedUser,
} from "../lib/credits.js";

/*
=========================================================
OBITREND AI FASHION CREATOR
SECURE IMAGE GENERATION API

ADVANCED MONTHLY PRO EDITION

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
- Existing image sizes
- High quality PNG output

MONTHLY PRO ONLY:
- Advanced camera system
- Fujifilm GFX 100S II
- Advanced male models
- Advanced female models
- Families
- Groups
- Couples
- Friends
- Adults
- Children
- Parents
- Mixed people
- Houses
- Villas
- Apartments
- Hotels
- Resorts
- Restaurants
- Cafes
- Shops
- Boutiques
- Malls
- Airports
- Cities
- Streets
- Beaches
- Pools
- Vehicles
- Cars
- Luxury cars
- Furniture
- Interiors
- Objects
- Business environments
- Lifestyle scenes
- Events
- Outdoor scenes
- Automatic scene intelligence
- Automatic people behaviour
- Automatic environmental objects
- Advanced photographic realism

IMPORTANT:
Monthly Pro restrictions are enforced SERVER-SIDE.
Browser supplied values cannot unlock Monthly Pro features.
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

IMPORTANT:
DO NOT CHANGE THESE EXISTING VALUES.
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
MONTHLY PRO DETECTION

IMPORTANT:
This uses the SERVER-SIDE Pro status.
The browser cannot declare itself Monthly Pro.
========================================================= */

async function getMonthlyProStatus(
  userId,
  redis
) {
  if (
    !userId ||
    !redis
  ) {
    return {
      active: false,
      monthly: false,
      plan: null,
      exhausted: false,
    };
  }

  try {
    const status =
      await getProStatus(
        userId,
        redis
      );

    const plan =
      clean(
        status?.plan,
        ""
      ).toUpperCase();

    const monthly =
      status?.active === true &&
      plan === "PRO_MONTHLY";

    return {
      active:
        status?.active === true,

      monthly,

      plan:
        plan || null,

      exhausted:
        status?.exhausted === true ||
        status?.proExhausted === true,
    };
  } catch (error) {
    console.warn(
      "OBITREND Monthly Pro check failed:",
      error?.message || error
    );

    return {
      active: false,
      monthly: false,
      plan: null,
      exhausted: false,
    };
  }
}

/* =========================================================
AI SMART CAMERA ENGINE
========================================================= */

function getCameraSettings(
  body,
  monthlyPro = false
) {
  /*
  =========================================================
  SERVER-SIDE FEATURE GATE

  ONLY PRO_MONTHLY may control the advanced camera engine.

  The browser cannot unlock these features by sending:
  - cameraType
  - advancedCamera
  - lens
  - peopleMode
  - peopleCount
  - cameraShot
  - cameraAngle
  - cameraDistance
  - cameraFocus
  - cameraLighting
  - realism
  =========================================================
  */

  if (!monthlyPro) {
    return {
      peopleMode:
        "limited natural adult background people",

      peopleCount: 2,

      cameraType:
        "AI Smart Camera - Standard",

      lens:
        "AI Smart Lens - Standard",

      shot:
        "natural professional fashion composition",

      angle:
        "eye-level natural camera angle",

      distance:
        "medium professional camera distance",

      focus:
        "primary adult model and uploaded garment",

      cameraLighting:
        "natural professional fashion lighting",

      realism:
        "true-to-life professional photography",

      smartCamera: `
STANDARD CAMERA ENGINE

The account is NOT Monthly Pro.

Use the standard OBITREND camera workflow.

Do NOT use:
- Fujifilm GFX100S II
- medium-format simulation
- advanced camera presets
- advanced camera controls
- advanced Monthly Pro photographic features

Use a realistic professional fashion camera appearance.

Keep the uploaded garment authoritative.

The camera must never redesign, replace or modify the
uploaded garment.
`,

      monthlyPro: false,
    };
  }


  /*
  =========================================================
  MONTHLY PRO ADVANCED CAMERA ENGINE
  =========================================================
  */

  const peopleMode =
    clean(
      getValue(
        body,
        "peopleMode",
        "peopleInScene",
        "companionMode",
        "surroundingPeople"
      ),
      "mixed natural people and families"
    );


  const peopleCountRaw =
    Number(
      getValue(
        body,
        "peopleCount",
        "numberOfPeople",
        "companionCount"
      )
    );


  const peopleCount =
    Number.isFinite(
      peopleCountRaw
    ) &&
    peopleCountRaw >= 1
      ? Math.min(
          Math.floor(
            peopleCountRaw
          ),
          10
        )
      : 4;


  const selectedCamera =
    clean(
      getValue(
        body,
        "realisticCamera",
        "cameraType",
        "advancedCamera",
        "camera"
      ),
      "AI Smart Camera"
    );


  const selectedLens =
    clean(
      getValue(
        body,
        "cameraLens",
        "lens"
      ),
      "AI Smart Lens Selection"
    );


  const shot =
    clean(
      getValue(
        body,
        "cameraShot",
        "shotType",
        "framing",
        "composition"
      ),
      "natural professional fashion composition"
    );


  const angle =
    clean(
      getValue(
        body,
        "cameraAngle",
        "angle"
      ),
      "eye-level natural camera angle"
    );


  const distance =
    clean(
      getValue(
        body,
        "cameraDistance",
        "distance"
      ),
      "natural professional camera distance"
    );


  const focus =
    clean(
      getValue(
        body,
        "cameraFocus",
        "focus"
      ),
      "eye autofocus with garment priority"
    );


  const cameraLighting =
    clean(
      getValue(
        body,
        "cameraLighting",
        "lighting"
      ),
      "physically realistic natural professional lighting"
    );


  const realism =
    clean(
      getValue(
        body,
        "realism",
        "realismLevel"
      ),
      "true-to-life professional photography"
    );


  const requestedFujifilm =
    /fujifilm\s*gfx\s*100s\s*ii|gfx\s*100s\s*ii/i.test(
      selectedCamera
    );


  const finalCamera =
    requestedFujifilm
      ? selectedCamera
      : selectedCamera;


  const gfxPrompt = `
MONTHLY PRO CAMERA SYSTEM ACTIVE.

FUJIFILM GFX100S II IS AVAILABLE.

When selected, create a believable medium-format
professional photographic appearance.

Use:
- realistic medium-format rendering
- natural tonal transitions
- high micro-detail
- realistic highlight roll-off
- realistic shadow detail
- natural skin texture
- realistic fabric texture
- believable depth of field
- natural perspective
- professional commercial photography

Do NOT turn the image into CGI.

Do NOT place camera branding in the photograph.

Do NOT write the camera name into the image.

The camera controls photographic rendering only.

The uploaded garment remains the authoritative product.
`;


  const smartCamera = `
AI SMART CAMERA — MONTHLY PRO ACTIVE

${gfxPrompt}

Automatically choose the most physically appropriate
professional camera configuration for the selected scene.

SENSOR:

Use the appropriate professional sensor characteristics.

LENS:

24mm — environmental and wide scenes.

35mm — street fashion and lifestyle.

50mm — natural perspective and everyday fashion.

85mm — premium fashion portraits.

105mm — compressed luxury portrait/campaign work.

Do not force one focal length onto every scene.

APERTURE:

Choose a realistic aperture according to subject distance,
lighting and number of people.

Use wider apertures for portraits.

Use moderate apertures for full-body fashion.

Use deeper apertures when multiple people or environmental
details need to remain recognizable.

SHUTTER:

Use a realistic shutter speed appropriate for movement.

ISO:

Use the lowest realistic ISO appropriate for the scene.

WHITE BALANCE:

Match the environment naturally.

AUTOFOCUS:

Use professional eye/face autofocus for the primary adult
model.

Prioritize garment detail whenever necessary.

DEPTH OF FIELD:

Use physically believable depth of field.

Do not use artificial blur.

PERSPECTIVE:

Maintain correct real-world perspective.

Keep people, architecture, furniture, vehicles and objects
at believable physical scale.

EXPOSURE:

Maintain realistic highlights, shadows and midtones.

Avoid excessive HDR.

SKIN:

Preserve realistic skin texture and natural tonal variation.

FABRIC:

Preserve realistic fabric texture, seams, stitching,
folds and surface detail.

CAMERA AUTHORITY:

Camera realism controls HOW the garment is photographed.

It must NEVER redesign or replace the garment.
`;


  return {
    peopleMode,
    peopleCount,

    cameraType:
      finalCamera,

    lens:
      selectedLens,

    shot,
    angle,
    distance,
    focus,
    cameraLighting,
    realism,

    smartCamera,

    monthlyPro: true,
  };
}

/* =========================================================
ADVANCED MONTHLY PRO PEOPLE ENGINE
========================================================= */

function buildPeoplePrompt(
  camera,
  locationType = "",
  scene = "",
  monthlyPro = false
) {
  const environment =
    `${locationType} ${scene}`.toLowerCase();


  /*
  =========================================================
  STANDARD / WEEKLY PRO / FREE
  =========================================================

  Strictly limited background people.

  No advanced family/group/children engine.
  */

  if (!monthlyPro) {
    return `
=========================================================
STANDARD REALISTIC PEOPLE MODE
=========================================================

This account does NOT have Monthly Pro.

Use only a small number of incidental adult background
people when the selected environment naturally requires them.

Maximum secondary people: 2

Secondary people must remain clearly behind or beside the
primary adult fashion model.

They may naturally:
- walk
- stand
- sit
- wait
- browse
- use a phone
- carry a normal bag
- drink coffee
- perform ordinary background activities

Do NOT use the Monthly Pro people engine.

Do NOT intentionally generate:
- large groups
- family scenes
- parent-and-child scenes
- child-focused scenes
- advanced mixed-age groups
- large crowds
- coordinated groups
- advanced people choreography

Do not clone faces.

Do not clone bodies.

Do not make everybody face the camera.

Do not make everybody look at the primary model.

Keep all secondary people visually subordinate.

The PRIMARY ADULT MODEL wearing the uploaded garment remains
the hero subject.

Environment:
${environment}
`;
  }


  /*
  =========================================================
  MONTHLY PRO PEOPLE ENGINE
  =========================================================
  */

  const mode =
    String(
      camera.peopleMode || ""
    ).toLowerCase();


  const count =
    Math.max(
      1,
      Math.min(
        Number(
          camera.peopleCount
        ) || 4,
        10
      )
    );


  const activities = `
NATURAL HUMAN BEHAVIOUR:

People must behave independently.

Different people can:
- walk
- talk
- shop
- browse
- sit
- stand
- wait
- use phones
- drink coffee
- eat
- carry bags
- take photographs
- enter buildings
- leave buildings
- travel
- relax
- interact with family
- interact with friends
- interact naturally with the environment

Do not make everybody perform the same action.

Do not make everybody face the camera.

Do not make everybody look at the primary model.

Do not arrange people in a perfect line.

Do not clone faces.

Do not clone bodies.

Do not clone clothing.

The PRIMARY ADULT MODEL wearing the uploaded garment
remains the hero subject.
`;


  return `
=========================================================
MONTHLY PRO REAL-WORLD PEOPLE ENGINE
=========================================================

MONTHLY PRO IS SERVER-VERIFIED.

People mode:
${mode || "automatic intelligent people selection"}

Approximately:
${count} secondary people

Possible people include:

- adult men
- adult women
- mothers
- fathers
- parents
- couples
- friends
- families
- children
- shoppers
- tourists
- hotel guests
- restaurant customers
- business people
- pedestrians
- travellers

Only use people appropriate for the selected environment.

=========================================================
PEOPLE VARIETY
=========================================================

Each person must be visually distinct.

Vary:
- age
- height
- hairstyle
- facial characteristics
- clothing
- body proportions
- posture
- activity
- distance
- direction

Do not clone faces.

Do not clone bodies.

Do not give everyone identical clothing.

Do not give everyone identical poses.

=========================================================
FAMILIES
=========================================================

Families may naturally include:

- mother + daughter
- mother + son
- father + daughter
- father + son
- mother + father + children
- parents with children
- grandparents with family

Use realistic family interaction.

=========================================================
GROUPS
=========================================================

Groups may include:

- friends
- coworkers
- shoppers
- tourists
- travellers
- event attendees
- restaurant groups
- casual social groups

Do not arrange groups like a studio photoshoot.

=========================================================
CHILDREN
=========================================================

Children may appear only when appropriate.

Children must:

- remain clearly age-appropriate
- wear age-appropriate clothing
- behave naturally
- remain secondary
- interact normally with parents or surroundings

Never sexualize children.

Never make children adult fashion models.

Never place children in adult poses.

=========================================================
REALISTIC DEPTH
=========================================================

People closer to camera appear larger.

People farther away appear smaller.

Use natural photographic depth.

Do not artificially blur people.

Keep the main garment clearly visible.

${activities}

=========================================================
ENVIRONMENT
=========================================================

${environment}
`;
}

/* =========================================================
MONTHLY PRO ALL-SCENE ENGINE
========================================================= */

function buildAdvancedScenePrompt(
  body,
  monthlyPro
) {
  if (!monthlyPro) {
    return "";
  }

  const locationType = clean(
    getValue(
      body,
      "locationType",
      "environmentType",
      "sceneType"
    ),
    ""
  );

  const scene = clean(
    getValue(
      body,
      "scene",
      "background",
      "backgroundPreset",
      "environment"
    ),
    ""
  );

  const property = clean(
    getValue(
      body,
      "property",
      "house",
      "propertyType",
      "building"
    ),
    ""
  );

  const vehicle = clean(
    getValue(
      body,
      "car",
      "vehicle",
      "vehicleType"
    ),
    ""
  );

  const object = clean(
    getValue(
      body,
      "object",
      "objectType",
      "product",
      "prop"
    ),
    ""
  );

  const sceneCategory = clean(
    getValue(
      body,
      "sceneCategory",
      "creativeCategory",
      "generationCategory"
    ),
    ""
  );

  return `
=========================================================
MONTHLY PRO UNIVERSAL SCENE ENGINE
=========================================================

MONTHLY PRO CAN GENERATE A WIDE RANGE OF REAL-WORLD
SUBJECTS, ENVIRONMENTS AND OBJECTS.

The selected uploaded garment remains the primary product
reference whenever a garment is supplied.

SCENE CATEGORY:
${sceneCategory || "automatic intelligent scene selection"}

LOCATION TYPE:
${locationType || "automatic"}

SCENE:
${scene || "automatic"}

PROPERTY:
${property || "none"}

VEHICLE:
${vehicle || "none"}

OBJECT:
${object || "none"}

=========================================================
HOUSES AND PROPERTY
=========================================================

Possible environments include:

- modern houses
- luxury houses
- family homes
- contemporary homes
- traditional homes
- villas
- luxury villas
- apartments
- penthouses
- townhouses
- mansions
- gated residences
- residential compounds
- gardens
- terraces
- balconies
- rooftops
- living rooms
- bedrooms
- kitchens
- dining rooms
- hallways
- home offices
- luxury interiors

Architecture must have:
- believable scale
- realistic doors
- realistic windows
- believable walls
- correct perspective
- realistic furniture
- natural lighting
- realistic materials

=========================================================
HOTELS AND RESORTS
=========================================================

Possible locations:

- luxury hotel lobby
- hotel bedroom
- hotel corridor
- hotel restaurant
- hotel rooftop
- resort
- beach resort
- pool area
- hotel entrance
- hotel lounge
- hotel garden

Add realistic guests and staff only when appropriate.

=========================================================
RESTAURANTS AND CAFES
=========================================================

Possible environments:

- luxury restaurant
- casual restaurant
- fine dining
- cafe
- coffee shop
- rooftop restaurant
- outdoor restaurant
- family restaurant
- fast food environment

Use realistic:
- tables
- chairs
- menus
- plates
- glasses
- cups
- food
- lighting
- counters
- decor

Objects must have correct physical scale.

=========================================================
SHOPS AND COMMERCIAL ENVIRONMENTS
=========================================================

Possible environments:

- fashion boutique
- clothing store
- luxury store
- shopping mall
- supermarket
- department store
- electronics store
- beauty store
- shoe store
- showroom
- business lobby

Use believable:
- shelves
- displays
- clothing racks
- shopping bags
- counters
- signs
- products
- customers

Do not create random readable brand names.

=========================================================
CITIES AND STREETS
=========================================================

Possible environments:

- city streets
- modern downtown
- residential streets
- business districts
- urban plazas
- pedestrian areas
- shopping streets
- waterfront districts

Maintain:
- correct road perspective
- believable buildings
- realistic traffic
- realistic pedestrians
- believable vehicles
- natural environmental depth

=========================================================
AIRPORTS AND TRAVEL
=========================================================

Possible environments:

- airport terminal
- departure hall
- arrival hall
- airport lounge
- airport exterior
- travel environment
- train station
- transport terminal

People may:
- carry luggage
- wait
- walk
- check phones
- sit
- talk
- travel with family

=========================================================
BEACHES AND OUTDOOR LOCATIONS
=========================================================

Possible environments:

- beach
- resort beach
- pool
- garden
- park
- outdoor terrace
- waterfront
- tropical environment
- luxury outdoor location

Use realistic:
- sunlight
- shadows
- water
- vegetation
- sand
- architecture
- outdoor furniture

=========================================================
VEHICLES
=========================================================

Possible objects:

- cars
- SUVs
- luxury vehicles
- sports cars
- electric vehicles
- taxis
- buses
- motorcycles
- bicycles
- vans
- boats
- yachts

Vehicles must have:
- believable wheels
- realistic proportions
- correct perspective
- realistic reflections
- natural contact with the ground

Never let a vehicle distort the primary garment.

=========================================================
FURNITURE AND OBJECTS
=========================================================

Possible objects:

- sofas
- chairs
- tables
- beds
- cabinets
- lamps
- mirrors
- televisions
- computers
- phones
- bags
- luggage
- books
- cups
- plates
- bottles
- decorative objects
- plants
- flowers
- sports equipment
- business equipment

Objects must appear physically present in the environment.

Do not create floating objects.

Do not create impossible object intersections.

=========================================================
BUSINESS AND LIFESTYLE
=========================================================

Possible scenes:

- office
- boardroom
- reception
- studio
- showroom
- creative workspace
- conference environment
- business meeting
- networking event
- lifestyle campaign
- travel campaign
- family lifestyle
- luxury campaign

=========================================================
AUTOMATIC SCENE INTELLIGENCE
=========================================================

If the user selects a general category rather than a specific
environment, intelligently construct a coherent scene.

All objects must belong to the same physical environment.

Do not mix unrelated environments.

Example:

A hotel should look like a hotel.

A restaurant should look like a restaurant.

An airport should look like an airport.

A family home should look like a family home.

A beach should look like a beach.

=========================================================
OBJECT REALISM
=========================================================

Every visible object must obey:

- realistic scale
- realistic perspective
- realistic shadows
- realistic reflections
- realistic contact points
- believable depth
- physically believable placement

Do not generate:
- floating furniture
- impossible architecture
- duplicated objects
- broken vehicles
- distorted doors
- impossible windows
- random limbs
- impossible hands

=========================================================
PRIMARY GARMENT PRIORITY
=========================================================

No environmental object may cover the important details of
the uploaded garment.

The environment supports the fashion image.

The garment remains the product.
`;
}

/* =========================================================
AUTOMATIC REFERENCE DETECTION
========================================================= */

function getReferenceSubjectMode(body) {
  const raw = clean(
    getValue(
      body,
      "referenceSubject",
      "subjectType",
      "referenceType",
      "generationSubject",
      "autoDetectSubject"
    ),
    "auto"
  ).toLowerCase();

  if (
    raw === "man" ||
    raw === "male" ||
    raw === "adult_man" ||
    raw === "adult male"
  ) {
    return "man";
  }

  if (
    raw === "woman" ||
    raw === "female" ||
    raw === "adult_woman" ||
    raw === "adult female"
  ) {
    return "woman";
  }

  if (
    raw === "child" ||
    raw === "children" ||
    raw === "boy" ||
    raw === "girl"
  ) {
    return "child";
  }

  if (
    raw === "family" ||
    raw === "group" ||
    raw === "couple" ||
    raw === "friends"
  ) {
    return raw;
  }

  if (
    raw === "clothing" ||
    raw === "garment" ||
    raw === "dress" ||
    raw === "outfit"
  ) {
    return "clothing";
  }

  if (
    raw === "object" ||
    raw === "product"
  ) {
    return "object";
  }

  if (
    raw === "vehicle" ||
    raw === "car"
  ) {
    return "vehicle";
  }

  if (
    raw === "house" ||
    raw === "building" ||
    raw === "architecture"
  ) {
    return "architecture";
  }

  if (raw === "scene" || raw === "environment") {
    return "scene";
  }

  return "auto";
}


/*
=========================================================
IMPORTANT

AUTO is the default.

The uploaded reference image is inspected by the image
generation model itself.

The old browser gender dropdown is NOT authoritative when
AUTO mode is active.
=========================================================
*/

function getModelGender(body) {
  const mode =
    getReferenceSubjectMode(body);

  if (mode === "man") {
    return "man";
  }

  if (mode === "woman") {
    return "woman";
  }

  return "auto";
}


function getGenderModelFallback(gender) {
  if (gender === "man") {
    return "professional adult male fashion model";
  }

  if (gender === "woman") {
    return "professional adult female fashion model";
  }

  return "professionally photographed realistic human subject automatically matched to the uploaded reference";
}


function getGenderBodyFallback(gender) {
  if (gender === "man") {
    return "natural proportioned adult male fashion model";
  }

  if (gender === "woman") {
    return "natural proportioned adult female fashion model";
  }

  return "natural realistic body proportions automatically matched to the uploaded reference";
}


function getGenderFaceFallback(gender) {
  if (gender === "man") {
    return "natural adult male facial characteristics";
  }

  if (gender === "woman") {
    return "natural adult female facial characteristics";
  }

  return "natural facial characteristics automatically matched to the uploaded reference";
}

/* =========================================================
FULL GARMENT PROMPT
========================================================= */

function buildPrompt(
  body,
  variantColor = "",
  selectedPose = "",
  monthlyPro = false
) {
  const camera =
    getCameraSettings(
      body,
      monthlyPro
    );

  const gender =
  getModelGender(body);

const isMale =
  gender === "man";

const isFemale =
  gender === "woman";

const referenceMode =
  getReferenceSubjectMode(body);

const genderLabel =
  isMale
    ? "ADULT MAN — MALE"
    : isFemale
      ? "ADULT WOMAN — FEMALE"
      : "AUTOMATIC REFERENCE SUBJECT DETECTION";

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

  const model =
  isMale
    ? (
        suppliedModel &&
        !/amina|amara|zara|nia|imani|maya|kiara|aisha|leila|naomi|tara|lina|sofia|mila|chiamaka|ada|celine|diana|ella|grace|chinwe|amaka|favour|deborah|esther|joy|precious|victoria/i.test(
          suppliedModel
        )
          ? suppliedModel
          : getGenderModelFallback("man")
      )
    : isFemale
      ? (
          suppliedModel ||
          getGenderModelFallback("woman")
        )
      : getGenderModelFallback("auto");

  const bodyStyle =
  suppliedBody ||
  getGenderBodyFallback(
    gender
  );

const face =
  isMale
    ? (
        suppliedFace &&
        !/female|woman|beauty|feminine|lady|girl/i.test(
          suppliedFace
        )
          ? suppliedFace
          : getGenderFaceFallback("man")
      )
    : isFemale
      ? (
          suppliedFace ||
          getGenderFaceFallback("woman")
        )
      : getGenderFaceFallback("auto");

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
    getValue(
      body,
      "country"
    )
  );

  const city = clean(
    getValue(
      body,
      "city"
    )
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
      scene,
      monthlyPro
    );

  const advancedScene =
    buildAdvancedScenePrompt(
      body,
      monthlyPro
    );

  return `
OBITREND AI FASHION CREATOR
REALISTIC CAMERA + REAL WORLD PEOPLE

${monthlyPro
  ? "MONTHLY PRO ADVANCED GENERATION ENGINE ACTIVE"
  : "STANDARD GENERATION ENGINE ACTIVE"}

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
AUTOMATIC REFERENCE SUBJECT INTELLIGENCE
=========================================================

REFERENCE SUBJECT MODE:

${referenceMode}

The uploaded reference image is the authoritative source
for identifying the primary subject.

AUTOMATIC DETECTION IS ACTIVE.

Before generating the final image, inspect the uploaded
reference and determine what the reference actually contains.

Automatically distinguish between:

- adult man
- adult woman
- child
- children
- family
- couple
- group
- friends
- clothing / garment
- object
- product
- vehicle
- house
- building
- architecture
- scene
- mixed reference

=========================================================
PRIMARY SUBJECT RULE
=========================================================

If the uploaded reference contains a clearly visible person,
match the generated primary person to the person shown in the
reference.

If the reference is a man:

THE PRIMARY MODEL MUST BE AN ADULT MAN.

If the reference is a woman:

THE PRIMARY MODEL MUST BE AN ADULT WOMAN.

If the reference contains children:

Keep the children clearly age-appropriate.

If the reference contains a family:

Preserve the family structure and generate a believable
family scene.

If the reference contains multiple people:

Preserve the appropriate number and relationship of people.

If the reference contains clothing without a person:

Treat the clothing as the authoritative garment reference
and automatically select an appropriate realistic adult model
for the garment.

If the reference contains an object:

Treat the object as the authoritative object reference.

If the reference contains a vehicle:

Treat the vehicle as the authoritative vehicle reference.

If the reference contains a house or architecture:

Treat the architecture as the authoritative structural
reference.

If the reference contains a scene:

Understand the scene and preserve its major visual context.

=========================================================
NO GENDER CONFLICT
=========================================================

Never allow a manually supplied model, face, body or gender
value to contradict the uploaded reference when AUTO mode is
active.

Do NOT turn a male reference into a female primary model.

Do NOT turn a female reference into a male primary model.

Do NOT turn a child into an adult.

Do NOT turn a family into a single unrelated person.

Do NOT replace an object with a person.

Do NOT replace a vehicle with another vehicle.

The uploaded reference always has priority.

=========================================================
GARMENT PRIORITY
=========================================================

When clothing is present, preserve the uploaded garment
exactly as the primary product reference.

Do not redesign it.

Do not replace it.

Do not simplify it.

Do not invent a different garment.

Do not change its construction.

Do not change its visible details.

Do not change its colour unless explicitly requested by the
existing colour workflow.

The primary fashion model remains the dominant subject.

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

${advancedScene}

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

${camera.smartCamera}

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

Create a premium commercial photograph.

The result should resemble genuine professional photography.

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
11. Objects
12. Vehicle
13. Property
14. Styling

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
          error?.message ||
          "Unknown OpenAI error",
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

    UNCHANGED
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
    MONTHLY PRO SERVER-SIDE CHECK
    ===================================================== */

    const monthlyProStatus =
      await getMonthlyProStatus(
        userId,
        redis
      );

    const monthlyPro =
      monthlyProStatus.monthly ===
      true;

    /*
    IMPORTANT:

    We do NOT trust:
      body.monthlyPro
      body.proPlan
      body.plan
      body.isMonthlyPro

    The actual plan comes from the server-side Pro record.
    */

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

    /*
    EXISTING IMAGE SIZE WORKFLOW
    */

    const size =
      getImageSize(
        getValue(
          body,
          "aspectRatio",
          "ratio"
        )
      );

    const camera =
      getCameraSettings(
        body,
        monthlyPro
      );

    /* =====================================================
    GENDER
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
            pose,
            monthlyPro
          );

        const finalPrompt = `
${prompt}

=========================================================
MONTHLY PRO EXECUTION STATUS
=========================================================

Monthly Pro active:
${monthlyPro ? "YES" : "NO"}

Server-verified plan:
${monthlyProStatus.plan || "STANDARD / FREE"}

${monthlyPro
  ? `
ADVANCED MONTHLY PRO FEATURES ARE ENABLED.

The following advanced systems may be used:

- Fujifilm GFX100S II photographic rendering
- advanced male models
- advanced female models
- families
- groups
- couples
- friends
- children
- houses
- villas
- apartments
- hotels
- resorts
- restaurants
- cafes
- shops
- malls
- airports
- cities
- streets
- beaches
- pools
- vehicles
- furniture
- objects
- business environments
- lifestyle environments
- automatic scene intelligence
`
  : `
STANDARD MODE:

Do not use Monthly Pro-only camera or scene features.

Use the existing standard generation workflow.
`}

=========================================================
AI SMART CAMERA — FINAL EXECUTION
=========================================================

${camera.smartCamera}

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

The camera must behave like a real professional camera.

Automatically create believable:

- sensor rendering
- focal length
- aperture
- shutter speed
- ISO
- white balance
- autofocus
- depth of field
- perspective
- exposure
- optical rendering

Do not force identical camera settings on every image.

=========================================================
GARMENT PROTECTION
=========================================================

The uploaded garment remains the AUTHORITATIVE product.

Camera settings must NEVER:

- redesign the garment
- replace the garment
- change garment construction
- remove garment details
- invent garment details
- alter garment silhouette
- transfer another clothing colour
- replace the outfit

=========================================================
PEOPLE EXECUTION
=========================================================

Create a believable real-world scene.

Secondary people should:

- behave independently
- have different appearances
- have different poses
- have different clothing
- perform different activities
- obey realistic perspective

Do not clone people.

Do not duplicate faces.

Do not arrange everyone in a line.

Do not make everyone face the camera.

Do not make everyone look at the primary model.

Children remain age-appropriate and secondary.

The primary adult model wearing the uploaded garment
remains the hero subject.

=========================================================
SINGLE FINAL IMAGE
=========================================================

Generate EXACTLY ONE finished photograph.

Do not generate:

- collage
- split screen
- multiple panels
- before/after
- multiple images inside one image
- duplicated model
- duplicated garment

Selected pose:

${pose}

=========================================================
FULL BODY / COMPOSITION
=========================================================

Respect the selected image composition.

Do not change the requested image orientation.

Do not change the requested aspect ratio.

Do not intentionally crop the garment.

For full-body photography, keep:

- head
- shoulders
- arms
- hands
- torso
- hips
- legs
- ankles
- both feet

visible whenever physically possible.

Use sufficient camera distance.

=========================================================
FINAL AUTOMATIC SUBJECT CHECK
=========================================================

Reference subject mode:

${referenceMode}

Before completing the image:

1. Inspect the uploaded reference again.
2. Determine the primary subject.
3. Match the generated subject to the reference.
4. Preserve the uploaded garment when present.
5. Preserve the correct person category.
6. Preserve family/group structure when present.
7. Keep children age-appropriate.
8. Preserve objects and vehicles when they are the reference.
9. Never contradict the uploaded reference.
10. Never replace the reference subject with an unrelated
    subject.

If the reference is a man:
PRIMARY SUBJECT = ADULT MAN.

If the reference is a woman:
PRIMARY SUBJECT = ADULT WOMAN.

If the reference is a child or children:
PRIMARY SUBJECT = AGE-APPROPRIATE CHILDREN.

If the reference is a family:
PRIMARY SUBJECT = FAMILY.

If the reference is a group:
PRIMARY SUBJECT = GROUP.

If the reference is clothing:
PRIMARY PRODUCT = UPLOADED GARMENT.

If the reference is an object:
PRIMARY PRODUCT = UPLOADED OBJECT.

If the reference is a vehicle:
PRIMARY PRODUCT = UPLOADED VEHICLE.

If the reference is architecture:
PRIMARY SUBJECT = UPLOADED ARCHITECTURE.

If the reference is a scene:
PRIMARY SUBJECT = UPLOADED SCENE.

The uploaded reference always wins over conflicting
generation instructions.

=========================================================
FINAL PHOTOGRAPHIC QUALITY CHECK
=========================================================

Before completing the photograph, check:

1. Uploaded garment preserved.
2. Garment construction preserved.
3. Garment colour preserved unless explicitly allowed.
4. Primary model gender correct.
5. Primary model is an adult.
6. Children are age-appropriate.
7. People are distinct.
8. No cloned faces.
9. No duplicated limbs.
10. Hands are realistic.
11. Feet are realistic.
12. Architecture is realistic.
13. Objects have realistic scale.
14. Vehicles have realistic scale.
15. Camera perspective is believable.
16. Depth of field is photographic.
17. Lighting is physically believable.
18. Main garment remains visible.
19. Selected pose is respected.
20. Selected location is respected.
21. No CGI appearance.
22. No watermarks.
23. No random logos.
24. Exactly one finished photograph.
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
      /*
      =====================================================
      EXISTING CREDIT REFUND
      =====================================================
      */

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
          getModelGender(body) ===
            "man"
            ? "adult_man"
            : "adult_woman"
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

      /*
      =====================================================
      NEW MONTHLY PRO INFORMATION
      =====================================================
      */

      monthlyPro,

      monthlyProActive:
        monthlyPro,

      monthlyProPlan:
        monthlyProStatus.plan,

      advancedFeatures: {
        monthlyProOnly: true,

        enabled:
          monthlyPro,

        fujifilmGFX100SII:
          monthlyPro,

        advancedPeople:
          monthlyPro,

        families:
          monthlyPro,

        groups:
          monthlyPro,

        children:
          monthlyPro,

        houses:
          monthlyPro,

        properties:
          monthlyPro,

        vehicles:
          monthlyPro,

        objects:
          monthlyPro,

        environments:
          monthlyPro,
      },

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

        monthlyPro,

        fujifilmGFX100SII:
          monthlyPro &&
          /fujifilm\s*gfx\s*100s\s*ii|gfx\s*100s\s*ii/i.test(
            camera.cameraType
          ),
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

    const status =
      Number(error?.status) >= 400 &&
      Number(error?.status) <= 599
        ? Number(error.status)
        : 503;

    const message =
      error?.message ||
      "OBITREND could not complete the generation request.";

    /*
    =========================================================
    IMPORTANT ERROR HANDLING

    Do NOT tell users to purchase Pro when the actual problem
    is authentication, credits, Supabase, Redis, OpenAI,
    request validation, or another backend error.
    =========================================================
    */

    if (status === 401) {
      return res.status(401).json({
        success: false,

        error:
          "Please sign in to your OBITREND account before creating an image.",

        upgradeRequired:
          false,

        authenticated:
          false,
      });
    }

    if (status === 402) {
      return res.status(402).json({
        success: false,

        error:
          message,

        upgradeRequired:
          true,
      });
    }

    if (status === 403) {
      return res.status(403).json({
        success: false,

        error:
          "Your OBITREND account is not authorized to perform this action.",

        upgradeRequired:
          false,
      });
    }

    return res.status(status).json({
      success: false,

      error:
        "OBITREND could not complete the image generation right now. Please try again.",

      upgradeRequired:
        false,

      backendError:
        process.env.NODE_ENV ===
        "development"
          ? message
          : undefined,
    });
  }
}
