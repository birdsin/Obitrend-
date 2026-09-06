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
SECURE IMAGE GENERATION API

IMPORTANT:
- OBITREND credits are separate from OpenAI billing.
- Customer credit balance comes from the server.
- OpenAI errors are NEVER exposed to customers.
- Failed generations refund the OBITREND credit.
- MODEL GENDER IS ENFORCED SERVER-SIDE.
=========================================================
*/

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

const MAX_COLOUR_IMAGES = 4;

const MAX_IMAGE_BYTES =
  9 * 1024 * 1024;

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
GENDER NORMALIZATION
========================================================= */

function normalizeGender(value) {
  const gender =
    clean(value).toLowerCase();

  if (
    gender === "man" ||
    gender === "male" ||
    gender === "boy" ||
    gender === "adult man" ||
    gender.includes("adult man") ||
    gender.includes("male")
  ) {
    return "male";
  }

  if (
    gender === "woman" ||
    gender === "female" ||
    gender === "girl" ||
    gender === "adult woman" ||
    gender.includes("adult woman") ||
    gender.includes("female")
  ) {
    return "female";
  }

  return "";
}


/* =========================================================
AGE GROUP
========================================================= */

function getAgeGroup(body) {
  return clean(
    getValue(
      body,
      "ageGroup",
      "age_group",
      "selectedAgeGroup",
      "age"
    ),
    "Adult — 18+"
  );
}


/* =========================================================
MODEL GENDER
========================================================= */

function getModelGender(body) {
  const rawGender =
    getValue(
      body,
      "modelGender",
      "gender",
      "selectedGender",
      "model_gender",
      "selectedModelGender"
    );

  const normalized =
    normalizeGender(rawGender);

  /*
   * If the browser sends a recognized gender,
   * that gender becomes the authoritative choice.
   */

  if (normalized) {
    return normalized;
  }

  /*
   * Some versions of the UI may encode gender
   * inside the age-group field.
   */

  const ageGender =
    normalizeGender(
      getAgeGroup(body)
    );

  if (ageGender) {
    return ageGender;
  }

  return "";
}


/* =========================================================
SAFE MODEL DESCRIPTION
========================================================= */

