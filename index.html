import OpenAI from "openai";

import {
  spendCredit,
  refundCredit,
  getProStatus,
  getRedisConfig,
} from "./credits.js";

/*
=========================================================
OBITREND AI FASHION CREATOR
REFERENCE-ONLY CLOTHING + FAMILY COMPANION ENGINE

IMPORTANT:

The uploaded image is NOT automatically treated as
the garment the woman must wear.

DEFAULT BEHAVIOUR:

UPLOADED IMAGE
      ↓
VISUAL FASHION / SCENE REFERENCE
      ↓
NEW OUTFIT GENERATED FOR WOMAN

If the uploaded reference contains a toddler boy,
the prompt may preserve him as a separate companion
with his own age-appropriate children's clothing.

NORMAL GENERATION:
    1 click = 1 image

MULTI-COLOUR:
    clothingColors: ["Red","Black","White"]

    Red   = 1 image
    Black = 1 image
    White = 1 image

TOTAL = 3 images

KEEPS COMPATIBILITY WITH:

- OPENAI_API_KEY
- credits.js
- Pro system
- /api/generate
- imageBase64
- uploadedImage
- image
- clothingImage
- referenceImage
- imageUrl
- url
- generatedImage
- images
- colorImages
- colourImages
=========================================================
*/

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});


/*
=========================================================
VERCEL CONFIG
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


/*
=========================================================
MODEL
=========================================================
*/

const MODEL =
  process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";


/*
=========================================================
SAFE LIMITS
=========================================================
*/

const MAX_COLOUR_IMAGES = 4;

const MAX_IMAGE_BYTES =
  9 * 1024 * 1024;


/*
=========================================================
GENERAL HELPERS
=========================================================
*/

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


/*
=========================================================
BOOLEAN HELPER
=========================================================
*/

function getBoolean(
  body,
  names,
  fallback = false
) {

  for (const name of names) {

    if (
      body?.[name] !== undefined &&
      body?.[name] !== null
    ) {

      const value =
        body[name];

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

  }

  return fallback;

}


/*
=========================================================
BASE64 NORMALIZATION
=========================================================
*/

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


/*
=========================================================
MIME TYPE
=========================================================
*/

function getMimeType(input) {

  const match =
    String(input || "").match(
      /^data:(image\/[a-zA-Z0-9.+-]+);base64,/i
    );


  if (match) {

    return match[1]
      .toLowerCase();

  }


  return "image/jpeg";

}


/*
=========================================================
FILE EXTENSION
=========================================================
*/

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


/*
=========================================================
IMAGE SIZE
=========================================================
*/

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
    ratio.includes("16:9") ||
    ratio.includes("5:4") ||
    ratio.includes("landscape")
  ) {

    return "1536x1024";

  }


  /*
   * 9:16 is kept portrait.
   *
   * The frontend already accepts 9:16.
   * We keep a valid portrait image size here.
   */

  return "1024x1536";

}


/*
=========================================================
COLOUR LIST
=========================================================
*/

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


  list =
    [
      ...new Set(
        list
          .map(
            value =>
              String(value).trim()
          )
          .filter(Boolean)
      )
    ];


  return list.slice(
    0,
    MAX_COLOUR_IMAGES
  );

}


/*
=========================================================
REFERENCE-ONLY MODE
=========================================================

IMPORTANT:

This is the major change.

The uploaded image is treated as:

- visual reference
- fashion inspiration
- composition reference
- environment reference when appropriate

It is NOT automatically the garment worn by
the woman.

=========================================================
*/

function getReferenceOnlyMode(body) {

  /*
   * New explicit flag.
   */

  if (
    body?.referenceOnly !== undefined
  ) {

    return getBoolean(
      body,
      ["referenceOnly"],
      true
    );

  }


  /*
   * Existing frontend compatibility.

   * Your current frontend sends:
   *
   * garmentReference: true
   *
   * We interpret that as:
   *
   * "there is a garment reference"
   *
   * NOT:
   *
   * "the woman must wear the exact garment".
   */

  if (
    body?.garmentReference !== undefined
  ) {

    return true;

  }


  /*
   * Default = reference only.
   */

  return true;

}


