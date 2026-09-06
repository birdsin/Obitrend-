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
COMPLETE SECURE GENERATION FLOW

USER
  ↓
LOGIN
  ↓
SUPABASE AUTHENTICATION
  ↓
CHECK ACTIVE PLAN
  ↓
CHECK CREDIT
  ↓
HAS CREDIT?
  ├── NO → STOP → UPGRADE
  │
  └── YES
        ↓
    DEDUCT 1 CREDIT
        ↓
    CALL OPENAI
        ↓
    GENERATE IMAGE
        ↓
    SUCCESS → KEEP CREDIT SPENT
        ↓
    OPENAI FAILURE → REFUND SAME CREDIT

CREDIT RULE

FREE
3 credits

4 DAYS
₦10,000
5 credits
small features

8 DAYS
₦20,000
10 credits
small features

14 DAYS
₦30,000
15 credits
limited Pro

MONTHLY
₦60,000
30 credits
full Pro

IMPORTANT

- One successful OpenAI generation = one credit
- Multiple generated images = multiple credits
- OpenAI failure refunds the exact credit charged
- Paid users do NOT receive unlimited generation
- Browser user ID is NEVER trusted
- Authentication comes from Supabase
- Uploaded garment remains the strict visual reference
- Existing frontend response aliases are preserved
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


/* =========================================================
OPENAI
========================================================= */

const MODEL =
  process.env.OPENAI_IMAGE_MODEL ||
  "gpt-image-2";


const openai = new OpenAI({
  apiKey:
    process.env.OPENAI_API_KEY,
});


/* =========================================================
LIMITS
========================================================= */

const MAX_COLOUR_IMAGES = 4;

const MAX_IMAGE_BYTES =
  9 * 1024 * 1024;

const MAX_OUTPUTS = 10;


/* =========================================================
HELPERS
========================================================= */

function clean(
  value,
  fallback = ""
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return fallback;
  }

  return String(value).trim();
}


