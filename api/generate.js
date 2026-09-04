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

const IMAGE_QUALITY = "medium";
const MAX_IMAGE_BYTES = 9 * 1024 * 1024;

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

function buildPrompt(body) {
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

  return `
OBITREND UNIVERSAL GARMENT REPRODUCTION MODE.

Create ONE premium photorealistic fashion photograph.

=========================================================
ABSOLUTE GARMENT PRIORITY
=========================================================

THE UPLOADED IMAGE IS THE PRIMARY AND AUTHORITATIVE
REFERENCE FOR THE GARMENT.

The main model MUST wear the garment shown in the
uploaded image.

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

The clothing controls describe how the uploaded garment
should be presented.

They do NOT override the uploaded garment.

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

=========================================================
VEHICLE
=========================================================

Requested Vehicle:
${scene.vehicle}

${scene.vehiclePlacement}

IMPORTANT:

Never add a vehicle simply because the scene looks
luxurious.

If the vehicle conflicts with the environment,
REMOVE THE VEHICLE.

=========================================================
SCENE REALISM
=========================================================

All objects must belong naturally to the selected
environment.

Do not combine unrelated environments.

Examples of forbidden combinations:

- restaurant + car beside dining table
- bedroom + street traffic
- pool + parking lot
- church + SUV inside sanctuary
- fashion studio + road traffic
- restaurant + highway
- beach lounge + indoor office
- boutique + parking garage

=========================================================
CAMERA
=========================================================

Camera:
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

Do not hide important garment details behind:

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
   IMAGE GENERATION
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
       IMAGE
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
     * IMPORTANT:
     *
     * NEVER trust body.userId here.
     *
     * Use the authenticated Supabase ID.
     *
     * This is the same identity used by
     * /api/credits.js and Pro entitlement.
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
      /*
       * REAL PRO USER:
       *
       * Do NOT spend free credits.
       */
      credit = {
        success: true,
        balance: null,
        usedCredit: false,
      };
    } else {
      /*
       * FREE USER:
       *
       * Spend one weekly credit.
       */
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

    /*
     * Build the prompt from the exact selected scene.
     *
     * This prevents the frontend metadata and AI prompt
     * from accidentally using different locations.
     */

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
        promptBody
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
        await generateImage(
          imageBase64,
          mimeType,
          prompt,
          size
        );
    } catch (
      generationError
    ) {
      /*
       * Refund only a FREE credit that was actually spent.
       *
       * Pro users never spend a free credit, so there is
       * nothing to refund for them.
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