/*
=========================================================
COMPANION DETECTION
=========================================================

We do NOT force a toddler into every generation.

If the uploaded image contains a toddler/child,
the prompt allows the image model to preserve that
child as a separate family companion.

The child gets separate clothing.

=========================================================
*/

function getCompanionInstruction(body) {

  const explicitCompanion =
    clean(
      getValue(
        body,
        "companion",
        "companionType",
        "childCompanion"
      )
    );


  const addToddler =
    getBoolean(
      body,
      [
        "addToddler",
        "addToddlerBoy",
        "toddlerBoy",
        "includeToddler"
      ],
      false
    );


  if (
    addToddler ||
    explicitCompanion
  ) {

    const companion =
      explicitCompanion ||
      "toddler boy";

    return `

==================================================
FAMILY COMPANION
==================================================

Include exactly ONE separate ${companion}.

The child is a separate person from the adult woman.

The child must have:

- realistic age-appropriate proportions
- realistic child anatomy
- natural child facial features
- age-appropriate children's clothing
- age-appropriate children's footwear
- innocent family-friendly presentation

The child must NOT wear the woman's outfit.

The child must NOT wear the uploaded reference
garment.

Give the child a separate children's outfit.

The child should naturally interact with or stand
beside the adult woman.

Do not duplicate people.

Do not create extra children.

Do not create adult body proportions for the child.

Do not sexualize the child.

Do not use adult glamour styling for the child.

`;

  }


  /*
   * Default intelligent reference behaviour.

   * This allows a child visible in the supplied
   * reference image to remain a possible companion,
   * without forcing a child into unrelated requests.
   */

  return `

==================================================
REFERENCE FAMILY COMPOSITION
==================================================

The uploaded reference image may contain people
or a child.

If a toddler boy or other child is clearly visible
in the supplied reference and is important to the
family composition, preserve the presence of ONE
such child as a separate family companion.

If a child is present:

- keep the child separate from the woman
- give the child his own children's outfit
- do NOT transfer the woman's outfit to the child
- do NOT transfer the uploaded garment to the child
- keep the presentation innocent and family-friendly

If no child is visible or needed, do not invent
a child.

`;

}


/*
=========================================================
AGE SAFETY
=========================================================
*/

function getAgeInstruction(body) {

  const ageGroup =
    clean(
      getValue(
        body,
        "ageGroup"
      ),
      "adult_woman"
    );


  if (
    ageGroup === "toddler_boy"
  ) {

    return `

==================================================
TODDLER BOY MODE
==================================================

The subject is a realistic toddler boy,
approximately 1–3 years old.

Use:

- realistic toddler anatomy
- age-appropriate children's clothing
- children's footwear
- innocent family-friendly posing

Do NOT sexualize the child.

Do NOT use adult glamour styling.

Do NOT use adult body proportions.

Do NOT use provocative poses.

Do NOT use revealing adult clothing.

`;

  }


  if (
    ageGroup === "toddler_girl"
  ) {

    return `

==================================================
TODDLER GIRL MODE
==================================================

The subject is a realistic toddler girl,
approximately 1–3 years old.

Use only age-appropriate children's clothing
and innocent family-friendly presentation.

Do NOT sexualize the child.

Do NOT use adult glamour styling.

`;

  }


  if (
    ageGroup === "teen_boy" ||
    ageGroup === "teen_girl"
  ) {

    return `

==================================================
TEEN MODE
==================================================

The subject is a realistic teenager aged 13–17.

Use age-appropriate clothing and presentation.

Do NOT sexualize the teenager.

Do NOT use adult glamour styling.

Do NOT depict the teenager as an adult.

`;

  }


  return `

==================================================
ADULT MODE
==================================================

The primary woman/man is a realistic adult
fashion model aged 18+.

`;

}


/*
=========================================================
PROMPT BUILDER
=========================================================
*/

