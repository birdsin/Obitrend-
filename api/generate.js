import OpenAI, { toFile } from "openai";

import {
  spendCredit,
  refundCredit,
  getProStatus,
  getRedisConfig,
  getAuthenticatedUser,
} from "./credits.js";

/* =========================================================
   CONFIG
========================================================= */

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

/*
 * HIGH is used for the best possible photorealistic
 * fashion result.
 */
const IMAGE_QUALITY = "high";

/*
 * Keep the decoded image data within the existing
 * server/body limits.
 */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 10 * 1024 * 1024;

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
    "stylish Italian restaurant interior",
    "luxury African fusion restaurant",
    "high-end restaurant terrace",
    "elegant hotel restaurant",
    "chic Parisian-style café",
    "premium city-view restaurant",
    "luxury waterfront restaurant",
    "modern restaurant lounge",
    "elegant outdoor Italian restaurant",
    "premium restaurant sidewalk terrace",
    "luxury restaurant entrance",
  ],

  hotel: [
    "luxury hotel lobby",
    "five-star hotel entrance",
    "luxury hotel rooftop",
    "premium hotel lounge",
    "elegant hotel corridor",
    "luxury hotel terrace",
    "five-star hotel suite",
    "luxury hotel courtyard",
    "high-end hotel reception area",
    "luxury hotel balcony",
    "luxury resort entrance",
    "premium hotel driveway",
  ],

  beach: [
    "luxury tropical beach",
    "private beach resort",
    "premium beachfront resort",
    "elegant beach club",
    "luxury oceanfront terrace",
    "tropical resort walkway",
    "private seaside villa",
    "luxury coastal promenade",
    "exclusive beach lounge",
    "luxury seaside restaurant",
  ],

  pool: [
    "luxury infinity pool",
    "five-star resort pool",
    "private luxury pool",
    "rooftop infinity pool",
    "premium hotel pool terrace",
    "tropical resort pool",
    "luxury poolside lounge",
    "exclusive resort swimming pool",
  ],

  shopping: [
    "luxury shopping district",
    "premium fashion shopping street",
    "upscale shopping mall",
    "designer boutique district",
    "luxury retail boulevard",
    "high-end fashion arcade",
    "premium shopping plaza",
    "elegant designer storefront",
    "luxury department store",
  ],

  boutique: [
    "luxury fashion boutique",
    "modern designer boutique",
    "premium clothing showroom",
    "high-end fashion showroom",
    "elegant fashion studio",
    "luxury retail interior",
    "designer clothing store",
    "exclusive fashion showroom",
    "premium fashion boutique entrance",
  ],

  city: [
    "modern downtown city street",
    "luxury city boulevard",
    "premium urban district",
    "modern financial district",
    "elegant downtown avenue",
    "city rooftop overlooking skyscrapers",
    "upscale urban plaza",
    "modern city promenade",
    "luxury city sidewalk",
  ],

  street: [
    "luxury city street",
    "upscale urban avenue",
    "modern downtown sidewalk",
    "premium city boulevard",
    "fashionable pedestrian street",
    "elegant city plaza",
    "luxury hotel entrance street",
    "modern architectural street",
    "premium shopping street",
  ],

  studio: [
    "premium fashion photography studio",
    "luxury editorial studio",
    "minimalist fashion studio",
    "high-end editorial set",
    "professional fashion campaign studio",
    "modern luxury photography studio",
  ],

  home: [
    "luxury modern living room",
    "high-end contemporary home",
    "luxury penthouse interior",
    "elegant modern apartment",
    "premium designer home",
    "luxury villa interior",
    "modern luxury bedroom",
    "elegant home terrace",
  ],

  office: [
    "luxury executive office",
    "modern premium office",
    "high-end corporate lounge",
    "executive penthouse office",
    "modern glass office",
    "luxury business lounge",
  ],

  airport: [
    "premium airport terminal",
    "luxury airport lounge",
    "VIP airport lounge",
    "modern international airport",
    "private aviation lounge",
    "premium airport departure hall",
    "airport exterior drop-off area",
  ],

  stadium: [
    "modern football stadium exterior",
    "luxury stadium VIP area",
    "premium sports arena",
    "modern stadium entrance",
    "stadium hospitality lounge",
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
    "beautiful urban terrace",
    "elegant outdoor promenade",
    "luxury hotel courtyard",
    "premium city terrace",
  ],
};

