import OpenAI, { toFile } from "openai";

import {
  spendCredit,
  refundCredit,
  getProStatus,
  getRedisConfig,
} from "./credits.js";

/*
=========================================================
OBITREND AI FASHION CREATOR
COMPLETE api/generate.js REPLACEMENT

SAFE COMPATIBILITY VERSION

Keeps compatibility with:
- index.html
- credits.js
- paystack.js
- pro.js
- existing user IDs
- existing image upload fields
- existing response fields
- existing colour selections
- existing aspect ratios

FIXES:
1. Garment being replaced by unrelated clothing
2. Uploaded clothing treated as inspiration
3. 60-second timeout caused by slow sequential generation
4. Keeps existing credit refund behaviour
=========================================================
*/


/* =========================================================
   VERCEL CONFIG
========================================================= */

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "12mb",
    },
  },
};

export const maxDuration = 60;


/* =========================================================
   SETTINGS
========================================================= */

const MODEL =
  process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";

/*
 * Keep the existing maximum of 4 colour images.
 */
const MAX_COLOUR_IMAGES = 4;

/*
 * Uploaded images are already compressed by your frontend.
 */
const MAX_IMAGE_BYTES =
  9 * 1024 * 1024;


/* =========================================================
   OPENAI
========================================================= */

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
        value.slice(comma + 1);
    }
  }

  value =
    value.replace(/\s/g, "");

  return value.length >= 100
    ? value
    : null;
}


/* =========================================================
   MIME TYPE
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
   COLOUR SUPPORT
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
  }

  else if (
    typeof raw === "string" &&
    raw.trim()
  ) {
    list =
      raw
        .split(",")
        .map(
          item =>
            item.trim()
        );
  }

  return [
    ...new Set(
      list
        .map(
          value =>
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
   USER ID
========================================================= */

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
    return clean(
      supplied
    )
      .replace(
        /[^a-zA-Z0-9_-]/g,
        ""
      )
      .slice(
        0,
        100
      );
  }

  const headerId =
    clean(
      req?.headers?.[
        "x-obitrend-user-id"
      ] || ""
    )
      .replace(
        /[^a-zA-Z0-9_-]/g,
        ""
      )
      .slice(
        0,
        100
      );

  return (
    headerId ||
    "guest"
  );
}


/* =========================================================
   GARMENT PRESERVATION PROMPT
========================================================= */

function buildPrompt(
  body,
  variantColor = ""
) {

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


  const location =
    [
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
OBITREND STRICT CLOTHING REPRODUCTION MODE.

The uploaded image is the STRICT VISUAL SOURCE OF TRUTH
for the clothing garment.

Create a new photorealistic fashion photograph where
the selected adult model is actually wearing the SAME
garment shown in the uploaded reference.

The uploaded clothing is NOT inspiration.

It is the actual garment that must be reproduced.

=========================================================
IGNORE THE ORIGINAL PERSON
=========================================================

IGNORE:

- original person's identity
- original person's face
- original person's body
- original person's age
- original person's pose
- original person's hairstyle
- original person's accessories
- original person's handbag
- original person's shoes
- original person's background
- original person's location

Use the uploaded image primarily to understand the garment.

=========================================================
PRESERVE THE GARMENT
=========================================================

Preserve as accurately as possible:

- garment category
- garment type
- silhouette
- proportions
- length
- neckline
- collar
- straps
- sleeve construction
- sleeveless construction
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
- hem shape
- buttons
- button placement
- zippers
- ties
- pockets
- embroidery
- logos
- labels
- lettering
- artwork
- prints
- stripes
- checks
- patterns
- borders
- trim
- fabric texture
- fabric finish
- exact colour
- colour relationships
- front construction
- back construction
- visible fastening details

=========================================================
VERY IMPORTANT
=========================================================

If the uploaded garment is a pink-and-white striped
sleeveless button-up top, the model MUST wear that
same pink-and-white striped sleeveless button-up top.

DO NOT change it into:

- cream clothing
- white clothing
- beige clothing
- a jumpsuit
- a blazer
- a dress
- a different blouse
- a different shirt
- a generic luxury outfit
- a newly designed outfit

The uploaded garment is more important than the
background or fashion styling.

=========================================================
DO NOT REDESIGN
=========================================================

DO NOT:

- redesign the garment
- replace the garment
- change the garment category
- change the neckline
- change the collar
- add sleeves
- remove sleeves
- add a belt that is not present
- remove an existing belt
- change buttons
- change stripe direction
- change stripe spacing
- change print placement
- remove logos
- remove lettering
- invent new panels
- change the fabric
- change the hem
- turn the clothing into generic luxury fashion
- substitute cream clothing
- substitute beige clothing
- substitute white clothing

=========================================================
MODEL
=========================================================

Model:
${model}

Body style:
${bodyStyle}

Pose:
${pose}

Fashion style:
${fashionStyle}

The model must be an adult fashion model.

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

The scene must not change the garment.

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
- realistic fingers
- realistic skin
- realistic hair
- realistic garment fit
- realistic fabric folds
- realistic seams
- realistic shadows
- realistic reflections
- realistic lighting
- realistic materials
- professional fashion photography
- luxury fashion campaign quality
- commercial photography
- natural depth of field
- professional camera rendering

Avoid:

- CGI appearance
- plastic skin
- fake fabric
- distorted hands
- extra fingers
- distorted anatomy
- melted clothing
- broken buttons
- random lettering
- watermark

=========================================================
COMPANION
=========================================================

${
  companionMode
    ? `
If the frontend specifically requested a companion,
a companion may appear.

Do not allow the companion to replace or alter the
adult model's garment.

Any child must remain age-appropriate.
`
    : `
Do not copy unrelated people from the uploaded reference.
`
}

=========================================================
COLOUR VARIANT
=========================================================

${
  variantColor
    ? `
Create this requested colour version:

${variantColor}

Change ONLY the colour of the garment.

Keep exactly the same:

- garment category
- garment construction
- silhouette
- stripes
- graphics
- buttons
- seams
- trims
- fabric
- proportions
- design

Do not redesign the garment.
`
    : ""
}

=========================================================
USER REQUEST
=========================================================

${
  userPrompt
    ? `
${userPrompt}
`
    : ""
}

=========================================================
EXTRA DIRECTION
=========================================================

${
  extra
    ? `
${extra}
`
    : ""
}

=========================================================
FINAL PRIORITY
=========================================================

Priority:

1. Uploaded garment accuracy
2. Garment construction
3. Garment colour/pattern
4. Garment details
5. Realistic model
6. Realistic garment fit
7. Pose
8. Background
9. Vehicle
10. Styling

If anything conflicts with the uploaded garment,
PRESERVE THE UPLOADED GARMENT.

The final image must visibly look like the SAME garment
from the uploaded photograph.

DO NOT SUBSTITUTE A DIFFERENT OUTFIT.
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
   PRO STATUS
========================================================= */

async function proActiveFor(
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
      "OBITREND Pro status check failed:",
      error?.message || error
    );

    return false;
  }
}