function buildPrompt(
  body,
  selectedColour = null
) {

  /*
   * MODEL
   */

  const gender =
    clean(
      getValue(
        body,
        "gender",
        "modelGender",
        "sex"
      ),
      "woman"
    );


  const model =
    clean(
      getValue(
        body,
        "model"
      ),
      "professional adult fashion model"
    );


  const bodyType =
    clean(
      getValue(
        body,
        "bodyType",
        "body"
      ),
      "natural proportional adult fashion-model body"
    );


  const face =
    clean(
      getValue(
        body,
        "face"
      ),
      "natural realistic adult facial features"
    );


  /*
   * POSE
   */

  const pose =
    clean(
      getValue(
        body,
        "pose"
      ),
      "confident natural full-body fashion pose"
    );


  /*
   * FOOTWEAR
   */

  const footwear =
    clean(
      getValue(
        body,
        "footwear",
        "shoe",
        "shoes"
      ),
      "realistic footwear matching the new outfit"
    );


  /*
   * NEW CLOTHING
   */

  const clothingType =
    clean(
      getValue(
        body,
        "clothingType",
        "garmentType",
        "outfitType"
      ),
      "a fashionable new outfit"
    );


  const originalColour =
    clean(
      getValue(
        body,
        "clothingColor",
        "color",
        "colour"
      ),
      "a tasteful fashion colour"
    );


  const clothingStyle =
    clean(
      getValue(
        body,
        "clothingStyle",
        "style"
      ),
      "premium fashion styling"
    );


  const fashionStyle =
    clean(
      getValue(
        body,
        "fashionStyle"
      ),
      "luxury fashion editorial"
    );


  const creativeDirection =
    clean(
      getValue(
        body,
        "creativeDirection",
        "creative"
      ),
      "professional commercial fashion campaign"
    );


  /*
   * LOCATION
   */

  const location =
    [
      clean(
        body.locationType
      ),

      clean(
        body.city
      ),

      clean(
        body.property
      ),
    ]
      .filter(Boolean)
      .join(", ") ||
    "premium modern fashion location";


  /*
   * VEHICLE
   */

  const vehicle =
    clean(
      getValue(
        body,
        "vehicle"
      ),
      "no vehicle required"
    );


  /*
   * CAMERA
   */

  const camera =
    clean(
      getValue(
        body,
        "camera"
      ),
      "professional full-frame fashion photography"
    );


  /*
   * LIGHTING
   */

  const lighting =
    clean(
      getValue(
        body,
        "lighting"
      ),
      "soft natural daylight with realistic shadows"
    );


  /*
   * REFERENCE MODE
   */

  const referenceOnly =
    getReferenceOnlyMode(
      body
    );


  /*
   * COLOUR
   */

  let colourInstruction = "";


  if (
    selectedColour &&
    selectedColour !== "Original Colour"
  ) {

    colourInstruction = `

==================================================
NEW OUTFIT COLOUR
==================================================

The newly generated outfit should use:

${selectedColour}

This colour applies to the NEW outfit.

Do NOT transfer the exact uploaded garment
onto the woman.

Do NOT copy the uploaded garment's exact
construction merely because this colour was
selected.

Create a NEW outfit using the selected
clothing type and clothing style.

`;

  }


  else {

    colourInstruction = `

==================================================
NEW OUTFIT COLOUR
==================================================

Create a new outfit using the selected
clothing colour direction:

${originalColour}

The uploaded garment's original colour is
reference inspiration only.

Do NOT automatically copy the uploaded garment
onto the woman.

`;

  }


  /*
   * AGE
   */

  const ageInstruction =
    getAgeInstruction(
      body
    );


  /*
   * COMPANION
   */

  const companionInstruction =
    getCompanionInstruction(
      body
    );


  /*
   * FINAL PROMPT
   */

  return `

OBITREND AI FASHION CREATOR.

Create ONE premium photorealistic fashion
photograph.

==================================================
MOST IMPORTANT INSTRUCTION
==================================================

THE UPLOADED IMAGE IS A REFERENCE IMAGE.

DO NOT AUTOMATICALLY PUT THE UPLOADED GARMENT
ON THE WOMAN.

The woman must wear a NEWLY GENERATED OUTFIT.

The uploaded image may contain:

- a garment
- a woman
- a child
- a vehicle
- a background
- a location
- other visual elements

Use those elements only as appropriate
reference information.

The uploaded clothing itself is NOT the default
outfit for the generated woman.

==================================================
NEW WOMAN OUTFIT
==================================================

Create a completely new outfit for the main
adult woman.

Clothing Type:

${clothingType}

Clothing Style:

${clothingStyle}

Fashion Style:

${fashionStyle}

Colour Direction:

${selectedColour || originalColour}

The new outfit should be:

- fashionable
- photorealistic
- commercially appropriate
- professionally fitted
- coherent with the selected fashion style
- visibly different from the uploaded garment

Do NOT simply paste the uploaded garment
onto the woman.

Do NOT automatically reproduce the exact:

- silhouette
- cut
- hem
- neckline
- sleeves
- waistband
- pockets
- buttons
- zipper
- straps
- seams
- pattern placement
- print placement
- fabric construction

of the uploaded garment.

The woman should clearly appear to be wearing
a newly designed outfit.

==================================================
UPLOADED IMAGE AS REFERENCE ONLY
==================================================

The uploaded image is useful for visual context.

It may help understand:

- fashion aesthetic
- colour inspiration
- general style
- family composition
- environment
- lighting
- camera composition
- overall campaign direction

But it must NOT force the exact uploaded garment
onto the woman.

If the uploaded image shows a person wearing
the reference garment, do NOT simply reproduce
that person's outfit.

Generate the woman's outfit from the user's
current clothing controls.

==================================================
${referenceOnly
  ? "REFERENCE-ONLY CLOTHING MODE ENABLED"
  : "REFERENCE MODE"
}
==================================================

The garment reference is advisory only.

The woman's new outfit has priority over
the uploaded garment.

${colourInstruction}

==================================================
MAIN MODEL
==================================================

Gender:

${gender}

Model:

${model}

Body Type:

${bodyType}

Face:

${face}

Use realistic adult anatomy when the selected
subject is an adult.

Use natural:

- skin
- face
- hair
- hands
- fingers
- feet
- body proportions

==================================================
AGE
==================================================

${ageInstruction}

==================================================
POSE
==================================================

${pose}

Use a natural professional fashion pose.

Avoid:

- extra fingers
- duplicated limbs
- malformed hands
- malformed feet
- distorted anatomy
- unnatural posture

==================================================
FOOTWEAR
==================================================

${footwear}

Footwear must match the NEW outfit.

Footwear must connect naturally to the feet.

If the subject is a child, use appropriate
children's footwear.

==================================================
FASHION DIRECTION
==================================================

Clothing Type:

${clothingType}

Clothing Style:

${clothingStyle}

Fashion Style:

${fashionStyle}

Creative Direction:

${creativeDirection}

==================================================
LOCATION
==================================================

${location}

Vehicle:

${vehicle}

Use the selected location as the campaign
environment.

==================================================
CAMERA
==================================================

${camera}

Use realistic:

- perspective
- lens behaviour
- depth of field
- proportions
- photographic detail

==================================================
LIGHTING
==================================================

${lighting}

Use realistic:

- shadows
- reflections
- skin tones
- fabric texture
- environmental lighting

==================================================
FAMILY / TODDLER COMPANION
==================================================

${companionInstruction}

==================================================
PHOTOREALISM
==================================================

Create:

- realistic skin texture
- realistic hair
- realistic hands
- realistic fingers
- realistic feet
- realistic fabric
- realistic folds
- realistic stitching
- realistic lighting
- realistic shadows
- realistic reflections
- realistic perspective
- realistic camera depth

Do NOT create:

- cartoon
- anime
- illustration
- painting
- plastic skin
- CGI-looking people
- distorted anatomy
- duplicated people
- extra limbs
- extra fingers
- malformed hands
- malformed feet
- warped clothing
- fake logos
- random text
- watermarks

==================================================
CLOTHING DIFFERENTIATION
==================================================

The main woman MUST NOT simply wear the
uploaded reference garment.

The generated outfit must be visually distinct.

For example:

If the reference contains a patterned skirt
and black top, and the user selects:

Clothing Type:
Baggy Jeans

Clothing Style:
Premium Streetwear

Colour:
Black

Then the woman should wear a new black
baggy-jeans streetwear outfit rather than
the original patterned skirt.

If the user selects:

Clothing Type:
Dress

Then create a new dress.

If the user selects:

Clothing Type:
Shorts

Then create a new shorts outfit.

If the user selects:

Clothing Type:
Blazer

Then create a new blazer outfit.

Always obey the CURRENT clothing controls.

==================================================
FINAL PRIORITY
==================================================

Priority order:

1. Current clothing controls
2. New outfit generation
3. Age safety
4. Companion/family composition
5. Selected colour
6. Fashion style
7. Model
8. Pose
9. Footwear
10. Location
11. Lighting
12. Creative direction
13. Uploaded image as visual reference

The uploaded garment is NOT the primary
clothing to be worn unless the user explicitly
requests exact garment preservation.

==================================================
FINAL OUTPUT
==================================================

Create ONE polished professional
OBITREND fashion campaign photograph.

Do not create multiple images in this request.

`;


}


