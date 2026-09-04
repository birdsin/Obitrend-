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

const IMAGE_QUALITY = "high";
const MAX_IMAGE_BYTES = 9 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 11 * 1024 * 1024;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* =========================================================
   OPENAI ERROR HELPERS
========================================================= */

function getOpenAIErrorStatus(error) {
  return Number(
    error?.status ||
    error?.statusCode ||
    error?.response?.status ||
    0
  );
}

function getOpenAIErrorText(error) {
  return String(
    error?.message ||
    error?.error?.message ||
    error?.response?.data?.error?.message ||
    ""
  );
}

function isOpenAIQuotaError(error) {
  const status =
    getOpenAIErrorStatus(error);

  const text =
    getOpenAIErrorText(error).toLowerCase();

  return (
    status === 429 &&
    (
      text.includes("quota") ||
      text.includes("billing") ||
      text.includes("insufficient") ||
      text.includes("credits") ||
      text.includes("exceeded your current quota") ||
      text.includes("add credits") ||
      text.includes("organization")
    )
  );
}

function isOpenAIRateLimitError(error) {
  const status =
    getOpenAIErrorStatus(error);

  const text =
    getOpenAIErrorText(error).toLowerCase();

  return (
    status === 429 &&
    !isOpenAIQuotaError(error) &&
    (
      text.includes("rate limit") ||
      text.includes("too many requests") ||
      text.includes("rate_limit")
    )
  );
}

function getSafeGenerationError(error) {
  if (
    isOpenAIQuotaError(error)
  ) {
    const safeError =
      new Error(
        "OBITREND image generation is temporarily unavailable because the image generation service has reached its available API usage limit. Your OBITREND credit has been protected and will not be lost. Please try again later."
      );

    safeError.code =
      "GENERATION_SERVICE_QUOTA";

    safeError.status =
      503;

    return safeError;
  }

  if (
    isOpenAIRateLimitError(error)
  ) {
    const safeError =
      new Error(
        "OBITREND is receiving too many image-generation requests right now. Please wait a moment and try again. Your OBITREND credit has been protected."
      );

    safeError.code =
      "GENERATION_SERVICE_RATE_LIMIT";

    safeError.status =
      429;

    return safeError;
  }

  const status =
    getOpenAIErrorStatus(error);

  if (
    status === 401
  ) {
    const safeError =
      new Error(
        "OBITREND image generation is temporarily unavailable because the generation service is not authenticated correctly."
      );

    safeError.code =
      "GENERATION_SERVICE_AUTH";

    safeError.status =
      503;

    return safeError;
  }

  if (
    status === 400
  ) {
    const text =
      getOpenAIErrorText(error);

    const lower =
      text.toLowerCase();

    if (
      lower.includes(
        "safety_violations"
      ) &&
      lower.includes(
        "sexual"
      )
    ) {
      const safeError =
        new Error(
          "The reference image could not be used for this fashion generation. Please use a clothing-focused reference such as a flat-lay garment, garment on a hanger, or garment on a fully covered mannequin."
        );

      safeError.code =
        "UNSUITABLE_FASHION_REFERENCE";

      safeError.status =
        400;

      return safeError;
    }
  }

  return error;
}

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
      "automatically identify from uploaded reference"
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
BACKGROUND REFERENCE
=========================================================

A SECOND IMAGE has been supplied as the BACKGROUND
REFERENCE.

The FIRST IMAGE is the GARMENT REFERENCE.

The SECOND IMAGE is the BACKGROUND REFERENCE.

Do not confuse these roles.

Use the second image to reproduce the visual environment
as faithfully as possible.

Preserve the recognizable:

- architecture
- storefronts
- restaurant structure
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
- environmental colours
- overall composition
- atmosphere

Make the final scene look as though the fashion
photograph was genuinely taken in that environment.

Do not replace the reference environment with a generic
background.

Do not create an unrelated location.

Match the subject's scale and perspective to the scene.

Create realistic contact shadows between the model,
clothing, footwear and the ground.
`
      : `
=========================================================
BACKGROUND
=========================================================

No background reference image was supplied.

Create a believable real-world environment matching:

${scene.selectedLocation}

Do not make the environment look like a generic
computer-generated backdrop.
`;

  return `
OBITREND PHOTOREALISTIC FASHION PHOTOGRAPHY ENGINE.

Create ONE premium photorealistic fashion photograph.

The final image should look like a genuine professional
fashion photograph captured with a real high-quality
camera.

=========================================================
FIRST IMAGE — GARMENT REFERENCE
=========================================================

The FIRST INPUT IMAGE is the authoritative GARMENT
REFERENCE.

The garment may be presented as:

1. FLAT-LAY
2. HANGER
3. FULLY COVERED MANNEQUIN
4. CLEAN PRODUCT PHOTOGRAPH
5. OTHER CLEAR GARMENT PRESENTATION

Understand the garment from whichever presentation is
provided.

The reference image is for understanding the clothing.

Do not simply copy the original presentation.

Convert the referenced garment into a realistic garment
worn by the selected appropriate model.

=========================================================
AUTOMATIC GARMENT TYPE RECOGNITION
=========================================================

Automatically determine the actual clothing type visible
in the garment reference.

Possible garment categories include:

- T-shirt
- shirt
- blouse
- top
- tank top
- singlet
- polo shirt
- sweater
- cardigan
- hoodie
- sweatshirt
- jacket
- coat
- blazer
- suit
- waistcoat
- dress
- gown
- skirt
- mini skirt
- midi skirt
- maxi skirt
- trousers
- pants
- jeans
- leggings
- shorts
- cargo pants
- joggers
- jumpsuit
- romper
- traditional clothing
- cultural clothing
- formalwear
- sportswear
- activewear
- outerwear
- two-piece outfit
- coordinated set
- other clearly visible garment

Do not change the garment category.

If the user-selected clothing type conflicts with the actual
garment visible in the reference, prioritize the actual
garment.

=========================================================
FLAT-LAY PROCESSING
=========================================================

If the garment reference is a flat-lay:

- understand the full garment silhouette
- understand its actual dimensions and proportions
- understand front/back-visible construction
- understand sleeves and neckline
- understand waist and hem
- understand seams and panels
- understand patterns and prints
- understand fabric texture
- understand decorative details

Then reconstruct the SAME garment naturally on the model.

Do not copy the flat surface into the final photograph.

Do not make the model look like a flat-lay.

=========================================================
HANGER PROCESSING
=========================================================

If the garment is shown on a hanger:

- understand the garment independently from the hanger
- preserve its visible shape
- preserve its neckline
- preserve sleeves
- preserve length
- preserve seams
- preserve patterns
- preserve fabric appearance
- preserve all important details

Remove the hanger from the final fashion photograph.

The hanger must not become part of the final outfit.

=========================================================
FULLY COVERED MANNEQUIN PROCESSING
=========================================================

If the garment is shown on a fully covered mannequin:

Understand the garment itself.

Preserve the garment's:

- cut
- shape
- construction
- proportions
- neckline
- sleeves
- seams
- panels
- fabric
- patterns
- colours
- details

Replace the mannequin presentation with the requested
appropriate model.

Do not copy mannequin anatomy.

The final subject should look like a real adult fashion
model wearing the garment.

=========================================================
GARMENT IDENTITY — HIGHEST PRIORITY
=========================================================

The uploaded garment must remain recognizable as the
same garment.

Preserve:

- exact garment category
- silhouette
- cut
- proportions
- length
- width
- neckline
- collar
- sleeves
- cuffs
- waist
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
