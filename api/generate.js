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
SAFE MULTI-COLOUR ENGINE
=========================================================

IMPORTANT COMPATIBILITY RULE

Existing frontend:
    clothingColor: "Red"

continues to work exactly as a normal single generation.

Multi-colour mode is activated ONLY when the frontend
explicitly sends:

    clothingColors: ["Red", "Black", "White"]

or:

    colors: ["Red", "Black", "White"]

or:

    selectedColors: ["Red", "Black", "White"]

This prevents the existing clothingColor dropdown
from accidentally changing the old generation behavior.

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

const DEFAULT_IMAGE_COUNT = 4;

const MAX_IMAGE_COUNT = 4;

/*
Maximum number of explicit colours in one request.

Kept at 4 so the request remains reasonably safe
for a serverless function.
*/
const MAX_COLOUR_IMAGES = 4;


/*
=========================================================
BASIC HELPERS
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
BASE64
=========================================================
*/

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
    return match[1].toLowerCase();
  }

  return "image/jpeg";
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


/*
=========================================================
IMAGE SIZE
=========================================================
*/

function getImageSize(value) {
  const ratio =
    clean(value, "4:5").toLowerCase();

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

  return "1024x1536";
}


/*
=========================================================
IMAGE COUNT
=========================================================
*/

function getImageCount(value) {
  const requested =
    Number.parseInt(value, 10);

  if (!Number.isFinite(requested)) {
    return DEFAULT_IMAGE_COUNT;
  }

  if (requested < 1) {
    return 1;
  }

  return Math.min(
    requested,
    MAX_IMAGE_COUNT
  );
}


/*
=========================================================
EXPLICIT MULTI-COLOUR LIST
=========================================================

IMPORTANT:

We deliberately DO NOT use:

    clothingColor

here.

That field already exists in your current frontend
and must remain backward compatible.

Only explicit arrays activate multi-colour mode.

=========================================================
*/

