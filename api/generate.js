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

const MAX_COLOUR_IMAGES = 4;

const MAX_IMAGE_BYTES =
  9 * 1024 * 1024;


/* =====================================================
   HELPERS
===================================================== */

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


/* =====================================================
   BASE64
===================================================== */

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


/* =====================================================
   MIME
===================================================== */

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


/* =====================================================
   IMAGE SIZE
===================================================== */

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


/* =====================================================
   COLOURS
===================================================== */

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
      .map(x => x.trim());
  }

  list = [
    ...new Set(
      list
        .map(x => String(x).trim())
        .filter(Boolean)
    ),
  ];

  return list.slice(
    0,
    MAX_COLOUR_IMAGES
  );
}


/* =====================================================
   COMPANION
===================================================== */

function getCompanion(body) {
  const value = clean(
    getValue(
      body,
      "companion",
      "childCompanion",
      "companionType"
    ),
    "none"
  ).toLowerCase();

  const allowed = new Set([
    "none",
    "toddler_boy",
    "toddler_girl",
    "boy_child",
    "girl_child",
  ]);

  return allowed.has(value)
    ? value
    : "none";
}


/* =====================================================
   COMPANION INSTRUCTIONS
===================================================== */

function buildCompanionInstruction(companion) {

  const instructions = {

    none: `
NO COMPANION.

Create ONLY the primary model.

Do not add:
- child
- toddler
- second adult
- extra person
`,

    toddler_boy: `
==================================================
TODDLER BOY COMPANION
==================================================

Add EXACTLY ONE realistic toddler boy.

Age:
Approximately 1–3 years old.

Position:
Naturally beside the primary adult woman.

The adult woman remains the PRIMARY
fashion subject.

The toddler is a SECONDARY SUBJECT.

Toddler requirements:

- realistic toddler anatomy
- realistic toddler proportions
- natural toddler face
- natural toddler hair
- fully clothed
- age-appropriate children's clothing
- age-appropriate children's footwear
- innocent child-safe presentation
- natural interaction with the adult woman

IMPORTANT:

DO NOT put the uploaded garment on the toddler.

DO NOT duplicate the uploaded garment.

DO NOT make the toddler the primary model.

DO NOT adultify the toddler.

DO NOT sexualize the toddler.

DO NOT use provocative posing.

DO NOT use adult glamour styling.

DO NOT use revealing adult clothing.

DO NOT create additional children.

DO NOT create additional adults.

Show:

ONE adult woman
+
ONE toddler boy.

`,

    toddler_girl: `
==================================================
TODDLER GIRL COMPANION
==================================================

Add EXACTLY ONE realistic toddler girl.

Age:
Approximately 1–3 years old.

Position:
Naturally beside the primary adult woman.

The adult woman remains the PRIMARY
fashion subject.

The toddler is a SECONDARY SUBJECT.

Use:

- realistic toddler anatomy
- realistic toddler proportions
- age-appropriate children's clothing
- age-appropriate children's footwear
- innocent child-safe presentation

IMPORTANT:

DO NOT put the uploaded garment on the toddler.

DO NOT duplicate the uploaded garment.

DO NOT adultify the toddler.

DO NOT sexualize the toddler.

DO NOT use provocative posing.

DO NOT create additional children.

Show exactly ONE toddler girl.

`,

    boy_child: `
==================================================
YOUNG BOY COMPANION
==================================================

Add EXACTLY ONE realistic young boy.

Age:
Approximately 4–8 years old.

Place him naturally beside the primary model.

Use separate age-appropriate children's clothing.

DO NOT put the uploaded garment on the child.

Show exactly ONE young boy.

`,

    girl_child: `
==================================================
YOUNG GIRL COMPANION
==================================================

Add EXACTLY ONE realistic young girl.

Age:
Approximately 4–8 years old.

Place her naturally beside the primary model.

Use separate age-appropriate children's clothing.

DO NOT put the uploaded garment on the child.

Show exactly ONE young girl.

`,
  };

  return (
    instructions[companion] ||
    instructions.none
  );
}


/* =====================================================
   PROMPT BUILDER
===================================================== */

