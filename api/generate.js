import OpenAI, { toFile } from "openai";

/*
===========================================================
OBITREND AI FASHION CREATOR
Premium image generation backend

Frontend:
index.html
        ↓
POST /api/generate
        ↓
This file
        ↓
OpenAI Image API
        ↓
Generated image
        ↓
Frontend displays image

IMPORTANT:
OPENAI_API_KEY must be stored in Vercel Environment Variables.
NEVER put the OpenAI API key inside index.html.
===========================================================
*/

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});


/* =========================================================
   BASIC HELPERS
========================================================= */

function json(res, status, data) {
  return res.status(status).json(data);
}


function clean(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value).trim();
}


/*
Convert frontend aspect ratios to OpenAI image sizes.
OpenAI image generation supports square, landscape and portrait
sizes rather than arbitrary ratio strings.
*/

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
   EXTRACT IMAGE FROM FRONTEND
========================================================= */

function getImageBase64(body) {

  /*
    Your new HTML sends:
      image
      imageBase64

    Accept both so the backend is compatible with either.
  */

  const value =
    body.imageBase64 ||
    body.image ||
    "";

  if (!value) {
    return null;
  }

  /*
    Expected format:

    data:image/jpeg;base64,AAAA...
    OR
    data:image/png;base64,AAAA...
  */

  if (value.startsWith("data:image/")) {

    const commaIndex = value.indexOf(",");

    if (commaIndex === -1) {
      return null;
    }

    return {
      mime:
        value
          .substring(
            5,
            value.indexOf(";")
          ),

      base64:
        value.substring(commaIndex + 1)
    };
  }


  /*
    Also accept raw base64.
  */

  return {
    mime: "image/jpeg",
    base64: value
  };
}


/* =========================================================
   BUILD PREMIUM FASHION PROMPT
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


  /*
    If the frontend already supplied the large prompt,
    use it as the creative foundation.

    We still add the strict garment-preservation
    instructions below.
  */

  return `
OBITREND PREMIUM FASHION CAMPAIGN.

${suppliedPrompt}

MODEL:
${model}

BODY TYPE:
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

CITY / COUNTRY:
${city}

PROPERTY:
${property}

VEHICLE:
${vehicle}

LIGHTING:
${lighting}

CAMERA:
${camera}


=========================================================
MOST IMPORTANT REQUIREMENT — CLOTHING PRESERVATION
=========================================================

The uploaded image is the primary clothing reference.

Preserve the uploaded garment as accurately as possible.

The garment must remain visually recognizable as the
same garment shown in the reference image.

Preserve:

- exact visible colors
- color placement
- patterns
- prints
- logos
- graphics
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
- belt details
- fabric texture
- material appearance
- garment proportions
- distinctive design elements

Do NOT redesign the garment.

Do NOT replace the garment.

Do NOT invent another garment.

Do NOT randomly change the colors.

Do NOT add unnecessary decorations.

Do NOT remove distinctive details.

The model must actually wear the uploaded garment.


=========================================================
PHOTOREALISM
=========================================================

Create an extremely realistic premium commercial fashion
photograph.

Realistic human anatomy.

Realistic face.

Realistic skin texture.

Realistic hair.

Realistic hands.

Realistic fingers.

Realistic fabric.

Realistic folds.

Realistic shadows.

Realistic reflections.

Realistic environmental lighting.

Natural perspective.

Physically believable depth of field.

Professional fashion photography.

Premium advertising quality.

Luxury editorial appearance.

The final image must look like a real photograph captured
by a professional fashion photographer, NOT an illustration.


=========================================================
AUTHENTIC LOCATION
=========================================================

The selected city and country should influence the environment.

Make the location believable and geographically appropriate.

Use realistic architecture, roads, vegetation, weather,
urban details and environmental context.

Do not create impossible buildings.

Do not create fake-looking scenery.

Do not use random fantasy architecture.

The location should look like a real professional
fashion campaign photographed there.


=========================================================
COMPOSITION
=========================================================

The clothing is the main visual subject.

Show the model clearly.

Use a flattering professional fashion pose.

Keep the complete garment visible whenever practical.

Maintain natural body proportions.

Maintain realistic garment fit.

Use premium composition.

Use professional depth of field.

Keep the background detailed but secondary to the garment.


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


FINAL GOAL:

A premium photorealistic fashion advertisement featuring
the uploaded garment, a beautiful model and a believable
luxury real-world environment.
`;
}


/* =========================================================
   MAIN HANDLER
========================================================= */