/* =========================================================
   CREDIT
========================================================= */

async function spendIfNeeded(
  userId,
  proActive,
  redis
) {

  if (
    proActive ||
    !redis
  ) {

    return {
      success: true,
      balance: null,
      usedCredit: false,
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
      Boolean(
        spent?.success
      ),
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
      "The compressed clothing image is too large. Please upload a smaller image."
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


  /*
   * MEDIUM is intentional.
   *
   * HIGH quality was contributing to the 60-second
   * Vercel timeout on generation requests.
   */
  const result =
    await openai.images.edit({

      model: MODEL,

      image: imageFile,

      prompt,

      size,

      quality: "medium",

      output_format: "png",

    });


  const b64 =
    result?.data?.[0]?.b64_json;


  if (!b64) {

    throw new Error(
      "OpenAI did not return an image."
    );

  }


  return (
    "data:image/png;base64," +
    b64
  );
}


/* =========================================================
   API HANDLER
========================================================= */

export default async function handler(
  req,
  res
) {

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

    return res.status(405).json({

      success: false,

      error:
        "Method not allowed.",

    });

  }


  /* =======================================================
     OPENAI KEY
  ======================================================= */

  if (
    !process.env.OPENAI_API_KEY
  ) {

    return res.status(500).json({

      success: false,

      error:
        "OPENAI_API_KEY is not configured.",

    });

  }


  try {

    const body =
      req.body || {};


    /* =====================================================
       IMAGE INPUT
    ===================================================== */

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


    if (
      !imageBase64
    ) {

      return res.status(400).json({

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
       USER / PRO / CREDIT
    ===================================================== */

    const userId =
      getUserId(
        body,
        req
      );


    const redis =
      getRedisOrNull();


    const proActive =
      await proActiveFor(
        userId,
        redis
      );


    const charge =
      await spendIfNeeded(
        userId,
        proActive,
        redis
      );


    if (
      !charge.success
    ) {

      return res.status(402).json({

        success: false,

        error:
          "Your free generations are finished. Upgrade to OBITREND Pro to continue.",

        upgradeRequired:
          true,

        balance:
          charge.balance,

      });

    }


    /* =====================================================
       COLOURS
    ===================================================== */

    const colours =
      getColourList(
        body
      );


    const prompts =
      colours.length

        ? colours.map(
            color =>
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


    /* =====================================================
       SIZE
    ===================================================== */

    const size =
      getImageSize(

        getValue(

          body,

          "aspectRatio",

          "ratio"

        )

      );


    let images = [];


    /* =====================================================
       GENERATE IMAGES
       
       IMPORTANT:
       Use Promise.all so multiple selected colours do not
       wait for one another.
    ===================================================== */

    try {

      const selectedPrompts =
        prompts.slice(
          0,
          MAX_COLOUR_IMAGES
        );


      const generatedImages =
        await Promise.all(

          selectedPrompts.map(
            prompt =>

              generateOne(

                imageBase64,

                mimeType,

                prompt,

                size

              )
          )

        );


      images =
        generatedImages;

    }


    /* =====================================================
       REFUND IF GENERATION FAILS
    ===================================================== */

    catch (
      generationError
    ) {

      if (
        charge.usedCredit &&
        redis
      ) {

        try {

          await refundCredit(

            userId,

            redis

          );

        }

        catch (
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


    /* =====================================================
       SAFETY CHECK
    ===================================================== */

    if (
      !images.length
    ) {

      throw new Error(
        "No image was generated."
      );

    }


    /* =====================================================
       FIRST IMAGE
    ===================================================== */

    const firstImage =
      images[0];


    /* =====================================================
       RESPONSE
       
       Keep all existing aliases so your current frontend
       does not need to be rewritten.
    ===================================================== */

    return res.status(200).json({

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
        charge.balance,

      pro:
        proActive,

    });

  }


  /* =======================================================
     ERROR HANDLER
  ======================================================= */

  catch (error) {

    console.error(
      "OBITREND generation error:",
      error
    );


    return res.status(500).json({

      success: false,

      error:
        error?.message ||
        "Image generation failed.",

    });

  }

}
