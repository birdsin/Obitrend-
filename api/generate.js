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
MULTI-COLOUR / ONE-IMAGE-PER-COLOUR ENGINE
=========================================================

SAFE COMPATIBILITY:

- Keeps existing OPENAI_API_KEY
- Keeps existing credits.js
- Keeps existing Pro system
- Keeps existing POST /api/generate
- Keeps existing imageBase64 fields
- Keeps existing response fields
- Supports existing single-image generation
- Supports multiple selected colours
- One generated image per selected colour

EXAMPLES:

{
  clothingColors: ["Red", "Navy Blue", "White"]
}

=> 3 generated images

OR:

{
  colors: ["Black", "White"]
}

=> 2 generated images

If no colour array is supplied,
the existing imageCount behavior is preserved.
=========================================================
*/


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

const MAX_COLOUR_IMAGES = 8;


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


/*
=========================================================
BASE64
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
MIME
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
    !Number.isFinite(requested)
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
COLOUR LIST
=========================================================

Accepts:

clothingColors
colors
selectedColors
colour
clothingColor
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


  if (Array.isArray(raw)) {

    list =
      raw;

  } else if (
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
   * Backward compatibility:
   * if frontend sends only clothingColor,
   * use that one colour.
   */

  if (!list.length) {

    const single =
      clean(
        getValue(
          body,
          "clothingColor",
          "color",
          "colour"
        )
      );


    if (
      single &&
      ![
        "original",
        "original colour",
        "original color",
        "auto detect",
        "automatic"
      ].includes(
        single.toLowerCase()
      )
    ) {

      list = [single];

    }

  }


  /*
   * Remove duplicates.
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
   * Protect the API from accidental
   * huge generation requests.
   */

  return list
    .slice(
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
   * Colour instruction.
   */

  let colourInstruction;


  if (
    selectedColour
  ) {

    colourInstruction = `
THE TARGET GARMENT COLOUR FOR THIS IMAGE IS:

${selectedColour}

Change ONLY the colour of the uploaded garment
to ${selectedColour}.

Do NOT change:

- garment shape
- garment construction
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
- graphics
- logos
- prints
- stripes
- patterns
- fabric appearance

The result must look like the SAME garment
manufactured in ${selectedColour}.
`;

  } else {

    colourInstruction = `
Preserve the original garment colour exactly
as shown in the uploaded reference.

Original colour:

${originalColour}
`;

  }


  return `

OBITREND AI FASHION CREATOR

PREMIUM PHOTOREALISTIC FASHION IMAGE


==================================================
PRIMARY REFERENCE
==================================================

The uploaded clothing image is the
PRIMARY and AUTHORITATIVE garment reference.

The uploaded garment is the actual product.

Do not treat it as inspiration.

Do not replace it with another garment.

Do not redesign it.


==================================================
EXACT GARMENT PRESERVATION
==================================================

Preserve the uploaded garment exactly.

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
- pattern
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
- remove details
- add unauthorized details
- invent new patterns
- invent new pockets
- invent new buttons


The garment must remain clearly recognizable
as the SAME real-world garment.


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
STYLE
==================================================

Fashion style:

${fashionStyle}


Creative direction:

${creativeDirection}


The final result must look like
a professional commercial fashion photograph.


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
IMAGE COUNT
==================================================

Create ${imageCount} image(s).

Each image must be a believable
professional fashion photograph.


==================================================
FINAL PRIORITY
==================================================

Priority order:

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


If any creative instruction conflicts
with the uploaded garment:

ALWAYS PRIORITIZE THE UPLOADED GARMENT.


Create the final premium OBITREND
fashion campaign photograph.
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
SAFE ERROR
=========================================================
*/

function getSafeErrorMessage(error) {

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
GENERATE ONE IMAGE
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

          ok: false,

          success: false,

          error:
            "OPENAI_API_KEY is missing from Vercel Environment Variables."

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

          ok: false,

          success: false,

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

          ok: false,

          success: false,

          error:
            "OBITREND credit system is not configured."

        });

    }


    /*
    ======================================================
    PRO
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

          ok: false,

          success: false,

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
      !mime.startsWith("image/")
    ) {

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


    if (
      buffer.length < 1000
    ) {

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
    ======================================================
    CREATE REFERENCE FILE
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
          type: mime
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


    /*
    ======================================================
    COLOUR MODE
    ======================================================

    If colours are supplied:

    Red
    Navy
    White

    => 3 separate OpenAI requests
    => 3 separate images

    If no colour list is supplied,
    preserve existing imageCount behavior.
    ======================================================
    */

    const colourList =
      getColourList(
        body
      );


    /*
    ======================================================
    MODE A
    MULTI-COLOUR
    ======================================================
    */

    if (
      colourList.length > 0
    ) {

      /*
       * Free users need one credit
       * for each generated image.
       *
       * Pro users use no free credits.
       */

      if (!proActive) {

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

            /*
             * Refund any credits already
             * consumed by this request.
             */

            for (
              let r = 0;
              r < spentCredits;
              r++
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
                  `You need ${colourList.length} generation credits to create one image for each selected colour. Please upgrade to OBITREND Pro.`,

                balance:
                  creditResult?.balance ??
                  0

              });

          }


          spentCredits++;

        }

      }


      /*
       * Generate one image for every colour.
       *
       * Promise.all keeps the request reasonably fast.
       */

      const generated =
        await Promise.all(

          colourList.map(
            async colour => {

              const prompt =
                buildPrompt(
                  body,
                  1,
                  colour
                );


              const imageUrl =
                await generateOneImage({

                  imageFile,

                  prompt,

                  size

                });


              return {

                imageUrl,

                color:
                  colour,

                colour:
                  colour

              };

            }
          )

        );


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
           * Backward compatible first image.
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
           * ALL images.
           */

          images,

          /*
           * Colour information.
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
            proActive
              ? null
              : await getCurrentBalance(
                  userId,
                  redis
                ),

          message:
            proActive
              ? `OBITREND Pro created ${images.length} premium fashion image(s), one for each selected colour.`
              : `OBITREND created ${images.length} premium fashion image(s), one for each selected colour.`

        });

    }


    /*
    ======================================================
    MODE B
    EXISTING MULTI-IMAGE MODE
    ======================================================

    If frontend does not send multiple colours,
    preserve the existing behavior.
    ======================================================
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
    * Existing behavior:
    * one API generation request = one credit.
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
              creditResult?.balance ??
              0

          });

      }


      spentCredits = 1;

    }


    /*
    ======================================================
    EXISTING OPENAI MULTI-IMAGE REQUEST
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
          imageCount

      });


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
            : creditResult?.balance ??
              null,

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
    ======================================================
    REFUND ALL CREDITS IF GENERATION FAILED
    ======================================================
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


/*
=========================================================
CURRENT BALANCE HELPER
=========================================================
*/

async function getCurrentBalance(
  userId,
  redis
) {

  try {

    /*
     * credits.js does not expose a direct
     * get-balance function, so we obtain the
     * current value through the existing
     * credits endpoint behavior without
     * modifying credits.js.
     *
     * For compatibility, return null here.
     */

    return null;

  } catch {

    return null;

  }

}
