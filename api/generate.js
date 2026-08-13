import OpenAI from "openai";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "12mb"
    }
  }
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});


/*
 * ---------------------------------------------------------
 * HELPERS
 * ---------------------------------------------------------
 */

function send(res, status, data) {

  res.status(status).json(data);

}


function extractBase64(dataUrl) {

  if (!dataUrl || typeof dataUrl !== "string") {
    throw new Error("No image was supplied.");
  }

  const match = dataUrl.match(
    /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i
  );

  if (!match) {

    throw new Error(
      "Unsupported image format. Use PNG, JPG, JPEG or WEBP."
    );

  }

  return {
    mime: match[1].toLowerCase(),
    base64: match[2]
  };

}


/*
 * ---------------------------------------------------------
 * API HANDLER
 * ---------------------------------------------------------
 */

export default async function handler(req, res) {

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


  if (req.method === "OPTIONS") {

    return send(res, 200, {
      ok: true
    });

  }


  if (req.method !== "POST") {

    return send(res, 405, {
      error: "Method not allowed. Use POST."
    });

  }


  /*
   * Check API key
   */

  if (!process.env.OPENAI_API_KEY) {

    console.error(
      "OPENAI_API_KEY is missing."
    );

    return send(res, 500, {

      error:
        "OBITREND AI is not configured. Add OPENAI_API_KEY to the server environment."

    });

  }


  try {

    const body = req.body || {};

    const prompt =
      typeof body.prompt === "string"
        ? body.prompt.trim()
        : "";

    const imageData =
      typeof body.image === "string"
        ? body.image
        : "";

    const requestedSize =
      typeof body.size === "string"
        ? body.size
        : "1024x1536";

    const fast =
      body.fast === true;


    /*
     * Validation
     */

    if (!prompt) {

      return send(res, 400, {
        error: "No fashion prompt was supplied."
      });

    }


    if (!imageData) {

      return send(res, 400, {
        error: "Please upload a fashion photo."
      });

    }


    const allowedSizes = [
      "1024x1024",
      "1024x1536",
      "1536x1024"
    ];

    const size = allowedSizes.includes(requestedSize)
      ? requestedSize
      : "1024x1536";


    /*
     * Convert browser Data URL to a File.
     */

    const parsed = extractBase64(imageData);

    const buffer = Buffer.from(
      parsed.base64,
      "base64"
    );

    const extension =
      parsed.mime === "image/png"
        ? "png"
        : parsed.mime === "image/webp"
          ? "webp"
          : "jpg";


    const file = new File(
      [buffer],
      `obitrend-fashion.${extension}`,
      {
        type: parsed.mime === "image/jpg"
          ? "image/jpeg"
          : parsed.mime
      }
    );


    /*
     * -------------------------------------------------------
     * IMAGE EDIT / FASHION GENERATION
     * -------------------------------------------------------
     *
     * The uploaded image is sent as the main visual reference.
     *
     * We use GPT Image so the clothing reference can influence
     * the generated campaign instead of simply generating an
     * unrelated fashion photograph.
     */

    const result = await openai.images.edit({

      model: "gpt-image-2",

      image: file,

      prompt: `

OBITREND AI FASHION CAMPAIGN.

Use the uploaded image as the PRIMARY CLOTHING REFERENCE.

IMPORTANT CLOTHING REQUIREMENTS:

Preserve the clothing's important design.
Preserve its dominant colors.
Preserve recognizable patterns.
Preserve the material appearance.
Preserve the overall silhouette.
Make the clothing naturally fit the generated model.

Do NOT simply reproduce the original photograph.

Create a NEW professional fashion campaign photograph
using the uploaded clothing.

MODEL AND ENVIRONMENT:

${prompt}

QUALITY REQUIREMENTS:

Photorealistic professional fashion photography.
High-end editorial composition.
Natural human anatomy.
Natural hands and fingers.
Realistic skin.
Realistic hair.
Realistic fabric folds.
Realistic stitching and clothing texture.
Natural shadows.
Professional depth of field.
High-quality lighting.
Premium international fashion campaign aesthetic.

The location must look believable and physically consistent.

If a city, hotel, house, stadium, football field, sports court,
boutique, game shop, airport, car, yacht, ship or other
environment is requested, integrate it naturally into the scene.

Keep the clothing as the visual priority.

Do not add captions.
Do not add watermarks.
Do not add random text.
Do not add fake brand logos.
Do not distort the clothing.
Do not create duplicate people.

FINAL RESULT:

A polished premium fashion campaign image suitable for
OBITREND AI Fashion Creator.
`,

      size,

      /*
       * Fast mode uses lower quality for quicker turnaround.
       * Normal mode uses medium quality.
       */

      quality: fast
        ? "low"
        : "medium",

      output_format: "png"

    });


    /*
     * -------------------------------------------------------
     * EXTRACT IMAGE
     * -------------------------------------------------------
     */

    if (
      !result ||
      !result.data ||
      !result.data[0] ||
      !result.data[0].b64_json
    ) {

      console.error(
        "Unexpected OpenAI image response:",
        result
      );

      return send(res, 502, {
        error:
          "The AI completed the request but returned no image."
      });

    }


    const generatedBase64 =
      result.data[0].b64_json;


    const outputImage =
      `data:image/png;base64,${generatedBase64}`;


    /*
     * -------------------------------------------------------
     * SUCCESS
     * -------------------------------------------------------
     */

    return send(res, 200, {

      success: true,

      image: outputImage,

      model: "gpt-image-2",

      size,

      fast,

      message:
        "OBITREND fashion campaign generated successfully."

    });


  } catch (error) {

    console.error(
      "OBITREND API ERROR:",
      error
    );


    /*
     * Friendly errors for the frontend.
     */

    const message =
      error?.error?.message ||
      error?.message ||
      "AI generation failed.";


    return send(res, 500, {

      error: message,

      details:
        process.env.NODE_ENV === "development"
          ? String(error?.stack || "")
          : undefined

    });

  }

}
