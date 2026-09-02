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
AI background.

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
INPUT REFERENCES
=========================================================

FIRST INPUT:
GARMENT REFERENCE.

The first image may show the garment:

- laid flat as a flat-lay
- hanging from a hanger
- displayed on a fully covered mannequin
- shown as a clean product photograph
- shown from another useful fashion-product angle

Automatically understand what garment is shown.

The garment reference is NOT a photograph of the final
model. It is the authoritative reference for the clothing.

${hasBackgroundReference
  ? `
SECOND INPUT:
BACKGROUND REFERENCE.

The second image is NOT a garment reference.
It is the environment/scene reference.
`
  : `
No second image is supplied.
`}

=========================================================
AUTOMATIC GARMENT UNDERSTANDING
=========================================================

Automatically identify the garment category and construction
from the first reference image.

Possible categories include, but are not limited to:

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
- coordinated two-piece outfit
- coordinated set
- other clothing clearly visible in the reference

If the user-selected clothing type conflicts with what is
clearly visible in the reference, prioritize the actual
garment visible in the reference.

Choose a suitable adult fashion model and styling for the
identified garment type unless the user explicitly selected
a different valid model configuration.

Do not turn one garment type into another.

=========================================================
GARMENT PRESERVATION
=========================================================

The FIRST INPUT IMAGE is the authoritative reference
for the garment.

The model MUST wear the same garment shown in the
reference.

Do not treat the garment as generic inspiration.

Preserve as accurately as possible:

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
- material appearance
- stripes
- checks
- patterns
- prints
- embroidery
- logos or distinctive visible design elements
- decorative details
- hardware
- trims

Do not redesign the garment.

Do not substitute another garment.

Do not remove important visible details.

Do not add unrelated garment details.

Keep the garment recognizable as the same garment.

=========================================================
FLAT-LAY / HANGER / MANNEQUIN HANDLING
=========================================================

If the garment is shown as a FLAT-LAY:

Understand the garment's actual shape and construction
from the flat presentation.

Reconstruct how the garment naturally hangs on a real
human body.

Do not copy the flat-lay background onto the final model.

If the garment is shown on a HANGER:

Remove the hanger from the final fashion presentation.

Use the garment's visible construction, neckline,
sleeves, proportions and length as the authoritative
reference.

Do not make the hanger part of the final outfit.

If the garment is shown on a FULLY COVERED MANNEQUIN:

Understand the garment itself rather than copying the
mannequin as the final person.

Replace the mannequin presentation with a natural adult
fashion model while preserving the garment.

The mannequin/body must never become the clothing design.

=========================================================
REALISTIC FIT
=========================================================

Make the garment physically believable on the model.

Use realistic:

- fabric tension
- wrinkles
- folds
- gravity
- seams
- draping
- garment-to-body contact
- sleeve behaviour
- hem behaviour
- natural stretching
- natural compression
- believable weight
- realistic fabric response to movement

Never make the clothing look pasted onto the model.

Never make fabric look melted, painted, plastic or
digitally attached.

=========================================================
DIFFERENT MODELS
=========================================================

The clothing may be presented on different adult models.

Create natural variation in:

- adult facial appearance
- hairstyle
- hair texture
- skin appearance
- body proportions
- height
- posture
- pose
- personal styling
- accessories
- footwear

The model must remain appropriate for the selected garment.

Do not change the garment simply to match the model.

The garment remains the primary reference.

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
REALISTIC OBJECTS AND PROPS
=========================================================

Add objects only when they naturally belong in the selected
environment.

Examples include:

RESTAURANT:
tables, chairs, plates, glasses, menus, lamps, flowers,
restaurant décor and believable dining objects.

HOTEL:
luggage, reception furniture, lamps, plants, seating,
architectural décor and believable hotel objects.

BOUTIQUE:
clothing racks, mirrors, shelves, display tables,
mannequins, fashion accessories and retail décor.

SHOPPING:
storefronts, shopping bags, displays, signs,
architectural details and pedestrians when appropriate.

CITY/STREET:
cars, taxis, buses, traffic lights, signs, street lamps,
buildings, storefronts, pedestrians and road markings
when appropriate.

BEACH:
loungers, umbrellas, towels, palms, resort furniture,
ocean details and believable seaside objects.

POOL:
loungers, umbrellas, towels, cabanas, tables, drinks
and resort details when appropriate.

OFFICE:
desks, chairs, computers, lamps, books, plants and
professional office objects.

HOME:
sofas, tables, lamps, plants, cushions, shelves and
appropriate household objects.

AIRPORT:
luggage, seating, signage, airport architecture,
trolleys and appropriate transportation details.

STADIUM:
seating, advertising boards, stadium architecture,
sports equipment and realistic venue details.

CHURCH:
appropriate architectural and decorative elements.

Do not add random objects just to make the image busy.

Every object must have a believable physical location.

Objects must obey:

- gravity
- scale
- perspective
- lighting
- reflections
- shadows
- depth

Do not place objects through the model.

Do not merge objects with clothing.

Do not create floating objects.

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

