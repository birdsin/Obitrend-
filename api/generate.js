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
CLOTHING PROMPT
========================================================= */

function buildPrompt(
  body,
  variantColor = ""
) {
  const modelInfo =
    getModelInstruction(body);

  const gender =
    modelInfo.gender;

  const model =
    modelInfo.model;

  const bodyStyle =
    modelInfo.bodyStyle;

  const ageGroup =
    modelInfo.ageGroup;

  const pose = clean(
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
    "luxury fashion studio"
  );

  const car = clean(
    getValue(
      body,
      "car",
      "vehicle"
    ),
    "no vehicle unless appropriate"
  );

  const camera = clean(
    getValue(
      body,
      "camera",
      "lighting"
    ),
    "high-end commercial fashion photography"
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


  /* =======================================================
     SERVER-ENFORCED MODEL RULE
     ======================================================= */

  let genderInstruction = "";

  if (gender === "male") {
    genderInstruction = `
=========================================================
MANDATORY MODEL GENDER — MALE
=========================================================

The selected Model Gender is MAN.

Generate an ADULT MALE model.

The final subject MUST be:
- male
- adult
- 18+
- clearly masculine in facial structure
- clearly masculine in body anatomy
- male hairstyle appropriate to the fashion campaign

ABSOLUTELY DO NOT generate:
- a woman
- a female model
- a feminine model
- a female face
- female body anatomy

The browser's female model selection MUST be ignored
because Model Gender = Man.

Even if another field contains a female model name,
female description, or female option, the MAN selection
has higher priority.

MODEL GENDER IS NON-NEGOTIABLE.
`;
  }

  if (gender === "female") {
    genderInstruction = `
=========================================================
MANDATORY MODEL GENDER — FEMALE
=========================================================

The selected Model Gender is WOMAN.

Generate an ADULT FEMALE model.

The final subject MUST be:
- female
- adult
- 18+
- feminine adult facial structure
- natural feminine adult body anatomy

Do not generate a male model.

MODEL GENDER IS NON-NEGOTIABLE.
`;
  }


  return `
OBITREND STRICT GARMENT REPRODUCTION MODE.

The uploaded image is the PRIMARY VISUAL REFERENCE
for the GARMENT.

Create a new photorealistic fashion photograph where
the selected adult model wears the SAME garment shown
in the uploaded reference.

The uploaded garment is NOT generic inspiration.

Preserve the garment as accurately as possible.

=========================================================
GARMENT
=========================================================

Preserve:

- exact garment category
- exact garment type
- exact silhouette
- exact proportions
- exact length
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
- belts only if present
- pockets
- embroidery
- prints
- artwork
- logos
- lettering
- stripes
- checks
- patterns
- borders
- trim
- fabric texture
- fabric finish
- color
- color relationships
- front construction
- back construction
- fastening details

Do not simplify or redesign the garment.

=========================================================
REFERENCE RULE
=========================================================

Ignore the original person's:

- identity
- face
- body
- age
- pose
- hairstyle
- accessories
- handbag
- shoes
- background
- location

The GARMENT is the primary reference.

=========================================================
PROHIBITIONS
=========================================================

Never:

- redesign the garment
- replace the garment
- randomly recolor the garment
- change its category
- change its neckline
- change its collar
- add sleeves that are not present
- remove sleeves that are present
- add a belt that is not present
- remove a belt that is present
- change buttons
- change stripe direction
- change stripe spacing
- change print placement
- remove embroidery
- remove logos
- remove lettering
- invent panels
- turn it into another outfit
- substitute generic clothing

=========================================================
MODEL
=========================================================

Model:
${model}

Age Group:
${ageGroup}

Body style:
${bodyStyle}

Pose:
${pose}

Fashion style:
${fashionStyle}

${genderInstruction}

The model must be an adult.

=========================================================
SCENE
=========================================================

Setting:
${scene}

${location ? `Location: ${location}` : ""}

Vehicle:
${car}

The environment must support the campaign
without changing the garment.

=========================================================
PHOTOGRAPHY
=========================================================

Camera:
${camera}

Aspect ratio:
${ratio}

Create:

- photorealistic adult anatomy
- realistic hands
- realistic face
- realistic skin
- realistic hair
- realistic garment fit
- realistic fabric folds
- realistic seams
- realistic shadows
- realistic lighting
- realistic materials
- premium commercial fashion photography
- high-end editorial quality
- natural depth of field

Avoid:

- CGI appearance
- plastic skin
- fake fabric
- distorted anatomy
- extra fingers
- distorted hands
- melted garment details
- random text
- watermark

=========================================================
COMPANION
=========================================================

${
  companionMode
    ? `
Keep the companion only when explicitly requested.
Do not allow the companion to replace or alter the
adult model's garment.
`
    : `
Do not copy unrelated people from the reference.
`
}

=========================================================
COLOUR VARIANT
=========================================================

${
  variantColor
    ? `
Create this requested garment colour variant:

${variantColor}

Change ONLY the garment colour.

Keep identical:

- category
- silhouette
- construction
- stripes
- graphics
- buttons
- seams
- trims
- fabric
- proportions
- garment details

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
EXTRA
=========================================================

${
  extra
    ? extra
    : ""
}

=========================================================
FINAL PRIORITY
=========================================================

Priority:

1. Model Gender
2. Uploaded garment accuracy
3. Garment construction
4. Photorealistic fit
5. Requested pose
6. Requested location
7. Requested vehicle
8. Fashion styling

If styling conflicts with the uploaded garment,
preserve the garment.

If any model option conflicts with Model Gender,
Model Gender wins.

If Model Gender is MAN, the result MUST contain
an adult male model.

If Model Gender is WOMAN, the result MUST contain
an adult female model.

The final image must visibly look like the SAME garment
from the uploaded photograph.

Do not substitute another outfit.
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
