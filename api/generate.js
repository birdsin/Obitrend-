import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
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

const PUSH_VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@obitrend.vercel.app";
async function sendImageReadyNotification(supabase,userId,imageUrl){
  try{
    const {data:config,error:configError}=await supabase.from("push_config").select("public_key,private_key,subject").eq("id","default").maybeSingle();
    if(configError||!config?.public_key||!config?.private_key)return;
    webpush.setVapidDetails(config.subject||PUSH_VAPID_SUBJECT,config.public_key,config.private_key);
    const {data:subscriptions,error}=await supabase.from("push_subscriptions").select("id,endpoint,subscription").eq("user_id",userId);
    if(error)throw error;
    for(const row of subscriptions||[]){
      const sub=row.subscription;
      if(!sub?.endpoint||!sub?.keys?.p256dh||!sub?.keys?.auth)continue;
      try{
        await webpush.sendNotification(sub,JSON.stringify({title:"OBITREND",body:"Your fashion image is ready.",tag:`obitrend-image-${Date.now()}`,url:imageUrl||"https://obitrend.vercel.app/"}));
      }catch(error){
        if(error?.statusCode===404||error?.statusCode===410)await supabase.from("push_subscriptions").delete().eq("id",row.id);
        else console.error("OBITREND image push failed:",error?.message||error);
      }
    }
  }catch(error){console.error("OBITREND image notification setup failed:",error?.message||error);}
}

const MODEL =
  process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";

const MAX_COLOUR_IMAGES = 4;
const MAX_IMAGE_BYTES = 9 * 1024 * 1024;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GENERATED_BUCKET = "obitrend-generated";

function storageClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

function generatedImageBuffer(value) {
  const input = String(value || "");
  if (!input) return null;
  if (/^data:image\//i.test(input)) {
    const comma = input.indexOf(",");
    if (comma < 0) return null;
    return Buffer.from(input.slice(comma + 1).replace(/\s/g, ""), "base64");
  }
  return null;
}