/*
=========================================================
OPENAI RESULT NORMALIZATION
=========================================================
*/

function imageDataToUrls(data) {

  return (
    Array.isArray(data)
      ? data
      : []
  )
    .map(
      item => {

        if (
          item?.b64_json
        ) {

          return (
            "data:image/png;base64," +
            item.b64_json
          );

        }


        if (
          item?.url
        ) {

          return item.url;

        }


        return null;

      }
    )
    .filter(Boolean);

}


/*
=========================================================
SAFE ERROR MESSAGE
=========================================================
*/

function getSafeErrorMessage(
  error
) {

  const status =
    Number(
      error?.status
    );


  if (
    status === 400
  ) {

    return (
      error?.message?.trim() ||
      "The image request was rejected. Check the uploaded image and selected options."
    );

  }


  if (
    status === 401
  ) {

    return (
      "OpenAI API authentication failed. " +
      "Check the existing OPENAI_API_KEY in Vercel."
    );

  }


  if (
    status === 403
  ) {

    return (
      "The OpenAI account or API key is not permitted " +
      "to use the selected image model."
    );

  }


  if (
    status === 404
  ) {

    return (
      `The image model "${MODEL}" was not found ` +
      "or is not available to this API key."
    );

  }


  if (
    status === 413
  ) {

    return (
      "The uploaded clothing image is too large. " +
      "Please use a smaller image."
    );

  }


  if (
    status === 429
  ) {

    return (
      "The image service is temporarily busy or " +
      "rate-limited. Please try again shortly."
    );

  }


  if (
    typeof error?.message === "string" &&
    error.message.trim()
  ) {

    return error.message.trim();

  }


  return (
    "The image generation service failed. " +
    "Please try again."
  );

}


