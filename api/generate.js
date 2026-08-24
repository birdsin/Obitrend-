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
COMPLETE /api/generate.js REPLACEMENT

PURPOSE
-------
Generate a new photorealistic fashion image using the
uploaded clothing photo as the strict garment reference.

IMPORTANT:
The uploaded image can be:
- one garment photo
- multiple garment photos
- a collage
- front/back garment views
- garment + model photos
- garment product photos
- garment laid flat
- garment on a hanger
- garment worn by another person

The generated model should wear the SAME garment.

BRANDING RULE
-------------
Do NOT reproduce:
- logos
- brand names
- labels
- watermarks
- signatures
- social-media handles
- visible copyrighted branding

Keep the garment's construction and design while removing
visible branding.

COMPATIBILITY
-------------
Keeps compatibility with the existing OBITREND frontend,
credits system and Pro system.
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
   OPENAI
========================================================= */

const MODEL =
  process.env.OPENAI_IMAGE_MODEL ||
  "gpt-image-2";


/*
Maximum number of colour variants.

The frontend can still request up to 4.
*/
const MAX_COLOUR_IMAGES = 4;


/*
Keep uploaded compressed images safely below the
request limit.
*/
const MAX_IMAGE_BYTES =
  9 * 1024 * 1024;


/*
Medium quality is intentional.

It reduces the chance of the Vercel function reaching
the 60-second timeout while still producing high-quality
fashion images.
*/
const IMAGE_QUALITY = "medium";


const openai =
  new OpenAI({
    apiKey:
      process.env.OPENAI_API_KEY,
  });


/* =========================================================
   GENERAL HELPERS
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
   BASE64 IMAGE
========================================================= */

