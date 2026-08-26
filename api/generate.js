import OpenAI, { toFile } from "openai";

import {
  spendCredit,
  refundCredit,
  getProStatus,
  getRedisConfig,
} from "./credits.js";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "12mb",
    },
  },
};

export const maxDuration = 60;

const MODEL =
  process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";

const IMAGE_QUALITY = "medium";
const MAX_IMAGE_BYTES = 9 * 1024 * 1024;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* =========================================================
   OBITREND SCENE INTELLIGENCE
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
  ],
};

/*
  Locations where a vehicle makes visual sense.
*/
const VEHICLE_ALLOWED_TYPES = new Set([
  "city",
  "street",
  "outdoor",
  "hotel",
  "shopping",
  "boutique",
  "airport",
]);

/*
  Locations where a normal car should NEVER appear
  inside the scene.
*/
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
  if (!input) return null;

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

  if (
    value.length < 100
  ) {
    return null;
  }

  return value;
}

function getMimeType(input) {
  const value =
    String(input || "");

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
    ratio.includes("5:4") ||
    ratio.includes("16:9") ||
    ratio.includes("landscape")
  ) {
    return "1536x1024";
  }

  return "1024x1536";
}

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
    return clean(supplied)
      .replace(
        /[^a-zA-Z0-9_-]/g,
        ""
      )
      .slice(0, 100);
  }

  return (
    clean(
      req?.headers?.[
        "x-obitrend-user-id"
      ] || ""
    )
      .replace(
        /[^a-zA-Z0-9_-]/g,
        ""
      )
      .slice(0, 100) ||
    "guest"
  );
}

function getRedisOrNull() {
  try {
    const redis =
      getRedisConfig();

    return redis?.url &&
      redis?.token
      ? redis
      : null;
  } catch {
    return null;
  }
}

async function isProUser(
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
      "OBITREND Pro check failed:",
      error?.message ||
        error
    );

    return false;
  }
}

async function useCredit(
  userId,
  pro,
  redis
) {
  if (
    pro ||
    !redis
  ) {
    return {
      success: true,
      balance: null,
      usedCredit: false,
    };
  }

  const result =
    await spendCredit(
      userId,
      redis
    );

  return {
    ...result,
    usedCredit:
      Boolean(
        result?.success
      ),
  };
}

/* =========================================================
   LOCATION HELPERS
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

function isAutoBackground(
  value
) {
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
    typeof value === "string"
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

function chooseRandomLocation(
  type,
  recentLocations = []
) {
  const pool =
    LOCATION_POOLS[
      type
    ] ||
    LOCATION_POOLS.studio;

  const recent =
    new Set(
      recentLocations.map(
        (item) =>
          String(item)
            .trim()
            .toLowerCase()
      )
    );

  let candidates =
    pool.filter(
      (location) =>
        !recent.has(
          location.toLowerCase()
        )
    );

  /*
    If the user has already visited every
    location in this category, reset the pool
    rather than returning nothing.
  */
  if (
    candidates.length === 0
  ) {
    candidates = [
      ...pool,
    ];
  }

  const index =
    Math.floor(
      Math.random() *
        candidates.length
    );

  return candidates[index];
}

