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
COMPLETE GENERATION FLOW

FLOW

USER
  ↓
OBITREND LOGIN / AUTHENTICATION
  ↓
CHECK USER SUBSCRIPTION
  ↓
CHECK OBITREND CREDIT
  ↓
HAS CREDIT?
  ├── NO → STOP → SHOW UPGRADE MESSAGE
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
    OPENAI FAILURE
        ↓
    REFUND 1 CREDIT

IMPORTANT

- One successful OpenAI image = one OBITREND credit
- Multiple images = multiple credits
- Failed OpenAI generation = automatic refund
- Pro subscription does NOT automatically mean unlimited
  credit usage unless credits.js explicitly handles it
- Browser userId is never trusted
- Authentication comes from getAuthenticatedUser()
- GPT-Image-2 image editing is preserved
- Existing frontend response fields are preserved
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

const MAX_IMAGE_BYTES =
  9 * 1024 * 1024;

const MAX_OUTPUTS = 10;

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
  if (!input) {
    return null;
  }

  let value =
    String(input).trim();

  if (
    value.startsWith("data:image/")
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

function getMimeType(input) {
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

function getImageSize(value) {
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

function getColourList(body) {
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

function getNestedImageInput(body) {
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

function getOutputCount(body) {
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
PRO STATUS
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
      plan: "free",
      fullPro: false,
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

      plan:
        clean(
          status?.plan ||
          status?.subscription ||
          status?.tier,
          "free"
        ),

      fullPro:
        Boolean(
          status?.fullPro ||
          status?.full_pro ||
          status?.plan ===
            "monthly"
        ),
    };
  } catch {
    return {
      active: false,
      plan: "free",
      fullPro: false,
    };
  }
}

/* =========================================================
ONE CREDIT
========================================================= */

async function deductOneCredit(
  userId,
  redis
) {
  if (
    !redis
  ) {
    return {
      success: false,
      balance: 0,
    };
  }

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

    balance:
      result?.balance ??
      null,
  };
}

/* =========================================================
REFUND ONE CREDIT
========================================================= */

async function refundOneCredit(
  userId,
  redis
) {
  if (
    !redis
  ) {
    return false;
  }

  try {
    await refundCredit(
      userId,
      redis
    );

    return true;
  } catch {
    return false;
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
      model: MODEL,
      image: imageFile,
      prompt,
      size,
      quality: "high",
      output_format: "png",
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
        "OpenAI is not configured.",
    });
  }

  try {
    /* =====================================================
    1. AUTHENTICATION
    ===================================================== */

    const auth =
      await getAuthenticatedUser(
        req
      );

    if (
      !auth?.ok ||
      !auth?.user?.id
    ) {
      return res.status(
        401
      ).json({
        success: false,
        error:
          "Please log in to continue.",
      });
    }

    const userId =
      auth.user.id;

    /* =====================================================
    2. REDIS / CREDIT SYSTEM
    ===================================================== */

    const redis =
      getRedisOrNull();

    if (!redis) {
      return res.status(
        503
      ).json({
        success: false,
        error:
          "OBITREND credit service is unavailable.",
      });
    }

    /* =====================================================
    3. SUBSCRIPTION CHECK
    ===================================================== */

    const subscription =
      await getSubscriptionStatus(
        userId,
        redis
      );

    /* =====================================================
    4. IMAGE INPUT
    ===================================================== */

    const body =
      req.body || {};

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
          "Please upload a clothing image first.",
      });
    }

    const mimeType =
      getMimeType(
        imageInput
      );

    /* =====================================================
    5. DETERMINE NUMBER OF ACTUAL GENERATIONS
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

    /*
    =========================================================
    IMPORTANT CREDIT RULE

    EVERY OpenAI GENERATION HAS ITS OWN CREDIT.

    Example:

    1 image requested
       = 1 credit

    5 images requested
       = 5 credits

    10 images requested
       = 10 credits

    A credit is NEVER deducted only once for a multi-image
    request.
    =========================================================
    */

    for (
      let index = 0;
      index < poses.length;
      index += 1
    ) {
      const pose =
        poses[index];

      /* ===================================================
      6. CHECK + DEDUCT EXACTLY ONE CREDIT
      =================================================== */

      const charge =
        await deductOneCredit(
          userId,
          redis
        );

      /*
      NO CREDIT
      ↓
      STOP IMMEDIATELY
      */

      if (
        !charge.success
      ) {
        /*
        If some images were already generated in this
        request, those successful generations remain charged.

        The failed attempt itself did not consume a credit.
        */

        if (
          images.length === 0
        ) {
          return res.status(
            402
          ).json({
            success: false,
            error:
              "Your credits are finished. Please upgrade to continue.",
            upgradeRequired:
              true,
            balance:
              charge.balance,
            pro:
              subscription.active,
            plan:
              subscription.plan,
            fullPro:
              subscription.fullPro,
          });
        }

        break;
      }

      /* ===================================================
      7. BUILD IMAGE PROMPT
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
      8. CALL OPENAI
      =================================================== */

      try {
        const generated =
          await generateOne(
            imageBase64,
            mimeType,
            singleImagePrompt,
            size
          );

        /* ================================================
        9. SUCCESS

        Credit stays spent.
        ================================================ */

        images.push(
          generated
        );
      } catch (
        openAIError
      ) {
        /* ================================================
        10. OPENAI FAILED

        Refund exactly the one credit deducted immediately.
        ================================================ */

        await refundOneCredit(
          userId,
          redis
        );

        /*
        Stop the campaign after the failed generation.
        Already-successful images remain valid.
        */

        break;
      }
    }

    /* =====================================================
    11. NOTHING GENERATED
    ===================================================== */

    if (
      images.length === 0
    ) {
      return res.status(
        402
      ).json({
        success: false,
        error:
          "Your credits are finished. Please upgrade to continue.",
        upgradeRequired:
          true,
        balance:
          null,
        pro:
          subscription.active,
        plan:
          subscription.plan,
        fullPro:
          subscription.fullPro,
      });
    }

    /* =====================================================
    12. RESPONSE
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
        null,

      pro:
        subscription.active,

      plan:
        subscription.plan,

      fullPro:
        subscription.fullPro,

      requestedImages:
        outputCount,

      generatedImages:
        images.length,

      imageCount:
        images.length,

      poseCount:
        images.length,

      poses:
        poses.slice(
          0,
          images.length
        ),

      poseImages:
        images,

      refunded:
        false,
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
        "Image generation failed.",
    });
  }
}
