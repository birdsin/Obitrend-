import OpenAI, { toFile } from "openai";
import {
  spendCredit,
  refundCredit,
  getRedisConfig
} from "./credits.js";

/*
===========================================================
OBITREND AI FASHION CREATOR
PREMIUM IMAGE GENERATION BACKEND
===========================================================
*/

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});


/* =========================================================
   RESPONSE HELPER
========================================================= */

function json(res, status, data) {
  return res.status(status).json(data);
}


/* =========================================================
   CLEAN VALUE
========================================================= */

function clean(value, fallback = "") {
  if (
    value === undefined ||
    value === null
  ) {
    return fallback;
  }

  return String(value).trim();
}


/* =========================================================
   USER ID
========================================================= */

function cleanCreditUserId(value) {

  if (
    value === undefined ||
    value === null
  ) {
    return "";
  }

  const id = String(value).trim();

  if (!id) {
    return "";
  }

  if (id.length > 200) {
    return "";
  }

  return id;
}


/* =========================================================
   IMAGE SIZE
========================================================= */

function getImageSize(ratio) {

  switch (clean(ratio)) {

    case "9:16":
      return "1024x1536";

    case "4:5":
      return "1024x1536";

    case "5:4":
      return "1536x1024";

    case "16:9":
      return "1536x1024";

    case "1:1":
    default:
      return "1024x1024";
  }
}


/* =========================================================
   EXTRACT BASE64 IMAGE
========================================================= */

function getImageBase64(body) {

  const value =
    body.imageBase64 ||
    body.image ||
    "";

  if (!value) {
    return null;
  }


  /* -------------------------------------------------------
     DATA URL
  ------------------------------------------------------- */

  if (
    typeof value === "string" &&
    value.startsWith("data:image/")
  ) {

    const commaIndex =
      value.indexOf(",");

    if (commaIndex === -1) {
      return null;
    }

    const header =
      value.substring(
        0,
        commaIndex
      );

    const mimeMatch =
      header.match(
        /^data:(image\/[^;]+);base64$/
      );

    const mime =
      mimeMatch
        ? mimeMatch[1]
        : "image/jpeg";

    const base64 =
      value.substring(
        commaIndex + 1
      );

    if (!base64) {
      return null;
    }

    return {
      mime,
      base64
    };
  }


  /* -------------------------------------------------------
     RAW BASE64
  ------------------------------------------------------- */

  return {
    mime: "image/jpeg",
    base64: value
  };
}


/* =========================================================
   BUILD PREMIUM PROMPT
========================================================= */

function buildPrompt(body) {

  const suppliedPrompt =
    clean(body.prompt);

  const model =
    clean(
      body.model,
      "beautiful professional fashion model"
    );

  const bodyType =
    clean(
      body.bodyType,
      "elegant natural proportions"
    );

  const face =
    clean(
      body.face,
      "beautiful natural facial features"
    );

  const pose =
    clean(
      body.pose,
      "standing confidently"
    );

  const fashionStyle =
    clean(
      body.fashionStyle,
      "premium luxury fashion editorial"
    );

  const camera =
    clean(
      body.camera,
      "professional full-frame fashion photography"
    );

  const locationType =
    clean(
      body.locationType,
      "luxury fashion location"
    );

  const city =
    clean(
      body.city,
      "Lagos, Nigeria"
    );

  const property =
    clean(
      body.property,
      "luxury modern property"
    );

  const vehicle =
    clean(
      body.vehicle,
      "premium luxury vehicle"
    );

  const lighting =
    clean(
      body.lighting,
      "soft natural daylight"
    );

  const creativeDirection =
    clean(
      body.creativeDirection,
      "premium fashion campaign"
    );


  return `
OBITREND PREMIUM FASHION CAMPAIGN.

${suppliedPrompt}


=========================================================
MODEL
=========================================================

${model}

BODY TYPE:
${bodyType}

FACE:
${face}

POSE:
${pose}


=========================================================
FASHION
=========================================================

FASHION STYLE:
${fashionStyle}

CREATIVE DIRECTION:
${creativeDirection}


=========================================================
LOCATION
=========================================================

LOCATION TYPE:
${locationType}

CITY / COUNTRY:
${city}

PROPERTY:
${property}

VEHICLE:
${vehicle}

Create a believable real-world environment appropriate
for the selected city and location.


=========================================================
MOST IMPORTANT — CLOTHING PRESERVATION
=========================================================

The uploaded image is the PRIMARY clothing reference.

The model must wear the SAME garment shown in the
uploaded reference image.

Preserve the garment as accurately as possible.

PRESERVE:

- exact visible colors
- exact color placement
- patterns
- prints
- graphics
- logos
- lettering when readable
- stitching
- seams
- neckline
- collar
- sleeves
- cuffs
- buttons
- pockets
- zippers
- belts
- fabric texture
- material appearance
- garment proportions
- distinctive design elements
- overall silhouette

DO NOT redesign the garment.

DO NOT replace the garment.

DO NOT invent another garment.

DO NOT randomly change the colors.

DO NOT add unnecessary decorations.

DO NOT remove distinctive details.

DO NOT turn the garment into a different clothing item.

The uploaded garment must remain clearly recognizable
as the same garment.


=========================================================
PHOTOREALISM
=========================================================

Create an extremely realistic premium commercial
fashion photograph.

Realistic human anatomy.

Realistic face.

Realistic skin texture.

Realistic hair.

Realistic hands.

Realistic fingers.

Realistic fabric.

Realistic folds.

Realistic garment fit.

Realistic shadows.

Realistic reflections.

Realistic environmental lighting.

Natural perspective.

Physically believable depth of field.

Professional fashion photography.

Premium advertising quality.

Luxury editorial appearance.

The final result must look like a real photograph
captured by a professional fashion photographer.


=========================================================
CAMERA
=========================================================

${camera}


=========================================================
LIGHTING
=========================================================

${lighting}


=========================================================
COMPOSITION
=========================================================

The garment is the primary visual subject.

Show the model clearly.

Use a professional fashion pose.

Show the complete garment whenever practical.

Maintain natural body proportions.

Maintain realistic garment fit.

Use premium commercial composition.

Keep the background detailed but secondary
to the clothing.

Use realistic depth of field.


=========================================================
AUTHENTIC ENVIRONMENT
=========================================================

Use believable architecture.

Use realistic roads.

Use realistic vegetation.

Use realistic weather.

Use geographically appropriate surroundings.

Make the selected city feel authentic.

Do not create impossible buildings.

Do not create fantasy architecture.

Do not create floating objects.

Do not distort vehicles.


=========================================================
NEGATIVE REQUIREMENTS
=========================================================

Avoid:

cartoon appearance

anime

illustration

plastic skin

CGI-looking humans

deformed anatomy

extra fingers

missing fingers

extra limbs

duplicate people

warped clothing

melted clothing

changed garment design

fake logos

random text

watermarks

blurry garment

distorted vehicles

floating objects

impossible architecture

unrealistic shadows

unrealistic reflections

oversaturated colors

artificial-looking skin


=========================================================
FINAL GOAL
=========================================================

A premium photorealistic fashion advertisement featuring
the uploaded garment, a beautiful professional model,
and a believable luxury real-world environment.

The uploaded clothing must remain the visual priority.
`;
}


