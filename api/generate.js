import OpenAI, { toFile } from "openai";

import {
  spendCredit,
  refundCredit,
  getRedisConfig
} from "./credits.js";

/*
============================================================
OBITREND AI FASHION CREATOR
DIAGNOSIS + REPAIR IMAGE GENERATION API
============================================================
*/

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});


/* =========================================================
   RESPONSE
========================================================= */

function send(res, status, data) {
  return res.status(status).json(data);
}


/* =========================================================
   SAFE STRING
========================================================= */

function clean(value, fallback = "") {

  if (
    value === undefined ||
    value === null
  ) {
    return fallback;
  }

  const result = String(value).trim();

  return result || fallback;
}


/* =========================================================
   USER ID
========================================================= */

function getUserId(body) {

  const value =
    body?.userId ||
    body?.obitrendUserId ||
    "";

  const id =
    String(value).trim();

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
   IMAGE INPUT
========================================================= */

function extractImage(body) {

  const value =
    body?.imageBase64 ||
    body?.image ||
    "";

  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    return null;
  }

  const input =
    value.trim();


  /* -------------------------------------------------------
     DATA URL
  ------------------------------------------------------- */

  if (
    input.startsWith("data:image/")
  ) {

    const comma =
      input.indexOf(",");

    if (comma === -1) {
      return null;
    }

    const header =
      input.slice(0, comma);

    const base64 =
      input.slice(comma + 1);

    const match =
      header.match(
        /^data:(image\/[^;]+);base64$/i
      );

    const mime =
      match?.[1] ||
      "image/jpeg";

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
    base64: input
  };
}


/* =========================================================
   PROMPT
========================================================= */