async function persistGeneratedImage(userId, imageValue, index = 0) {
  const supabase = storageClient();
  const buffer = generatedImageBuffer(imageValue);
  if (!supabase || !userId || !buffer?.length) return imageValue;
  const safeId = crypto.randomUUID();
  const path = userId + "/images/" + Date.now() + "-" + safeId + "-" + (index + 1) + ".png";
  const { error: uploadError } = await supabase.storage.from(GENERATED_BUCKET).upload(path, buffer, {
    contentType: "image/png",
    upsert: false
  });
  if (uploadError) throw uploadError;
  const { data, error: signedError } = await supabase.storage.from(GENERATED_BUCKET).createSignedUrl(path, 60 * 60 * 24 * 30);
  if (signedError) throw signedError;
  return data.signedUrl;
}


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
  proActive = false,
  monthlyPro = false
) {
  const allowedCameras = [
    "Canon EOS R5 Mark II",
    "Fujifilm GFX 100S II",
    "Nikon Z8"
  ];

  if (!proActive) {
    return {
      peopleMode: "limited natural adult background people",
      peopleCount: 2,
      cameraType: "AI Smart Camera - Standard",
      lens: "AI Smart Lens - Standard",
      shot: "natural professional fashion composition",
      angle: "eye-level natural camera angle",
      distance: "medium professional camera distance",
      focus: "primary adult model and uploaded garment",
      cameraLighting: "natural professional fashion lighting",
      realism: "true-to-life professional photography",
      smartCamera: `
STANDARD CAMERA ENGINE

The account is FREE / STANDARD.

Do not use Pro camera presets or Pro camera characteristics.

Use a realistic professional AI camera appearance.
The uploaded garment remains authoritative.
`,
      monthlyPro: false,
      proCamera: false
    };
  }

  const requested = clean(
    getValue(body, "realisticCamera", "cameraType", "advancedCamera", "camera"),
    "AI Smart Camera"
  );

  const selected = allowedCameras.find(
    item => item.toLowerCase() === requested.toLowerCase()
  ) || "AI Smart Camera";

  const cameraDescription =
    selected === "Canon EOS R5 Mark II"
      ? "45MP-class high-resolution rendering, responsive AI subject tracking, realistic high-detail 8K-style video/image characteristics."
      : selected === "Fujifilm GFX 100S II"
        ? "100MP medium-format rendering, exceptional micro-detail, natural tonal transitions, realistic depth and fabric texture."
        : selected === "Nikon Z8"
          ? "high-end full-frame rendering, elite autofocus behavior, strong detail, natural perspective and professional dynamic range."
          : "professional AI camera rendering with natural perspective and realistic detail.";

  return {
    peopleMode: monthlyPro ? "mixed natural people and families" : "limited natural adult background people",
    peopleCount: monthlyPro ? 4 : 2,
    cameraType: selected,
    lens: clean(getValue(body, "cameraLens", "lens"), "50mm natural perspective"),
    shot: clean(getValue(body, "cameraShot", "shotType", "framing", "composition"), "natural professional fashion composition"),
    angle: clean(getValue(body, "cameraAngle", "angle"), "eye-level natural camera angle"),
    distance: clean(getValue(body, "cameraDistance", "distance"), "natural professional camera distance"),
    focus: clean(getValue(body, "cameraFocus", "focus"), "eye autofocus with garment priority"),
    cameraLighting: clean(getValue(body, "cameraLighting", "lighting"), "physically realistic professional lighting"),
    realism: clean(getValue(body, "realism", "realismLevel"), "true-to-life professional photography"),
    smartCamera: `
PRO CAMERA SYSTEM ACTIVE.

Selected camera:
${selected}

Camera characteristics:
${cameraDescription}

Apply these characteristics to the photographic rendering only.
Do not display camera branding.
Do not turn the image into CGI.
Preserve realistic skin, fabric, lighting, perspective and anatomy.
The uploaded garment remains the authoritative product and must not be redesigned.
`,
    monthlyPro,
    proCamera: true
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
REALISTIC HUMAN ANATOMY + HEAD/BODY ALIGNMENT
========================================================= */

const realisticHumanAnatomyPrompt = `
REALISTIC HUMAN ANATOMY — STRICT REQUIREMENT:

Generate a completely natural, anatomically correct adult human.

The head MUST belong naturally to the same body.
The head, neck, shoulders, chest, waist, hips and legs MUST form one
continuous anatomically correct human body.

HEAD AND NECK:
- Natural head-to-neck connection.
- Neck must emerge naturally from the shoulders.
- Head must be correctly centered and proportionate to the body.
- No floating head.
- No detached head.
- No oversized head.
- No undersized head.
- No stretched neck.
- No twisted neck.
- No unnatural head angle.

POSTURE:
- Model stands naturally upright.
- Spine remains anatomically straight and believable.
- Head remains naturally aligned above the neck and torso.
- Shoulders remain naturally aligned.
- Hips remain naturally aligned with the torso.
- Legs connect naturally to the hips.
- Feet connect naturally to the legs.
- Use a relaxed professional fashion-model stance.
- Slight natural asymmetry is allowed, but NEVER unnatural bending.

BODY PROPORTIONS:
- Realistic adult human proportions.
- Head size, neck length, shoulder width, torso length,
  arm length and leg length must be physically consistent.
- Arms must attach naturally at the shoulders.
- Hands must attach naturally to the wrists.
- Legs must attach naturally to the hips.
- No duplicated limbs.
- No extra limbs.
- No missing limbs.
- No warped joints.
- No deformed anatomy.

CAMERA:
- Keep the camera at a natural eye-level or slightly below eye-level.
- Use a realistic full-body fashion-camera perspective.
- Avoid extreme wide-angle distortion.
- Do not stretch the head or body near the edges of the frame.
- Keep the model centered in the frame.
- Leave enough space around the head, feet and body.
- Keep the complete body visible when full-body framing is requested.

POSE:
- Natural upright standing pose.
- Weight distributed realistically between both legs.
- Shoulders relaxed.
- Torso vertical.
- Head naturally aligned with the spine.
- Face looking naturally toward the camera unless another pose is explicitly selected.

QUALITY CONTROL:
Before producing the final image, internally check the anatomy.
If the head does not naturally belong to the body, correct it.
If the neck, shoulders or spine look distorted, correct them.
If the body is bent unnaturally, correct the posture.
If proportions look unrealistic, correct them.
The final image MUST look like a real photograph of one real adult person,
not a generated body assembled from separate parts.
`;
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

  const detectedScene = body?.detectedScene && typeof body.detectedScene === "object"
    ? body.detectedScene
    : null;

  const automaticDetectionPrompt = detectedScene
    ? `
=========================================================
AUTOMATIC UPLOADED IMAGE / OBJECT / SCENE DETECTION
=========================================================

The system automatically analyzed the uploaded reference image.

Primary subject:
${clean(detectedScene.primarySubject, "not specified")}

Scene type:
${clean(detectedScene.sceneType, "not specified")}

Detected garments:
${Array.isArray(detectedScene.garments) ? detectedScene.garments.join(", ") : "none specified"}

Detected vehicles:
${Array.isArray(detectedScene.vehicles) ? detectedScene.vehicles.join(", ") : "none specified"}

Detected properties / buildings:
${Array.isArray(detectedScene.properties) ? detectedScene.properties.join(", ") : "none specified"}

Detected objects:
${Array.isArray(detectedScene.objects) ? detectedScene.objects.join(", ") : "none specified"}

Detected environment:
${Array.isArray(detectedScene.environment) ? detectedScene.environment.join(", ") : "none specified"}

Detected colors:
${Array.isArray(detectedScene.colors) ? detectedScene.colors.join(", ") : "none specified"}

Detected materials:
${Array.isArray(detectedScene.materials) ? detectedScene.materials.join(", ") : "none specified"}

Important visual details:
${Array.isArray(detectedScene.details) ? detectedScene.details.join(", ") : "none specified"}

Generation instruction:
${clean(detectedScene.generationInstruction, "Respect all clearly visible real objects and environmental details.")}

AUTOMATIC DETECTION RULES:
- Respect real objects that are visibly present in the reference image.
- Preserve their category, approximate shape, scale, placement and relationship to the scene when they remain part of the requested composition.
- A detected house/building must remain a believable house/building, not become a random object.
- A detected car/vehicle must remain a believable vehicle with realistic proportions.
- Detected furniture and objects must have realistic scale and perspective.
- Do not invent additional major objects merely because they are common in the scene.
- Do not remove a clearly visible important object unless the user's prompt explicitly requests removal.
- Automatic detection is descriptive guidance; the actual uploaded image remains the authoritative visual reference.
`
    : `
AUTOMATIC IMAGE DETECTION:
No separate analysis was available. Inspect the uploaded reference image directly and automatically identify visible garments, people, houses, cars, vehicles, furniture, objects and environmental elements. Respect what is actually visible and do not invent major objects.
`;

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

  const automaticSceneIntelligence = automaticDetectionPrompt;

  const advancedScene =
    buildAdvancedScenePrompt(
      body,
      monthlyPro
    );

  return `
OBITREND AI FASHION CREATOR
REALISTIC CAMERA + REAL WORLD PEOPLE

${automaticSceneIntelligence}

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
${realisticHumanAnatomyPrompt}
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
${realisticHumanAnatomyPrompt}

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

  /*
  =========================================================
  PROMPT LENGTH FIX ONLY
  =========================================================

  DO NOT change the prompt content.

  The existing prompt is 33,897 characters because it contains
  many line breaks and repeated formatting whitespace.

  OpenAI has a 32,000 character prompt limit.

  Compress whitespace only before sending the EXISTING prompt.

  No instructions, words, workflow, features, image sizes,
  garment rules, camera rules, people rules or user direction
  are changed.
  =========================================================
  */

  const safePrompt = buildAutomaticPromptOnlyPrompt(prompt)
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, 30000);

console.log("OBITREND prompt length:", safePrompt.length);

  try {
    const result =
      await openai.images.edit({
        model: MODEL,
        image: imageFile,
        prompt: safePrompt,
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
PROMPT-ONLY GENERATION
Used when the creator does not upload a garment.
========================================================= */
function buildAutomaticPromptOnlyPrompt(prompt) {
  return `
OBITREND AUTOMATIC FASHION CREATIVE DIRECTOR

UNIVERSAL FASHION SCENE COVERAGE

The user's text may describe any fashion concept, clothing style, model, pose, campaign or real-world environment.

Automatically support coherent fashion imagery in places such as:
- luxury houses, villas, mansions, apartments and penthouses
- beautiful home interiors, living rooms, bedrooms, kitchens, dining rooms, offices and rooftops
- luxury hotels, resorts, lobbies, lounges, restaurants and cafes
- fashion boutiques, clothing stores, malls, supermarkets and showrooms
- city streets, downtown districts, plazas, waterfronts and modern architecture
- beaches, pools, gardens, parks, terraces and outdoor resorts
- airports, travel environments, transport terminals and lounges
- business environments, studios, events and lifestyle locations
- elegant vehicles, cars, SUVs, yachts and other appropriate fashion props

When the user gives only a broad fashion idea, intelligently choose a beautiful, believable location and complete the scene automatically. Keep architecture, furniture, vehicles, people, props, lighting, scale and perspective physically realistic and visually coherent.

If an uploaded garment is supplied elsewhere in the workflow, preserve that garment as the authoritative product reference. Never redesign or replace it.



Create a true-to-life, professional fashion image from the user's description below.

USER CREATIVE DIRECTION:
${String(prompt || "").trim()}

AUTOMATIC DECISIONS:
- Automatically choose a believable adult fashion model appropriate to the described clothing and scene.
- Automatically choose a suitable pose, body framing, camera perspective, lens look, depth of field, lighting and exposure.
- Automatically choose a realistic fashion location/background that fits the user's description.
- Automatically choose complementary styling, footwear and accessories only when appropriate.
- Automatically compose the scene like a professional commercial fashion campaign.
- Automatically determine whether full-body, three-quarter or portrait framing best serves the described fashion.
- Preserve realistic anatomy, skin, hair, hands, fabric, stitching and material texture.
- Keep architecture, furniture, vehicles and people at believable physical scale.
- Add natural background activity only when it fits the scene.
- Do not add random text, watermarks, logos or camera branding.
- Do not turn the image into CGI, illustration or cartoon.
- Do not ask the user to choose technical settings.
- The user's description is the creative direction; OBITREND makes the photographic and fashion decisions automatically.

FINAL RESULT:
A polished, true-to-life fashion campaign photograph that follows the user's idea while using intelligent automatic creative direction.
`;
}

async function generateFromPrompt(prompt, size) {
  const safePrompt = String(prompt || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30000);
  if (!safePrompt) throw new Error("Please describe the fashion image first.");
  const result = await openai.images.generate({
    model: MODEL,
    prompt: safePrompt,
    size,
    quality: "high",
    output_format: "png",
  });
  const b64 = result?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI did not return a generated image.");
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

  let charge = null;
  let userId = null;
  let redis = null;
  let generatedImageCount = 0;

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

    const mimeType = imageInput
      ? getMimeType(imageInput)
      : "image/jpeg";

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

    userId = auth.user.id;

    const supabase =
      storageClient();

    redis = getRedisOrNull();

    /* =====================================================
    CREDIT CHARGE

    UNCHANGED
    ===================================================== */

    charge = redis
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

    /* =====================================================
    PROMPT-ONLY MODE
    No garment image is required. The text prompt is the
    complete creative reference.
    ===================================================== */
    if (!imageBase64) {
      const promptOnly = clean(getValue(body, "prompt", "creativeDirection", "description"));
      if (!promptOnly) {
        if (charge.usedCredit && redis) { try { await refundCredit(userId, redis, charge.creditType); } catch {} }
        return res.status(400).json({ success:false, error:"Please describe the fashion image first." });
      }
      try {
        const promptOnlySize = getImageSize(getValue(body, "aspectRatio", "ratio"));
        const automaticPrompt = buildAutomaticPromptOnlyPrompt(promptOnly);
        const generatedRaw = await generateFromPrompt(automaticPrompt, promptOnlySize);
        const generated = await persistGeneratedImage(userId, generatedRaw, 0);
        return res.status(200).json({
          success:true, ok:true, model:MODEL,
          image:generated, imageUrl:generated, url:generated,
          generatedImage:generated, images:[generated],
          colorImages:[generated], colourImages:[generated],
          balance:charge.balance, pro:proActive, proActive,
          monthlyPro, monthlyProActive:monthlyPro,
          monthlyProPlan:monthlyProStatus.plan,
          requestedImages:1, generatedImages:1, imageCount:1,
          poseCount:1, poses:["prompt-directed fashion composition"], poseImages:[generated],
          promptOnly:true, garmentReference:false,
          advancedFeatures:{monthlyProOnly:true,enabled:monthlyPro,fujifilmGFX100SII:monthlyPro,advancedPeople:monthlyPro,families:monthlyPro,groups:monthlyPro,children:monthlyPro,houses:monthlyPro,properties:monthlyPro,vehicles:monthlyPro,objects:monthlyPro,environments:monthlyPro},
          refunded:false
        });
      } catch (generationError) {
        if (charge.usedCredit && redis) {
          try {
            await refundCredit(userId, redis, charge.creditType);
            charge.usedCredit = false;
          } catch (refundError) {
            console.error("OBITREND prompt-only refund failed:", refundError);
          }
        }
        throw generationError;
      }
    }

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
        proActive,
        monthlyPro
      );

    /* =====================================================
    GENDER
    ===================================================== */

    const selectedGender =
      getModelGender(body);
    
const referenceMode =
  getReferenceSubjectMode(body);
    
    const isMale =
      selectedGender === "man";

    const genderLabel =
  selectedGender === "man"
    ? "ADULT MAN — MALE"
    : selectedGender === "woman"
      ? "ADULT WOMAN — FEMALE"
      : "AUTOMATIC REFERENCE SUBJECT DETECTION";

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
MONTHLY PRO STATUS
=========================================================

Monthly Pro active:
${monthlyPro ? "YES" : "NO"}

Server-verified plan:
${monthlyProStatus.plan || "STANDARD / FREE"}

=========================================================
ADVANCED CAMERA
=========================================================

${camera.proCamera ? camera.smartCamera : ""}

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
REFERENCE SUBJECT PROTECTION
=========================================================

The uploaded reference image is the primary visual source.

Preserve the uploaded garment exactly.
Preserve garment construction, shape, proportions, seams,
patterns, graphics, logos, colors, materials and visible details.

Do not redesign, replace, simplify, recolor or invent the garment.

If a person is present in the uploaded reference, preserve the
identity and natural appearance of that reference subject when
the selected workflow requires reference-subject preservation.

=========================================================
FULL-BODY PHOTOGRAPHY
=========================================================

When full-body framing is requested, show the complete person
from head to feet.

Keep the head naturally connected to the neck and body.
Use anatomically correct human proportions.
Use a natural upright fashion-model posture.
Do not create detached heads, duplicated limbs, missing limbs,
warped joints or unnatural body bending.

Keep sufficient space around the head and feet.
Avoid extreme wide-angle distortion.
Keep the main subject naturally centered.

=========================================================
FINAL QUALITY CONTROL
=========================================================

Before producing the final photograph, verify:

1. Uploaded garment is preserved.
2. Garment construction is preserved.
3. Garment color is preserved unless explicitly requested otherwise.
4. Selected gender is respected.
5. Primary subject is correctly represented.
6. Human anatomy is realistic.
7. Head, neck and body form one natural person.
8. Hands and feet are realistic.
9. No duplicated or missing limbs.
10. People are distinct.
11. Children are age-appropriate when requested.
12. Houses, vehicles and objects have realistic scale.
13. Camera perspective is believable.
14. Lighting is physically believable.
15. Selected pose is respected only when it maintains natural upright anatomy.
    The model must remain completely straight and vertically aligned.
    Do not allow sideways leaning, slouching, twisting, or unnatural bending.
16. Selected location is respected.
17. No watermark.
18. No random logos.
19. Exactly one finished photograph.
`;

        const generated =
          await generateOne(
            imageBase64,
            mimeType,
            finalPrompt,
            size
          );

        const savedGenerated = await persistGeneratedImage(userId, generated, images.length);
        images.push(savedGenerated);
        generatedImageCount = images.length;
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
          await refundCredit(userId, redis, charge.creditType);
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

    const firstImage =
      images[0];

    await sendImageReadyNotification(
      supabase,
      userId,
      firstImage || null
    );

    /* =====================================================
    RESPONSE
    ===================================================== */

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

    /*
    =========================================================
    AUTOMATIC IMAGE CREDIT RESTORATION
    =========================================================

    One image credit is reserved before generation starts.
    If the request fails before ANY image is successfully
    produced, restore that exact reserved credit.

    If an image was successfully produced, do not refund it.
    =========================================================
    */
    let creditRestored = false;
    if (
      charge?.usedCredit &&
      redis &&
      generatedImageCount === 0
    ) {
      try {
        await refundCredit(userId, redis, charge.creditType);
        creditRestored = true;
        console.log("OBITREND image credit restored after failed generation.");
      } catch (refundError) {
        console.error(
          "OBITREND failed-generation credit restoration failed:",
          refundError
        );
      }
    }

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

      backendError: message,
    });
  }
}
