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
SAFE SINGLE-IMAGE + ONE-IMAGE-PER-COLOUR ENGINE
=========================================================

EXISTING BEHAVIOUR IS PRESERVED.

NORMAL GENERATION:
    1 Generate click = 1 image

MULTI-COLOUR:
    clothingColors: ["Red", "Black", "White"]

    Red   = 1 image
    Black = 1 image
    White = 1 image

TOTAL = 3 images

OPTIONAL CHILD / COMPANION:

    companion: "Toddler Boy"

OR

    child: "Toddler Boy"

OR

    childType: "Toddler Boy"

OR

    companionType: "Toddler Boy"

OR

    includeChild: true
    childGender: "boy"

If none of these are supplied, NO CHILD is added.

This file intentionally keeps the existing:
- OPENAI_API_KEY
- credits.js
- Pro system
- /api/generate endpoint
- imageBase64
- uploadedImage
- image
- clothingImage
- referenceImage
- imageUrl
- url
- image
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
OPTIONAL CHILD / COMPANION
=========================================================
*/

function getCompanion(body) {

  /*
   * Accept several possible frontend names so we do not
   * need to redesign the API later.
   */

  const directValue =
    getValue(
      body,
      "companion",
      "child",
      "childType",
      "companionType",
      "additionalPerson"
    );


  /*
   * Explicit "None" selection.
   */

  if (directValue) {

    const value =
      clean(directValue);

    const normalized =
      value.toLowerCase();

    if (
      normalized === "none" ||
      normalized === "no child" ||
      normalized === "no companion" ||
      normalized === "none selected"
    ) {
      return null;
    }

    return value;
  }


  /*
   * Boolean support.
   */

  if (
    body?.includeChild === true
  ) {

    const gender =
      clean(
        getValue(
          body,
          "childGender",
          "companionGender"
        ),
        "boy"
      );

    if (
      gender
        .toLowerCase()
        .includes("girl")
    ) {
      return "Toddler Girl";
    }

    return "Toddler Boy";
  }


  /*
   * No child selected.
   */

  return null;
}


/*
=========================================================
CHILD / COMPANION PROMPT
=========================================================
*/

