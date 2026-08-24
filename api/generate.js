import OpenAI from "openai";

import {
  spendCredit,
  refundCredit,
  getProStatus,
  getRedisConfig,
} from "./credits.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

/*
=========================================================
OBITREND MULTI-IMAGE SETTINGS
=========================================================
*/

const DEFAULT_IMAGE_COUNT = 4;
const MAX_IMAGE_COUNT = 4;


/*
=========================================================
HELPERS
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


function normalizeBase64(input) {
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

  return "1024x1536";
}


/*
=========================================================
IMAGE COUNT
=========================================================
*/

function getImageCount(value) {
  const requested =
    Number.parseInt(
      value,
      10
    );

  if (
    !Number.isFinite(
      requested
    )
  ) {
    return DEFAULT_IMAGE_COUNT;
  }

  if (
    requested < 1
  ) {
    return 1;
  }

  return Math.min(
    requested,
    MAX_IMAGE_COUNT
  );
}


/*
=========================================================
PROMPT
=========================================================
*/

function buildPrompt(
  body,
  imageCount
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
        "color"
      ),
      "Original Colour"
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


  const preserveOriginalColor =
    [
      "original",
      "original colour",
      "original color",
      "auto detect",
    ].includes(
      clothingColor.toLowerCase()
    );


  const recolorInstruction =
    preserveOriginalColor
      ? "Preserve the original garment colors exactly as shown in the reference."
      : `Change ONLY the garment color to ${clothingColor}. Preserve every other garment detail exactly.`;


  return `

OBITREND AI FASHION CREATOR

MULTI-IMAGE PREMIUM FASHION CAMPAIGN


Create ${imageCount} DIFFERENT,
extremely photorealistic,
professional fashion campaign photographs
using the uploaded image as the PRIMARY
and AUTHORITATIVE clothing reference.


==================================================
MOST IMPORTANT RULE
==================================================

THE UPLOADED GARMENT IS THE ACTUAL PRODUCT.

It is NOT inspiration.

It is NOT a suggestion.

It must NOT be replaced by a similar garment.


==================================================
ABSOLUTE GARMENT FIDELITY
==================================================

Preserve the exact uploaded garment identity
in EVERY generated image.

Preserve exactly:

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
- pattern
- stripes
- checks
- graphics
- prints
- logos
- decorative elements
- construction details
- panel placement


DO NOT redesign the garment.

DO NOT replace the garment.

DO NOT simplify the garment.

DO NOT invent another garment.

DO NOT shorten the garment.

DO NOT lengthen the garment.

DO NOT change the garment silhouette.

DO NOT change the garment construction.

DO NOT remove garment details.

DO NOT add unauthorized garment details.

DO NOT invent new patterns.

DO NOT invent new buttons.

DO NOT invent new pockets.

Keep the uploaded garment clearly recognizable
as the SAME real-world garment in every image.


==================================================
COLOR CONTROL
==================================================

Selected garment color:

${clothingColor}


${recolorInstruction}


If recoloring is requested:

Change ONLY the garment color.

Preserve:

- exact design
- exact pattern
- graphics
- stripes
- seams
- stitching
- neckline
- sleeves
- proportions
- garment length
- fabric appearance

Do not redesign the garment while recoloring it.


==================================================
MODEL
==================================================

Gender:

${gender}


Model:

${model}


Face:

${face}


Body type:

${bodyType}


Use a realistic ADULT fashion model aged 18+.

Use realistic:

- human anatomy
- facial features
- skin texture
- hair
- hands
- fingers
- feet
- body proportions


==================================================
POSE
==================================================

Base pose:

${pose}


Every generated image should have a
natural professional pose.

Avoid:

- distorted hands
- extra fingers
- duplicated fingers
- duplicated limbs
- malformed feet
- unnatural posture
- floating body parts


==================================================
FOOTWEAR
==================================================

${footwear}


Footwear must:

- look realistic
- match the outfit
- be correctly attached to the feet
- naturally touch the ground

Avoid:

- floating shoes
- duplicated shoes
- malformed shoes


==================================================
LOCATION
==================================================

Location:

${location}


Vehicle context:

${vehicle}


Use the selected environment as a
realistic professional fashion campaign.


==================================================
CAMERA
==================================================

${camera}


Use:

- realistic perspective
- realistic lens behavior
- accurate proportions
- professional detail
- realistic depth of field


==================================================
LIGHTING
==================================================

${lighting}


Preserve:

- realistic shadows
- realistic reflections
- accurate skin tones
- accurate garment colors
- realistic fabric texture


==================================================
FASHION DIRECTION
==================================================

Fashion style:

${fashionStyle}


Creative direction:

${creativeDirection}


Create a premium campaign suitable
for a real fashion brand.


==================================================
MULTIPLE IMAGE VARIATION
==================================================

Create ${imageCount} DIFFERENT photographs.

Do NOT make all images identical.

The uploaded garment must remain
the SAME in every image.

Vary naturally between the images:

- camera angle
- pose
- composition
- distance from camera
- body orientation
- background framing
- environment emphasis
- professional campaign mood
- editorial presentation


Use the following campaign variation structure
where appropriate:

IMAGE 1:
Premium hero campaign photograph.

IMAGE 2:
Full-body editorial fashion photograph.

IMAGE 3:
Lifestyle/environment fashion photograph.

IMAGE 4:
Alternative professional fashion angle.


The variations must NEVER change
the uploaded garment.

The garment remains the constant
product reference.


==================================================
PHOTOREALISM
==================================================

The final images must look like
real professional photographs.

NOT:

- cartoon
- anime
- illustration
- painting
- plastic skin
- CGI
- artificial-looking anatomy


Use realistic:

- skin pores
- facial anatomy
- hair
- hands
- fingers
- feet
- body proportions
- fabric folds
- fabric texture
- shadows
- reflections
- lighting
- perspective
- depth of field


Avoid:

- extra fingers
- duplicated limbs
- malformed hands
- distorted feet
- warped clothing
- melted fabric
- floating objects
- unrealistic anatomy


==================================================
COMMERCIAL PRESENTATION
==================================================

Use an adult model aged 18+.

Make the fashion presentation:

- natural
- confident
- professional
- non-sexual
- commercial
- premium


Keep the entire garment visible
whenever the composition allows.


==================================================
PRIORITY ORDER
==================================================

1. EXACT UPLOADED GARMENT
2. GARMENT VISIBILITY
3. GARMENT CONSTRUCTION
4. GARMENT PATTERN
5. PHOTOREALISTIC ANATOMY
6. MODEL
7. POSE
8. FOOTWEAR
9. LOCATION
10. LIGHTING
11. CREATIVE DIRECTION


If any creative instruction conflicts
with the uploaded garment:

ALWAYS PRIORITIZE THE UPLOADED GARMENT.


==================================================
FINAL REQUIREMENT
==================================================

Create ${imageCount} different,
believable, premium professional
fashion photographs of THIS EXACT
UPLOADED GARMENT on a real adult model.

OBITREND EXACT GARMENT.

OBITREND MULTI-IMAGE CAMPAIGN.

`;
}