/* =========================================================
   MAIN HANDLER
========================================================= */

export default async function handler(req, res) {

  /* -------------------------------------------------------
     METHOD
  ------------------------------------------------------- */

  if (req.method !== "POST") {

    return json(
      res,
      405,
      {
        success: false,
        error:
          "Method not allowed. Use POST."
      }
    );
  }


  /* -------------------------------------------------------
     OPENAI KEY
  ------------------------------------------------------- */

  if (!process.env.OPENAI_API_KEY) {

    console.error(
      "OBITREND ERROR: OPENAI_API_KEY is missing."
    );

    return json(
      res,
      500,
      {
        success: false,
        error:
          "OPENAI_API_KEY is missing in Vercel Environment Variables."
      }
    );
  }


  let creditCharged = false;
  let userId = "";
  let redis = null;


  try {

    const body =
      req.body || {};


    /* -----------------------------------------------------
       USER
    ----------------------------------------------------- */

    userId =
      cleanCreditUserId(
        body.userId ||
        body.obitrendUserId
      );


    if (!userId) {

      return json(
        res,
        400,
        {
          success: false,
          error:
            "OBITREND user ID is missing. Please refresh the app and try again."
        }
      );
    }


    /* -----------------------------------------------------
       IMAGE
    ----------------------------------------------------- */

    const image =
      getImageBase64(body);


    if (!image) {

      return json(
        res,
        400,
        {
          success: false,
          error:
            "Please upload a clothing image first."
        }
      );
    }


    if (!image.base64) {

      return json(
        res,
        400,
        {
          success: false,
          error:
            "The uploaded image is empty."
        }
      );
    }


    /* -----------------------------------------------------
       REDIS
    ----------------------------------------------------- */

    redis =
      getRedisConfig();


    if (
      !redis ||
      !redis.url ||
      !redis.token
    ) {

      return json(
        res,
        500,
        {
          success: false,
          error:
            "OBITREND Redis is not configured in Vercel."
        }
      );
    }


    /* -----------------------------------------------------
       SPEND CREDIT
    ----------------------------------------------------- */

    const creditResult =
      await spendCredit(
        userId,
        redis
      );


    if (
      !creditResult ||
      !creditResult.success
    ) {

      return json(
        res,
        402,
        {
          success: false,
          error:
            "You have no image credits remaining.",
          credits: 0
        }
      );
    }


    creditCharged = true;


    console.log(
      "OBITREND credit used:",
      creditResult.balance
    );


    /* -----------------------------------------------------
       PROMPT
    ----------------------------------------------------- */

    const prompt =
      buildPrompt(body);


    /* -----------------------------------------------------
       SIZE
    ----------------------------------------------------- */

    const size =
      getImageSize(
        body.aspectRatio
      );


    console.log(
      "OBITREND generation started",
      {
        size,
        city: body.city,
        style: body.fashionStyle,
        ratio: body.aspectRatio
      }
    );


    /* -----------------------------------------------------
       IMAGE BUFFER
    ----------------------------------------------------- */

    const imageBuffer =
      Buffer.from(
        image.base64,
        "base64"
      );


    if (!imageBuffer.length) {

      throw new Error(
        "Uploaded image could not be decoded."
      );
    }


    /* -----------------------------------------------------
       FILE TYPE
    ----------------------------------------------------- */

    let extension = "jpg";

    if (
      image.mime ===
      "image/png"
    ) {
      extension = "png";
    }

    if (
      image.mime ===
      "image/webp"
    ) {
      extension = "webp";
    }


    /* -----------------------------------------------------
       CREATE OPENAI FILE
    ----------------------------------------------------- */

    const imageFile =
      await toFile(
        imageBuffer,
        `obitrend-reference.${extension}`,
        {
          type:
            image.mime ||
            "image/jpeg"
        }
      );


    /* -----------------------------------------------------
       OPENAI IMAGE GENERATION
    ----------------------------------------------------- */

    const result =
      await client.images.edit({

        model:
          process.env.OPENAI_IMAGE_MODEL ||
          "gpt-image-1.5",

        image:
          imageFile,

        prompt:
          prompt,

        size:
          size,

        quality:
          "high",

        input_fidelity:
          "high",

        output_format:
          "jpeg",

        output_compression:
          80,

        n:
          1
      });


    /* -----------------------------------------------------
       VERIFY RESPONSE
    ----------------------------------------------------- */

    if (
      !result ||
      !Array.isArray(result.data) ||
      !result.data.length
    ) {

      console.error(
        "OBITREND: OpenAI returned no image."
      );

      if (creditCharged) {

        await refundCredit(
          userId,
          redis
        );

        creditCharged = false;
      }

      return json(
        res,
        502,
        {
          success: false,
          error:
            "OpenAI did not return an image. Your OBITREND credit has been restored."
        }
      );
    }


    const generated =
      result.data[0];


    /* -----------------------------------------------------
       BASE64 RESPONSE
    ----------------------------------------------------- */

    const generatedBase64 =
      generated?.b64_json ||
      generated?.base64 ||
      "";


    if (generatedBase64) {

      const imageUrl =
        `data:image/jpeg;base64,${generatedBase64}`;


      console.log(
        "OBITREND generation completed successfully."
      );


      return json(
        res,
        200,
        {
          success: true,

          imageUrl:
            imageUrl,

          url:
            imageUrl,

          image:
            imageUrl,

          aspectRatio:
            clean(
              body.aspectRatio,
              "4:5"
            ),

          size:
            size,

          premium:
            true,

          clothingPreservation:
            true
        }
      );
    }


    /* -----------------------------------------------------
       URL FALLBACK
    ----------------------------------------------------- */

    if (generated?.url) {

      console.log(
        "OBITREND generation completed with URL."
      );


      return json(
        res,
        200,
        {
          success: true,

          imageUrl:
            generated.url,

          url:
            generated.url,

          image:
            generated.url,

          aspectRatio:
            clean(
              body.aspectRatio,
              "4:5"
            ),

          size:
            size,

          premium:
            true,

          clothingPreservation:
            true
        }
      );
    }


    /* -----------------------------------------------------
       UNEXPECTED RESPONSE
    ----------------------------------------------------- */

    console.error(
      "OBITREND: Unexpected OpenAI image response.",
      generated
    );


    if (creditCharged) {

      await refundCredit(
        userId,
        redis
      );

      creditCharged = false;
    }


    return json(
      res,
      502,
      {
        success: false,
        error:
          "OpenAI returned an unexpected image response. Your OBITREND credit has been refunded."
      }
    );


  } catch (error) {

    /* -----------------------------------------------------
       ERROR LOG
    ----------------------------------------------------- */

    console.error(
      "OBITREND GENERATION ERROR:",
      error
    );


    /* -----------------------------------------------------
       REFUND CREDIT
    ----------------------------------------------------- */

    if (
      creditCharged &&
      redis &&
      userId
    ) {

      try {

        await refundCredit(
          userId,
          redis
        );

        creditCharged = false;

        console.log(
          "OBITREND credit refunded after generation error."
        );

      } catch (refundError) {

        console.error(
          "OBITREND credit refund error:",
          refundError
        );
      }
    }


    /* -----------------------------------------------------
       ERROR MESSAGE
    ----------------------------------------------------- */

    let message =
      "Image generation failed.";


    if (error?.message) {

      message =
        error.message;
    }


    if (
      error?.error?.message
    ) {

      message =
        error.error.message;
    }


    if (
      error?.response?.data?.error?.message
    ) {

      message =
        error.response.data.error.message;
    }


    console.error(
      "OBITREND final error:",
      message
    );


    return json(
      res,
      500,
      {
        success: false,

        error:
          "OBITREND image generation failed: " +
          message,

        creditRefunded:
          true
      }
    );
  }
  }
