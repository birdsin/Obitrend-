import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import OpenAI, { toFile } from "openai";
import { inflateSync, deflateSync } from "node:zlib";

import {
  spendCredit,
  refundCredit,
  getRedisConfig,
  getAuthenticatedUser,
  getProStatus,
  canUseCamera,
  getAllowedCamerasForPlan,
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
  /*
  Return a fresh Supabase signed URL for the private generated image.
  The file remains private in storage, while the browser can display the
  signed URL directly.
  */
  const { data: signed, error: signedError } = await supabase.storage
    .from(GENERATED_BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (signedError || !signed?.signedUrl) {
    throw signedError || new Error("Unable to create generated image URL.");
  }
  return signed.signedUrl;
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
COLOR PROMPT ENGINE
========================================================= */
function getColorPromptEngine(body){const raw=getValue(body,"colorInstructions","colourInstructions","colorPrompt","colourPrompt","objectColors","objectColours");if(!raw)return "";if(Array.isArray(raw))return raw.map(v=>String(v).trim()).filter(Boolean).join(". ");return String(raw).trim();}


/* =========================================================
EXACT USER ASPECT-RATIO ENGINE
========================================================= */

function getRequestedAspectRatio(body) {
  const promptText = String(
    getValue(
      body,
      "prompt",
      "description",
      "creativeDirection",
      "extra",
      "additionalPrompt"
    ) || ""
  );

  const promptMatch = promptText.match(
    /(?:^|\s|["'“”])((?:1:1|4:5|5:4|9:16|16:9))(?:$|\s|["'“”.,!?])/i
  );

  if (promptMatch?.[1]) {
    return promptMatch[1];
  }

  const selected = clean(
    getValue(body, "aspectRatio", "ratio"),
    "4:5"
  );

  const selectedMatch = selected.match(
    /(?:1:1|4:5|5:4|9:16|16:9)/i
  );

  return selectedMatch?.[0] || "5:4";
}

function cropPngDataUrlToRatio(dataUrl, requestedRatio) {
  const input = String(dataUrl || "");
  if (!/^data:image\/png;base64,/i.test(input)) return input;

  const ratioMatch = String(requestedRatio || "").match(
    /^(1:1|4:5|5:4|9:16|16:9)$/i
  );
  if (!ratioMatch) return input;

  const [targetWPart, targetHPart] = ratioMatch[1].split(":").map(Number);
  if (!targetWPart || !targetHPart) return input;

  try {
    const source = Buffer.from(input.split(",")[1], "base64");
    let offset = 8;
    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = 0;
    let interlace = 0;
    const idat = [];

    while (offset + 8 <= source.length) {
      const length = source.readUInt32BE(offset);
      const type = source.toString("ascii", offset + 4, offset + 8);
      const start = offset + 8;
      const end = start + length;

      if (end + 4 > source.length) return input;

      if (type === "IHDR") {
        width = source.readUInt32BE(start);
        height = source.readUInt32BE(start + 4);
        bitDepth = source[start + 8];
        colorType = source[start + 9];
        interlace = source[start + 12];
      } else if (type === "IDAT") {
        idat.push(source.subarray(start, end));
      } else if (type === "IEND") {
        break;
      }

      offset = end + 4;
    }

    // OpenAI PNG output is normally 8-bit RGBA. Keep this helper conservative
    // and leave unsupported PNG variants untouched rather than corrupting them.
    if (
      !width ||
      !height ||
      bitDepth !== 8 ||
      (colorType !== 6 && colorType !== 2) ||
      interlace !== 0 ||
      !idat.length
    ) {
      return input;
    }

    const bytesPerPixel = colorType === 6 ? 4 : 3;
    const rowBytes = width * bytesPerPixel;
    const decoded = inflateSync(Buffer.concat(idat));

    if (decoded.length < (rowBytes + 1) * height) {
      return input;
    }

    const pixels = Buffer.alloc(rowBytes * height);
    let sourceOffset = 0;

    function paeth(a, b, c) {
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      if (pa <= pb && pa <= pc) return a;
      if (pb <= pc) return b;
      return c;
    }

    for (let y = 0; y < height; y += 1) {
      const filter = decoded[sourceOffset++];
      const rowStart = y * rowBytes;
      const previousStart = (y - 1) * rowBytes;

      for (let x = 0; x < rowBytes; x += 1) {
        const raw = decoded[sourceOffset++];
        const left = x >= bytesPerPixel
          ? pixels[rowStart + x - bytesPerPixel]
          : 0;
        const up = y > 0
          ? pixels[previousStart + x]
          : 0;
        const upLeft =
          y > 0 && x >= bytesPerPixel
            ? pixels[previousStart + x - bytesPerPixel]
            : 0;

        let value = raw;

        if (filter === 1) {
          value = raw + left;
        } else if (filter === 2) {
          value = raw + up;
        } else if (filter === 3) {
          value = raw + Math.floor((left + up) / 2);
        } else if (filter === 4) {
          value = raw + paeth(left, up, upLeft);
        } else if (filter !== 0) {
          return input;
        }

        pixels[rowStart + x] = value & 255;
      }
    }

    // Choose the largest exact-integer-ratio crop that fits inside the
    // generated image. This guarantees the returned PNG has the requested
    // mathematical ratio rather than merely displaying it via CSS/prompt.
    const scale = Math.floor(
      Math.min(
        width / targetWPart,
        height / targetHPart
      )
    );

    if (scale < 1) return input;

    const cropWidth = targetWPart * scale;
    const cropHeight = targetHPart * scale;
    const left = Math.floor((width - cropWidth) / 2);
    const top = Math.floor((height - cropHeight) / 2);

    if (
      cropWidth === width &&
      cropHeight === height
    ) {
      return input;
    }

    const output = Buffer.alloc(
      (cropWidth * bytesPerPixel + 1) * cropHeight
    );

    for (let y = 0; y < cropHeight; y += 1) {
      const sourceRowStart =
        (top + y) * rowBytes +
        left * bytesPerPixel;
      const outputRowStart =
        y * (cropWidth * bytesPerPixel + 1);

      // Filter type 0 makes the encoder deterministic and simple.
      output[outputRowStart] = 0;

      pixels.copy(
        output,
        outputRowStart + 1,
        sourceRowStart,
        sourceRowStart + cropWidth * bytesPerPixel
      );
    }

    function crc32(buffer) {
      let crc = 0xffffffff;

      for (let i = 0; i < buffer.length; i += 1) {
        crc ^= buffer[i];

        for (let bit = 0; bit < 8; bit += 1) {
          crc =
            (crc >>> 1) ^
            (0xedb88320 & -(crc & 1));
        }
      }

      return (crc ^ 0xffffffff) >>> 0;
    }

    function pngChunk(type, data) {
      const typeBuffer = Buffer.from(type, "ascii");
      const chunk = Buffer.alloc(
        12 + data.length
      );

      chunk.writeUInt32BE(data.length, 0);
      typeBuffer.copy(chunk, 4);
      data.copy(chunk, 8);

      chunk.writeUInt32BE(
        crc32(
          Buffer.concat([
            typeBuffer,
            data
          ])
        ),
        8 + data.length
      );

      return chunk;
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(cropWidth, 0);
    ihdr.writeUInt32BE(cropHeight, 4);
    ihdr[8] = 8;
    ihdr[9] = colorType;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    const png = Buffer.concat([
      Buffer.from([
        137, 80, 78, 71,
        13, 10, 26, 10
      ]),
      pngChunk("IHDR", ihdr),
      pngChunk("IDAT", deflateSync(output)),
      pngChunk("IEND", Buffer.alloc(0))
    ]);

    return `data:image/png;base64,${png.toString("base64")}`;
  } catch (error) {
    console.error(
      "OBITREND exact aspect-ratio crop failed:",
      error?.message || error
    );
    return input;
  }
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
      cameraLighting: "cinematic evening lighting",
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
    getValue(body, "realisticCamera", "cameraType", "advancedCamera", "camera", "cameraStyle"),
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
OBITREND UNIVERSAL USER PROMPT + WORLD SCENE ENGINE
========================================================= */

function buildUserSceneIntelligencePrompt(userPrompt, monthlyPro = false) {
  const request = clean(userPrompt, "");
  if (!request) return "";

  return `
=========================================================
USER REQUEST — PRIMARY CREATIVE DIRECTION
=========================================================

USER'S EXACT REQUEST:
"${request}"

The user's explicit request is the primary creative direction.
Automatically understand the complete request before generating.

WORLDWIDE LOCATION INTELLIGENCE:
- Understand any region, continent, country, state/province, city,
  district, neighborhood, street, landmark, venue or real-world place
  named by the user.
- Preserve the most specific location the user requested.
- Do not replace an explicit location with a generic studio, hotel,
  lobby, restaurant, beach, city or other preset.
- Build the surrounding architecture, street/environmental details,
  people, traffic, vehicles, businesses and activities appropriate to
  the requested real-world location.
- If the user names a time such as morning, afternoon, sunset or night,
  follow it exactly.
- If the user names weather or atmosphere, follow it.

AUTOMATIC WORLD BUILDER:
Automatically determine what naturally belongs around the requested
location. When appropriate, include:
- multiple independent groups of people
- passers-by
- couples
- friends
- families
- parents with children
- shoppers
- tourists
- workers
- customers
- vehicles
- cars
- taxis
- buses
- motorcycles
- bicycles
- machines and equipment
- buildings
- storefronts
- street infrastructure
- furniture
- realistic environmental objects
- natural activities

Do not force every category into every scene. Only add elements that
naturally belong to the requested location.

PEOPLE VARIETY:
Every secondary person must be visually distinct.
Vary age, height, clothing, hairstyle, posture, activity, distance and
direction. Do not clone faces, bodies or clothing. Do not make everyone
face the camera or look at the primary model.

CHILDREN:
Children may appear when appropriate to the requested environment.
Keep them clearly age-appropriate, naturally accompanied when appropriate,
secondary to the main fashion subject, and never in adult fashion poses.

VEHICLES AND MACHINES:
Use only vehicles/machines appropriate to the requested location.
Maintain realistic proportions, perspective, contact with the ground,
shadows, reflections and spatial placement.

COLOR INTELLIGENCE:
If the user requests multiple colors, use ALL explicitly requested colors
in the same image when the wording asks for one image/scene. Do not select
only one color. Distribute the requested colors intelligently across the
requested outfit, accessories and/or environment according to what the
user actually asked for.
Do NOT recolor the uploaded garment unless the user explicitly asks for
the garment itself to change color.

POSE AND STYLE INTELLIGENCE:
- Follow explicit pose instructions.
- If the user requests multiple different poses/outputs, preserve the
  requested number and make the poses genuinely different.
- If the user requests multiple people with different poses in ONE image,
  keep them in one coherent scene with distinct natural poses.
- Follow the user's requested fashion style, mood and campaign direction.

ASPECT RATIO:
Respect the user's explicitly requested aspect ratio as an output
composition requirement. Keep framing and subject placement appropriate
to that ratio and do not substitute a different orientation.

REFERENCE PRIORITY:
The intended uploaded subject/product remains authoritative.
When a garment is supplied, preserve its design, construction, pattern,
graphics, embedded branding, material, color and visible details.
Do not copy unrelated background logos, signs, watermarks or scenery from
the reference image.

SCENE CONSISTENCY:
Everything visible must belong to one physically believable world.
Do not mix unrelated environments unless the user explicitly requests
the combination.

FINAL RULE:
The automatic engine COMPLETES the user's request.
It must not replace the user's explicit request with generic OBITREND
defaults.
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
OBITREND UNIVERSAL AUTOMATIC PROMPT ENGINE
=========================================================

The user can describe almost any creative subject in natural
language. This engine converts that request into explicit
visual instructions before the image model generates the result.

It automatically distinguishes the requested/reference role of:
- people: man, woman, model, child, family, couple, group, friends
- clothing: shirt, top, blouse, dress, skirt, trousers, jeans, pants,
  shorts, jacket, coat, suit, hoodie, uniform, outfit
- accessories: bag, handbag, shoes, sneakers, watch, glasses, jewelry,
  hat, belt and other fashion accessories
- products/objects: phones, furniture, electronics, food, equipment,
  sports items, beauty products, luggage and arbitrary props
- vehicles: cars, SUVs, motorcycles, bicycles, buses, boats, yachts,
  aircraft and other requested vehicles
- places: houses, villas, apartments, hotels, resorts, restaurants,
  shops, malls, airports, streets, beaches, offices, studios and
  other real-world environments
- mixed references containing several of the above

AUTOMATIC SUBJECT INTELLIGENCE:
1. Read the complete user request.
2. Inspect the uploaded reference image directly when one exists.
3. Determine what is actually important in the reference.
4. Separate PRIMARY SUBJECTS from incidental background content.
5. Preserve requested/reference products and subjects while rebuilding
   the environment according to the user's new instructions.
6. If several subjects are requested, keep them distinct and give each
   the correct physical scale, placement and relationship.
7. If the user asks for a change, apply the change only to the named
   subject/item unless the user explicitly requests a global change.
8. If the user gives a broad request, automatically complete missing
   photography, styling, composition, lighting, environment and prop
   decisions without asking the user to choose technical settings.

REFERENCE CONTAMINATION PROTECTION:
- Preserve logos, graphics, labels, patterns and text ONLY when they are
  physically part of the requested/reference product or garment.
- Do NOT copy unrelated signs, hotel logos, wall branding, posters,
  storefront marks, watermarks, captions or background text from a
  reference image into a newly requested environment.
- Do NOT copy the reference background merely because it is visible.
- When the user requests a new location, rebuild that location
  independently while preserving only the intended reference subject.
- Do NOT invent unrelated brand names, watermarks or readable signage.

PEOPLE:
If a person is the reference or explicitly requested subject, preserve
the requested gender, age category, appearance and natural anatomy.
If the user requests multiple people, make them distinct and natural.
Never replace a requested person with an unrelated object or vice versa.

PRODUCT / OBJECT:
If a bag, shoe, vehicle, furniture item, product or other object is the
reference, preserve its recognizable design, proportions, materials,
construction and visible details. Do not substitute a generic object.

CLOTHING:
When clothing is the reference, treat the garment as the authoritative
fashion product. Preserve its silhouette, construction, fabric, pattern,
graphics, garment-embedded logos and visible details. Put it on the
requested/appropriate model without importing unrelated background
elements from the source image.

WORLD BUILDER:
The user may request any coherent combination of people, clothing,
accessories, objects, vehicles, architecture, locations, weather,
lighting, time of day, activities, props, camera style and campaign
direction. Build all requested elements into one physically believable
scene. Keep scale, perspective, shadows, reflections, contact points and
spatial relationships realistic.

PROMPT PRIORITY:
User's explicit creative request > intended reference subject/product >
automatic scene completion > incidental reference background.

=========================================================

/* =========================================================
UNIVERSAL SUBJECT INTENT ENGINE
========================================================= */

function getSubjectIntent(body) {
  const explicit = clean(
    getValue(body,"subjectType","referenceSubject","generationSubject","subject","peopleType","peopleMode","sceneCategory","creativeCategory"), ""
  ).toLowerCase();
  const prompt = clean(getValue(body,"prompt","description","creativeDirection"), "").toLowerCase();
  const source = \`\${explicit} \${prompt}\`.trim();
  const has = (...patterns) => patterns.some((pattern) => pattern.test(source));

  if (has(/\b(family|families|parents?\s*(?:and|&)\s*children|mother\s*(?:and|&)\s*father)\b/))
    return { type:"family", label:"FAMILY", count:4 };
  if (has(/\b(companions?|friends?|best friends?|duo|pair)\b/))
    return { type:"companions", label:"COMPANIONS", count:2 };
  if (has(/\b(group|crowd|team|people|persons)\b/))
    return { type:"group", label:"GROUP", count:4 };
  if (has(/\b(child|children|kid|kids|boy|boys|girl|girls|toddler|baby|babies)\b/))
    return { type:"child", label:"CHILD", count:1 };
  if (has(/\b(man|men|male|gentleman|gentlemen)\b/))
    return { type:"man", label:"MAN", count:1 };
  if (has(/\b(lady|woman|women|female)\b/))
    return { type:"woman", label:"LADY", count:1 };
  if (has(/\b(car|cars|suv|vehicle|vehicles|truck|van|motorcycle|motorbike|bike|bicycle|boat|yacht)\b/))
    return { type:"vehicle", label:"VEHICLE", count:1 };
  if (has(/\b(house|home|villa|villas|mansion|apartment|apartments|building|architecture|property|properties|penthouse|penthouses)\b/))
    return { type:"architecture", label:"HOUSE / PROPERTY", count:1 };
  if (has(/\b(object|objects|product|products|furniture|phone|laptop|bag|handbag|shoe|shoes|watch|jewelry|jewellery|equipment|machine|prop|props)\b/))
    return { type:"object", label:"OBJECT / PRODUCT", count:1 };
  return { type:"auto", label:"AUTOMATIC", count:1 };
}

function buildSubjectIntentPrompt(intent) {
  if (!intent || intent.type === "auto") return \`
SUBJECT INTENT:
AUTOMATIC

Do not assume the primary subject is a woman or an adult fashion model.
Determine the requested primary subject from the user's words and the
uploaded reference image.
\`;

  if (["vehicle","architecture","object"].includes(intent.type)) return \`
=========================================================
EXPLICIT PRIMARY SUBJECT OVERRIDE — \${intent.label}
=========================================================

The user's request explicitly makes this the PRIMARY visual subject.
Do NOT replace it with an adult fashion model.
Preserve its exact category, recognizable design, proportions, materials,
construction, colors, visible details, realistic scale and perspective.

If a person wearing the uploaded garment is also explicitly requested,
include that person naturally while keeping the requested primary
object, vehicle or property clearly dominant.
\`;

  if (intent.type === "child") return \`
=========================================================
EXPLICIT PRIMARY SUBJECT OVERRIDE — CHILD
=========================================================

Generate a real, clearly age-appropriate CHILD as the PRIMARY SUBJECT.
Never turn the child into an adult.
Use age-appropriate face, body proportions, clothing, pose, behavior and
environment. If the uploaded garment is intended for the child, preserve
that garment exactly and fit it naturally to the child's body.
Never sexualize a child or use adult fashion poses.
\`;

  if (["family","companions","group"].includes(intent.type)) return \`
=========================================================
EXPLICIT PRIMARY SUBJECT OVERRIDE — \${intent.label}
=========================================================

Generate the requested \${intent.label.toLowerCase()} as the PRIMARY SUBJECT.
Use approximately \${intent.count} people unless the user states an exact
number. Every person must be visually distinct, naturally proportioned,
and naturally interacting. Do NOT collapse the request into one adult
fashion model. For families, preserve believable parent/child relationships.
If the uploaded garment is requested for the group, apply it only as the
user instructs and preserve its exact design and construction.
\`;

  return \`
=========================================================
EXPLICIT PRIMARY SUBJECT OVERRIDE — \${intent.label}
=========================================================

Generate the requested \${intent.label.toLowerCase()} as the PRIMARY SUBJECT.
Do NOT substitute a different gender or subject type.
If the uploaded garment is intended for this subject, preserve it exactly.
\`;
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

  const subjectIntent =
    getSubjectIntent(body);

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
  subjectIntent.type === "child"
    ? "age-appropriate realistic child subject"
    : ["family","companions","group"].includes(subjectIntent.type)
      ? "realistic people matching the explicitly requested group"
      : ["vehicle","architecture","object"].includes(subjectIntent.type)
        ? "not applicable — requested non-human subject is primary"
        : isMale
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
    "automatically determined from the user's prompt"
  );

  const scene = clean(
    getValue(
      body,
      "scene",
      "background",
      "backgroundPreset"
    ),
    "automatically determined from the user's prompt"
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

  const ratio = getRequestedAspectRatio(body);

  const extra = clean(
    getValue(
      body,
      "extra",
      "additionalPrompt"
    )
  );

  const objectPrompt = clean(
    getValue(
      body,
      "objectPrompt",
      "objectDescription",
      "objectInstruction",
      "objectInstructions"
    )
  );

  const objectPromptEngine = objectPrompt
    ? "=========================================================\nOBJECT PROMPT ENGINE\n=========================================================\n\nUSER OBJECT INSTRUCTION:\n" +
      objectPrompt +
      "\n\nOBJECT HANDLING RULES:\n" +
      "- Treat the requested object as a real, intentional visual subject or scene element.\n" +
      "- Preserve the requested object's exact category, recognizable identity, proportions, shape, construction, material, texture, color and important visible details.\n" +
      "- Keep realistic scale, perspective, contact with the ground or surrounding surfaces, shadows and lighting.\n" +
      "- If an uploaded reference object is present, use it as the authoritative visual reference for that object and do not redesign it.\n" +
      "- Do not replace a referenced object with a generic substitute.\n" +
      "- Do not remove a clearly requested or clearly visible important object.\n" +
      "- Do not invent logos, labels, text or brand markings that are not visible in the reference.\n" +
      "- Keep object edges, handles, doors, windows, controls, panels, seams, hardware and other visible construction details coherent.\n" +
      "- For furniture, vehicles, buildings, products, machines, accessories and props, preserve believable real-world construction and scale.\n" +
      "- For multiple objects, keep each object distinct and preserve the requested relationship between them.\n" +
      "- If the object is the primary subject, give it clear visual prominence while maintaining the requested fashion composition.\n"
    : "";

  const userPrompt = clean(
    getValue(
      body,
      "prompt",
      "description"
    )
  );

  const subjectIntentPrompt =
    buildSubjectIntentPrompt(subjectIntent);

  const userSceneIntelligence =
    buildUserSceneIntelligencePrompt(
      userPrompt,
      monthlyPro
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

  const colorPromptEngine = getColorPromptEngine(body);

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

${objectPromptEngine}

${monthlyPro
  ? "MONTHLY PRO ADVANCED GENERATION ENGINE ACTIVE"
  : "STANDARD GENERATION ENGINE ACTIVE"}

=========================================================
SUBJECT INTENT OVERRIDE
=========================================================

${subjectIntentPrompt}

=========================================================
PRIMARY IMAGE REFERENCE
=========================================================

The uploaded image is the PRIMARY and AUTHORITATIVE visual reference
for the intended subject or product.

The automatic reference engine determines whether the intended reference
is a person, garment, accessory, object, vehicle, property, architecture,
scene or a mixed reference.

When the intended reference is a garment, the garment is the actual product.
When the intended reference is an object, accessory or vehicle, that item
is the actual product.
When the intended reference is a person or scene, preserve the intended
person or scene according to the user's explicit request.

Do not treat the intended reference as mere inspiration.
Do not replace the intended reference with a generic substitute.
Do not redesign the intended reference unless the user explicitly asks
for a redesign or transformation.

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
- logos that are physically part of the garment
- labels that are physically attached to the garment
- stripes
- checks
- patterns
- pattern scale
- fabric texture

IMPORTANT GARMENT / BACKGROUND SEPARATION:
Preserve garment-embedded branding and graphics when they are part of
the actual clothing product.
Do NOT copy unrelated logos, signs, hotel branding, posters, wall text,
storefront branding, watermarks, captions or background labels from the
uploaded image.
If the user requests a new location, create that location independently.
Only reference elements belonging to the intended primary subject/product
should be carried into the new composition.
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

${colorPromptEngine ? "\n=========================================================\nCOLOR PROMPT ENGINE\n=========================================================\n\n" + colorPromptEngine + "\n\nApply every requested color only to the named item. A color instruction for trousers, skirt, shorts, shoes, bag or object must not recolor the uploaded top/garment unless that item is explicitly named. Preserve garment construction, pattern, logos, artwork, texture and all non-color details.\n" : ""}

TROUSERS / PANTS COLOUR:

${trousersColour}

The trousers/pants colour is independent from the garment.

Never transfer trouser colour onto the uploaded garment.

${
  variantColor
    ? `
REQUESTED GARMENT COLOUR VARIANT:

${variantColor}

Change only the garment colour to the selected colour while preserving
the garment's exact construction, pattern, graphics, logos, texture,
material, proportions and every non-colour detail.
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
REFERENCE PRODUCT PRIORITY
=========================================================

When clothing is present and is the intended reference, preserve the
uploaded garment exactly as the primary product reference.

When a bag, shoe, accessory, vehicle or other object is the intended
reference, preserve that item as the primary product reference instead.

When a person is the intended reference, preserve the requested person
characteristics and natural anatomy.

Do not redesign, replace, simplify or substitute the intended reference
unless the user explicitly asks for that change.

Do not transfer visual details from incidental background content onto
the intended reference.

The primary requested subject remains visually dominant.

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

The primary subject is determined by the SUBJECT INTENT OVERRIDE above.
Do not force an adult fashion model when the user requested a child,
family, companions, group, object, vehicle or property.

=========================================================
AUTOMATIC USER SCENE INTELLIGENCE
=========================================================

${userSceneIntelligence}

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
primary requested subject completely visible.

For a human primary subject, show the complete person when full-body
framing is requested. For a non-human primary subject, show the complete
requested object, vehicle or property with natural surrounding context.

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
FINAL AUTOMATIC INSTRUCTION PRIORITY
=========================================================

1. Explicit user creative request
2. Exact user-requested location
3. Exact user-requested time/weather
4. Intended uploaded/reference subject or product
5. Uploaded garment accuracy and construction
6. Explicitly requested colors
7. Explicitly requested people/groups
8. Explicitly requested pose(s)
9. Explicitly requested style
10. Location-aware people, vehicles, machines and environment
11. Camera realism
12. Automatic creative completion

Never override an explicit user location with a generic OBITREND location.
Never override an explicit time of day.
Never replace a requested street, city, venue or environment with a generic
studio, hotel or lobby.
Never discard explicitly requested colors.
Never discard explicitly requested surrounding activity.
Use all requested colors in the same image when the user asks for them in
one image.
Respect requested multiple poses according to whether the user requests
multiple outputs or multiple subjects in one image.
The automatic engine completes missing details; it does not replace
explicit user instructions.

If the intended reference is a garment, the final image must visibly
represent that same garment being realistically used or worn as requested.
If the intended reference is an object, accessory, vehicle, person,
property or scene, preserve that intended reference instead.
`;
}

/* =========================================================
OUTPUT COUNT
========================================================= */

function getOutputCount(body) {
  const selectedPoses = getValue(
    body,
    "poses",
    "poseList"
  );

  if (Array.isArray(selectedPoses)) {
    const selectedCount = selectedPoses
      .map((value) => String(value).trim())
      .filter(Boolean).length;

    if (selectedCount > 0) {
      return Math.min(selectedCount, 10);
    }
  }

  if (
    typeof selectedPoses === "string" &&
    selectedPoses.trim()
  ) {
    const selectedCount = selectedPoses
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean).length;

    if (selectedCount > 0) {
      return Math.min(selectedCount, 10);
    }
  }

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

  if (!Number.isFinite(n) || n < 1) {
    return 1;
  }

  return Math.min(Math.floor(n), 10);
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
  size,
  requestedRatio = "5:4"
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

  // Put the uploaded garment lock FIRST so it cannot be lost if the
  // provider prompt-length guard has to shorten the full automatic prompt.
  // Only the wearer, scene, pose, camera and explicitly requested colour
  // are allowed to change.
  const garmentLock = [
    "NON-NEGOTIABLE UPLOADED GARMENT REFERENCE",
    "",
    "The uploaded image is the EXACT garment product reference.",
    "The GARMENT itself is authoritative. The hanger, hand, shop,",
    "other clothes and background are NOT part of the garment.",
    "",
    "Transfer this exact garment onto the generated adult model.",
    "Preserve the garment actual neckline shape, depth and binding;",
    "shoulder straps and their exact placement and width;",
    "silhouette, proportions, length and hem shape;",
    "seams, stitching, panels, edges and construction;",
    "fabric type, knit/weave, thickness, texture and natural drape;",
    "original color and every visible garment detail.",
    "",
    "Do NOT redesign, reinterpret, beautify, simplify, replace or invent",
    "any part of the garment. Do NOT turn it into a generic similar top.",
    "Do NOT change the neckline, straps, silhouette, length, seams,",
    "fabric construction or other visible design details.",
    "",
    "ONLY change the wearer/model, pose, environment, camera and lighting,",
    "plus a garment color change when the user explicitly requested one.",
    "If any detail is uncertain, copy the visible garment exactly rather",
    "than inventing a different fashion design."
  ].join("\n");

  // Keep the existing image-edit prompt content, but preserve BOTH its
  // beginning and ending when shortening is required. This prevents the
  // final garment/reference protection rules from being cut off.
  const normalizedPrompt = String(prompt || "")
    .replace(/\s+/g, " ")
    .trim();

  const combinedPrompt = garmentLock + "\n\n" + normalizedPrompt;
  const maxPromptChars = 32000;

  const safePrompt =
    combinedPrompt.length <= maxPromptChars
      ? combinedPrompt
      : combinedPrompt.slice(0, 16000) +
        " IMPORTANT PROMPT CONTENT CONTINUES. " +
        combinedPrompt.slice(-15500);

  console.log("OBITREND prompt length:", safePrompt.length);

  let lastError = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
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

      const generated = `data:image/png;base64,${b64}`;
      return cropPngDataUrlToRatio(generated, requestedRatio);
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || 0);
      const retryable =
        status >= 500 ||
        /internal server error|temporarily unavailable|timeout|timed out|rate limit/i.test(
          String(error?.message || "")
        );

      console.error(
        "OBITREND OpenAI image edit failed:",
        {
          attempt,
          message: error?.message || "Unknown OpenAI error",
          status: error?.status || null,
          code: error?.code || null,
          type: error?.type || null,
          param: error?.param || null,
        }
      );

      if (!retryable || attempt === 2) break;
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
  }

  throw lastError || new Error("Image generation failed. Please try again.");
}


/* =========================================================
PROMPT-ONLY GENERATION
Used when the creator does not upload a garment.
========================================================= */
function buildAutomaticPromptOnlyPrompt(prompt) {
  return `
OBITREND AUTOMATIC FASHION CREATIVE DIRECTOR

UNIVERSAL FASHION SCENE COVERAGE

The user's text may describe almost any people, fashion item, accessory, object, product, vehicle, property, location, activity, campaign or visual concept.

OBITREND UNIVERSAL AUTOMATIC PROMPT ENGINE:
- Automatically identify the main subject requested by the user.
- Automatically distinguish people, clothing, accessories, objects, products,
  vehicles, buildings, locations and mixed scenes.
- Automatically complete missing camera, composition, lighting, styling and
  environment decisions.
- Keep requested/reference products visually consistent instead of replacing
  them with generic substitutes.
- Do not copy unrelated logos, signs, posters, watermarks or background
  branding from any reference.
- Treat garment-embedded logos/graphics as part of the garment when the
  garment itself is the intended reference.
- Build arbitrary combinations of people, clothes, bags, shoes, vehicles,
  furniture, architecture, locations, weather, time of day and activities
  into one coherent photorealistic scene.

The user's request is the creative direction. OBITREND should make the
technical and visual decisions automatically.

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

async function generateFromPrompt(prompt, size, requestedRatio = "5:4") {
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
  const generated = `data:image/png;base64,${b64}`;
  return cropPngDataUrlToRatio(generated, requestedRatio);
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

    /*
    =====================================================
    SERVER-SIDE ACCESS POLICY
    =====================================================

    FREE users may create images only with their 2 weekly
    free credits.

    Paid Pro users spend their paid Pro credits first.

    Monthly Pro is required for the advanced feature set.
    Standard paid plans can use the standard Pro image
    generation features, but cannot unlock Monthly-only
    camera/people/scene engines.

    No browser flag can promote an account to Monthly Pro.
    */
    /*
    =====================================================
    CAMERA ACCESS — SERVER ENFORCED
    =====================================================
    The browser may request a camera, but the server decides
    whether the authenticated paid plan is allowed to use it.
    =====================================================
    */
    const requestedCamera = clean(
      getValue(
        body,
        "cameraStyle",
        "realisticCamera",
        "cameraType",
        "advancedCamera",
        "camera"
      ),
      ""
    );

    if (
      requestedCamera &&
      requestedCamera !== "AI Smart Camera"
    ) {
      const currentPro = await getProStatus(
        userId,
        getRedisConfig()
      );

      if (
        !currentPro?.active ||
        !canUseCamera(currentPro?.plan, requestedCamera)
      ) {
        return res.status(403).json({
          success: false,
          error: "🔒 This camera is locked for your current Pro plan.",
          upgradeRequired: true,
          cameraLocked: true,
          requestedCamera,
          plan: currentPro?.plan || null,
          allowedCameras: getAllowedCamerasForPlan(currentPro?.plan)
        });
      }
    }

    const supabase =
      storageClient();

    redis = getRedisOrNull();

    /* =====================================================
    CREDIT CHARGE
    PRO credits are used first; eligible users can also use
    their available free image credits. The credit engine is
    the single source of truth for access and balance.
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
        const promptOnlyRatio = getRequestedAspectRatio(body);
        const promptOnlySize = getImageSize(promptOnlyRatio);
        const automaticPrompt = buildAutomaticPromptOnlyPrompt(promptOnly);
        const generatedRaw = await generateFromPrompt(automaticPrompt, promptOnlySize, promptOnlyRatio);
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

    const requestedRatio =
      getRequestedAspectRatio(body);

    const size =
      getImageSize(requestedRatio);

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

${poses.length > 1 ? `=========================================================
MULTI-POSE OUTPUT MODE
=========================================================

This is standalone pose output ${index + 1} of ${poses.length}.
Generate EXACTLY ONE pose in this image: ${pose}.
Do NOT combine, stack, collage, split-screen, duplicate or show multiple poses in one image.
Each pose output must be a complete standalone photograph using the requested aspect ratio.
` : ""}

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

The uploaded reference image is the primary visual source for the
intended subject/product identified by the automatic reference engine.

If a garment is the intended reference, preserve garment construction,
shape, proportions, seams, patterns, graphics, garment-embedded logos,
colors, materials and visible details.
If another product or subject is intended, preserve its corresponding
recognizable design, proportions, materials and visible details.

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
            size,
            requestedRatio
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
      GENERATION ERROR
      =====================================================

      The outer handler below is the SINGLE credit-refund
      boundary. Do not refund here as well, otherwise one
      failed generation can restore the same credit twice.
      =====================================================
      */

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

    const rawMessage =
      error?.message ||
      "OBITREND could not complete the generation request.";
    const message =
      /internal server error|temporarily unavailable|timeout|timed out/i.test(String(rawMessage))
        ? "The image service was temporarily unavailable. Your image credit has been restored. Please try again."
        : rawMessage;

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

    if (status === 429) {
      const providerQuota =
        /insufficient_quota|credit_balance_exhausted|no credits remaining|add credits to continue/i.test(String(message));

      return res.status(429).json({
        success: false,
        error: providerQuota
          ? "The image service provider has no available API quota right now. Your OBITREND image credit has been restored because no image was generated. Please try again after the image service API quota is available."
          : "The image service is temporarily rate-limited. Your OBITREND image credit has been restored because no image was generated. Please wait a moment and try again.",
        providerQuota,
        creditRestored,
        upgradeRequired: false
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