/*
=========================================================
NORMALIZE OPENAI RESULTS
=========================================================
*/

function imageDataToUrls(
  data
) {

  return (
    Array.isArray(data)
      ? data
      : []
  )
    .map(
      (item) => {

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
ERROR HANDLING
=========================================================
*/

function getSafeErrorMessage(
  error
) {

  const status =
    Number(error?.status);


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
MAIN API
=========================================================
*/

export default async function handler(
  req,
  res
) {

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


  if (
    req.method === "OPTIONS"
  ) {
    return res
      .status(200)
      .end();
  }


  if (
    req.method !== "POST"
  ) {

    return res
      .status(405)
      .json({
        ok:false,
        success:false,
        error:
          "Method not allowed. Use POST."
      });

  }


  let creditSpent =
    false;

  let userId =
    "";

  let redis =
    null;

  let proActive =
    false;


  try {

    /*
    ======================================================
    CHECK OPENAI KEY
    ======================================================
    */

    if (
      !process.env.OPENAI_API_KEY
    ) {

      return res
        .status(500)
        .json({
          ok:false,
          success:false,
          error:
            "OPENAI_API_KEY is missing from Vercel Environment Variables."
        });

    }


    /*
    ======================================================
    REQUEST BODY
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
          ok:false,
          success:false,
          error:
            "A valid OBITREND user ID is required."
        });

    }


    /*
    ======================================================
    REDIS
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
          ok:false,
          success:false,
          error:
            "OBITREND credit system is not configured."
        });

    }


    /*
    ======================================================
    CHECK PRO
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
    GET IMAGE
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
          ok:false,
          success:false,
          error:
            "No valid clothing image was received. Upload a JPG, PNG or WEBP image and try again."
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
          ok:false,
          success:false,
          error:
            "The uploaded file is not a valid image."
        });

    }


    /*
    ======================================================
    IMAGE BUFFER
    ======================================================
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
          ok:false,
          success:false,
          error:
            "The clothing image is too large. Please use an image under 9MB."
        });

    }


    if (
      buffer.length < 1000
    ) {

      return res
        .status(400)
        .json({
          ok:false,
          success:false,
          error:
            "The uploaded image appears to be empty or corrupted."
        });

    }


    /*
    ======================================================
    CREATE FILE
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
          type:mime
        }
      );


    /*
    ======================================================
    IMAGE SETTINGS
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


    const imageCount =
      getImageCount(
        body.imageCount
      );


    const prompt =
      buildPrompt(
        body,
        imageCount
      );


    /*
    ======================================================
    CREDIT SYSTEM
    ======================================================
    */

    let creditResult = {
      success:true,
      balance:null
    };


    /*
    PRO USERS:
    no free credit consumed
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

            ok:false,

            success:false,

            upgradeRequired:true,

            proActive:false,

            error:
              "Your 3 free OBITREND generations have been used. Upgrade to OBITREND Pro to continue.",

            balance:
              creditResult?.balance ??
              0

          });

      }


      creditSpent =
        true;

    }


    /*
    ======================================================
    OPENAI MULTI-IMAGE EDIT
    ======================================================

    THIS IS THE IMPORTANT CHANGE:

    n: imageCount

    The frontend already requests 4.
    The backend now actually asks OpenAI
    for 4 images.
    ======================================================
    */

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
          imageCount,

      });


    /*
    ======================================================
    READ ALL GENERATED IMAGES
    ======================================================
    */

    const images =
      imageDataToUrls(
        result?.data
      );


    if (
      !images.length
    ) {

      const imageError =
        new Error(
          "The image service returned no valid generated image data."
        );

      imageError.status =
        502;

      throw imageError;

    }


    /*
    ======================================================
    SUCCESS
    ======================================================
    */

    return res
      .status(200)
      .json({

        ok:true,

        success:true,

        proActive,

        upgradeRequired:false,

        imageUrl:
          images[0],

        url:
          images[0],

        image:
          images[0],

        generatedImage:
          images[0],

        /*
        IMPORTANT:
        This contains ALL generated images.
        */

        images:

          images,

        count:
          images.length,

        requestedCount:
          imageCount,

        model:
          MODEL,

        aspectRatio:
          aspectRatio,

        size:
          size,

        /*
        One generation request
        uses one free credit.
        */

        creditsUsed:
          proActive
            ? 0
            : 1,

        balance:
          proActive
            ? null
            : creditResult?.balance ??
              null,

        message:
          proActive

            ? `OBITREND Pro generated ${images.length} premium fashion images successfully.`

            : `OBITREND generated ${images.length} premium fashion images successfully.`

      });


  } catch (
    error
  ) {

    console.error(
      "OBITREND GENERATION ERROR:",
      error
    );


    /*
    ======================================================
    REFUND CREDIT IF OPENAI FAILED
    ======================================================
    */

    if (
      creditSpent &&
      userId &&
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
          "OBITREND CREDIT REFUND ERROR:",
          refundError
        );

      }

    }


    /*
    ======================================================
    ERROR RESPONSE
    ======================================================
    */

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

        ok:false,

        success:false,

        proActive,

        upgradeRequired:false,

        error:
          getSafeErrorMessage(
            error
          )

      });

  }

}