If the vehicle is incompatible with the scene,
do not include it.

=========================================================
CAMERA AND LIGHTING
=========================================================

Camera:
${camera}

Lighting:
${lighting}

Aspect Ratio:
${ratio}

Use realistic professional photography characteristics:

- natural camera perspective
- realistic lens perspective
- believable depth of field
- realistic exposure
- realistic highlights
- realistic shadows
- realistic reflections
- natural ambient light
- realistic colour response
- realistic skin texture
- realistic pores
- natural hair
- realistic fabric texture
- realistic environmental texture
- realistic motion and depth
- believable lens behaviour
- subtle natural photographic imperfections

=========================================================
PHOTOREALISM
=========================================================

The result must look like a real photograph.

It should resemble a professionally photographed fashion
campaign rather than an obviously computer-generated image.

Do not make it look like:

- illustration
- cartoon
- anime
- painting
- CGI
- 3D render
- videogame graphics
- plastic skin
- wax skin
- mannequin skin
- artificial beauty filter
- excessive smoothing
- excessive HDR

Avoid:

- distorted hands
- extra fingers
- missing fingers
- extra limbs
- duplicated people
- merged bodies
- distorted faces
- warped clothing
- floating objects
- impossible perspective
- inconsistent shadows
- inconsistent reflections
- melted fabric
- malformed architecture
- artificial-looking pavement
- artificial-looking plants
- repeated objects
- unnatural skin texture

=========================================================
NATURAL HUMAN PHOTOGRAPHY
=========================================================

The model should appear like a real person photographed
in a real location.

Use:

- realistic anatomy
- natural posture
- realistic facial structure
- realistic skin
- natural hair
- realistic hands
- realistic feet
- believable interaction with the environment
- natural facial expression
- natural body balance

Do not make the model look like a mannequin.

=========================================================
GARMENT VISIBILITY
=========================================================

Keep the garment clearly visible.

Do not hide important garment details behind:

- hands
- bags
- furniture
- vehicles
- other people
- excessive cropping
- environmental objects

Use a natural fashion pose that displays the garment.

The garment should remain easy to inspect.

=========================================================
SCENE INTEGRATION
=========================================================

The model must physically belong in the environment.

Match:

- perspective
- scale
- camera angle
- lighting direction
- shadow direction
- colour temperature
- ambient exposure
- depth
- ground contact
- reflections

The subject must not look pasted into the background.

Objects and clothing must share the same lighting and
environmental conditions as the scene.

=========================================================
CREATIVE DIRECTION
=========================================================

Creative Direction:
${creative}

Create ONE polished premium OBITREND fashion campaign
photograph.

The garment remains the main visual focus.

=========================================================
USER REQUEST
=========================================================

${userPrompt}

=========================================================
FINAL PRIORITY
=========================================================

1. Garment identity
2. Garment construction
3. Garment pattern
4. Garment colour
5. Garment details
6. Background reference when supplied
7. Scene compatibility
8. Realistic garment fit
9. Natural anatomy
10. Model
11. Pose
12. Footwear
13. Location
14. Appropriate objects and props
15. Vehicle
16. Camera
17. Lighting
18. Campaign styling

If anything conflicts with the garment:

PRESERVE THE GARMENT.

If a background reference is supplied:

PRESERVE THE REFERENCE ENVIRONMENT.

If a vehicle conflicts with the environment:

REMOVE THE VEHICLE.

If an object conflicts with the environment:

REMOVE THE OBJECT.

Do not invent a different garment.

Do not turn the garment into generic clothing.

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

    if (!backgroundBuffer.length) {
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
      "The reference images are too large together. Please use smaller images."
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

  const inputImages = [
    clothingFile,
  ];

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

  let result;

  try {
    result =
      await openai.images.edit({
        model: MODEL,

        image:
          inputImages.length === 1
            ? inputImages[0]
            : inputImages,

        prompt,

        size,

        quality:
          IMAGE_QUALITY,

        output_format:
          "png",
      });
  } catch (error) {
    const message =
      error?.message ||
      "";

    const lower =
      message.toLowerCase();

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
          "The reference image could not be used for this fashion generation. Please upload a clothing-focused product photo, such as the garment on a hanger, laid flat, or on a fully covered mannequin."
        );

      safeError.code =
        "UNSUITABLE_FASHION_REFERENCE";

      safeError.status =
        400;

      throw safeError;
    }

    throw error;
  }

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
       OPTIONAL BACKGROUND REFERENCE
    ===================================================== */

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
          "referenceBackground"
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
       AUTHENTICATION
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

      if (
        generationError?.code ===
        "UNSUITABLE_FASHION_REFERENCE"
      ) {
        return res.status(
          400
        ).json({
          success: false,

          error:
            generationError.message,

          code:
            "UNSUITABLE_FASHION_REFERENCE",

          upgradeRequired:
            false,

          pro:
            Boolean(
              pro.active
            ),

          balance:
            credit.balance,

          usedFreeCredit:
            false,

          refunded:
            Boolean(
              credit?.usedCredit
            ),
        });
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

      /* REFERENCES */

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