const VEHICLE_ALLOWED_TYPES = new Set([
  "city",
  "street",
  "outdoor",
  "hotel",
  "shopping",
  "boutique",
  "airport",
]);

const VEHICLE_FORBIDDEN_TYPES = new Set([
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
   GENERAL HELPERS
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

function normalizeBody(rawBody) {
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
        typeof parsed === "object"
        ? parsed
        : {};
    } catch {
      return {};
    }
  }

  return {};
}

function normalizeBase64(input) {
  if (!input) {
    return null;
  }

  let value =
    String(input).trim();

  const comma =
    value.indexOf(",");

  if (
    value.startsWith("data:image/") &&
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

  if (
    value.length < 100
  ) {
    return null;
  }

  return value;
}

function getMimeType(input) {
  const value =
    String(input || "")
      .toLowerCase();

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

function extensionFromMime(mime) {
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

function getDecodedImageBytes(base64) {
  if (!base64) {
    return 0;
  }

  return Math.floor(
    (base64.length * 3) / 4
  );
}

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
    ratio.includes("5:4")
  ) {
    return "1536x1024";
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
   LOCATION
========================================================= */

function normalizeLocationType(value) {
  const text =
    clean(
      value,
      "studio"
    ).toLowerCase();

  if (
    text.includes("restaurant") ||
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
    text.includes("shopping") ||
    text.includes("mall") ||
    text.includes("retail")
  ) {
    return "shopping";
  }

  if (
    text.includes("boutique") ||
    text.includes("fashion store") ||
    text.includes("showroom")
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
    text.includes("apartment") ||
    text.includes("bedroom")
  ) {
    return "home";
  }

  if (
    text.includes("street") ||
    text.includes("road") ||
    text.includes("avenue") ||
    text.includes("boulevard")
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
    text.includes("terrace") ||
    text.includes("plaza")
  ) {
    return "outdoor";
  }

  return "studio";
}

function isAutoBackground(value) {
  const text =
    clean(
      value,
      "Auto Background"
    ).toLowerCase();

  return (
    text === "" ||
    text.includes("auto") ||
    text.includes("random") ||
    text.includes("surprise") ||
    text.includes("different")
  );
}

function normalizeRecentLocations(value) {
  if (
    Array.isArray(value)
  ) {
    return value
      .map(
        item =>
          clean(item)
            .toLowerCase()
      )
      .filter(Boolean)
      .slice(-20);
  }

  if (
    typeof value === "string"
  ) {
    return value
      .split(",")
      .map(
        item =>
          item.trim().toLowerCase()
      )
      .filter(Boolean)
      .slice(-20);
  }

  return [];
}

function chooseRandomLocation(
  type,
  recentLocations = []
) {
  const pool =
    LOCATION_POOLS[type] ||
    LOCATION_POOLS.studio;

  const recent =
    new Set(
      recentLocations.map(
        item =>
          String(item)
            .trim()
            .toLowerCase()
      )
    );

  let candidates =
    pool.filter(
      location =>
        !recent.has(
          location.toLowerCase()
        )
    );

  if (
    candidates.length === 0
  ) {
    candidates = [...pool];
  }

  return candidates[
    Math.floor(
      Math.random() *
        candidates.length
    )
  ];
}

/* =========================================================
   SCENE PLAN
========================================================= */

function buildScenePlan(body) {
  const rawLocationType =
    clean(
      getValue(
        body,
        "locationType"
      ),
      "luxury fashion studio"
    );

  const backgroundPreset =
    clean(
      getValue(
        body,
        "backgroundPreset"
      ),
      "Auto Background"
    );

  const city =
    clean(
      getValue(
        body,
        "city"
      )
    );

  const property =
    clean(
      getValue(
        body,
        "property"
      )
    );

  let vehicle =
    clean(
      getValue(
        body,
        "vehicle"
      ),
      "none"
    );

  const recentLocations =
    normalizeRecentLocations(
      getValue(
        body,
        "recentLocations",
        "usedLocations",
        "previousLocations",
        "locationHistory"
      )
    );

  const type =
    normalizeLocationType(
      rawLocationType
    );

  const auto =
    isAutoBackground(
      backgroundPreset
    );

  const selectedLocation =
    !auto &&
    backgroundPreset
      ? backgroundPreset
      : chooseRandomLocation(
          type,
          recentLocations
        );

  if (
    VEHICLE_FORBIDDEN_TYPES.has(
      type
    )
  ) {
    vehicle = "none";
  }

  const cityText =
    city &&
    !city.toLowerCase()
      .includes("auto")
      ? city
      : "";

  const propertyText =
    property &&
    !property.toLowerCase()
      .includes("auto")
      ? property
      : "";

  let vehiclePlacement =
    "NO VEHICLE.";

  if (
    vehicle !== "none" &&
    VEHICLE_ALLOWED_TYPES.has(type)
  ) {
    vehiclePlacement = `
The selected vehicle may appear only in a physically
plausible location such as a street, driveway,
hotel entrance, exterior parking area, showroom,
airport drop-off area or luxury curbside scene.

Never place the vehicle inside a normal restaurant,
bedroom, pool, beach lounge, office, church,
fashion studio or other physically impossible area.
`;
  }

  const rules = {
    restaurant: `
RESTAURANT:
Create a believable restaurant environment.
Use tables, chairs, tasteful décor, lighting,
windows and dining details.

NO cars or SUVs inside the restaurant.
NO roads through the restaurant.
NO parking lot beside dining tables.
`,

    hotel: `
HOTEL:
Create a believable luxury hotel or resort.
Vehicles may appear only outside at a driveway,
entrance or drop-off area.

Never put a normal vehicle inside a hotel room,
restaurant, lobby or corridor.
`,

    beach: `
BEACH:
Create a believable luxury beach or seaside resort.
Use sand, ocean, palms, loungers and resort details.

Do not add random vehicles directly beside the model
on the beach.
`,

    pool: `
POOL:
Create a believable luxury swimming pool environment.
Use pool water, loungers, umbrellas, cabanas and
resort architecture.

NO random cars or SUVs inside the pool area.
`,

    studio: `
STUDIO:
Create a professional fashion photography studio.
Use seamless backdrops and professional lighting.

NO cars or SUVs inside the studio.
`,

    home: `
HOME:
Create a believable luxury residential environment.
Use living rooms, bedrooms, kitchens, terraces or
other appropriate residential details.

NO cars inside the home.
`,

    office: `
OFFICE:
Create a premium executive office.

NO cars inside the office.
`,

    church: `
CHURCH:
Create a respectful believable church environment.

NO cars inside the church.
`,

    stadium: `
STADIUM:
Create a believable sports venue.

NO random vehicles inside spectator seating or
on the field unless explicitly requested as a
vehicle-display scene.
`,

    city: `
CITY:
Create a believable modern urban fashion environment.
Vehicles may appear naturally on streets or roads.
`,

    street: `
STREET:
Create a believable exterior street or avenue.
Vehicles may appear naturally on roads, curbs,
driveways or parking areas.
`,

    shopping: `
SHOPPING:
Create a believable premium shopping environment.
Vehicles may appear outside or at a curbside area.

Do not place random vehicles inside normal stores.
`,

    boutique: `
BOUTIQUE:
Create a luxury fashion boutique or showroom.
Use clothing racks, mirrors, displays and premium décor.

NO random cars inside a normal boutique.
`,

    airport: `
AIRPORT:
Create a believable modern airport environment.
Vehicles may appear only in appropriate exterior
drop-off or transport areas.
`,

    outdoor: `
OUTDOOR:
Create a believable premium outdoor fashion location.
Vehicles may appear only when physically appropriate.
`,
  };

  return {
    type,
    selectedLocation,
    vehicle,
    recentLocations,
    cityText,
    propertyText,
    vehiclePlacement,
    rules:
      rules[type] ||
      rules.studio,
  };
}

/* =========================================================
   PROMPT
========================================================= */

function buildPrompt(
  body,
  hasBackgroundReference
) {
  const scene =
    buildScenePlan(body);

  const model =
    clean(
      getValue(
        body,
        "model"
      ),
      "professional adult fashion model"
    );

  const gender =
    clean(
      getValue(
        body,
        "gender"
      ),
      "woman"
    );

  const ageGroup =
    clean(
      getValue(
        body,
        "ageGroup"
      ),
      "adult_woman"
    );

  const bodyType =
    clean(
      getValue(
        body,
        "bodyType",
        "body"
      ),
      "natural proportioned model"
    );

  const face =
    clean(
      getValue(
        body,
        "face"
      ),
      "natural elegant fashion beauty"
    );

  const pose =
    clean(
      getValue(
        body,
        "pose"
      ),
      "standing confidently"
    );

  const footwear =
    clean(
      getValue(
        body,
        "footwear"
      ),
      "footwear appropriate for the garment"
    );

  const clothingType =
    clean(
      getValue(
        body,
        "clothingType"
      ),
      "auto detect from uploaded reference"
    );

  const clothingStyle =
    clean(
      getValue(
        body,
        "clothingStyle"
      ),
      "premium fashion"
    );

  const fashionStyle =
    clean(
      getValue(
        body,
        "fashionStyle",
        "style"
      ),
      "luxury fashion editorial"
    );

  const clothingColors =
    getValue(
      body,
      "clothingColors",
      "clothingColor",
      "colors"
    );

  const colourText =
    Array.isArray(
      clothingColors
    )
      ? clothingColors.join(", ")
      : clean(
          clothingColors,
          "Original Colour"
        );

  const camera =
    clean(
      getValue(
        body,
        "camera"
      ),
      "professional full-frame fashion photography"
    );

  const lighting =
    clean(
      getValue(
        body,
        "lighting"
      ),
      "natural professional lighting"
    );

  const creative =
    clean(
      getValue(
        body,
        "creativeDirection",
        "creative"
      ),
      "luxury fashion campaign"
    );

  const ratio =
    clean(
      getValue(
        body,
        "aspectRatio",
        "ratio"
      ),
      "4:5"
    );

  const companion =
    clean(
      getValue(
        body,
        "companion",
        "companionType"
      ),
      "none"
    );

  const userPrompt =
    clean(
      getValue(
        body,
        "prompt"
      )
    );

  const childMode =
    ageGroup === "toddler_girl" ||
    ageGroup === "toddler_boy";

  const teenMode =
    ageGroup === "teen_girl" ||
    ageGroup === "teen_boy";

  const ageInstruction =
    childMode
      ? `
CHILD-SAFE TODDLER MODE.

The subject is approximately 1–3 years old.

Use only age-appropriate children's clothing
and family-friendly presentation.

Do not use adult glamour styling.
Do not use provocative posing.
Do not sexualize the child.
`
      : teenMode
        ? `
TEEN MODE.

The subject is aged 13–17.

Use age-appropriate fashion presentation.

Do not sexualize the teenager.
Do not use provocative posing.
`
        : `
ADULT MODE.

The subject is an adult aged 18+.

Use professional fashion photography.
`;

  const companionInstruction =
    companion &&
    companion !== "none"
      ? `
SECONDARY COMPANION:
${companion}

Keep the companion separate from the main subject.

The main model remains the primary fashion subject.

Do not duplicate people.
Do not merge bodies.
Do not create extra limbs or fingers.

Any child companion must remain age-appropriate
and family-friendly.
`
      : `
NO COMPANION.

The main model appears alone.
`;

  const colourInstruction =
    colourText
      .toLowerCase()
      .includes("original colour")
      ? `
COLOUR:
Preserve the actual colour visible in the uploaded
garment reference.
`
      : `
COLOUR:
${colourText}

If recolouring is requested, recolour the SAME garment
while preserving its exact construction and details.

Do not redesign the garment.
`;

  const backgroundInstruction =
    hasBackgroundReference
      ? `
=========================================================
BACKGROUND REFERENCE IMAGE — ABSOLUTE SCENE REFERENCE
=========================================================

A SECOND INPUT IMAGE has been supplied as the
BACKGROUND REFERENCE.

The SECOND INPUT IMAGE controls the visual environment.

Recreate the background as faithfully as possible.

Preserve the reference scene's:

- architecture
- storefronts
- restaurant or venue structure
- doors
- windows
- furniture
- pavement
- walls
- signs
- awnings
- plants
- street elements
- lighting direction
- shadows
- perspective
- camera viewpoint
- depth
- composition
- environmental colours
- realistic object placement
- overall atmosphere

Do NOT replace the reference environment with a generic
AI background.

Do NOT randomly move important background objects.

Do NOT invent an unrelated location.

Keep the same type of real-world place.

The model should be naturally inserted into the scene,
as though the photograph was genuinely taken there.

Maintain realistic contact shadows between the model,
clothing, footwear and the ground.

Match the perspective and lighting of the background
reference.

IMPORTANT:
The FIRST INPUT IMAGE is the GARMENT REFERENCE.
The SECOND INPUT IMAGE is the BACKGROUND REFERENCE.

Do not confuse the two.
`
      : `
=========================================================
GENERATED BACKGROUND
=========================================================

No background reference image was supplied.

Create a completely believable real-world environment
matching the selected location.

The environment must look physically photographed,
not like a generic AI backdrop.
`;

  return `
OBITREND PHOTOREALISTIC FASHION PHOTOGRAPHY ENGINE.

Create ONE premium photorealistic fashion photograph.

The final result must look like a genuine professional
camera photograph captured in the real world.

=========================================================
INPUT IMAGE PRIORITY
=========================================================

FIRST INPUT IMAGE:
GARMENT REFERENCE.

This is the authoritative reference for the clothing.

${hasBackgroundReference
  ? `
SECOND INPUT IMAGE:
BACKGROUND REFERENCE.

This is the authoritative reference for the environment.
`
  : ""}

Never confuse the garment reference with the background
reference.

=========================================================
ABSOLUTE GARMENT PRIORITY
=========================================================

THE UPLOADED GARMENT IMAGE IS THE PRIMARY AND
AUTHORITATIVE REFERENCE FOR THE CLOTHING.

The model MUST wear the garment shown in that image.

The uploaded clothing is NOT merely inspiration.

Do NOT invent a replacement outfit.

Do NOT substitute a generic luxury outfit.

Do NOT redesign the clothing.

Do NOT change the garment into another garment.

=========================================================
EXACT GARMENT PRESERVATION
=========================================================

Preserve the visible garment as accurately as possible:

- garment type
- silhouette
- cut
- proportions
- length
- width
- neckline
- collar
- sleeves
- cuffs
- waist shaping
- seams
- stitching
- panels
- pockets
- buttons
- zippers
- closures
- straps
- ties
- belts
- pleats
- gathers
- ruching
- folds
- draping
- hem
- slits
- fabric texture
- fabric weight
- material appearance
- stripes
- checks
- patterns
- prints
- embroidery
- distinctive details

Preserve the actual visual identity of the garment.

Do not simplify distinctive details.

Do not add details that are not present.

Do not remove important details that are visible.

The garment must remain recognizable as the SAME garment.

=========================================================
REALISTIC GARMENT FIT
=========================================================

The garment must naturally fit the selected model.

Make the clothing physically believable.

Use:

- realistic fabric tension
- realistic folds
- natural wrinkles
- believable seams
- realistic gravity
- correct garment-to-body contact
- natural sleeve and hem behaviour
- realistic waist and shoulder fit

Never make the clothing look pasted onto the model.

Never make the clothing float.

Never create plastic-looking fabric.

=========================================================
MODEL
=========================================================

Gender:
${gender}

Model:
${model}

Body Type:
${bodyType}

Face:
${face}

Age Group:
${ageGroup}

Pose:
${pose}

Footwear:
${footwear}

${ageInstruction}

=========================================================
CLOTHING
=========================================================

Clothing Type:
${clothingType}

Clothing Style:
${clothingStyle}

Fashion Style:
${fashionStyle}

${colourInstruction}

=========================================================
COMPANION
=========================================================

${companionInstruction}

=========================================================
LOCATION
=========================================================

Location Category:
${scene.type}

Selected Location:
${scene.selectedLocation}

${scene.cityText
  ? `City / Region: ${scene.cityText}`
  : ""}

${scene.propertyText
  ? `Property / Venue: ${scene.propertyText}`
  : ""}

${scene.rules}

${backgroundInstruction}

=========================================================
VEHICLE
=========================================================

Requested Vehicle:
${scene.vehicle}

${scene.vehiclePlacement}

Never add a vehicle simply because the scene looks
luxurious.

If the vehicle conflicts with the environment,
REMOVE THE VEHICLE.

=========================================================
REAL CAMERA PHOTOGRAPHY
=========================================================

Camera:
${camera}

Lighting:
${lighting}

Aspect Ratio:
${ratio}

Create the visual characteristics of a real professional
fashion photograph.

Use:

- realistic full-frame camera perspective
- physically believable lens characteristics
- natural depth of field
- realistic exposure
- realistic dynamic range
- natural highlight roll-off
- realistic shadows
- realistic reflections
- natural ambient light
- realistic colour response
- believable skin texture
- realistic pores
- natural hair strands
- realistic eyelashes
- realistic fabric texture
- realistic environmental texture
- physically believable contact shadows

=========================================================
NO OBVIOUS AI APPEARANCE
=========================================================

The finished image must NOT look like an illustration,
3D render, videogame image, cartoon or synthetic CGI.

Avoid:

- plastic skin
- waxy skin
- excessive skin smoothing
- fake beauty-filter appearance
- unnatural eyes
- malformed hands
- extra fingers
- missing fingers
- extra limbs
- duplicated people
- merged bodies
- distorted faces
- floating objects
- warped architecture
- impossible perspective
- inconsistent shadows
- inconsistent reflections
- melted fabric
- duplicated clothing details
- impossible seams
- fake-looking pavement
- fake-looking plants
- artificial background blur
- excessive sharpening
- unrealistic HDR
- oversaturated colours
- generic AI fashion imagery

The result should look like a real photograph taken by
a professional fashion photographer.

=========================================================
NATURAL HUMAN REALISM
=========================================================

The person must have:

- realistic anatomy
- natural proportions
- realistic facial structure
- realistic skin texture
- realistic hands
- realistic feet
- realistic hair
- natural posture
- believable interaction with the environment

Do not make the model look like a mannequin.

Do not make the model look computer-generated.

=========================================================
GARMENT VISIBILITY
=========================================================

The garment must remain clearly visible.

Do not hide important garment details behind:

- hands
- bags
- furniture
- vehicles
- other people
- excessive cropping
- extreme poses
- environmental objects

Use a natural fashion pose that displays the garment.

=========================================================
SCENE INTEGRATION
=========================================================

The model must physically belong in the environment.

Match:

- camera angle
- perspective
- scale
- lighting direction
- shadow direction
- colour temperature
- ambient exposure
- depth
- ground contact
- reflections
- environmental atmosphere

The subject must not look pasted into the background.

=========================================================
BACKGROUND RULE
=========================================================

${hasBackgroundReference
  ? `
Use the SECOND INPUT IMAGE as the main background
reference.

Preserve its recognizable scene and composition.

Make the model appear as though she was actually
photographed inside that exact type of location.

Do not turn the background into a generic luxury scene.
`
  : `
Create the selected location as a believable real-world
photographic environment.
`}

=========================================================
CAMPAIGN
=========================================================

Creative Direction:
${creative}

Create ONE polished premium OBITREND fashion campaign
photograph.

The uploaded garment is the visual focus.

=========================================================
USER REQUEST
=========================================================

${userPrompt}

=========================================================
FINAL PRIORITY
=========================================================

1. Uploaded garment identity
2. Uploaded garment construction
3. Uploaded garment pattern
4. Uploaded garment colour
5. Uploaded garment details
6. Background reference, when supplied
7. Scene compatibility
8. Realistic garment fit
9. Natural human anatomy
10. Model
11. Pose
12. Footwear
13. Location
14. Vehicle
15. Camera
16. Lighting
17. Fashion campaign styling

If anything conflicts with the uploaded garment:

PRESERVE THE UPLOADED GARMENT.

If a background reference is supplied:

PRESERVE ITS REAL-WORLD SCENE AND COMPOSITION.

If anything conflicts with the selected scene:

PRESERVE SCENE COMPATIBILITY.

If a vehicle conflicts with the scene:

REMOVE THE VEHICLE.

Generate ONE photorealistic image.
`;
}

/* =========================================================
   IMAGE GENERATION
========================================================= */

async function generateImage({
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

  if (!clothingBuffer.length) {
    throw new Error(
      "The uploaded clothing image is empty."
    );
  }

  if (
    clothingBuffer.length >
    MAX_IMAGE_BYTES
  ) {
    throw new Error(
      "The clothing image is too large. Please upload the image again."
    );
  }

  let backgroundBuffer = null;

  if (backgroundBase64) {
    backgroundBuffer =
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

    if (
      backgroundBuffer.length >
      MAX_IMAGE_BYTES
    ) {
      throw new Error(
        "The background reference image is too large. Please upload a smaller image."
      );
    }
  }

  const totalBytes =
    clothingBuffer.length +
    (backgroundBuffer
      ? backgroundBuffer.length
      : 0);

  if (
    totalBytes >
    MAX_TOTAL_IMAGE_BYTES
  ) {
    throw new Error(
      "The uploaded reference images are too large together. Please use smaller images."
    );
  }

  const clothingFile =
    await toFile(
      clothingBuffer,
      `obitrend-garment-reference.${extensionFromMime(
        clothingMimeType
      )}`,
      {
        type: clothingMimeType,
      }
    );

  /*
   * FIRST IMAGE = GARMENT
   * SECOND IMAGE = BACKGROUND
   *
   * This ordering is intentional.
   */

  const inputImages =
    [clothingFile];

  if (
    backgroundBuffer &&
    backgroundMimeType
  ) {
    const backgroundFile =
      await toFile(
        backgroundBuffer,
        `obitrend-background-reference.${extensionFromMime(
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

  const result =
    await openai.images.edit({
      model: MODEL,
      image:
        inputImages.length === 1
          ? inputImages[0]
          : inputImages,
      prompt,
      size,
      quality: IMAGE_QUALITY,
      output_format: "png",
    });

  const base64 =
    result?.data?.[0]?.b64_json;

  if (!base64) {
    throw new Error(
      "OpenAI did not return an image."
    );
  }

  return (
    "data:image/png;base64," +
    base64
  );
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

    return res.status(
      405
    ).json({
      success: false,
      error:
        "Method not allowed.",
    });
  }

  if (
    !process.env.OPENAI_API_KEY
  ) {
    return res.status(
      500
    ).json({
      success: false,
      error:
        "OPENAI_API_KEY is not configured.",
    });
  }

  let credit = null;
  let redis = null;
  let userId = null;

  try {
    /* =====================================================
       BODY
    ===================================================== */

    const body =
      normalizeBody(
        req.body
      );

    /* =====================================================
       CLOTHING IMAGE
    ===================================================== */

    let imageInput =
      getValue(
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
      imageInput =
        getValue(
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
      imageInput =
        getValue(
          body.input,
          "imageBase64",
          "uploadedImage",
          "image",
          "clothingImage",
          "referenceImage"
        );
    }

    const imageBase64 =
      normalizeBase64(
        imageInput
      );

    if (
      !imageBase64
    ) {
      return res.status(
        400
      ).json({
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
       OPTIONAL BACKGROUND REFERENCE IMAGE
    ===================================================== */

    /*
     * Existing frontend behaviour is preserved.
     *
     * These are NEW optional names.
     *
     * If none is supplied, the app works exactly as
     * before and generates the selected/random background.
     */

    let backgroundInput =
      getValue(
        body,
        "backgroundReferenceImage",
        "backgroundImage",
        "sceneReferenceImage",
        "referenceBackground",
        "backgroundReference"
      );

    if (
      !backgroundInput &&
      body?.data &&
      typeof body.data === "object"
    ) {
      backgroundInput =
        getValue(
          body.data,
          "backgroundReferenceImage",
          "backgroundImage",
          "sceneReferenceImage",
          "referenceBackground",
          "backgroundReference"
        );
    }

    if (
      !backgroundInput &&
      body?.input &&
      typeof body.input === "object"
    ) {
      backgroundInput =
        getValue(
          body.input,
          "backgroundReferenceImage",
          "backgroundImage",
          "sceneReferenceImage",
          "referenceBackground",
          "backgroundReference"
        );
    }

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
       REAL SUPABASE AUTHENTICATION
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
        error:
          auth.error,
      });
    }

    /*
     * NEVER trust body.userId.
     *
     * Always use the authenticated Supabase ID.
     */

    userId =
      auth.user.id;

    /* =====================================================
       REDIS
    ===================================================== */

    redis =
      getRedisOrNull();

    if (!redis) {
      return res.status(
        500
      ).json({
        success: false,
        error:
          "OBITREND credits service is not configured.",
        code:
          "REDIS_NOT_CONFIGURED",
      });
    }

    /* =====================================================
       PRO STATUS
    ===================================================== */

    const pro =
      await getProStatus(
        userId,
        redis
      );

    /* =====================================================
       CREDIT CONTROL
    ===================================================== */

    if (pro.active) {
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
          credit.success
        );

      if (
        !credit.success
      ) {
        return res.status(
          402
        ).json({
          success: false,
          error:
            "Your free generations are finished. Upgrade to OBITREND Pro to continue.",
          upgradeRequired:
            true,
          pro:
            false,
          balance:
            credit.balance,
          resetAt:
            credit.resetAt,
        });
      }
    }

    /* =====================================================
       SCENE
    ===================================================== */

    const scene =
      buildScenePlan(
        body
      );

    const promptBody = {
      ...body,

      locationType:
        scene.type,

      backgroundPreset:
        scene.selectedLocation,

      vehicle:
        scene.vehicle,

      city:
        scene.cityText,

      property:
        scene.propertyText,
    };

    const prompt =
      buildPrompt(
        promptBody,
        Boolean(
          backgroundBase64
        )
      );

    /* =====================================================
       IMAGE SIZE
    ===================================================== */

    const size =
      getImageSize(
        getValue(
          body,
          "aspectRatio",
          "ratio"
        )
      );

    /* =====================================================
       GENERATE
    ===================================================== */

    let imageUrl;

    try {
      imageUrl =
        await generateImage({
          clothingBase64:
            imageBase64,

          clothingMimeType:
            mimeType,

          backgroundBase64:
            backgroundBase64,

          backgroundMimeType:
            backgroundMimeType,

          prompt:
            prompt,

          size:
            size,
        });
    } catch (
      generationError
    ) {
      /*
       * Refund only a FREE credit that was actually spent.
       */

      if (
        credit?.usedCredit &&
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
            "OBITREND refund failed:",
            refundError
          );
        }
      }

      throw generationError;
    }

    /* =====================================================
       LOCATION HISTORY
    ===================================================== */

    const recent =
      normalizeRecentLocations(
        getValue(
          body,
          "recentLocations",
          "usedLocations",
          "previousLocations",
          "locationHistory"
        )
      );

    const updatedLocationHistory =
      [
        ...recent,
        scene.selectedLocation,
      ].slice(-10);

    /* =====================================================
       RESPONSE
    ===================================================== */

    return res.status(
      200
    ).json({
      success: true,
      ok: true,

      model:
        MODEL,

      image:
        imageUrl,

      imageUrl:
        imageUrl,

      url:
        imageUrl,

      generatedImage:
        imageUrl,

      images: [
        imageUrl,
      ],

      colorImages: [
        imageUrl,
      ],

      colourImages: [
        imageUrl,
      ],

      /* LOCATION */

      locationUsed:
        scene.selectedLocation,

      selectedLocation:
        scene.selectedLocation,

      locationType:
        scene.type,

      sceneType:
        scene.type,

      vehicleUsed:
        scene.vehicle,

      recentLocations:
        updatedLocationHistory,

      /* REFERENCE STATUS */

      backgroundReferenceUsed:
        Boolean(
          backgroundBase64
        ),

      hasBackgroundReference:
        Boolean(
          backgroundBase64
        ),

      backgroundReference:
        Boolean(
          backgroundBase64
        ),

      /* ACCOUNT */

      userId:
        userId,

      pro:
        Boolean(
          pro.active
        ),

      proActive:
        Boolean(
          pro.active
        ),

      proExpiresAt:
        pro.expiresAt || null,

      /* CREDITS */

      balance:
        credit.balance,

      usedFreeCredit:
        Boolean(
          credit.usedCredit
        ),
    });

  } catch (error) {
    console.error(
      "OBITREND /api/generate error:",
      error?.message ||
        error
    );

    return res.status(
      500
    ).json({
      success: false,
      error:
        error?.message ||
        "Image generation failed.",
    });
  }
}