function getModelInstruction(body) {
  const gender =
    getModelGender(body);

  const ageGroup =
    getAgeGroup(body);

  const selectedModel =
    clean(
      getValue(
        body,
        "model",
        "lady",
        "selectedModel"
      )
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

  /*
   * CRITICAL:
   *
   * Gender selection overrides the selected model name.
   *
   * This prevents a female name such as "Amina"
   * from causing a female result when the user selected Man.
   */

  if (gender === "male") {
    return {
      gender: "male",
      model: "adult male fashion model",
      ageGroup,
      bodyStyle,
      selectedModel,
    };
  }

  if (gender === "female") {
    return {
      gender: "female",
      model:
        selectedModel ||
        "adult female fashion model",
      ageGroup,
      bodyStyle,
      selectedModel,
    };
  }

  /*
   * Unknown gender:
   * use the selected model only if there is no
   * conflicting gender selection.
   */

  return {
    gender: "",
    model:
      selectedModel ||
      "adult fashion model",
    ageGroup,
    bodyStyle,
    selectedModel,
  };
}


/* =========================================================
BASE64
========================================================= */

function normalizeBase64(input) {
  if (!input) {
    return null;
  }

  let value = String(input).trim();

  if (value.startsWith("data:image/")) {
    const comma = value.indexOf(",");

    if (comma !== -1) {
      value = value.slice(comma + 1);
    }
  }

  value = value.replace(/\s/g, "");

  return value.length >= 100
    ? value
    : null;
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
  if (mime.includes("png")) {
    return "png";
  }

  if (mime.includes("webp")) {
    return "webp";
  }

  return "jpg";
}


/* =========================================================
IMAGE SIZE
========================================================= */

function getImageSize(value) {
  const ratio = clean(value, "9:16").toLowerCase();

  if (
    ratio.includes("1:1") ||
    ratio.includes("square")
  ) {
    return "1024x1024";
  }

  if (
    ratio.includes("9:16") ||
    ratio.includes("portrait") ||
    ratio.includes("4:5") ||
    ratio.includes("5:4")
  ) {
    return "1024x1536";
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
COLOURS
========================================================= */

function getColourList(body) {
  const raw = getValue(
    body,
    "clothingColors",
    "colors",
    "selectedColors"
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
        .map((value) =>
          String(value).trim()
        )
        .filter(Boolean)
    ),
  ].slice(0, MAX_COLOUR_IMAGES);
}


/* =========================================================
   PROMPT — FULL MODEL + GARMENT FIDELITY
========================================================= */

function buildPrompt(
  body,
  variantColor = ""
) {
  const modelInfo = getModelInstruction(body);

  const gender = modelInfo.gender;
  const model = modelInfo.model;
  const bodyStyle = modelInfo.bodyStyle;
  const ageGroup = modelInfo.ageGroup;

  const pose = clean(
    getValue(body, "pose"),
    "standing naturally and confidently"
  );

  const fashionStyle = clean(
    getValue(
      body,
      "fashionStyle",
      "style"
    ),
    "luxury commercial fashion"
  );

  const country = clean(
    getValue(body, "country")
  );

  const city = clean(
    getValue(body, "city")
  );

  const scene = clean(
    getValue(
      body,
      "scene",
      "background"
    ),
    "luxury professional fashion studio"
  );

  const car = clean(
    getValue(
      body,
      "car",
      "vehicle"
    ),
    "no vehicle unless requested"
  );

  const camera = clean(
    getValue(
      body,
      "camera",
      "lighting"
    ),
    "professional full-body commercial fashion photography"
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

  const location = [
    city,
    country
  ]
    .filter(Boolean)
    .join(", ");

  const companionMode = getBoolean(
    body,
    "hasCompanion",
    "companionMode",
    "preserveCompanion"
  );


  /* =======================================================
     SERVER-ENFORCED MODEL GENDER
  ======================================================= */

  let genderInstruction = "";

  if (gender === "male") {
    genderInstruction = `
=========================================================
MANDATORY MODEL GENDER — ADULT MALE
=========================================================

The selected model gender is MAN.

Generate one clearly ADULT MALE fashion model,
18 years or older.

The main model must be:
- male
- adult
- masculine adult facial structure
- masculine adult body anatomy
- professionally styled for a commercial fashion campaign

Do not generate a female model.

MODEL GENDER HAS HIGHER PRIORITY THAN ANY MODEL NAME
OR OTHER CONFLICTING FIELD.
`;
  }

  if (gender === "female") {
    genderInstruction = `
=========================================================
MANDATORY MODEL GENDER — ADULT FEMALE
=========================================================

The selected model gender is WOMAN.

Generate one clearly ADULT FEMALE fashion model,
18 years or older.

The main model must be:
- female
- adult
- feminine adult facial structure
- natural adult body anatomy
- professionally styled for a commercial fashion campaign

Do not generate a male model.

MODEL GENDER HAS HIGHER PRIORITY THAN ANY MODEL NAME
OR OTHER CONFLICTING FIELD.
`;
  }


  /* =======================================================
     MAIN PROMPT
  ======================================================= */

  return `
OBITREND AI FASHION CREATOR
PROFESSIONAL COMMERCIAL FASHION PHOTOGRAPHY MODE.

Create one polished, photorealistic, professional fashion
campaign photograph.

The purpose of this image is commercial clothing presentation.

The presentation must remain:
- professional
- tasteful
- non-sexual
- fashion-focused
- suitable for a normal commercial fashion catalogue
- suitable for an online clothing store

Do not create erotic, provocative, intimate, fetish-oriented,
or sexually suggestive imagery.

=========================================================
PRIMARY REFERENCE — UPLOADED GARMENT
=========================================================

The uploaded clothing photograph is the PRIMARY and
AUTHORITATIVE visual reference for the garment.

The uploaded garment is an actual clothing product.

Treat the uploaded garment as a product that must be
reproduced faithfully on the selected adult model.

Do not treat the garment as generic fashion inspiration.

Preserve the garment's visual identity as accurately as
the image-generation system allows.

=========================================================
GARMENT FIDELITY
=========================================================

Preserve:

- garment category
- garment type
- silhouette
- overall shape
- proportions
- length
- width
- neckline
- collar
- shoulder shape
- straps
- sleeves
- arm openings
- waist construction
- seams
- stitching
- panels
- darts
- pleats
- gathers
- ruching
- folds
- draping
- hem
- cuffs
- buttons
- zippers
- closures
- ties
- pockets
- trim
- embroidery
- graphics
- artwork
- logos
- lettering
- stripes
- checks
- patterns
- borders
- fabric texture
- material
- fabric finish
- colour
- colour relationships
- pattern placement
- pattern direction
- front construction
- back construction
- fastening details

The garment must remain recognizably the SAME garment
shown in the uploaded reference.

Do not redesign it.

Do not replace it.

Do not simplify it.

Do not invent additional clothing details.

Do not turn it into another clothing category.

Do not substitute generic clothing.

=========================================================
REFERENCE SEPARATION
=========================================================

Use the uploaded image primarily to understand the garment.

Do NOT copy unrelated elements from the original reference,
including:

- original person's identity
- original person's face
- original person's body
- original person's pose
- original person's hairstyle
- original person's accessories
- original person's shoes
- original person's handbag
- original person's background
- original person's location

The selected OBITREND model and selected scene must be used.

The GARMENT is the primary product reference.

=========================================================
MODEL
=========================================================

Selected model:
${model}

Age group:
${ageGroup}

Body style:
${bodyStyle}

Pose:
${pose}

Fashion style:
${fashionStyle}

${genderInstruction}

The main model must be an adult.

Keep the presentation professional and fashion-focused.

=========================================================
FULL MODEL PRESERVATION
=========================================================

The MAIN MODEL is a PRIMARY subject.

The complete main model must remain inside the image.

Show the model from the TOP OF THE HEAD to the BOTTOM OF
BOTH FEET.

The following must all remain visible:

- entire head
- entire hair
- entire neck
- both shoulders
- both arms
- both hands
- complete torso
- waist
- hips
- both legs
- both ankles
- both feet
- complete footwear

Do NOT crop any part of the main model.

Do NOT crop the head.

Do NOT crop the hair.

Do NOT crop either hand.

Do NOT crop the torso.

Do NOT crop the hips.

Do NOT crop either leg.

Do NOT crop either ankle.

Do NOT crop either foot.

Do NOT create a close-up.

Do NOT create a portrait crop.

Do NOT create a waist-up image.

Do NOT create a half-body image.

Do NOT create a knee-up image.

Do NOT zoom the camera too close.

Use sufficient camera distance to keep the COMPLETE MODEL
comfortably inside the frame.

Leave natural breathing room above the head.

Leave natural breathing room below both feet.

Keep both feet completely inside the image boundaries.

The model must not touch or cross the image edges.

=========================================================
COMPLETE OUTFIT VISIBILITY
=========================================================

The COMPLETE uploaded garment must remain visible whenever
the garment's design permits.

Do not hide important garment details behind:

- hands
- arms
- accessories
- bags
- vehicles
- furniture
- other people
- environmental objects

The garment remains the primary fashion product.

If a pose would hide an important garment feature,
use a more neutral professional pose.

=========================================================
COMPOSITION PRIORITY
=========================================================

When deciding how to compose the photograph, use this priority:

1. Complete adult model visibility
2. Complete garment visibility
3. Accurate garment reproduction
4. Correct model gender
5. Natural garment fit
6. Professional fashion pose
7. Scene and location
8. Vehicle and background details

Never sacrifice the model's full-body visibility just to
make the background larger or more dramatic.

The background is SECONDARY.

The main model and garment are PRIMARY.

=========================================================
ASPECT RATIO
=========================================================

Requested aspect ratio:
${ratio}

If portrait:

Use a vertical full-body fashion composition.

If landscape:

Still keep the complete adult model visible from head
to feet.

The requested aspect ratio must NEVER be used as a reason
to crop the model.

=========================================================
SCENE
=========================================================

Setting:
${scene}

${location ? `Location: ${location}` : ""}

Vehicle:
${car}

The environment must support the fashion campaign.

Do not allow the environment to cover the model or garment.

=========================================================
PHOTOGRAPHY
=========================================================

Camera:
${camera}

Create:

- photorealistic adult anatomy
- realistic face
- realistic skin
- realistic hair
- realistic hands
- realistic feet
- realistic garment fit
- realistic fabric behaviour
- realistic folds
- realistic seams
- realistic material
- realistic shadows
- realistic reflections
- realistic lighting
- natural perspective
- natural depth of field
- premium commercial fashion photography
- high-end editorial quality

=========================================================
PROFESSIONAL PRESENTATION
=========================================================

The model must be presented as a professional adult fashion
model in a normal commercial clothing campaign.

Use a natural, confident, tasteful fashion pose.

Avoid:

- sexualized posing
- intimate framing
- erotic presentation
- fetish presentation
- provocative camera angles
- unnecessary body emphasis
- close framing of intimate areas
- transparent or revealing presentation
- nudity

The focus is the CLOTHING PRODUCT and professional
fashion photography.

=========================================================
ANATOMY AND QUALITY
=========================================================

Avoid:

- cropped body
- cropped head
- cropped hands
- cropped legs
- cropped feet
- extra fingers
- malformed hands
- extra limbs
- duplicated limbs
- distorted face
- distorted body
- melted clothing
- warped clothing
- floating clothing
- plastic skin
- CGI appearance
- cartoon appearance
- anime appearance
- illustration appearance
- random text
- fake logos
- watermarks

=========================================================
COMPANION
=========================================================

${
  companionMode
    ? `
A companion may be included because the user explicitly
requested one.

Keep the main adult model and the uploaded garment as the
primary subjects.

The companion must not cover, replace, redesign, or alter
the main model's garment.
`
    : `
Do not add unrelated people from the uploaded reference.
`
}

=========================================================
GARMENT COLOUR VARIANT
=========================================================

${
  variantColor
    ? `
The user requested this garment colour variant:

${variantColor}

Change ONLY the colour of the garment.

Do NOT change:

- garment category
- silhouette
- proportions
- construction
- neckline
- sleeves
- seams
- stitching
- stripes
- graphics
- artwork
- buttons
- zippers
- trims
- fabric
- pattern
- garment details

The colour change must not redesign the garment.
`
    : `
Preserve the original garment colour shown in the uploaded
reference unless a specific colour instruction was provided
by the user.
`
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
EXTRA INSTRUCTIONS
=========================================================

${
  extra
    ? extra
    : ""
}

=========================================================
FINAL NON-NEGOTIABLE PRIORITY
=========================================================

The final image must look like a professional photograph
of the SELECTED ADULT MODEL wearing the SAME CLOTHING
PRODUCT shown in the uploaded reference.

Priority order:

1. Correct adult model gender
2. Complete model from head to feet
3. Complete garment visibility
4. Uploaded garment fidelity
5. Garment construction
6. Garment colour
7. Natural garment fit
8. Professional pose
9. Requested location
10. Requested vehicle
11. Background styling

If any styling instruction conflicts with the uploaded
garment, preserve the uploaded garment.

If any model-name instruction conflicts with Model Gender,
Model Gender wins.

If the selected model is MAN, generate an adult male.

If the selected model is WOMAN, generate an adult female.

Never replace the uploaded garment with generic clothing.

Never intentionally crop the main model.

Never intentionally crop either foot.

Never intentionally crop the complete garment.

The result must be a professional, tasteful,
non-sexual commercial fashion photograph.
`;
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
SPEND CREDIT
========================================================= */

async function spendIfNeeded(
  userId,
  redis
) {
  if (!redis) {
    return {
      success: false,
      balance: 0,
      usedCredit: false,
      reason: "credit_service_unavailable",
      upgradeRequired: false,
    };
  }

  const spent =
    await spendCredit(
      userId,
      redis
    );

  return {
    ...spent,
    usedCredit:
      Boolean(spent?.success),
  };
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

  if (!inputBuffer.length) {
    throw new Error(
      "IMAGE_INPUT_INVALID"
    );
  }

  if (
    inputBuffer.length >
    MAX_IMAGE_BYTES
  ) {
    throw new Error(
      "IMAGE_INPUT_TOO_LARGE"
    );
  }

  const imageFile =
    await toFile(
      inputBuffer,
      `clothing-reference.${extensionFromMime(
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
    result?.data?.[0]?.b64_json;

  if (!b64) {
    throw new Error(
      "IMAGE_RESULT_EMPTY"
    );
  }

  return `data:image/png;base64,${b64}`;
}


/* =========================================================
CUSTOMER-SAFE ERROR RESPONSE
========================================================= */

function sendSafeGenerationError(
  res,
  error
) {
  /*
   * Technical details remain server-side.
   * Customers never receive:
   *
   * - 429
   * - OpenAI billing URLs
   * - API messages
   * - stack traces
   * - Redis errors
   * - environment-variable errors
   */

  console.error(
    "OBITREND generation failure:",
    error
  );

  return res.status(500).json({
    success: false,
    ok: false,

    error:
      "We couldn't create your fashion image right now. Please try again.",

    userMessage:
      "We couldn't create your fashion image right now. Please try again."
  });
}


/* =========================================================
API HANDLER
========================================================= */

export default async function handler(
  req,
  res
) {
  if (req.method !== "POST") {
    res.setHeader(
      "Allow",
      "POST"
    );

    return res.status(405).json({
      success: false,
      ok: false,
      error:
        "This action is not available right now."
    });
  }


  /* -------------------------------------------------------
     OPENAI KEY
     ------------------------------------------------------- */

  if (!process.env.OPENAI_API_KEY) {
    console.error(
      "OPENAI_API_KEY is missing."
    );

    return res.status(503).json({
      success: false,
      ok: false,
      error:
        "Image generation is temporarily unavailable.",
      userMessage:
        "Image generation is temporarily unavailable. Please try again later."
    });
  }


  try {
    const body =
      req.body || {};


    /* -----------------------------------------------------
       IMAGE
       ----------------------------------------------------- */

    const imageInput =
      getValue(
        body,
        "imageBase64",
        "uploadedImage",
        "image",
        "clothingImage",
        "referenceImage"
      );

    const imageBase64 =
      normalizeBase64(
        imageInput
      );

    if (!imageBase64) {
      return res.status(400).json({
        success: false,
        ok: false,
        error:
          "Please upload a clothing image first."
      });
    }

    const mimeType =
      getMimeType(
        imageInput
      );


    /* -----------------------------------------------------
       AUTHENTICATION
       ----------------------------------------------------- */

    const auth =
      await getAuthenticatedUser(
        req
      );

    if (!auth.ok) {
      return res.status(
        auth.status
      ).json({
        success: false,
        ok: false,
        error:
          "Please sign in to continue."
      });
    }


    /*
     * NEVER trust userId from the browser.
     */
    const userId =
      auth.user.id;


    /* -----------------------------------------------------
       REDIS
       ----------------------------------------------------- */

    const redis =
      getRedisOrNull();

    if (!redis) {
      return res.status(503).json({
        success: false,
        ok: false,
        error:
          "Image generation is temporarily unavailable.",
        userMessage:
          "Image generation is temporarily unavailable. Please try again later."
      });
    }


    /* -----------------------------------------------------
       SPEND ONE OBITREND CREDIT
       ----------------------------------------------------- */

    const charge =
      await spendIfNeeded(
        userId,
        redis
      );

    if (!charge.success) {

      /*
       * This is an OBITREND credit decision.
       * It has nothing to do with OpenAI billing.
       */

      if (
        charge.reason ===
          "no_pro_credits" ||
        charge.reason ===
          "no_free_credits"
      ) {
        return res.status(402).json({
          success: false,
          ok: false,

          error:
            "You have no OBITREND credits remaining.",

          userMessage:
            "You have no credits remaining. Upgrade to a Pro package to continue.",

          upgradeRequired: true,

          balance:
            Number(
              charge.balance || 0
            ),

          proActive:
            charge.proActive === true,

          proCredits:
            Number(
              charge.proCredits || 0
            )
        });
      }

      return res.status(503).json({
        success: false,
        ok: false,

        error:
          "Image generation is temporarily unavailable.",

        userMessage:
          "Image generation is temporarily unavailable. Please try again later."
      });
    }


    const proActive =
      charge.proActive === true;


    /* -----------------------------------------------------
       COLOURS
       ----------------------------------------------------- */

    const colours =
      getColourList(
        body
      );

    const prompts =
      colours.length
        ? colours.map(
            (color) =>
              buildPrompt(
                body,
                color
              )
          )
        : [
            buildPrompt(
              body
            )
          ];


    /* -----------------------------------------------------
       SIZE
       ----------------------------------------------------- */

    const size =
      getImageSize(
        getValue(
          body,
          "aspectRatio",
          "ratio"
        )
      );


    const images = [];


    /* -----------------------------------------------------
       GENERATE
       ----------------------------------------------------- */

    try {

      for (
        const prompt of prompts.slice(
          0,
          MAX_COLOUR_IMAGES
        )
      ) {

        images.push(
          await generateOne(
            imageBase64,
            mimeType,
            prompt,
            size
          )
        );
      }

    } catch (
      generationError
    ) {

      /*
       * The OBITREND credit was already spent.
       *
       * If OpenAI fails — including billing,
       * quota, temporary failure, etc. —
       * return the credit to the user.
       */

      try {
        if (
          charge.usedCredit &&
          redis
        ) {
          await refundCredit(
            userId,
            redis
          );
        }
      } catch (
        refundError
      ) {
        console.error(
          "OBITREND refund failed:",
          refundError
        );
      }

      /*
       * NEVER expose generationError.message.
       */

      return sendSafeGenerationError(
        res,
        generationError
      );
    }


    /* -----------------------------------------------------
       RESULT
       ----------------------------------------------------- */

    const firstImage =
      images[0];


    return res.status(200).json({
      success: true,
      ok: true,

      model: MODEL,

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
        Number(
          charge.balance || 0
        ),

      pro:
        proActive
    });

  } catch (error) {

    /*
     * SERVER LOG ONLY.
     * NEVER send error.message to customer.
     */

    return sendSafeGenerationError(
      res,
      error
    );
  }
}