function buildPrompt(body) {

  const suppliedPrompt =
    clean(
      body?.prompt,
      "Create a premium professional fashion campaign."
    );

  const model =
    clean(
      body?.model,
      "adult professional fashion model"
    );

  const bodyType =
    clean(
      body?.bodyType,
      "natural elegant proportions"
    );

  const face =
    clean(
      body?.face,
      "natural attractive facial features"
    );

  const pose =
    clean(
      body?.pose,
      "confident professional fashion pose"
    );

  const fashionStyle =
    clean(
      body?.fashionStyle,
      "premium fashion editorial"
    );

  const camera =
    clean(
      body?.camera,
      "professional full-frame fashion photography"
    );

  const locationType =
    clean(
      body?.locationType,
      "premium real-world fashion location"
    );

  const city =
    clean(
      body?.city,
      "Lagos, Nigeria"
    );

  const property =
    clean(
      body?.property,
      "premium modern property"
    );

  const vehicle =
    clean(
      body?.vehicle,
      "premium vehicle"
    );

  const lighting =
    clean(
      body?.lighting,
      "soft professional commercial lighting"
    );

  const creativeDirection =
    clean(
      body?.creativeDirection,
      "premium ecommerce fashion campaign"
    );


  return `
OBITREND PREMIUM FASHION CAMPAIGN.

Create a professional commercial fashion photograph.

USER CREATIVE DIRECTION:
${suppliedPrompt}

MODEL:
${model}

BODY:
${bodyType}

FACE:
${face}

POSE:
${pose}

FASHION STYLE:
${fashionStyle}

CREATIVE DIRECTION:
${creativeDirection}

LOCATION:
${locationType}

CITY:
${city}

PROPERTY:
${property}

VEHICLE:
${vehicle}

LIGHTING:
${lighting}

CAMERA:
${camera}


============================================================
IMPORTANT CLOTHING REFERENCE
============================================================

The uploaded image is the PRIMARY CLOTHING REFERENCE.

The adult model must wear the same garment shown
in the uploaded reference image.

Preserve the garment as accurately as possible.

Preserve:

- garment type
- garment shape
- garment silhouette
- colors
- color placement
- stripes
- patterns
- prints
- graphics
- logos when visible
- lettering when readable
- neckline
- collar
- sleeves
- cuffs
- seams
- stitching
- buttons
- pockets
- zippers
- fabric texture
- material appearance
- distinctive design details

Do NOT redesign the garment.

Do NOT replace the garment.

Do NOT invent another garment.

Do NOT change the garment into a different clothing item.

Do NOT randomly change the colors.

Do NOT remove important design details.

The final garment should remain clearly recognizable
as the same garment in the uploaded reference.


============================================================
FASHION SAFETY
============================================================

Create an adult professional fashion campaign.

The model is fully clothed.

Use tasteful professional fashion styling.

No nudity.

No sexualized posing.

No explicit content.

No fetish styling.

No transparent clothing.

No underwear-focused presentation.

No suggestive camera framing.

The emphasis is on the clothing, styling,
photography, location and commercial presentation.


============================================================
PHOTOREALISM
============================================================

Photorealistic commercial fashion photography.

Realistic adult human anatomy.

Realistic hands.

Realistic fingers.

Realistic face.

Realistic skin texture.

Realistic hair.

Realistic fabric.

Realistic garment folds.

Realistic shadows.

Realistic reflections.

Natural perspective.

Professional depth of field.

Premium fashion advertising quality.


============================================================
ENVIRONMENT
============================================================

Create a believable real-world environment.

The selected city should feel authentic.

Use realistic architecture.

Use realistic roads and surfaces.

Use realistic vegetation.

Use physically believable lighting.

Use realistic vehicles.

Avoid impossible architecture.

Avoid floating objects.

Avoid distorted vehicles.

Avoid fantasy environments.


============================================================
COMPOSITION
============================================================

The clothing is the primary visual subject.

Show the garment clearly.

Use a professional fashion pose.

Show the complete garment whenever practical.

Keep the background secondary to the clothing.

Use premium commercial composition.

Use realistic depth of field.


============================================================
QUALITY CONTROL
============================================================

Avoid:

cartoon appearance

anime

illustration

CGI-looking people

plastic skin

deformed anatomy

extra fingers

missing fingers

extra limbs

duplicate people

warped clothing

melted clothing

changed garment design

random clothing

fake logos

random text

watermarks

blurred garment

distorted vehicles

floating objects

impossible architecture

unrealistic shadows

unrealistic reflections

oversaturated colors


============================================================
FINAL RESULT
============================================================

Produce a premium photorealistic fashion advertisement.

The uploaded garment must remain recognizable.

The clothing must be the visual priority.

The model must be an adult.

The scene must look like a real professional
fashion photograph captured for a commercial campaign.
`;
}


/* =========================================================
   ERROR CLASSIFICATION
========================================================= */

function classifyOpenAIError(error) {

  const status =
    Number(error?.status || 0);

  const code =
    clean(
      error?.code ||
      error?.error?.code
    );

  const type =
    clean(
      error?.type ||
      error?.error?.type
    );

  const message =
    clean(
      error?.message ||
      error?.error?.message,
      "Unknown OpenAI error."
    );


  if (
    status === 429 ||
    code === "insufficient_quota" ||
    code === "credit_balance_exhausted" ||
    message.toLowerCase().includes("no credits remaining")
  ) {

    return {
      kind: "OPENAI_CREDITS",
      status: 503,
      code,
      type,
      message
    };
  }


  if (
    status === 400 &&
    (
      code === "moderation_blocked" ||
      type === "image_generation_user_error" ||
      message.toLowerCase().includes("safety")
    )
  ) {

    return {
      kind: "SAFETY_BLOCK",
      status: 422,
      code,
      type,
      message
    };
  }


  if (
    status === 400
  ) {

    return {
      kind: "BAD_REQUEST",
      status: 400,
      code,
      type,
      message
    };
  }


  if (
    status >= 500
  ) {

    return {
      kind: "OPENAI_SERVER_ERROR",
      status: 502,
      code,
      type,
      message
    };
  }


  return {
    kind: "OPENAI_UNKNOWN_ERROR",
    status: 502,
    code,
    type,
    message
  };
}