function buildPrompt(
  body,
  selectedColour = null
) {

  const ageGroup =
    clean(
      getValue(
        body,
        "ageGroup"
      ),
      "adult_woman"
    );

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

  const companion =
    getCompanion(body);


  /* ===================================================
     COLOUR
  =================================================== */

  let colourInstruction;

  if (selectedColour) {

    colourInstruction = `

TARGET GARMENT COLOUR:

${selectedColour}

Change ONLY the colour of the uploaded
garment to ${selectedColour}.

Keep the SAME garment.

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
- panel placement

The result must look like the SAME
real-world garment manufactured in
${selectedColour}.

Do not redesign the garment.

Do not replace the garment.

`;

  } else {

    colourInstruction = `

PRESERVE THE ORIGINAL GARMENT COLOUR.

Original colour:

${originalColour}

Do not recolour the garment.

`;

  }


  /* ===================================================
     AGE SAFETY
  =================================================== */

  let ageSafety = `

ADULT MODE.

The primary model must be a realistic
adult aged 18 or older.

`;


  if (
    ageGroup === "toddler_boy" ||
    ageGroup === "toddler_girl"
  ) {

    ageSafety = `

CHILD-SAFE TODDLER MODE.

The primary subject is a realistic toddler
approximately 1–3 years old.

Use only age-appropriate children's clothing
and innocent child-safe presentation.

Never sexualize or adultify the child.

`;

  }

  else if (
    ageGroup === "teen_boy" ||
    ageGroup === "teen_girl"
  ) {

    ageSafety = `

TEEN MODE.

The primary subject is a realistic teenager
aged 13–17.

Use only age-appropriate clothing
and presentation.

Never sexualize or adultify the teenager.

`;

  }


  /* ===================================================
     FINAL PROMPT
  =================================================== */

  return `

OBITREND AI FASHION CREATOR.

Create ONE premium photorealistic
fashion photograph.


==================================================
PRIMARY GARMENT REFERENCE
==================================================

The uploaded clothing image is the PRIMARY
and AUTHORITATIVE garment reference.

The uploaded garment is the actual product.

It is NOT merely inspiration.

Preserve the uploaded garment as accurately
as possible.


==================================================
EXACT GARMENT PRESERVATION
==================================================

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
- invent pockets
- invent buttons
- invent graphics
- invent patterns
- invent logos


The final garment must clearly look like
the SAME real-world garment shown in
the uploaded reference.


==================================================
COLOUR
==================================================

${colourInstruction}


==================================================
PRIMARY MODEL
==================================================

Age Group:

${ageGroup}


Gender:

${gender}


Model:

${model}


Body Type:

${bodyType}


Face:

${face}


${ageSafety}


==================================================
COMPANION
==================================================

${buildCompanionInstruction(
  companion
)}


If a companion is selected:

The primary model remains the main
fashion subject.

The companion is secondary.

The uploaded garment belongs ONLY
to the primary model.

The companion must wear separate,
age-appropriate clothing.

Show EXACTLY ONE companion.

Do not create additional people.


==================================================
POSE
==================================================

${pose}

Use natural professional positioning.

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
and correctly connect to the person's feet.


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


DO NOT CREATE:

- cartoon
- anime
- illustration
- painting
- CGI-looking people
- plastic skin
- distorted anatomy
- extra limbs
- extra fingers
- duplicated people
- duplicated children
- warped clothing
- invented patterns
- fake logos


==================================================
FINAL PRIORITY
==================================================

Priority order:

1. Uploaded garment
2. Target garment colour
3. Garment construction
4. Garment pattern
5. Garment visibility
6. Correct age
7. Correct anatomy
8. Primary model
9. Companion composition
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

Do not create multiple images
inside this request.

`;

}


/* =====================================================
   OPENAI RESULT
===================================================== */

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


/* =====================================================
   SAFE ERROR
===================================================== */