/*
=========================================================
GENERATE EXACTLY ONE IMAGE
=========================================================

IMPORTANT:

n: 1

This preserves your existing one-image behaviour.

=========================================================
*/

async function generateOneImage({
  imageFile,
  prompt,
  size,
}) {

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
        "medium",

      n:
        1,

    });


  const images =
    imageDataToUrls(
      result?.data
    );


  if (
    !images.length
  ) {

    const error =
      new Error(
        "The image service returned no generated image."
      );

    error.status =
      502;

    throw error;

  }


  return images[0];

}


/*
=========================================================
REFUND MULTIPLE CREDITS
=========================================================
*/

async function refundMany(
  userId,
  redis,
  count
) {

  for (
    let i = 0;
    i < count;
    i++
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
        "OBITREND CREDIT REFUND ERROR:",
        refundError
      );

    }

  }

}


/*
=========================================================
MAIN API
=========================================================
*/

export default async function handler(
  req,
  res
) {

  /*
   * CORS
   */

  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );


  /*
   * OPTIONS
   */

  if (
    req.method === "OPTIONS"
  ) {

    return res
      .status(200)
      .end();

  }


  /*
   * ONLY POST
   */

  if (
    req.method !== "POST"
  ) {

    return res
      .status(405)
      .json({

        ok:
          false,

        success:
          false,

        error:
          "Method not allowed. Use POST.",

      });

  }


  /*
   * STATE
   */

  let userId = "";

  let redis = null;

  let proActive =
    false;

  let spentCredits =
    0;


  try {

    /*
    ======================================================
    OPENAI KEY
    ======================================================
    */

    if (
      !process.env.OPENAI_API_KEY
    ) {

      return res
        .status(500)
        .json({

          ok:
            false,

          success:
            false,

          error:
            "OPENAI_API_KEY is missing from Vercel Environment Variables.",

        });

    }


    /*
    ======================================================
    BODY
    ======================================================
    */

    const body =
      req.body || {};


    /*
    ======================================================
    USER ID
    ======================================================
    */

    userId =
      clean(
        getValue(
          body,
          "userId",
          "obitrendUserId"
        )
      );


    if (!userId) {

      return res
        .status(400)
        .json({

          ok:
            false,

          success:
            false,

          error:
            "A valid OBITREND user ID is required.",

        });

    }


    /*
    ======================================================
    REDIS / CREDITS
    ======================================================
    */

    redis =
      getRedisConfig();


    if (
      !redis?.url ||
      !redis?.token
    ) {

      return res
        .status(500)
        .json({

          ok:
            false,

          success:
            false,

          error:
            "OBITREND credit system is not configured.",

        });

    }


    /*
    ======================================================
    PRO STATUS
    ======================================================
    */

    const proStatus =
      await getProStatus(
        userId,
        redis
      );


    proActive =
      proStatus?.active === true;


    /*
    ======================================================
    UPLOADED IMAGE
    ======================================================
    */

    const rawImage =
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
        rawImage
      );


    if (!imageBase64) {

      return res
        .status(400)
        .json({

          ok:
            false,

          success:
            false,

          error:
            "No valid clothing image was received. Upload a JPG, PNG or WEBP image and try again.",

        });

    }


    /*
    ======================================================
    MIME
    ======================================================
    */

    const mime =
      getMimeType(
        rawImage
      );


    if (
      !mime.startsWith(
        "image/"
      )
    ) {

      return res
        .status(400)
        .json({

          ok:
            false,

          success:
            false,

          error:
            "The uploaded file is not a valid image.",

        });

    }


    /*
    ======================================================
    BUFFER
    ======================================================
    */

    const buffer =
      Buffer.from(
        imageBase64,
        "base64"
      );


    if (
      buffer.length >
      MAX_IMAGE_BYTES
    ) {

      return res
        .status(413)
        .json({

          ok:
            false,

          success:
            false,

          error:
            "The clothing image is too large. Please use an image under 9MB.",

        });

    }


    if (
      buffer.length <
      1000
    ) {

      return res
        .status(400)
        .json({

          ok:
            false,

          success:
            false,

          error:
            "The uploaded image appears to be empty or corrupted.",

        });

    }


    /*
    ======================================================
    REFERENCE FILE
    ======================================================
    */

    const extension =
      extensionFromMime(
        mime
      );


    const imageFile =
      new File(

        [buffer],

        `obitrend-reference.${extension}`,

        {
          type:
            mime,
        }

      );


    /*
    ======================================================
    ASPECT RATIO
    ======================================================
    */

    const aspectRatio =
      clean(

        body.aspectRatio ||
        body.ratio,

        "4:5"

      );


    const size =
      getImageSize(
        aspectRatio
      );


    /*
    ======================================================
    EXPLICIT COLOURS
    ======================================================
    */

    const colourList =
      getColourList(
        body
      );


    /*
    ======================================================
    REFERENCE MODE
    ======================================================

    We intentionally do NOT use the old instruction:

       "uploaded garment is the actual product"

    Instead the uploaded image is reference-only.

    ======================================================
    */


    /*
    ======================================================
    MULTI-COLOUR MODE
    ======================================================
    */

    if (
      colourList.length > 0
    ) {


      /*
       * FREE USERS
       *
       * One credit per requested colour.
       */

      if (
        !proActive
      ) {

        for (
          let i = 0;
          i < colourList.length;
          i++
        ) {

          const creditResult =
            await spendCredit(
              userId,
              redis
            );


          if (
            !creditResult?.success
          ) {

            await refundMany(
              userId,
              redis,
              spentCredits
            );


            return res
              .status(402)
              .json({

                ok:
                  false,

                success:
                  false,

                upgradeRequired:
                  true,

                proActive:
                  false,

                error:
                  `You need ${colourList.length} generation credits to create one image for each selected colour. Please upgrade to OBITREND Pro.`,

                balance:
                  creditResult?.balance ??
                  0,

              });

          }


          spentCredits++;

        }

      }


      /*
       * Generate one image per colour.
       */

      const results =
        await Promise.allSettled(

          colourList.map(
            async (
              colour
            ) => {

              const prompt =
                buildPrompt(
                  body,
                  colour
                );


              const imageUrl =
                await generateOneImage({

                  imageFile:
                    imageFile,

                  prompt:
                    prompt,

                  size:
                    size,

                });


              return {

                imageUrl:
                  imageUrl,

                color:
                  colour,

                colour:
                  colour,

              };

            }
          )

        );


      /*
       * Successful images.
       */

      const generated = [];


      /*
       * Failed jobs.
       */

      let failedCount =
        0;


      let firstFailure =
        null;


      /*
       * Collect.
       */

      for (
        const result of results
      ) {

        if (
          result.status ===
          "fulfilled"
        ) {

          generated.push(
            result.value
          );

        }

        else {

          failedCount++;


          if (
            !firstFailure
          ) {

            firstFailure =
              result.reason;

          }


          console.error(
            "OBITREND COLOUR GENERATION ERROR:",
            result.reason
          );

        }

      }


      /*
       * Refund failed jobs.
       */

      if (
        !proActive &&
        failedCount > 0
      ) {

        await refundMany(
          userId,
          redis,
          failedCount
        );


        spentCredits -=
          failedCount;

      }


      /*
       * Nothing succeeded.
       */

      if (
        !generated.length
      ) {

        throw (
          firstFailure ||
          new Error(
            "No colour image was generated."
          )
        );

      }


      /*
       * IMAGE URLS
       */

      const images =
        generated.map(
          item =>
            item.imageUrl
        );


      /*
       * SUCCESS RESPONSE
       */

      return res
        .status(200)
        .json({

          ok:
            true,

          success:
            true,

          proActive:
            proActive,

          upgradeRequired:
            false,


          /*
           * BACKWARD COMPATIBILITY
           */

          imageUrl:
            images[0],

          url:
            images[0],

          image:
            images[0],

          generatedImage:
            images[0],


          /*
           * ALL IMAGES
           */

          images:
            images,


          /*
           * COLOUR OBJECTS
           */

          colorImages:
            generated,

          colourImages:
            generated,


          /*
           * COLOUR ARRAYS
           */

          colors:
            generated.map(
              item =>
                item.color
            ),

          colours:
            generated.map(
              item =>
                item.colour
            ),


          /*
           * COUNTS
           */

          count:
            images.length,

          requestedCount:
            colourList.length,


          /*
           * REQUESTED
           */

          requestedColours:
            colourList,


          /*
           * GENERATED
           */

          generatedColours:
            generated.map(
              item =>
                item.colour
            ),


          /*
           * FAILED
           */

          failedColours:
            colourList.filter(
              colour =>
                !generated.some(
                  item =>
                    item.colour ===
                    colour
                )
            ),


          partial:
            failedCount > 0,


          /*
           * MODEL
           */

          model:
            MODEL,


          /*
           * RATIO
           */

          aspectRatio:
            aspectRatio,


          /*
           * SIZE
           */

          size:
            size,


          /*
           * CREDITS
           */

          creditsUsed:
            proActive
              ? 0
              : spentCredits,


          balance:
            null,


          /*
           * NEW MODE FLAG
           */

          referenceOnly:
            true,


          /*
           * MESSAGE
           */

          message:

            failedCount > 0

              ? `OBITREND generated ${images.length} of ${colourList.length} selected colour image(s). Failed colour jobs were refunded.`

              : proActive

                ? `OBITREND Pro created ${images.length} premium fashion image(s) with new outfit styling.`

                : `OBITREND created ${images.length} premium fashion image(s) with new outfit styling.`,

        });

    }


    /*
    ======================================================
    NORMAL SINGLE-IMAGE MODE
    ======================================================
    */

    const prompt =
      buildPrompt(
        body,
        null
      );


    /*
     * Existing credit system.
     */

    let creditResult = {

      success:
        true,

      balance:
        null,

    };


    /*
     * Free user = one credit.
     */

    if (
      !proActive
    ) {

      creditResult =
        await spendCredit(
          userId,
          redis
        );


      if (
        !creditResult?.success
      ) {

        return res
          .status(402)
          .json({

            ok:
              false,

            success:
              false,

            upgradeRequired:
              true,

            proActive:
              false,

            error:
              "Your free OBITREND generations have been used. Upgrade to OBITREND Pro to continue.",

            balance:
              creditResult?.balance ??
              0,

          });

      }


      spentCredits =
        1;

    }


    /*
    ======================================================
    EXACTLY ONE IMAGE
    ======================================================
    */

    const imageUrl =
      await generateOneImage({

        imageFile:
          imageFile,

        prompt:
          prompt,

        size:
          size,

      });


    /*
     * Keep one-image array.
     */

    const images = [
      imageUrl,
    ];


    /*
    ======================================================
    SUCCESS
    ======================================================
    */

    return res
      .status(200)
      .json({

        ok:
          true,

        success:
          true,

        proActive:
          proActive,

        upgradeRequired:
          false,


        /*
         * Existing fields.
         */

        imageUrl:
          imageUrl,

        url:
          imageUrl,

        image:
          imageUrl,

        generatedImage:
          imageUrl,


        /*
         * Exactly ONE.
         */

        images:
          images,

        count:
          1,

        requestedCount:
          1,


        /*
         * Model.
         */

        model:
          MODEL,


        /*
         * Ratio.
         */

        aspectRatio:
          aspectRatio,


        /*
         * Size.
         */

        size:
          size,


        /*
         * Credits.
         */

        creditsUsed:
          proActive
            ? 0
            : 1,


        /*
         * Existing balance compatibility.
         */

        balance:
          proActive
            ? null
            : creditResult?.balance ??
              null,


        /*
         * New mode.
         */

        referenceOnly:
          true,


        /*
         * Message.
         */

        message:
          proActive

            ? "OBITREND Pro generated one premium fashion image with a newly styled outfit."

            : "OBITREND generated one premium fashion image with a newly styled outfit.",

      });


  } catch (
    error
  ) {


    /*
    ======================================================
    LOG
    ======================================================
    */

    console.error(
      "OBITREND GENERATION ERROR:",
      error
    );


    /*
    ======================================================
    REFUND
    ======================================================
    */

    if (
      spentCredits > 0 &&
      userId &&
      redis
    ) {

      await refundMany(
        userId,
        redis,
        spentCredits
      );

    }


    /*
    ======================================================
    STATUS
    ======================================================
    */

    const status =

      Number.isInteger(
        error?.status
      ) &&

      error.status >= 400

        ? error.status

        : 500;


    /*
    ======================================================
    ERROR RESPONSE
    ======================================================
    */

    return res
      .status(status)
      .json({

        ok:
          false,

        success:
          false,

        proActive:
          proActive,

        upgradeRequired:
          false,

        error:
          getSafeErrorMessage(
            error
          ),

      });

  }

}