/* =========================================================
   REFUND HELPER
========================================================= */

async function safelyRefund(
  userId,
  redis,
  reason
) {

  if (
    !userId ||
    !redis
  ) {
    return false;
  }

  try {

    await refundCredit(
      userId,
      redis
    );

    console.log(
      "OBITREND CREDIT REFUNDED:",
      {
        userId,
        reason
      }
    );

    return true;

  } catch (refundError) {

    console.error(
      "OBITREND CREDIT REFUND FAILED:",
      refundError
    );

    return false;
  }
}


/* =========================================================
   MAIN HANDLER
========================================================= */

export default async function handler(
  req,
  res
) {

  const diagnosticId =
    `obi_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;


  /* -------------------------------------------------------
     METHOD
  ------------------------------------------------------- */

  if (
    req.method !== "POST"
  ) {

    return send(
      res,
      405,
      {
        success: false,
        error:
          "Method not allowed. Use POST.",
        diagnosticId
      }
    );
  }


  /* -------------------------------------------------------
     API KEY
  ------------------------------------------------------- */

  if (
    !process.env.OPENAI_API_KEY
  ) {

    console.error(
      "OBITREND DIAGNOSIS",
      diagnosticId,
      "OPENAI_API_KEY missing"
    );

    return send(
      res,
      500,
      {
        success: false,
        error:
          "OPENAI_API_KEY is missing from Vercel Environment Variables.",
        diagnosticId
      }
    );
  }


  let creditCharged =
    false;

  let userId =
    "";

  let redis =
    null;


  try {

    const body =
      req.body || {};


    /* -----------------------------------------------------
       USER
    ----------------------------------------------------- */

    userId =
      getUserId(body);

    if (!userId) {

      return send(
        res,
        400,
        {
          success: false,
          error:
            "OBITREND user ID is missing. Refresh the app and try again.",
          diagnosticId
        }
      );
    }


    /* -----------------------------------------------------
       IMAGE
    ----------------------------------------------------- */

    const image =
      extractImage(body);

    if (!image) {

      return send(
        res,
        400,
        {
          success: false,
          error:
            "No valid clothing image was received.",
          diagnosticId
        }
      );
    }


    let imageBuffer;

    try {

      imageBuffer =
        Buffer.from(
          image.base64,
          "base64"
        );

    } catch (decodeError) {

      console.error(
        "OBITREND IMAGE DECODE ERROR",
        diagnosticId,
        decodeError
      );

      return send(
        res,
        400,
        {
          success: false,
          error:
            "The uploaded clothing image could not be decoded.",
          diagnosticId
        }
      );
    }


    if (
      !imageBuffer.length
    ) {

      return send(
        res,
        400,
        {
          success: false,
          error:
            "The uploaded clothing image is empty.",
          diagnosticId
        }
      );
    }


    /* -----------------------------------------------------
       BASIC IMAGE SIZE SAFETY
    ----------------------------------------------------- */

    if (
      imageBuffer.length >
      20 * 1024 * 1024
    ) {

      return send(
        res,
        413,
        {
          success: false,
          error:
            "The clothing image is too large. Please use an image below 20 MB.",
          diagnosticId
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

      console.error(
        "OBITREND REDIS CONFIG ERROR",
        diagnosticId
      );

      return send(
        res,
        500,
        {
          success: false,
          error:
            "OBITREND Redis is not configured correctly in Vercel.",
          diagnosticId
        }
      );
    }


    /* -----------------------------------------------------
       CREDIT
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

      return send(
        res,
        402,
        {
          success: false,
          error:
            "You have no OBITREND image credits remaining.",
          credits:
            Number(
              creditResult?.balance || 0
            ),
          diagnosticId
        }
      );
    }


    creditCharged =
      true;


    console.log(
      "OBITREND CREDIT CHARGED",
      {
        diagnosticId,
        userId,
        balance:
          creditResult.balance
      }
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


    const model =
      clean(
        process.env.OPENAI_IMAGE_MODEL,
        "gpt-image-1.5"
      );


    console.log(
      "OBITREND GENERATION START",
      {
        diagnosticId,
        model,
        size,
        aspectRatio:
          body.aspectRatio,
        city:
          body.city,
        fashionStyle:
          body.fashionStyle
      }
    );


    /* -----------------------------------------------------
       FILE EXTENSION
    ----------------------------------------------------- */

    let extension =
      "jpg";


    if (
      image.mime ===
      "image/png"
    ) {

      extension =
        "png";

    } else if (
      image.mime ===
      "image/webp"
    ) {

      extension =
        "webp";
    }


    /* -----------------------------------------------------
       OPENAI FILE
    ----------------------------------------------------- */

    let imageFile;

    try {

      imageFile =
        await toFile(
          imageBuffer,
          `obitrend-reference.${extension}`,
          {
            type:
              image.mime ||
              "image/jpeg"
          }
        );

    } catch (fileError) {

      console.error(
        "OBITREND OPENAI FILE ERROR",
        diagnosticId,
        fileError
      );


      if (
        creditCharged
      ) {

        await safelyRefund(
          userId,
          redis,
          "image-file-error"
        );

        creditCharged =
          false;
      }


      return send(
        res,
        400,
        {
          success: false,
          error:
            "The clothing image could not be prepared for image generation. Your credit was restored.",
          diagnosticId
        }
      );
    }


    /* -----------------------------------------------------
       OPENAI GENERATION
    ----------------------------------------------------- */

    let result;

    try {

      result =
        await client.images.edit({

          model,

          image:
            imageFile,

          prompt,

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

    } catch (openAIError) {

      const diagnosis =
        classifyOpenAIError(
          openAIError
        );


      console.error(
        "OBITREND OPENAI FAILURE",
        {
          diagnosticId,
          kind:
            diagnosis.kind,
          status:
            diagnosis.status,
          code:
            diagnosis.code,
          type:
            diagnosis.type,
          message:
            diagnosis.message
        }
      );


      /* ---------------------------------------------------
         ALWAYS REFUND FAILED GENERATION
      --------------------------------------------------- */

      if (
        creditCharged
      ) {

        await safelyRefund(
          userId,
          redis,
          diagnosis.kind
        );

        creditCharged =
          false;
      }


      /* ---------------------------------------------------
         OPENAI BILLING / CREDITS
      --------------------------------------------------- */

      if (
        diagnosis.kind ===
        "OPENAI_CREDITS"
      ) {

        return send(
          res,
          503,
          {
            success: false,
            error:
              "OBITREND cannot generate images because the OpenAI API account has no available API credits. Your OBITREND credit was restored.",
            diagnosis:
              "OPENAI_CREDITS",
            diagnosticId
          }
        );
      }


      /* ---------------------------------------------------
         SAFETY
      --------------------------------------------------- */

      if (
        diagnosis.kind ===
        "SAFETY_BLOCK"
      ) {

        return send(
          res,
          422,
          {
            success: false,
            error:
              "OpenAI rejected this generation request for safety reasons. Your OBITREND credit was restored. Try a normal fully-clothed professional fashion campaign.",
            diagnosis:
              "SAFETY_BLOCK",
            diagnosticId
          }
        );
      }


      /* ---------------------------------------------------
         BAD REQUEST
      --------------------------------------------------- */

      if (
        diagnosis.kind ===
        "BAD_REQUEST"
      ) {

        return send(
          res,
          400,
          {
            success: false,
            error:
              "OpenAI rejected the image-generation request. Your OBITREND credit was restored.",
            diagnosis:
              "BAD_REQUEST",
            diagnosticId
          }
        );
      }


      /* ---------------------------------------------------
         SERVER ERROR
      --------------------------------------------------- */

      return send(
        res,
        502,
        {
          success: false,
          error:
            "The image-generation service failed before returning an image. Your OBITREND credit was restored.",
          diagnosis:
            diagnosis.kind,
          diagnosticId
        }
      );
    }


    /* -----------------------------------------------------
       RESPONSE VALIDATION
    ----------------------------------------------------- */

    if (
      !result ||
      !Array.isArray(
        result.data
      ) ||
      !result.data.length
    ) {

      console.error(
        "OBITREND INVALID OPENAI RESPONSE",
        diagnosticId,
        result
      );


      if (
        creditCharged
      ) {

        await safelyRefund(
          userId,
          redis,
          "empty-openai-response"
        );

        creditCharged =
          false;
      }


      return send(
        res,
        502,
        {
          success: false,
          error:
            "OpenAI returned no image. Your OBITREND credit was restored.",
          diagnosis:
            "EMPTY_OPENAI_RESPONSE",
          diagnosticId
        }
      );
    }


    const generated =
      result.data[0];


    /* -----------------------------------------------------
       BASE64 IMAGE
    ----------------------------------------------------- */

    const base64 =
      generated?.b64_json ||
      generated?.base64 ||
      "";


    if (
      base64
    ) {

      const imageUrl =
        `data:image/jpeg;base64,${base64}`;


      console.log(
        "OBITREND GENERATION SUCCESS",
        {
          diagnosticId,
          model,
          size
        }
      );


      return send(
        res,
        200,
        {
          success:
            true,

          imageUrl,

          image:
            imageUrl,

          url:
            imageUrl,

          aspectRatio:
            clean(
              body.aspectRatio,
              "4:5"
            ),

          size,

          model,

          premium:
            true,

          clothingPreservation:
            true,

          diagnosticId,

          credits:
            Number(
              creditResult.balance
            )
        }
      );
    }


    /* -----------------------------------------------------
       URL FALLBACK
    ----------------------------------------------------- */

    if (
      generated?.url
    ) {

      console.log(
        "OBITREND GENERATION SUCCESS URL",
        diagnosticId
      );


      return send(
        res,
        200,
        {
          success:
            true,

          imageUrl:
            generated.url,

          image:
            generated.url,

          url:
            generated.url,

          aspectRatio:
            clean(
              body.aspectRatio,
              "4:5"
            ),

          size,

          model,

          premium:
            true,

          clothingPreservation:
            true,

          diagnosticId,

          credits:
            Number(
              creditResult.balance
            )
        }
      );
    }


    /* -----------------------------------------------------
       UNKNOWN OPENAI RESPONSE
    ----------------------------------------------------- */

    console.error(
      "OBITREND UNKNOWN OPENAI IMAGE RESPONSE",
      {
        diagnosticId,
        resultKeys:
          Object.keys(
            result || {}
          )
      }
    );


    if (
      creditCharged
    ) {

      await safelyRefund(
        userId,
        redis,
        "unknown-openai-response"
      );

      creditCharged =
        false;
    }


    return send(
      res,
      502,
      {
        success: false,
        error:
          "The image service returned an unsupported response. Your OBITREND credit was restored.",
        diagnosis:
          "UNKNOWN_OPENAI_RESPONSE",
        diagnosticId
      }
    );


  } catch (error) {

    console.error(
      "OBITREND UNEXPECTED ERROR",
      {
        diagnosticId,
        name:
          error?.name,
        message:
          error?.message,
        stack:
          error?.stack
      }
    );


    /* -----------------------------------------------------
       REFUND UNEXPECTED FAILURE
    ----------------------------------------------------- */

    if (
      creditCharged
    ) {

      await safelyRefund(
        userId,
        redis,
        "unexpected-server-error"
      );

      creditCharged =
        false;
    }


    return send(
      res,
      500,
      {
        success: false,
        error:
          "OBITREND encountered an unexpected server error. Your credit was restored.",
        diagnosis:
          "UNEXPECTED_SERVER_ERROR",
        diagnosticId
      }
    );
  }
}