function buildScenePlan(
  body
) {
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

  const requestedVehicle =
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

  const regeneration =
    Boolean(
      getValue(
        body,
        "regenerate",
        "isRegenerate",
        "regeneration"
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

  let selectedLocation;

  /*
    Explicit background:
    respect it.

    Auto background:
    rotate through the compatible pool.
  */
  if (
    !auto &&
    backgroundPreset
  ) {
    selectedLocation =
      backgroundPreset;
  } else {
    selectedLocation =
      chooseRandomLocation(
        type,
        recentLocations
      );
  }

  /*
    If a property was explicitly selected,
    it becomes part of the environment,
    but it does NOT override the scene category.
  */
  const propertyText =
    property &&
    !property
      .toLowerCase()
      .includes("auto")
      ? property
      : "";

  const cityText =
    city &&
    !city
      .toLowerCase()
      .includes("auto")
      ? city
      : "";

  /*
    HARD VEHICLE SAFETY.

    Restaurants, pools, beaches, studios,
    homes, offices, churches and stadiums
    do not receive a normal vehicle.
  */
  let vehicle =
    requestedVehicle;

  if (
    VEHICLE_FORBIDDEN_TYPES.has(
      type
    )
  ) {
    vehicle = "none";
  }

  /*
    If vehicle is selected in an environment where
    it makes sense, it must remain outside or in a
    believable vehicle-compatible area.
  */
  const vehiclePlacement =
    vehicle &&
    vehicle !== "none" &&
    VEHICLE_ALLOWED_TYPES.has(
      type
    )
      ? `
VEHICLE PLACEMENT:
The selected vehicle may appear only in a physically
plausible vehicle-compatible location such as a street,
driveway, hotel entrance, exterior parking area,
showroom, airport drop-off area or luxury curbside scene.

NEVER place the vehicle inside a normal restaurant,
inside a pool, on a beach lounge, inside a bedroom,
inside a normal fashion studio, or in another physically
impossible indoor location.
`
      : `
VEHICLE PLACEMENT:
NO VEHICLE.

Do not generate a car, SUV, motorcycle, van or other
vehicle as a background prop.
`;

  const sceneRules = {
    restaurant: `
RESTAURANT SCENE RULES:

This is a restaurant/dining environment.

Allowed environmental elements:
- dining tables
- chairs
- plates
- glasses
- tasteful food-service objects
- chandeliers
- restaurant décor
- windows
- bar area
- elegant architectural details
- plants
- candles
- city views

FORBIDDEN:
- cars inside the restaurant
- SUVs inside the restaurant
- motorcycles inside the restaurant
- vehicles parked beside dining tables
- roads running through the restaurant
- parking lots inside the restaurant
- random outdoor vehicle scenes

The model must clearly appear to be inside or naturally
outside the restaurant dining environment.
`,

    hotel: `
HOTEL SCENE RULES:

Create a believable luxury hotel/resort environment.

Allowed:
- reception desk
- sofas
- hotel corridors
- chandeliers
- elevators
- balconies
- hotel terraces
- tasteful luggage
- architectural décor
- resort landscaping

Vehicles are allowed ONLY outside at a driveway,
entrance, drop-off zone or other believable exterior
vehicle area.

Never place a vehicle in a normal hotel bedroom,
restaurant, lobby or corridor.
`,

    beach: `
BEACH SCENE RULES:

Create a believable beach or seaside resort.

Allowed:
- sand
- ocean
- palm trees
- umbrellas
- beach loungers
- resort architecture
- seaside terraces
- beach club furniture

Do not place cars directly beside the model on the
beach unless the selected environment explicitly
requires a beach-access vehicle scene.

Never place an indoor restaurant scene into the beach.
`,

    pool: `
POOL SCENE RULES:

Create a luxury swimming pool or resort pool area.

Allowed:
- pool water
- loungers
- umbrellas
- resort architecture
- tropical plants
- poolside tables
- towels
- cabanas

NO normal cars or SUVs inside the pool area.
No vehicle parked beside the pool unless the user
explicitly requested a special vehicle display scene.
`,

    studio: `
STUDIO SCENE RULES:

Create a professional fashion photography studio.

Allowed:
- seamless backdrop
- professional lighting
- softboxes
- tasteful studio equipment
- premium editorial set pieces

NO cars or SUVs inside the studio.
`,

    home: `
HOME SCENE RULES:

Create a believable luxury residential environment.

Allowed:
- sofa
- dining area
- kitchen
- bedroom
- living room
- terrace
- windows
- plants
- tasteful home décor

NO cars inside the home.
`,

    office: `
OFFICE SCENE RULES:

Create a believable premium office environment.

Allowed:
- desks
- executive chairs
- glass walls
- lounge furniture
- architectural décor
- city views

NO cars inside the office.
`,

    church: `
CHURCH SCENE RULES:

Create a respectful, believable church environment.

Allowed:
- architecture
- pews
- altar
- stained glass
- courtyard
- tasteful lighting

NO cars inside the church.
`,

    stadium: `
STADIUM SCENE RULES:

Create a believable stadium or sports venue.

Allowed:
- seating
- field
- stadium architecture
- entrances
- VIP areas
- sports lighting

NO random cars inside spectator seating or on the
field unless the selected scene explicitly requires
a professional vehicle display.
`,

    city: `
CITY SCENE RULES:

Create a believable urban fashion environment.

Vehicles may appear naturally on roads or in the
background.

Never place vehicles inside buildings.
`,

    street: `
STREET SCENE RULES:

Create a believable exterior street/avenue.

Vehicles may appear naturally on roads, curbside,
driveways or parking areas.

Do not put vehicles inside unrelated buildings.
`,

    shopping: `
SHOPPING SCENE RULES:

Create a believable premium shopping environment.

Vehicles may appear outside the building or at a
drop-off/curbside location.

Do not place vehicles inside normal stores or shopping
mall corridors unless the scene explicitly represents
a vehicle showroom.
`,

    boutique: `
BOUTIQUE SCENE RULES:

Create a believable luxury fashion boutique or showroom.

Allowed:
- clothing racks
- mirrors
- displays
- mannequins
- premium interior décor

NO random cars inside a normal fashion boutique.
`,

    airport: `
AIRPORT SCENE RULES:

Create a believable modern airport or VIP aviation
environment.

Vehicles may appear only in believable exterior
drop-off or airport transport areas.

Do not place ordinary cars inside an airport lounge.
`,

    outdoor: `
OUTDOOR SCENE RULES:

Create a believable outdoor fashion location.

Use natural architectural and environmental elements.

Vehicles may appear only when physically appropriate.
`,
  };

  const citySuffix =
    cityText
      ? `\nCITY / REGION: ${cityText}`
      : "";

  const propertySuffix =
    propertyText
      ? `\nPROPERTY / VENUE: ${propertyText}`
      : "";

  return {
    type,
    selectedLocation,
    vehicle,
    regeneration,
    recentLocations,
    cityText,
    propertyText,
    vehiclePlacement,
    rules:
      sceneRules[type] ||
      sceneRules.studio,
    citySuffix,
    propertySuffix,
  };
}

/* =========================================================
   PROMPT
   ========================================================= */

function buildPrompt(body) {
  const scene =
    buildScenePlan(
      body
    );

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
      ? clothingColors.join(
          ", "
        )
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
      "professional fashion photography"
    );

  const lighting =
    clean(
      getValue(
        body,
        "lighting"
      ),
      "soft professional lighting"
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

  const ageInstruction =
    ageGroup ===
      "toddler_girl" ||
    ageGroup ===
      "toddler_boy"
      ? `
CHILD-SAFE TODDLER MODE.

The main subject is a realistic toddler approximately
1–3 years old.

Use only age-appropriate children's clothing,
footwear and family-friendly presentation.

Do not use adult glamour styling.
Do not use provocative posing.
Do not sexualize the child.
`
      : ageGroup ===
          "teen_girl" ||
        ageGroup ===
          "teen_boy"
      ? `
TEEN MODE.

The main subject is a realistic teenager aged 13–17.

Use age-appropriate fashion presentation.

Do not sexualize the teenager.
Do not use adult glamour styling.
Do not use provocative posing.
`
      : `
ADULT MODE.

The main subject is an adult fashion model aged 18+.

Use professional fashion photography and realistic
adult anatomy.
`;

  const companionInstruction =
    companion &&
    companion !== "none"
      ? `
A secondary companion is requested:
${companion}

Keep the companion separate from the main model.

The main model remains the primary fashion subject.

Do not duplicate people.
Do not merge bodies.
Do not create extra limbs.
Do not create extra fingers.

Any child companion must remain age-appropriate and
family-friendly.
`
      : `
NO COMPANION.

The main model appears alone.
`;

  const colourInstruction =
    colourText
      .toLowerCase()
      .includes(
        "original colour"
      )
      ? `
COLOUR:
Original Colour.

Preserve the actual colour visible in the uploaded
garment reference.
`
      : `
COLOUR:
${colourText}

Recolour the SAME uploaded garment while preserving
its construction, pattern and material.

Do not use colour selection as permission to redesign
the garment.
`;

  return `

OBITREND UNIVERSAL GARMENT REPRODUCTION MODE.

Create ONE premium photorealistic fashion photograph.

=========================================================
ABSOLUTE GARMENT PRIORITY
=========================================================

THE UPLOADED IMAGE IS THE PRIMARY AND AUTHORITATIVE
REFERENCE FOR THE GARMENT.

THE MAIN MODEL MUST WEAR THE GARMENT SHOWN IN THE
UPLOADED IMAGE.

The uploaded clothing is NOT merely inspiration.

Do NOT invent a replacement outfit.
Do NOT substitute a generic luxury outfit.
Do NOT redesign the clothing.

=========================================================
GARMENT PRESERVATION
=========================================================

Preserve:

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
- darts
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

Do not simplify the garment.

=========================================================
MODEL
=========================================================

Gender:
${gender}

Model:
${model}

Body Type:
${bodyType}

Face / Beauty:
${face}

Age Group:
${ageGroup}

Pose:
${pose}

Footwear:
${footwear}

${ageInstruction}

=========================================================
CLOTHING CONTROLS
=========================================================

Clothing Type:
${clothingType}

Clothing Style:
${clothingStyle}

Fashion Style:
${fashionStyle}

${colourInstruction}

These controls describe how the uploaded garment
should be presented.

They do NOT override the uploaded garment.

=========================================================
COMPANION
=========================================================

${companionInstruction}

=========================================================
SMART LOCATION ENGINE
=========================================================

LOCATION CATEGORY:
${scene.type}

SELECTED LOCATION:
${scene.selectedLocation}

${scene.citySuffix}

${scene.propertySuffix}

${scene.rules}

=========================================================
VEHICLE CONTROL
=========================================================

Vehicle requested:
${scene.vehicle}

${scene.vehiclePlacement}

IMPORTANT:

A vehicle must NEVER appear simply because the image
generator thinks the scene looks luxurious.

Only generate a vehicle when it is explicitly selected
AND physically appropriate for the selected environment.

For restaurant scenes:

NO CAR INSIDE.

For beach/pool scenes:

NO RANDOM CAR.

For studio scenes:

NO CAR.

For home/bedroom scenes:

NO CAR.

For office scenes:

NO CAR.

For church scenes:

NO CAR.

For normal boutique interiors:

NO CAR.

For hotel interiors:

NO CAR unless the selected scene is specifically an
exterior hotel driveway/drop-off/showroom environment.

=========================================================
LOCATION REALISM
=========================================================

The selected location must be physically coherent.

Do not combine unrelated environments.

Examples of forbidden combinations:

- restaurant + car parked beside dining table
- bedroom + street traffic
- pool + indoor parking lot
- church + luxury SUV inside the sanctuary
- fashion studio + road traffic
- restaurant + highway
- beach lounge + indoor office
- boutique + random parking garage

All objects must belong naturally to the selected location.

=========================================================
LOCATION ROTATION
=========================================================

If the user regenerates the image, use the selected
location supplied by OBITREND.

Do not repeat a recent location when another compatible
location is available.

Make each regeneration visually different through:

- location
- architecture
- composition
- camera angle
- environmental details
- background depth

BUT NEVER change the uploaded garment.

=========================================================
FINAL IMAGE CLEANLINESS
=========================================================

Do not add:

- watermarks
- signatures
- social media handles
- advertising text
- random text
- unrelated brand marks

=========================================================
CAMERA
=========================================================

${camera}

Lighting:
${lighting}

Aspect Ratio:
${ratio}

Create realistic commercial fashion photography with:

- realistic camera perspective
- realistic depth of field
- realistic exposure
- realistic shadows
- realistic highlights
- realistic reflections
- realistic skin texture
- realistic fabric texture
- realistic materials

=========================================================
PHOTOREALISM
=========================================================

The result must look like a real photograph.

Use realistic:

- anatomy
- hands
- fingers
- face
- hair
- skin
- feet
- body proportions
- garment fit
- fabric folds
- shadows
- lighting
- environment

Avoid:

- cartoon
- anime
- painting
- illustration
- CGI appearance
- plastic skin
- distorted anatomy
- extra fingers
- extra limbs
- duplicated people
- malformed hands
- distorted faces
- warped clothing
- random text
- watermarks

=========================================================
GARMENT VISIBILITY
=========================================================

The garment must be clearly visible.

Do not hide important parts behind:

- hands
- bags
- furniture
- vehicles
- other people
- excessive cropping
- objects

Use natural fashion posing that allows the garment
to be inspected clearly.

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
6. Scene compatibility
7. Realistic garment fit
8. Model
9. Pose
10. Footwear
11. Background/location
12. Vehicle
13. Camera
14. Lighting
15. Campaign styling

If anything conflicts with the uploaded garment:

PRESERVE THE UPLOADED GARMENT.

If anything conflicts with the selected scene:

PRESERVE SCENE COMPATIBILITY.

If a vehicle conflicts with the scene:

REMOVE THE VEHICLE.

Generate ONE photorealistic image.

`;
}

/* =========================================================
   OPENAI IMAGE GENERATION
   ========================================================= */

async function generateImage(
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
      "The clothing image is too large. Please upload the image again."
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

  const result =
    await openai.images.edit({
      model: MODEL,
      image: file,
      prompt,
      size,
      quality:
        IMAGE_QUALITY,
      output_format:
        "png",
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
    req.method !==
    "POST"
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
  let userId =
    "guest";

  try {
    const body =
      normalizeBody(
        req.body
      );

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
      typeof body.data ===
        "object"
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
      typeof body.input ===
        "object"
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

    userId =
      getUserId(
        body,
        req
      );

    redis =
      getRedisOrNull();

    const pro =
      await isProUser(
        userId,
        redis
      );

    credit =
      await useCredit(
        userId,
        pro,
        redis
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
        balance:
          credit.balance,
      });
    }

    /*
      Build the scene ONCE so the prompt and response
      use exactly the same location.
    */
    const scene =
      buildScenePlan(
        body
      );

    /*
      Build prompt using the selected scene.
    */
    const prompt =
      buildPrompt({
        ...body,

        /*
          Inject the selected scene so a second
          buildScenePlan call cannot accidentally
          choose another location.
        */
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
      });

    const size =
      getImageSize(
        getValue(
          body,
          "aspectRatio",
          "ratio"
        )
      );

    let imageUrl;

    try {
      imageUrl =
        await generateImage(
          imageBase64,
          mimeType,
          prompt,
          size
        );
    } catch (
      generationError
    ) {
      if (
        credit.usedCredit &&
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

    /*
      Return the location metadata to the frontend.

      This is important because your frontend can store
      locationUsed and send it back as recentLocations
      during the next regeneration.
    */

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

      /*
        NEW LOCATION DATA
      */
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

      regeneration:
        scene.regeneration,

      /*
        Existing credit / Pro response
      */
      balance:
        credit.balance,

      pro:
        pro,
    });

  } catch (
    error
  ) {
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