export default async function handler(req, res) {

  /*
    Only POST is allowed.
  */

  if (req.method !== "POST") {

    return json(res, 405, {
      success: false,
      error: "Method not allowed. Use POST."
    });

  }


  /*
    Make sure OpenAI key exists.
  */

  if (!process.env.OPENAI_API_KEY) {

    console.error(
      "OBITREND ERROR: OPENAI_API_KEY is missing."
    );

    return json(res, 500, {
      success: false,
      error:
        "OPENAI_API_KEY is missing in Vercel Environment Variables."
    });

  }


  try {

    const body = req.body || {};


    /*
      Frontend image.
    */

    const image = getImageBase64(body);


    if (!image) {

      return json(res, 400, {
        success: false,
        error:
          "Please upload a clothing image first."
      });

    }


    /*
      Build premium prompt.
    */

    const prompt =
      buildPrompt(body);


    /*
      Convert ratio to supported OpenAI size.
    */

    const size =
      getImageSize(body.aspectRatio);


    console.log(
      "OBITREND generation started",
      {
        size,
        city: body.city,
        style: body.fashionStyle,
        ratio: body.aspectRatio
      }
    );


    /*
    =========================================================
    CREATE IMAGE FILE
    =========================================================

    The uploaded base64 image becomes a File object.

    This allows OpenAI's image editing endpoint to use the
    user's clothing image as the reference.
    */

    const imageBuffer =
      Buffer.from(
        image.base64,
        "base64"
      );


    const extension =
      image.mime === "image/png"
        ? "png"
        : "jpg";


    const imageFile =
      await toFile(
        imageBuffer,
        `obitrend-reference.${extension}`,
        {
          type: image.mime
        }
      );


    /*
    =========================================================
    IMAGE EDIT / GENERATION
    =========================================================

    We use the uploaded clothing photo as a reference.

    This is better for OBITREND than generating a completely
    unrelated image from text alone.
    */

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

        n: 1

      });


    /*
    =========================================================
    CHECK RESPONSE
    =========================================================
    */

    if (
      !result ||
      !result.data ||
      !result.data.length
    ) {

      console.error(
        "OBITREND: OpenAI returned no image."
      );

      return json(res, 502, {
        success: false,
        error:
          "OpenAI did not return an image."
      });

    }


    const generated =
      result.data[0];


    /*
    GPT Image models normally return base64 image data
    in b64_json.

    Convert it to a browser data URL.
    */

    if (generated.b64_json) {

      const imageUrl =
        `data:image/png;base64,${generated.b64_json}`;


      console.log(
        "OBITREND generation completed successfully."
      );


      return json(res, 200, {

        success: true,

        imageUrl:

          imageUrl,

        /*
          Additional fields make the endpoint easier
          to use with future OBITREND versions.
        */

        url:
          imageUrl,

        image:
          imageUrl,

        aspectRatio:
          clean(body.aspectRatio, "4:5"),

        size:
          size,

        premium:
          true,

        clothingPreservation:
          true

      });

    }


    /*
    =========================================================
    FALLBACK
    =========================================================

    Some API responses may expose a URL instead.
    */

    if (generated.url) {

      return json(res, 200, {

        success: true,

        imageUrl:
          generated.url,

        url:
          generated.url,

        image:
          generated.url,

        aspectRatio:
          clean(body.aspectRatio, "4:5"),

        size:
          size,

        premium:
          true,

        clothingPreservation:
          true

      });

    }


    /*
    Nothing usable was returned.
    */

    console.error(
      "OBITREND: Unexpected OpenAI image response.",
      generated
    );


    return json(res, 502, {

      success: false,

      error:
        "OpenAI returned an unexpected image response."

    });


  } catch (error) {

    /*
    =========================================================
    ERROR HANDLING
    =========================================================
    */

    console.error(
      "OBITREND GENERATION ERROR:",
      error
    );


    let message =
      "Image generation failed.";


    /*
      OpenAI errors often contain useful information.
    */

    if (error?.message) {

      message =
        error.message;

    }


    /*
      Handle common configuration errors
      without exposing secrets.
    */

    if (
      message
        .toLowerCase()
        .includes("api key")
    ) {

      message =
        "OpenAI API key is missing or invalid. Check OPENAI_API_KEY in Vercel.";

    }


    if (
      message
        .toLowerCase()
        .includes("quota")
    ) {

      message =
        "OpenAI API quota or billing limit was reached.";

    }


    if (
      message
        .toLowerCase()
        .includes("rate")
    ) {

      message =
        "OBITREND is temporarily rate-limited. Please try again shortly.";

    }


    return json(res, 500, {

      success: false,

      error:
        message

    });

  }

}