function buildCompanionInstruction(body) {

  const companion =
    getCompanion(body);


  /*
   * IMPORTANT:
   *
   * Existing app behaviour when no child is selected.
   */

  if (!companion) {

    return `

==================================================
CHILD / COMPANION
==================================================

No additional child or companion was requested.

Do not add an extra person.

If the uploaded reference image visibly contains
a child that is clearly part of the requested scene,
do not intentionally erase that child when preserving
the reference composition is appropriate.

`;

  }


  /*
   * TODDLER BOY
   */

  if (
    companion
      .toLowerCase()
      .includes("toddler boy")
  ) {

    return `

==================================================
CHILD / COMPANION
==================================================

ADD EXACTLY ONE TODDLER BOY.

The toddler boy is an additional person in the
fashion photograph.

COMPOSITION:

- Place ONE toddler boy naturally beside the adult
  model.
- Keep the toddler clearly separate from the adult.
- The adult and toddler must both be fully visible
  whenever the selected framing allows it.
- Use realistic toddler proportions.
- Make the child clearly look like a young toddler.
- Keep the child age-appropriate.
- Give the toddler natural posture and movement.
- The toddler may naturally stand beside the adult
  or interact gently with the adult.

REFERENCE PRESERVATION:

If a toddler boy is visible in the uploaded reference
image, use that visible child as a visual reference
for the child's general appearance.

Preserve, where reasonably possible:

- approximate age
- gender
- general hairstyle
- general skin tone
- general clothing appearance
- general proportions

DO NOT:

- remove the toddler
- duplicate the toddler
- create two toddlers
- turn the toddler into an adult
- make the toddler look like a teenager
- make the toddler unusually tall
- merge the toddler with the adult
- merge their bodies
- duplicate limbs
- create malformed hands
- create malformed feet
- create unnatural anatomy

The toddler must look like a real separate child
photographed in the same location as the adult.

IMPORTANT GARMENT RULE:

The uploaded garment remains the PRIMARY and
AUTHORITATIVE fashion reference.

The toddler instruction must NEVER cause the
adult's uploaded garment to be redesigned,
replaced, simplified or removed.

`;

  }


  /*
   * TODDLER GIRL
   */

  if (
    companion
      .toLowerCase()
      .includes("toddler girl")
  ) {

    return `

==================================================
CHILD / COMPANION
==================================================

ADD EXACTLY ONE TODDLER GIRL.

The toddler girl is an additional person in the
fashion photograph.

COMPOSITION:

- Place ONE toddler girl naturally beside the adult
  model.
- Keep the toddler clearly separate from the adult.
- Use realistic toddler proportions.
- Keep the child age-appropriate.
- Give the child natural posture and movement.
- Make the scene look like a real photograph.

REFERENCE PRESERVATION:

If a toddler girl is visible in the uploaded image,
use the visible child as a visual reference for her
general appearance.

DO NOT:

- remove the child
- duplicate the child
- create multiple children
- turn the child into an adult
- make the child look like a teenager
- merge the child with the adult
- create malformed anatomy

The uploaded garment remains the PRIMARY reference.

`;

  }


  /*
   * GENERIC COMPANION
   */

  return `

==================================================
CHILD / COMPANION
==================================================

ADD EXACTLY ONE ADDITIONAL PERSON:

${companion}

The additional person must appear naturally beside
the adult model.

Use realistic proportions and natural anatomy.

If this person is visible in the uploaded reference
image, preserve their general appearance as much as
possible.

DO NOT:

- duplicate the person
- create multiple additional people
- merge people
- turn a child into an adult
- create malformed anatomy
- remove a requested person

The uploaded garment remains the PRIMARY reference.

`;

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


  /*
   * Remove data:image/...;base64,
   */

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


  /*
   * Remove whitespace.
   */

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


  /*
   * Square
   */

  if (
    ratio.includes("1:1") ||
    ratio.includes("square")
  ) {

    return "1024x1024";

  }


  /*
   * Landscape
   */

  if (
    ratio.includes("16:9") ||
    ratio.includes("5:4") ||
    ratio.includes("landscape")
  ) {

    return "1536x1024";

  }


  /*
   * Portrait
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


  /*
   * Array
   */

  if (
    Array.isArray(raw)
  ) {

    list = raw;

  }


  /*
   * Comma-separated string
   */

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


  /*
   * Remove empty values and duplicates.
   */

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


  /*
   * Safety limit.
   */

  return list.slice(
    0,
    MAX_COLOUR_IMAGES
  );

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
      "realistic footwear that naturally matches the outfit"
    );


  /*
   * CLOTHING
   */

  const clothingType =
    clean(
      getValue(
        body,
        "clothingType",
        "garmentType",
        "outfitType"
      ),
      "the exact uploaded garment"
    );


  const originalColour =
    clean(
      getValue(
        body,
        "clothingColor",
        "color",
        "colour"
      ),
      "original colour"
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


  /*
   * FASHION STYLE
   */

  const fashionStyle =
    clean(
      getValue(
        body,
        "fashionStyle"
      ),
      "luxury fashion editorial"
    );


  /*
   * CREATIVE DIRECTION
   */

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
   * CHILD / COMPANION
   */

  const companionInstruction =
    buildCompanionInstruction(
      body
    );


  /*
   * COLOUR INSTRUCTION
   */

  let colourInstruction;


  /*
   * MULTI-COLOUR IMAGE
   */

  if (
    selectedColour
  ) {

    colourInstruction = `

TARGET GARMENT COLOUR FOR THIS IMAGE:

${selectedColour}

Change ONLY the colour of the uploaded garment
to ${selectedColour}.

The garment itself must remain the SAME garment.

DO NOT CHANGE:

- garment type
- garment shape
- garment silhouette
- garment length
- garment proportions
- neckline
- collar
- sleeves
- sleeve length
- cuffs
- waistband
- hem
- pockets
- buttons
- zippers
- straps
- seams
- stitching
- logos
- graphics
- prints
- stripes
- patterns
- decorative details
- fabric texture
- fabric construction

The result should look like the SAME real-world
garment manufactured in ${selectedColour}.

Do not redesign the garment.
Do not replace the garment.

`;

  }


  /*
   * NORMAL IMAGE
   */

  else {

    colourInstruction = `

PRESERVE THE ORIGINAL GARMENT COLOUR.

Original colour:

${originalColour}

Do not recolour the garment.

`;

  }


  /*
   * FINAL PROMPT
   */

  return `

OBITREND AI FASHION CREATOR

Create ONE premium photorealistic fashion photograph.


==================================================
PRIMARY REFERENCE
==================================================

The uploaded clothing image is the PRIMARY
and AUTHORITATIVE garment reference.

The uploaded garment is the actual product.

It is NOT merely inspiration.

Do NOT replace it.

Do NOT redesign it.

Do NOT invent another garment.


==================================================
EXACT GARMENT PRESERVATION
==================================================

Preserve the uploaded garment as accurately
as possible.

Preserve:

- garment type
- garment shape
- garment silhouette
- garment length
- garment proportions
- neckline
- collar
- sleeves
- sleeve length
- cuffs
- waistband
- hem
- pockets
- buttons
- zippers
- straps
- seams
- stitching
- fabric texture
- fabric appearance
- folds
- patterns
- stripes
- checks
- graphics
- prints
- logos
- decorative details
- construction
- panel placement


DO NOT:

- redesign the garment
- replace the garment
- simplify the garment
- shorten it
- lengthen it
- change its silhouette
- remove important details
- add unauthorized details
- invent new pockets
- invent new buttons
- invent new graphics
- invent new patterns


The final garment must clearly look like
the SAME real-world garment shown in
the uploaded reference.


==================================================
COLOUR
==================================================

${colourInstruction}


==================================================
MODEL
==================================================

Gender:

${gender}


Model:

${model}


Body type:

${bodyType}


Face:

${face}


Use a realistic adult fashion model aged 18+.


Natural:

- anatomy
- face
- skin
- hair
- hands
- fingers
- feet
- proportions


==================================================
CHILD / COMPANION
==================================================

${companionInstruction}


==================================================
POSE
==================================================

${pose}


Use a professional natural fashion pose.

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


Footwear must look physically realistic
and correctly connect to the model's feet.


==================================================
CLOTHING
==================================================

Clothing type:

${clothingType}


Clothing style:

${clothingStyle}


==================================================
LOCATION
==================================================

${location}


Vehicle:

${vehicle}


Create a realistic premium fashion campaign.


==================================================
CAMERA
==================================================

${camera}


Use realistic:

- perspective
- lens behavior
- proportions
- depth of field
- photographic detail


==================================================
LIGHTING
==================================================

${lighting}


Use realistic:

- shadows
- reflections
- skin tones
- garment texture
- environmental lighting


==================================================
FASHION STYLE
==================================================

${fashionStyle}


==================================================
CREATIVE DIRECTION
==================================================

${creativeDirection}


==================================================
PHOTOREALISM
==================================================

Do NOT create:

- cartoon
- anime
- illustration
- painting
- CGI-looking people
- plastic skin
- artificial anatomy


Create realistic:

- skin texture
- hair
- hands
- fingers
- feet
- fabric folds
- fabric texture
- lighting
- shadows
- reflections
- perspective


==================================================
PEOPLE COMPOSITION
==================================================

Every requested person must be a distinct,
complete human being.

Do NOT:

- merge people
- duplicate people
- remove a requested person
- create extra people
- create duplicated limbs
- create malformed hands
- create malformed feet

If a toddler boy is requested:

Create ONE separate toddler boy beside
the adult model.

The toddler must remain clearly recognizable
as a separate child.


==================================================
FINAL PRIORITY
==================================================

Priority order:

1. Uploaded garment
2. Target garment colour
3. Garment construction
4. Garment pattern
5. Garment visibility
6. Requested people
7. Realistic anatomy
8. Model
9. Child/companion
10. Pose
11. Footwear
12. Location
13. Lighting
14. Creative direction


If any creative instruction conflicts
with the uploaded garment:

ALWAYS PRIORITIZE THE UPLOADED GARMENT.


==================================================
FINAL OUTPUT
==================================================

Create ONE final premium OBITREND
fashion campaign photograph.

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

        /*
         * Base64 result.
         */

        if (
          item?.b64_json
        ) {

          return (
            "data:image/png;base64:" +
            item.b64_json
          );

        }


        /*
         * URL result.
         */

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

CRITICAL:

n: 1

Normal generation = exactly one image.

Multi-colour generation calls this function once
for each selected colour.

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


  /*
   * Return ONLY the first image.
   */

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
    GET EXPLICIT COLOURS
    ======================================================
    */

    const colourList =
      getColourList(
        body
      );


    /*
    ======================================================
    MULTI-COLOUR MODE
    ======================================================
    */

    if (
      colourList.length > 0
    ) {


      /*
       * FREE USERS:
       *
       * One credit for every requested colour.
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


          /*
           * Not enough credits.
           */

          if (
            !creditResult?.success
          ) {

            /*
             * Refund credits already spent.
             */

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
       * Generate ONE image per colour.
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
       * Collect results.
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

        } else {

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
       * Refund only failed colour jobs.
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
       * ALL IMAGE URLS
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
           * ALL GENERATED IMAGES
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
           * REQUESTED COLOURS
           */

          requestedColours:
            colourList,


          /*
           * SUCCESSFUL COLOURS
           */

          generatedColours:
            generated.map(
              item =>
                item.colour
            ),


          /*
           * FAILED COLOURS
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


          /*
           * TRUE IF SOME COLOURS FAILED
           */

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


          /*
           * Existing balance compatibility.
           */

          balance:
            null,


          /*
           * Child / companion information.
           *
           * Additive only.
           */

          companion:
            getCompanion(
              body
            ),


          /*
           * MESSAGE
           */

          message:
            failedCount > 0

              ? `OBITREND generated ${images.length} of ${colourList.length} selected colour image(s). Failed colour jobs were refunded.`

              : proActive

                ? `OBITREND Pro created ${images.length} premium fashion image(s), one for each selected colour.`

                : `OBITREND created ${images.length} premium fashion image(s), one for each selected colour.`,

        });

    }


    /*
    ======================================================
    NORMAL SINGLE-IMAGE MODE
    ======================================================

    ALWAYS ONE IMAGE.

    There is no imageCount.
    There is no n: 4.
    There is no multiple-image generation.

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
     * Keep the images array because your existing
     * frontend already uses it.
     *
     * It contains ONLY ONE image.
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
         * NEW:
         * Tell frontend which companion was requested.
         */

        companion:
          getCompanion(
            body
          ),


        /*
         * Message.
         */

        message:
          proActive

            ? "OBITREND Pro generated one premium fashion image successfully."

            : "OBITREND generated one premium fashion image successfully.",

      });


  } catch (
    error
  ) {


    /*
    ======================================================
    LOG ERROR
    ======================================================
    */

    console.error(
      "OBITREND GENERATION ERROR:",
      error
    );


    /*
    ======================================================
    REFUND CREDITS IF GENERATION FAILED
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