function getExplicitColourList(body) {
  const raw =
    getValue(
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
      .map(value => value.trim());
  }

  list = [
    ...new Set(
      list
        .map(value => String(value).trim())
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
PROMPT
=========================================================
*/

function buildPrompt(
  body,
  imageCount,
  selectedColour = null
) {
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

  const pose =
    clean(
      getValue(
        body,
        "pose"
      ),
      "confident natural full-body fashion pose"
    );

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

  const clothingColor =
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

  const location =
    [
      clean(body.locationType),
      clean(body.city),
      clean(body.property),
    ]
      .filter(Boolean)
      .join(", ") ||
    "premium modern fashion location";

  const vehicle =
    clean(
      getValue(
        body,
        "vehicle"
      ),
      "no vehicle required"
    );

  const camera =
    clean(
      getValue(
        body,
        "camera"
      ),
      "professional full-frame fashion photography"
    );

  const lighting =
    clean(
      getValue(
        body,
        "lighting"
      ),
      "soft natural daylight with realistic shadows"
    );


  /*
  =======================================================
  COLOUR INSTRUCTION
  =======================================================
  */

  let colourInstruction = "";

  if (selectedColour) {

    colourInstruction = `
TARGET GARMENT COLOUR:

${selectedColour}

Create this image as the SAME uploaded garment
in ${selectedColour}.

Change ONLY the garment colour.

Preserve exactly:

- garment shape
- garment silhouette
- garment length
- garment proportions
- neckline
- collar
- sleeves
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
- checks
- patterns
- decorative details
- fabric appearance
- construction

The garment must look like the same real-world
product manufactured in ${selectedColour}.

Do not replace the garment.
Do not redesign the garment.
`;

  } else {

    colourInstruction = `
GARMENT COLOUR:

Preserve the clothing colour selected by the
existing OBITREND clothingColor control:

${clothingColor}

Do not invent another colour.
`;

  }


  return `

OBITREND AI FASHION CREATOR

PREMIUM PHOTOREALISTIC FASHION IMAGE


==================================================
PRIMARY IMAGE REFERENCE
==================================================

The uploaded clothing photograph is the PRIMARY
and AUTHORITATIVE garment reference.

The uploaded garment is the actual product.

Do not treat the garment as inspiration.

Do not substitute it with another garment.


==================================================
GARMENT PRESERVATION
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
- decorative elements
- construction
- panel placement

Do NOT:

- redesign the garment
- replace the garment
- simplify the garment
- shorten the garment
- lengthen the garment
- remove garment details
- add unauthorized details
- invent patterns
- invent pockets
- invent buttons


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

Use an adult professional fashion model aged 18+.

Natural:

- anatomy
- facial features
- skin
- hair
- hands
- fingers
- feet
- body proportions


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

Footwear must look physically realistic
and correctly connect to the model's feet.


==================================================
LOCATION
==================================================

${location}

Vehicle:

${vehicle}


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

Clothing style:

${clothingStyle}

Creative direction:

${creativeDirection}


==================================================
PHOTOREALISM
==================================================

Create a professional commercial fashion
photograph.

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
IMAGE COUNT
==================================================

Create ${imageCount} image(s).

Every image must be a believable professional
fashion photograph.


==================================================
FINAL PRIORITY
==================================================

Priority:

1. Uploaded garment
2. Garment colour
3. Garment construction
4. Garment pattern
5. Garment visibility
6. Realistic anatomy
7. Model
8. Pose
9. Footwear
10. Location
11. Lighting
12. Creative direction

If a creative instruction conflicts with the
uploaded garment:

ALWAYS PRIORITIZE THE UPLOADED GARMENT.


Create the final premium OBITREND
fashion campaign photograph.
`;
}


/*
=========================================================
OPENAI RESPONSE NORMALIZATION
=========================================================
*/

function imageDataToUrls(data) {

  return (
    Array.isArray(data)
      ? data
      : []
  )
    .map(item => {

      if (item?.b64_json) {
        return (
          "data:image/png;base64," +
          item.b64_json
        );
      }

      if (item?.url) {
        return item.url;
      }

      return null;

    })
    .filter(Boolean);
}


/*
=========================================================
SAFE ERROR
=========================================================
*/

function getSafeErrorMessage(error) {

  const status =
    Number(error?.status);

  if (status === 400) {
    return (
      error?.message ||
      "The image request was rejected. Please check the uploaded image and generation settings."
    );
  }

  if (status === 401) {
    return (
      "OpenAI API authentication failed. " +
      "Your existing OPENAI_API_KEY could not be authenticated."
    );
  }

  if (status === 403) {
    return (
      "The OpenAI account or API key is not permitted " +
      "to use the selected image model."
    );
  }

  if (status === 404) {
    return (
      `The image model "${MODEL}" was not found ` +
      "or is not available to this API key."
    );
  }

  if (status === 413) {
    return (
      "The uploaded clothing image is too large. " +
      "Please use a smaller image."
    );
  }

  if (status === 429) {
    return (
      "The image service is temporarily busy or rate-limited. " +
      "Please try again shortly."
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
GENERATE ONE IMAGE
=========================================================
*/

async function generateOneImage({
  imageFile,
  prompt,
  size,
  count = 1
}) {

  const result =
    await openai.images.edit({

      model: MODEL,

      image: imageFile,

      prompt,

      size,

      quality: "medium",

      n: count

    });


  const images =
    imageDataToUrls(
      result?.data
    );


  if (!images.length) {

    const error =
      new Error(
        "The image service returned no generated image."
      );

    error.status = 502;

    throw error;
  }


  return images;
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
  =======================================================
  CORS
  =======================================================
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


  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }


  if (req.method !== "POST") {

    return res
      .status(405)
      .json({
        ok: false,
        success: false,
        error:
          "Method not allowed. Use POST."
      });
  }


  let userId = "";

  let redis = null;

  let proActive = false;

  let spentCredits = 0;


  try {

    /*
    =====================================================
    OPENAI KEY
    =====================================================
    */

    if (!process.env.OPENAI_API_KEY) {

      return res
        .status(500)
        .json({
          ok: false,
          success: false,
          error:
            "OPENAI_API_KEY is missing from Vercel Environment Variables."
        });
    }


    /*
    =====================================================
    BODY
    =====================================================
    */

    const body =
      req.body || {};


    /*
    =====================================================
    USER ID
    =====================================================
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
          ok: false,
          success: false,
          error:
            "A valid OBITREND user ID is required."
        });
    }


    /*
    =====================================================
    REDIS
    =====================================================
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
          ok: false,
          success: false,
          error:
            "OBITREND credit system is not configured."
        });
    }


    /*
    =====================================================
    PRO STATUS
    =====================================================
    */

    const proStatus =
      await getProStatus(
        userId,
        redis
      );

    proActive =
      proStatus?.active === true;


    /*
    =====================================================
    IMAGE
    =====================================================
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
      normalizeBase64(rawImage);


    if (!imageBase64) {

      return res
        .status(400)
        .json({
          ok: false,
          success: false,
          error:
            "No valid clothing image was received. Upload a JPG, PNG or WEBP image and try again."
        });
    }


    /*
    =====================================================
    MIME
    =====================================================
    */

    const mime =
      getMimeType(rawImage);


    if (!mime.startsWith("image/")) {

      return res
        .status(400)
        .json({
          ok: false,
          success: false,
          error:
            "The uploaded file is not a valid image."
        });
    }


    /*
    =====================================================
    BUFFER
    =====================================================
    */

    const buffer =
      Buffer.from(
        imageBase64,
        "base64"
      );


    if (
      buffer.length >
      9 * 1024 * 1024
    ) {

      return res
        .status(413)
        .json({
          ok: false,
          success: false,
          error:
            "The clothing image is too large. Please use an image under 9MB."
        });
    }


    if (buffer.length < 1000) {

      return res
        .status(400)
        .json({
          ok: false,
          success: false,
          error:
            "The uploaded image appears to be empty or corrupted."
        });
    }


    /*
    =====================================================
    REFERENCE FILE
    =====================================================
    */

    const extension =
      extensionFromMime(mime);


    const imageFile =
      new File(
        [buffer],
        `obitrend-reference.${extension}`,
        {
          type: mime
        }
      );


    /*
    =====================================================
    IMAGE SETTINGS
    =====================================================
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
    =====================================================
    IMPORTANT:
    EXPLICIT MULTI-COLOUR MODE ONLY
    =====================================================
    */

    const colourList =
      getExplicitColourList(body);


    /*
    =====================================================
    MODE A:
    EXPLICIT MULTI-COLOUR
    =====================================================
    */

    if (colourList.length > 0) {

      /*
       * Each colour = exactly one image.
       */

      const generated = [];


      /*
       * Generate sequentially.

       * This is deliberately NOT Promise.all().

       * It reduces the chance of the Vercel
       * request failing because several image
       * generations are running simultaneously.
       */

      for (
        const colour of colourList
      ) {

        /*
        -----------------------------------------------
        CREDIT
        -----------------------------------------------
        */

        if (!proActive) {

          const creditResult =
            await spendCredit(
              userId,
              redis
            );


          if (
            !creditResult?.success
          ) {

            /*
             * Refund previous successful
             * colour generations from this
             * request.
             */

            for (
              let i = 0;
              i < spentCredits;
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
                  "OBITREND REFUND ERROR:",
                  refundError
                );

              }
            }


            return res
              .status(402)
              .json({

                ok: false,

                success: false,

                upgradeRequired: true,

                proActive: false,

                error:
                  `You need ${colourList.length} generation credit(s) to create one image for every selected colour.`,

                balance:
                  creditResult?.balance ?? 0

              });
          }


          spentCredits++;
        }


        /*
        -----------------------------------------------
        PROMPT FOR THIS COLOUR
        -----------------------------------------------
        */

        const prompt =
          buildPrompt(
            body,
            1,
            colour
          );


        /*
        -----------------------------------------------
        GENERATE ONE
        -----------------------------------------------
        */

        const images =
          await generateOneImage({

            imageFile,

            prompt,

            size,

            count: 1

          });


        const imageUrl =
          images[0];


        if (!imageUrl) {

          const error =
            new Error(
              `No image was returned for colour "${colour}".`
            );

          error.status = 502;

          throw error;
        }


        generated.push({

          imageUrl,

          color: colour,

          colour: colour

        });
      }


      /*
      ==================================================
      MULTI-COLOUR SUCCESS
      ==================================================
      */

      const images =
        generated.map(
          item =>
            item.imageUrl
        );


      return res
        .status(200)
        .json({

          ok: true,

          success: true,

          proActive,

          upgradeRequired: false,


          /*
           * Existing response compatibility.
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
           * All generated images.
           */

          images,


          /*
           * Colour-aware results.
           */

          colorImages:
            generated,

          colourImages:
            generated,


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
           * Counts.
           */

          count:
            images.length,

          requestedCount:
            images.length,


          requestedColours:
            colourList,


          model:
            MODEL,

          aspectRatio,

          size,


          creditsUsed:
            proActive
              ? 0
              : colourList.length,


          balance:
            null,


          message:
            proActive
              ? `OBITREND Pro created ${images.length} premium fashion image(s), one image for each selected colour.`
              : `OBITREND created ${images.length} premium fashion image(s), one image for each selected colour.`

        });
    }


    /*
    =====================================================
    MODE B:
    EXISTING APP BEHAVIOUR
    =====================================================

    This is the important compatibility section.

    Your current frontend sends:

        clothingColor: "Red"

    but does NOT send clothingColors[].

    Therefore this section runs and the old
    multi-image behaviour remains intact.
    =====================================================
    */

    const imageCount =
      getImageCount(
        body.imageCount
      );


    const prompt =
      buildPrompt(
        body,
        imageCount,
        null
      );


    let creditResult = {

      success: true,

      balance: null

    };


    /*
    Existing app:
    one generation request = one credit.
    */

    if (!proActive) {

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

            ok: false,

            success: false,

            upgradeRequired: true,

            proActive: false,

            error:
              "Your free OBITREND generations have been used. Upgrade to OBITREND Pro to continue.",

            balance:
              creditResult?.balance ?? 0

          });
      }


      spentCredits = 1;
    }


    /*
    =====================================================
    EXISTING MULTI-IMAGE REQUEST
    =====================================================
    */

    const images =
      await generateOneImage({

        imageFile,

        prompt,

        size,

        count: imageCount

      });


    if (!images.length) {

      const error =
        new Error(
          "The image service returned no valid generated image data."
        );

      error.status = 502;

      throw error;
    }


    /*
    =====================================================
    EXISTING SUCCESS RESPONSE
    =====================================================
    */

    return res
      .status(200)
      .json({

        ok: true,

        success: true,

        proActive,

        upgradeRequired: false,


        imageUrl:
          images[0],

        url:
          images[0],

        image:
          images[0],

        generatedImage:
          images[0],


        images,


        count:
          images.length,

        requestedCount:
          imageCount,


        model:
          MODEL,

        aspectRatio,

        size,


        creditsUsed:
          proActive
            ? 0
            : 1,


        balance:
          proActive
            ? null
            : creditResult?.balance ?? null,


        message:
          proActive
            ? `OBITREND Pro generated ${images.length} premium fashion images successfully.`
            : `OBITREND generated ${images.length} premium fashion images successfully.`

      });


  } catch (error) {

    console.error(
      "OBITREND GENERATION ERROR:",
      error
    );


    /*
    =====================================================
    REFUND
    =====================================================
    */

    if (
      spentCredits > 0 &&
      userId &&
      redis
    ) {

      for (
        let i = 0;
        i < spentCredits;
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


    const status =
      Number.isInteger(
        error?.status
      ) &&
      error.status >= 400
        ? error.status
        : 500;


    return res
      .status(status)
      .json({

        ok: false,

        success: false,

        proActive,

        upgradeRequired: false,

        error:
          getSafeErrorMessage(
            error
          )

      });
  }
}