function getValue(
  body,
  ...names
) {
  for (
    const name of names
  ) {
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


function getBoolean(
  body,
  ...names
) {
  for (
    const name of names
  ) {
    const value =
      body?.[name];

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

function normalizeBase64(
  input
) {
  if (!input) {
    return null;
  }

  let value =
    String(input).trim();

  if (
    value.startsWith(
      "data:image/"
    )
  ) {
    const comma =
      value.indexOf(",");

    if (comma !== -1) {
      value =
        value.slice(
          comma + 1
        );
    }
  }

  value =
    value.replace(
      /\s/g,
      ""
    );

  return value.length >= 100
    ? value
    : null;
}


/* =========================================================
MIME
========================================================= */

function getMimeType(
  input
) {
  const match =
    String(input || "").match(
      /^data:(image\/[a-zA-Z0-9.+-]+);base64,/i
    );

  return match
    ? match[1].toLowerCase()
    : "image/jpeg";
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


/* =========================================================
IMAGE SIZE
========================================================= */

function getImageSize(
  value
) {
  const ratio =
    clean(
      value,
      "5:4"
    ).toLowerCase();

  if (
    ratio.includes("1:1") ||
    ratio.includes("square")
  ) {
    return "1024x1024";
  }

  if (
    ratio.includes("9:16") ||
    ratio.includes("portrait")
  ) {
    return "1024x1536";
  }

  return "1536x1024";
}


/* =========================================================
COLOURS
========================================================= */

function getColourList(
  body
) {
  const raw =
    getValue(
      body,
      "clothingColors",
      "colors",
      "selectedColors"
    );

  let list = [];

  if (
    Array.isArray(raw)
  ) {
    list = raw;
  } else if (
    typeof raw === "string" &&
    raw.trim()
  ) {
    list =
      raw
        .split(",")
        .map(
          (item) =>
            item.trim()
        );
  }

  return [
    ...new Set(
      list
        .map(
          (value) =>
            String(value).trim()
        )
        .filter(Boolean)
    ),
  ].slice(
    0,
    MAX_COLOUR_IMAGES
  );
}


/* =========================================================
IMAGE INPUT
========================================================= */

function getNestedImageInput(
  body
) {
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


  return imageInput;
}


/* =========================================================
PROMPT
========================================================= */

function buildPrompt(
  body,
  variantColor = "",
  selectedPose = ""
) {

  const allowColourChange =
    getBoolean(
      body,
      "changeGarmentColor",
      "changeClothingColor",
      "allowGarmentColorChange",
      "variantColorChange"
    );


  const model =
    clean(
      getValue(
        body,
        "model",
        "lady",
        "selectedModel"
      ),
      "adult fashion model"
    );


  const bodyStyle =
    clean(
      getValue(
        body,
        "bodyStyle",
        "body",
        "body_type"
      ),
      "natural balanced"
    );


  const pose =
    clean(
      selectedPose ||
        getValue(
          body,
          "pose"
        ),
      "standing confidently"
    );


  const fashionStyle =
    clean(
      getValue(
        body,
        "fashionStyle",
        "style"
      ),
      "luxury editorial"
    );


  const country =
    clean(
      getValue(
        body,
        "country"
      )
    );


  const city =
    clean(
      getValue(
        body,
        "city"
      )
    );


  const scene =
    clean(
      getValue(
        body,
        "scene",
        "background"
      ),
      "luxury fashion studio"
    );


  const car =
    clean(
      getValue(
        body,
        "car",
        "vehicle"
      ),
      "no vehicle unless appropriate"
    );


  const camera =
    clean(
      getValue(
        body,
        "camera",
        "lighting"
      ),
      "high-end commercial fashion photography"
    );


  const ratio =
    clean(
      getValue(
        body,
        "aspectRatio",
        "ratio"
      ),
      "5:4"
    );


  const extra =
    clean(
      getValue(
        body,
        "extra",
        "additionalPrompt"
      )
    );


  const userPrompt =
    clean(
      getValue(
        body,
        "prompt",
        "description"
      )
    );


  const location = [
    city,
    country,
  ]
    .filter(Boolean)
    .join(", ");


  const companionMode =
    getBoolean(
      body,
      "hasCompanion",
      "companionMode",
      "preserveCompanion"
    );


  return `
OBITREND STRICT GARMENT REPRODUCTION MODE.

The uploaded image is the PRIMARY AND STRICT VISUAL REFERENCE
for the GARMENT.

Create one photorealistic fashion photograph where the selected
adult model is wearing the SAME garment shown in the uploaded
reference.

The uploaded garment is NOT generic inspiration.

Preserve the garment as accurately as possible.

=========================================================
REFERENCE IMAGE
=========================================================

Use the uploaded image to understand the garment.

Ignore the original person's:

- identity
- face
- body
- age
- pose
- hairstyle
- accessories
- shoes
- handbag
- background
- location

Preserve the garment.

If multiple garment views are visible, use all visible views
to understand its construction.

=========================================================
GARMENT PRESERVATION
=========================================================

Preserve:

- garment category
- garment type
- silhouette
- proportions
- length
- neckline
- collar
- straps
- sleeves
- arm openings
- waist shaping
- darts
- seams
- stitching
- panels
- pleats
- gathers
- folds
- draping
- hem
- buttons
- zippers
- ties
- pockets
- embroidery
- prints
- artwork
- logos
- labels
- lettering
- stripes
- checks
- patterns
- borders
- trim
- fabric texture
- fabric finish
- original colour
- colour relationships
- front construction
- back construction
- fastening details

Do not simplify the garment.

Do not redesign the garment.

Do not replace it with a generic fashion outfit.

=========================================================
PROHIBITIONS
=========================================================

Never:

- redesign the garment
- replace the garment
- change its category
- change its silhouette
- change its neckline
- add sleeves that are not present
- remove sleeves that are present
- add a belt that is not present
- remove a belt that is present
- change buttons
- change stripe direction
- change stripe spacing
- change print placement
- remove logos
- remove lettering
- invent panels
- turn the garment into another outfit
- substitute a different outfit

=========================================================
MODEL
=========================================================

Model:
${model}

Body style:
${bodyStyle}

Pose:
${pose}

The model is an adult fashion model.

=========================================================
SCENE
=========================================================

Setting:
${scene}

${
  location
    ? `Location: ${location}`
    : ""
}

Vehicle:
${car}

The environment must not alter the garment.

=========================================================
PHOTOGRAPHY
=========================================================

Fashion style:
${fashionStyle}

Camera:
${camera}

Aspect ratio:
${ratio}

Create:

- photorealistic adult anatomy
- realistic face
- realistic hands
- realistic skin
- realistic hair
- realistic garment fit
- realistic garment-to-body contact
- realistic fabric folds
- realistic stitching
- realistic shadows
- realistic reflections
- physically plausible lighting
- realistic materials
- premium commercial fashion photography
- luxury editorial quality
- natural depth of field

Avoid:

- CGI appearance
- plastic skin
- fake fabric
- distorted anatomy
- distorted hands
- extra fingers
- melted clothing details
- random text
- watermark

=========================================================
COMPANION
=========================================================

${
  companionMode
    ? `
Keep a companion only if explicitly requested by the frontend.
The companion must not replace or alter the adult model's garment.
`
    : `
Do not copy unrelated people from the reference image.
`
}

=========================================================
COLOUR VARIANT
=========================================================

${
  variantColor &&
  allowColourChange
    ? `
Create the requested garment colour variant:

${variantColor}

Change ONLY the garment colour.

Keep identical:

- garment category
- silhouette
- construction
- stripes
- graphics
- buttons
- seams
- trims
- fabric
- proportions
- all other garment details

Do not redesign the garment.
`
    : ""
}

=========================================================
USER REQUEST
=========================================================

${
  userPrompt
    ? userPrompt
    : ""
}

=========================================================
EXTRA DIRECTION
=========================================================

${
  extra
    ? extra
    : ""
}

=========================================================
FINAL PRIORITY
=========================================================

1. Uploaded garment accuracy
2. Garment construction
3. Garment details
4. Photorealistic model
5. Garment fit
6. Requested pose
7. Requested scene
8. Requested location
9. Requested vehicle
10. Requested fashion styling

If anything conflicts with the garment,
preserve the garment.

The final photograph must visibly represent
the SAME garment from the uploaded reference.
`;
}


/* =========================================================
OUTPUT COUNT
========================================================= */

function getOutputCount(
  body
) {

  const raw =
    getValue(
      body,
      "outputCount",
      "numberOfOutputs",
      "imageCount",
      "numberOfImages",
      "poseCount",
      "numberOfPoses",
      "selectedPoseCount"
    );


  const n =
    Number(raw);


  if (
    !Number.isFinite(n) ||
    n < 1
  ) {
    return 1;
  }


  return Math.min(
    Math.floor(n),
    MAX_OUTPUTS
  );
}


/* =========================================================
POSES
========================================================= */

function getPoseList(
  body,
  count
) {

  const raw =
    getValue(
      body,
      "poses",
      "poseList"
    );


  let list = [];


  if (
    Array.isArray(raw)
  ) {
    list = raw;

  } else if (
    typeof raw === "string" &&
    raw.trim()
  ) {

    list =
      raw.split(",");

  } else {

    const single =
      clean(
        getValue(
          body,
          "pose"
        )
      );

    if (single) {
      list = [single];
    }
  }


  list =
    list
      .map(
        (value) =>
          String(value).trim()
      )
      .filter(Boolean);


  const defaults = [

    "confident editorial standing pose, full body, natural hands",

    "natural three-quarter standing pose, elegant posture",

    "fashion walking pose with natural movement",

    "relaxed editorial seated pose, garment clearly visible",

    "side-angle editorial pose showing garment silhouette",

    "confident over-the-shoulder fashion pose",

    "natural candid fashion pose, relaxed arms",

    "strong runway-inspired standing pose",

    "elegant movement pose with realistic fabric motion",

    "premium campaign pose with clear garment visibility",

  ];


  const result = [];


  for (
    const pose of list
  ) {

    if (
      !result.includes(
        pose
      )
    ) {
      result.push(
        pose
      );
    }


    if (
      result.length >= count
    ) {
      break;
    }
  }


  for (
    const pose of defaults
  ) {

    if (
      result.length >= count
    ) {
      break;
    }


    if (
      !result.includes(
        pose
      )
    ) {
      result.push(
        pose
      );
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
SUBSCRIPTION
========================================================= */

async function getSubscriptionStatus(
  userId,
  redis
) {

  if (
    !redis ||
    !userId
  ) {

    return {
      active: false,
      paid: false,
      pro: false,
      plan: null,
      planName: null,
      featureLevel: "free",
      fullPro: false,
      expiresAt: null,
      proCredits: 0,
      proCreditsTotal: 0
    };
  }


  try {

    const status =
      await getProStatus(
        userId,
        redis
      );


    return {

      active:
        Boolean(
          status?.active
        ),

      paid:
        Boolean(
          status?.paid
        ),

      pro:
        Boolean(
          status?.pro
        ),

      plan:
        clean(
          status?.plan,
          ""
        ),

      planName:
        clean(
          status?.planName,
          ""
        ),

      featureLevel:
        clean(
          status?.featureLevel,
          "free"
        ),

      fullPro:
        Boolean(
          status?.fullPro
        ),

      expiresAt:
        status?.expiresAt ||
        null,

      proCredits:
        Number(
          status?.proCredits || 0
        ),

      proCreditsTotal:
        Number(
          status?.proCreditsTotal || 0
        )
    };

  } catch {

    return {

      active: false,
      paid: false,
      pro: false,
      plan: null,
      planName: null,
      featureLevel: "free",
      fullPro: false,
      expiresAt: null,
      proCredits: 0,
      proCreditsTotal: 0
    };
  }
}


/* =========================================================
DEDUCT ONE CREDIT
========================================================= */

async function deductOneCredit(
  userId,
  redis
) {

  const result =
    await spendCredit(
      userId,
      redis
    );


  return {

    success:
      Boolean(
        result?.success
      ),

    allowed:
      Boolean(
        result?.allowed ??
        result?.success
      ),

    upgradeRequired:
      Boolean(
        result?.upgradeRequired
      ),

    creditType:
      result?.creditType ||
      null,

    balance:
      result?.remaining ??
      result?.balance ??
      null,

    plan:
      result?.plan ||
      null,

    featureLevel:
      result?.featureLevel ||
      "free",

    fullPro:
      Boolean(
        result?.fullPro
      ),

    expiresAt:
      result?.expiresAt ||
      null,

    resetAt:
      result?.resetAt ||
      null,

    message:
      result?.message ||
      "Your credits are finished. Please upgrade to continue."
  };
}


/* =========================================================
REFUND THE EXACT CREDIT
========================================================= */

async function refundOneCredit(
  userId,
  redis,
  creditType
) {

  try {

    const result =
      await refundCredit(
        userId,
        redis,
        creditType
      );


    return {

      success:
        Boolean(
          result?.success
        ),

      creditType:
        result?.creditType ||
        creditType ||
        null,

      remaining:
        result?.remaining ??
        null
    };

  } catch {

    return {
      success: false,
      creditType:
        creditType ||
        null,
      remaining: null
    };
  }
}


/* =========================================================
OPENAI IMAGE GENERATION
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


  if (
    !inputBuffer.length
  ) {

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

      model:
        MODEL,

      image:
        imageFile,

      prompt:
        prompt,

      size:
        size,

      quality:
        "high",

      output_format:
        "png",
    });


  const b64 =
    result?.data?.[0]
      ?.b64_json;


  if (!b64) {

    throw new Error(
      "OpenAI did not return a generated image."
    );
  }


  return `data:image/png;base64,${b64}`;
}


/* =========================================================
GET CURRENT BALANCE
========================================================= */

async function getCurrentStatus(
  userId,
  redis
) {

  const subscription =
    await getSubscriptionStatus(
      userId,
      redis
    );


  if (
    subscription.active
  ) {

    return {

      balance:
        subscription.proCredits,

      pro:
        subscription.pro,

      paid:
        subscription.paid,

      active:
        subscription.active,

      plan:
        subscription.plan,

      planName:
        subscription.planName,

      featureLevel:
        subscription.featureLevel,

      fullPro:
        subscription.fullPro,

      expiresAt:
        subscription.expiresAt,

      proCredits:
        subscription.proCredits,

      proCreditsTotal:
        subscription.proCreditsTotal
    };
  }


  /*
  ---------------------------------------------------------
  FREE BALANCE

  We intentionally use the credits endpoint through the
  existing spend/refund system rather than trusting the
  browser.
  ---------------------------------------------------------
  */

  return {

    balance: null,

    pro: false,

    paid: false,

    active: false,

    plan: null,

    planName: null,

    featureLevel: "free",

    fullPro: false,

    expiresAt: null,

    proCredits: 0,

    proCreditsTotal: 0
  };
}


/* =========================================================
API HANDLER
========================================================= */

export default async function handler(
  req,
  res
) {

  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate"
  );

  res.setHeader(
    "Pragma",
    "no-cache"
  );


  /* =======================================================
  METHOD
  ======================================================= */

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
        "Method not allowed."
    });
  }


  /* =======================================================
  OPENAI CONFIGURATION
  ======================================================= */

  if (
    !process.env.OPENAI_API_KEY
  ) {

    return res.status(
      500
    ).json({

      success: false,

      error:
        "OpenAI is not configured."
    });
  }


  try {

    /* =====================================================
    1. AUTHENTICATE USER

    IMPORTANT:
    getAuthenticatedUser() from credits.js returns the USER
    DIRECTLY.

    It does NOT return:
      { ok, user }

    ===================================================== */

    const auth =
      await getAuthenticatedUser(
        req
      );


    if (
      !auth?.id
    ) {

      return res.status(
        401
      ).json({

        success: false,

        error:
          "Please log in to continue.",

        upgradeRequired:
          false
      });
    }


    const userId =
      auth.id;


    /* =====================================================
    2. REDIS
    ===================================================== */

    const redis =
      getRedisOrNull();


    if (!redis) {

      return res.status(
        503
      ).json({

        success: false,

        error:
          "OBITREND credit service is unavailable."
      });
    }


    /* =====================================================
    3. CHECK SUBSCRIPTION
    ===================================================== */

    let subscription =
      await getSubscriptionStatus(
        userId,
        redis
      );


    /* =====================================================
    4. REQUEST BODY
    ===================================================== */

    const body =
      req.body || {};


    /* =====================================================
    5. IMAGE INPUT
    ===================================================== */

    const imageInput =
      getNestedImageInput(
        body
      );


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
          "Please upload a clothing image first."
      });
    }


    const mimeType =
      getMimeType(
        imageInput
      );


    /* =====================================================
    6. GENERATION SETTINGS
    ===================================================== */

    const outputCount =
      getOutputCount(
        body
      );


    const poses =
      getPoseList(
        body,
        outputCount
      );


    const colours =
      getColourList(
        body
      );


    const size =
      getImageSize(
        getValue(
          body,
          "aspectRatio",
          "ratio"
        )
      );


    const images = [];

    const usedPoses = [];

    let lastRefunded =
      false;


    /* =====================================================
    7. GENERATE EACH IMAGE

    EVERY IMAGE GETS ONE CREDIT.
    ===================================================== */

    for (
      let index = 0;
      index < poses.length;
      index += 1
    ) {

      const pose =
        poses[index];


      /* ===================================================
      DEDUCT ONE CREDIT
      =================================================== */

      const charge =
        await deductOneCredit(
          userId,
          redis
        );


      /* ===================================================
      NO CREDIT

      STOP IMMEDIATELY.
      =================================================== */

      if (
        !charge.success
      ) {

        /*
        If previous images succeeded, return those images.

        Their credits remain spent.

        The image that could not start consumed no credit.
        */

        if (
          images.length === 0
        ) {

          return res.status(
            402
          ).json({

            success: false,

            error:
              charge.message ||
              "Your credits are finished. Please upgrade to continue.",

            upgradeRequired:
              true,

            balance:
              charge.balance,

            creditType:
              charge.creditType,

            pro:
              subscription.pro,

            paid:
              subscription.paid,

            active:
              subscription.active,

            plan:
              subscription.plan,

            planName:
              subscription.planName,

            featureLevel:
              subscription.featureLevel,

            fullPro:
              subscription.fullPro,

            expiresAt:
              subscription.expiresAt,

            proCredits:
              subscription.proCredits,

            proCreditsTotal:
              subscription.proCreditsTotal
          });
        }


        break;
      }


      /* ===================================================
      BUILD PROMPT
      =================================================== */

      const variantColor =
        colours.length > 0
          ? colours[
              index %
                colours.length
            ]
          : "";


      const basePrompt =
        buildPrompt(
          body,
          variantColor,
          pose
        );


      const singleImagePrompt = `
${basePrompt}

=========================================================
ONE IMAGE / ONE POSE
=========================================================

Generate EXACTLY ONE finished fashion photograph.

Show:

- exactly one adult model
- exactly one pose
- exactly one finished scene

Do NOT create:

- a collage
- split screen
- multiple frames
- before/after panels
- multiple poses
- multiple models
- duplicate views

Selected pose:

${pose}

The uploaded garment remains the primary visual reference.
`;


      /* ===================================================
      CALL OPENAI
      =================================================== */

      try {

        const generated =
          await generateOne(
            imageBase64,
            mimeType,
            singleImagePrompt,
            size
          );


        /* =================================================
        SUCCESS

        CREDIT STAYS SPENT.
        ================================================= */

        images.push(
          generated
        );

        usedPoses.push(
          pose
        );

      } catch (
        openAIError
      ) {

        /*
        ---------------------------------------------------
        OPENAI FAILED

        Refund EXACTLY the bucket that was charged.
        ---------------------------------------------------
        */

        const refund =
          await refundOneCredit(
            userId,
            redis,
            charge.creditType
          );


        lastRefunded =
          Boolean(
            refund.success
          );


        /*
        Stop this generation request.

        Previously successful images remain valid.
        */

        break;
      }
    }


    /* =====================================================
    8. NO IMAGE GENERATED
    ===================================================== */

    if (
      images.length === 0
    ) {

      /*
      Refresh subscription because it may have expired
      during the request.
      */

      subscription =
        await getSubscriptionStatus(
          userId,
          redis
        );


      return res.status(
        402
      ).json({

        success: false,

        error:
          lastRefunded
            ? "Image generation failed. Your credit has been refunded."
            : "Your credits are finished. Please upgrade to continue.",

        upgradeRequired:
          !lastRefunded,

        balance:
          subscription.active
            ? subscription.proCredits
            : null,

        pro:
          subscription.pro,

        paid:
          subscription.paid,

        active:
          subscription.active,

        plan:
          subscription.plan,

        planName:
          subscription.planName,

        featureLevel:
          subscription.featureLevel,

        fullPro:
          subscription.fullPro,

        expiresAt:
          subscription.expiresAt,

        proCredits:
          subscription.proCredits,

        proCreditsTotal:
          subscription.proCreditsTotal,

        refunded:
          lastRefunded
      });
    }


    /* =====================================================
    9. REFRESH SUBSCRIPTION / CREDIT STATUS
    ===================================================== */

    subscription =
      await getSubscriptionStatus(
        userId,
        redis
      );


    const current =
      await getCurrentStatus(
        userId,
        redis
      );


    /* =====================================================
    10. SUCCESS RESPONSE
    ===================================================== */

    const firstImage =
      images[0];


    return res.status(
      200
    ).json({

      success: true,

      ok: true,


      model:
        MODEL,


      image:
        firstImage,


      imageUrl:
        firstImage,


      url:
        firstImage,


      generatedImage:
        firstImage,


      images:
        images,


      colorImages:
        images,


      colourImages:
        images,


      balance:
        current.balance,


      pro:
        current.pro,


      paid:
        current.paid,


      active:
        current.active,


      plan:
        current.plan,


      planName:
        current.planName,


      featureLevel:
        current.featureLevel,


      fullPro:
        current.fullPro,


      expiresAt:
        current.expiresAt,


      proCredits:
        current.proCredits,


      proCreditsTotal:
        current.proCreditsTotal,


      requestedImages:
        outputCount,


      generatedImages:
        images.length,


      imageCount:
        images.length,


      poseCount:
        images.length,


      poses:
        usedPoses,


      poseImages:
        images,


      refunded:
        false
    });


  } catch (
    error
  ) {

    console.error(
      "OBITREND generation error:",
      error
    );


    return res.status(
      500
    ).json({

      success: false,

      error:
        error?.message ||
        "Image generation failed."
    });
  }
}