function getSafeErrorMessage(error) {

  const status =
    Number(error?.status);

  if (status === 400) {

    return (
      error?.message?.trim() ||
      "The image request was rejected. Check the uploaded image and selected options."
    );

  }

  if (status === 401) {

    return (
      "OpenAI API authentication failed. " +
      "Check the existing OPENAI_API_KEY in Vercel."
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


/* =====================================================
   GENERATE ONE IMAGE
===================================================== */

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


  if (!images.length) {

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


/* =====================================================
   REFUND
===================================================== */

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

    } catch (refundError) {

      console.error(
        "OBITREND CREDIT REFUND ERROR:",
        refundError
      );

    }

  }

}


/* =====================================================
   MAIN API
===================================================== */

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

        ok:
          false,

        success:
          false,

        error:
          "Method not allowed. Use POST.",

      });

  }


  let userId = "";

  let redis = null;

  let proActive =
    false;

  let spentCredits =
    0;


  try {


    /* =================================================
       OPENAI KEY
    ================================================= */

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


    /* =================================================
       BODY
    ================================================= */

    const body =
      req.body || {};


    /* =================================================
       USER ID
    ================================================= */

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


    /* =================================================
       REDIS
    ================================================= */

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


    /* =================================================
       PRO
    ================================================= */

    const proStatus =
      await getProStatus(
        userId,
        redis
      );


    proActive =
      proStatus?.active === true;


    /* =================================================
       IMAGE
    ================================================= */

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


    /* =================================================
       MIME
    ================================================= */

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

          ok:
            false,

          success:
            false,

          error:
            "The uploaded file is not a valid image.",

        });

    }


    /* =================================================
       BUFFER
    ================================================= */

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


    /* =================================================
       REFERENCE FILE
    ================================================= */

    const imageFile =
      new File(

        [buffer],

        `obitrend-reference.${extensionFromMime(mime)}`,

        {
          type:
            mime,
        }

      );


    /* =================================================
       RATIO
    ================================================= */

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


    /* =================================================
       COLOURS
    ================================================= */

    const colourList =
      getColourList(
        body
      );


    /* =================================================
       MULTI-COLOUR
    ================================================= */

    if (
      colourList.length > 0
    ) {

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


      const results =
        await Promise.allSettled(

          colourList.map(
            async colour => {

              const imageUrl =
                await generateOneImage({

                  imageFile:

                    imageFile,

                  prompt:

                    buildPrompt(
                      body,
                      colour
                    ),

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


      const generated = [];

      let failedCount =
        0;

      let firstFailure =
        null;


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


      const images =
        generated.map(
          item =>
            item.imageUrl
        );


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


          imageUrl:
            images[0],

          url:
            images[0],

          image:
            images[0],

          generatedImage:
            images[0],


          images:
            images,


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
            colourList.length,


          requestedColours:
            colourList,

          generatedColours:
            generated.map(
              item =>
                item.colour
            ),


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


          model:
            MODEL,


          aspectRatio:
            aspectRatio,


          size:
            size,


          companion:
            getCompanion(body),


          creditsUsed:
            proActive
              ? 0
              : spentCredits,


          balance:
            null,


          message:

            failedCount > 0

              ? `OBITREND generated ${images.length} of ${colourList.length} selected colour image(s). Failed colour jobs were refunded.`

              : proActive

                ? `OBITREND Pro created ${images.length} premium fashion image(s), one for each selected colour.`

                : `OBITREND created ${images.length} premium fashion image(s), one for each selected colour.`,

        });

    }


    /* =================================================
       NORMAL SINGLE IMAGE
    ================================================= */

    const prompt =
      buildPrompt(
        body,
        null
      );


    let creditResult = {

      success:
        true,

      balance:
        null,

    };


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


    /* =================================================
       EXACTLY ONE IMAGE
    ================================================= */

    const imageUrl =
      await generateOneImage({

        imageFile:

          imageFile,

        prompt:

          prompt,

        size:

          size,

      });


    /* =================================================
       SUCCESS
    ================================================= */

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


        imageUrl:
          imageUrl,

        url:
          imageUrl,

        image:
          imageUrl,

        generatedImage:
          imageUrl,


        images:
          [
            imageUrl
          ],


        count:
          1,

        requestedCount:
          1,


        model:
          MODEL,


        aspectRatio:
          aspectRatio,


        size:
          size,


        companion:
          getCompanion(body),


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

            ? "OBITREND Pro generated one premium fashion image successfully."

            : "OBITREND generated one premium fashion image successfully.",

      });


  } catch (
    error
  ) {


    console.error(
      "OBITREND GENERATION ERROR:",
      error
    );


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