function normalizeBase64(
  input
) {
  if (!input) {
    return null;
  }

  let value =
    String(input).trim();


  /*
  Remove data:image/...;base64,
  prefix when present.
  */
  if (
    value.startsWith(
      "data:image/"
    )
  ) {
    const comma =
      value.indexOf(",");

    if (
      comma !== -1
    ) {
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


  return
    value.length >= 100
      ? value
      : null;
}


/* =========================================================
   MIME TYPE
========================================================= */

function getMimeType(
  input
) {
  const match =
    String(input || "")
      .match(
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
   OUTPUT SIZE
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


  /*
  Existing OBITREND default.
  */
  return "1536x1024";
}


/* =========================================================
   COLOUR LIST
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


  if (
    supplied
  ) {
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
   UNIVERSAL GARMENT PRESERVATION PROMPT
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
      "luxury editorial fashion"
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
      "no vehicle unless requested"
    );


  const camera =
    clean(
      getValue(
        body,
        "camera",
        "lighting"
      ),
      "professional commercial fashion photography"
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

OBITREND UNIVERSAL GARMENT REPRODUCTION MODE.

The uploaded image is the STRICT PRIMARY REFERENCE for
the CLOTHING / GARMENT.

Create a completely new photorealistic fashion photograph.

The selected adult model must wear the SAME garment shown
in the uploaded reference.

The garment is NOT merely inspiration.

Do not replace it with a generic outfit.

=========================================================
REFERENCE IMAGE ANALYSIS
=========================================================

The uploaded reference may contain:

- one garment
- several garments
- multiple views
- front and back views
- product photography
- clothing on a hanger
- clothing laid flat
- clothing worn by a person
- a collage
- model photographs
- multiple colours of the same garment

Analyze the reference carefully.

If multiple views show the SAME garment, combine the
information from all views to reconstruct that garment.

Use the garment views to understand:

- front
- back
- side
- neckline
- collar
- sleeves
- cuffs
- shoulders
- waist
- hips
- hem
- buttons
- zippers
- seams
- panels
- pockets
- pleats
- folds
- draping
- construction
- proportions
- fabric
- texture
- pattern

=========================================================
IGNORE THE ORIGINAL PERSON
=========================================================

Do NOT copy the original person's:

- face
- identity
- body
- skin
- age
- hairstyle
- pose
- expression
- accessories
- jewellery
- handbag
- shoes
- environment

The original person is NOT the target.

The GARMENT is the target.

=========================================================
UNIVERSAL CLOTHING RULE
=========================================================

This instruction applies to ANY uploaded clothing type.

Examples include:

- shirt
- blouse
- T-shirt
- polo
- tank top
- singlet
- crop top
- sweater
- hoodie
- jacket
- blazer
- coat
- cardigan
- dress
- gown
- jumpsuit
- romper
- skirt
- mini skirt
- maxi skirt
- trousers
- pants
- jeans
- baggy jeans
- skinny jeans
- cargo pants
- shorts
- Capri pants
- traditional clothing
- African fashion
- kaftan
- agbada
- two-piece outfit
- three-piece outfit
- suit
- tracksuit
- sportswear
- swimwear
- formalwear
- casualwear
- streetwear
- luxury fashion

Whatever garment is uploaded:

REPRODUCE THAT GARMENT.

Do not assume it is a shirt.

Do not assume it is a dress.

Do not assume it is a suit.

Identify the actual garment from the uploaded reference.

=========================================================
GARMENT STRUCTURE
=========================================================

Preserve the visible garment design as accurately as possible.

Preserve:

- garment category
- garment type
- silhouette
- proportions
- length
- width
- neckline
- collar
- shoulder design
- sleeves
- sleeve length
- cuffs
- arm openings
- waist
- waist shaping
- darts
- seams
- stitching
- panels
- pleats
- gathers
- folds
- draping
- pockets
- buttons
- button placement
- zippers
- closures
- ties
- straps
- belt construction if present
- hem
- side openings
- slits
- texture
- fabric appearance
- fabric weight
- pattern
- stripes
- checks
- prints
- embroidery
- decorative details
- unique construction

=========================================================
PATTERN PRESERVATION
=========================================================

If the garment has:

- stripes

keep the stripe direction and spacing visually consistent.

If it has:

- checks

keep the check structure consistent.

If it has:

- flowers
- geometric patterns
- abstract patterns
- prints

keep the overall pattern placement and visual character.

If it has:

- pleats
- gathers
- ruching
- folds

keep those construction details.

If it has:

- buttons

keep their visible placement and approximate number.

If it has:

- pockets

keep their placement and shape.

=========================================================
NO BRANDING / NO LOGOS
=========================================================

VERY IMPORTANT:

The final generated image must contain NO visible logos,
brand names, trademarks, labels, watermarks, signatures,
social-media handles or advertising marks.

Remove branding from the garment even if the uploaded
reference contains branding.

Do NOT reproduce:

- logos
- brand names
- company names
- labels
- watermarks
- signatures
- usernames
- social handles
- product marks
- promotional text

Instead:

KEEP THE GARMENT DESIGN.

REMOVE ONLY THE BRANDING.

For example:

If a shirt has a visible brand logo:

remove the logo while keeping the shirt's:

- color
- fabric
- collar
- sleeves
- buttons
- pocket
- pattern
- shape
- construction

Do not replace the garment because of a logo.

=========================================================
NO RE-DESIGN
=========================================================

DO NOT:

- redesign the clothing
- invent a new outfit
- substitute another garment
- change the garment category
- turn a shirt into a jumpsuit
- turn a blouse into a dress
- turn trousers into a skirt
- turn jeans into formal pants
- turn a jacket into a blazer
- turn a dress into a gown
- add random accessories to the garment
- remove important construction details
- simplify the garment
- make a generic luxury outfit
- use a generic cream outfit
- use a generic white outfit
- use a generic beige outfit

The uploaded garment has priority.

=========================================================
FIT ON THE NEW MODEL
=========================================================

The garment should realistically fit the selected model.

Adjust ONLY the natural fit needed for the new adult model.

Do NOT redesign the garment.

The garment should:

- sit naturally on the body
- follow realistic anatomy
- have realistic fabric tension
- have realistic folds
- have realistic shadows
- maintain its original construction

=========================================================
MODEL
=========================================================

Selected model:

${model}

Body style:

${bodyStyle}

Pose:

${pose}

Fashion style:

${fashionStyle}

The model must be an adult.

=========================================================
LOCATION
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

The environment must enhance the fashion campaign.

The environment must NOT alter the garment.

=========================================================
PHOTOGRAPHY
=========================================================

Camera:

${camera}

Aspect ratio:

${ratio}

Create:

- photorealistic adult human
- realistic anatomy
- realistic hands
- realistic fingers
- realistic face
- realistic skin
- realistic hair
- realistic fabric
- realistic garment fit
- realistic shadows
- realistic lighting
- realistic reflections
- realistic depth
- professional fashion photography
- premium editorial photography
- luxury commercial campaign quality
- natural camera perspective
- realistic materials
- high detail
- clean image

Avoid:

- CGI appearance
- plastic skin
- fake fabric
- distorted hands
- extra fingers
- distorted anatomy
- melted clothing
- duplicated limbs
- strange patterns
- random text
- watermarks
- logos
- brand names
- labels

=========================================================
COMPANION / OTHER PEOPLE
=========================================================

${
  companionMode
    ? `
A companion may be included because the user requested it.

Keep the companion separate from the garment reference.

The adult model wearing the uploaded garment remains the
primary subject.

Any child must remain age-appropriate.
`
    : `
Do not copy unrelated people from the uploaded reference.

Only reproduce the garment.
`
}

=========================================================
COLOUR VARIANT
=========================================================

${
  variantColor
    ? `
Create the same garment in this requested colour:

${variantColor}

Change ONLY the garment colour.

Keep:

- garment category
- garment silhouette
- garment construction
- pattern structure
- buttons
- seams
- pockets
- fabric
- proportions
- texture
- all non-brand garment details

Remove logos and branding.

Do NOT redesign the garment.
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

PRIORITY:

1. Correct uploaded garment
2. Correct garment category
3. Correct garment construction
4. Correct garment pattern
5. Correct garment color
6. Remove all branding/logos
7. Realistic fit
8. Photorealistic adult model
9. Pose
10. Location
11. Vehicle
12. Fashion styling

If any instruction conflicts with the uploaded garment,
PRESERVE THE GARMENT.

The final image must look like the SAME TYPE AND DESIGN
of garment from the uploaded reference, realistically worn
by the selected adult model.

NO LOGOS.

NO BRAND NAMES.

NO WATERMARKS.

NO REPLACEMENT OUTFIT.

NO GENERIC OUTFIT.

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


  const result =
    await openai.images.edit({

      model: MODEL,

      image: imageFile,

      prompt,

      size,

      quality:
        IMAGE_QUALITY,

      output_format:
        "png",

    });


  const b64 =
    result?.data?.[0]
      ?.b64_json;


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

    return res.status(
      405
    ).json({

      success: false,

      error:
        "Method not allowed.",

    });

  }


  /* =======================================================
     API KEY
  ======================================================= */

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

      return res.status(
        402
      ).json({

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
       COLOUR VARIANTS
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
       OUTPUT SIZE
    ===================================================== */

    const size =
      getImageSize(

        getValue(

          body,

          "aspectRatio",

          "ratio"

        )

      );


    const images = [];


    /* =====================================================
       GENERATE IMAGES
       
       IMPORTANT:
       Generate requested variants concurrently instead
       of waiting for image 1, image 2, image 3...
       
       This helps prevent the Vercel 60-second timeout.
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


      images.push(
        ...generatedImages
      );


    } catch (
      generationError
    ) {


      /* ===================================================
         REFUND CREDIT IF GENERATION FAILS
      =================================================== */

      if (
        charge.usedCredit &&
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
       
       Keep all existing aliases so the existing frontend
       does not need to be changed.
    ===================================================== */

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
