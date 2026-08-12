import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export default async function handler(req, res) {

  // --------------------------------------------------
  // CORS / METHOD
  // --------------------------------------------------

  res.setHeader("Access-Control-Allow-Origin", "*");
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
    return res.status(405).json({
      error: "Method not allowed. Use POST."
    });
  }


  // --------------------------------------------------
  // CHECK API KEY
  // --------------------------------------------------

  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is missing.");

    return res.status(500).json({
      error:
        "OPENAI_API_KEY is not configured on the server."
    });
  }


  try {

    // ------------------------------------------------
    // READ REQUEST
    // ------------------------------------------------

    const { image, prompt } = req.body || {};


    if (!image) {
      return res.status(400).json({
        error:
          "No clothing image was received."
      });
    }


    if (typeof image !== "string") {
      return res.status(400).json({
        error:
          "The image must be sent as a data URL."
      });
    }


    if (!image.startsWith("data:image/")) {
      return res.status(400).json({
        error:
          "Invalid image format. Please upload JPG, PNG or WebP."
      });
    }


    // ------------------------------------------------
    // SIZE PROTECTION
    // ------------------------------------------------

    // Prevent extremely large uploads from breaking
    // the server request.

    const maximumImageCharacters = 15 * 1024 * 1024;

    if (image.length > maximumImageCharacters) {

      return res.status(413).json({
        error:
          "The uploaded image is too large. Please choose a smaller photo."
      });

    }


    // ------------------------------------------------
    // PROFESSIONAL FASHION PROMPT
    // ------------------------------------------------

    const userPrompt =
      typeof prompt === "string" && prompt.trim()
        ? prompt.trim()
        : `
Create a professional luxury fashion campaign
using the uploaded clothing item.

Show an adult fashion model wearing the clothing
naturally and professionally.

Use polished commercial fashion photography.

The clothing should remain the main focus.
Preserve its important colors, shape, patterns,
fabric details and design.

Use an elegant premium fashion presentation.

No nudity.
No lingerie.
No erotic content.
No sexually suggestive posing.
No emphasis on intimate body areas.
`;


    const finalPrompt = `
OBITREND AI FASHION CREATOR

Create a premium professional fashion image
using the uploaded clothing photograph as the
primary clothing reference.

IMPORTANT CLOTHING REQUIREMENTS:

- Preserve the clothing design.
- Preserve the main colors.
- Preserve visible patterns.
- Preserve important fabric details.
- Make the clothing clearly visible.
- Do not replace the clothing with unrelated clothing.
- Make the final image look commercially produced.

MODEL:

The model must be an adult fashion model.

Use tasteful professional fashion styling.

Use a natural, confident fashion pose.

LOCATION:

Follow the location, city, country, hotel,
house, vehicle and luxury-environment choices
provided in the user's creative direction.

PHOTOGRAPHY:

Premium international fashion photography.
Professional lighting.
Natural skin appearance.
Realistic proportions.
Detailed clothing.
Luxury editorial composition.
Commercial advertising quality.

SAFETY:

The image must remain appropriate for a
professional fashion advertisement.

No nudity.
No lingerie.
No erotic content.
No sexually suggestive posing.
No sexualized framing.
No emphasis on breasts, buttocks or intimate areas.

USER CREATIVE DIRECTION:

${userPrompt}
`;


    console.log(
      "OBITREND: Starting image generation..."
    );


    // ------------------------------------------------
    // OPENAI IMAGE EDIT
    // ------------------------------------------------

    const response =
      await openai.images.edit({

        model: "gpt-image-1",

        image: image,

        prompt: finalPrompt,

        size: "1024x1536",

        quality: "high",

        output_format: "png"

      });


    console.log(
      "OBITREND: Image generation completed."
    );


    // ------------------------------------------------
    // GET GENERATED IMAGE
    // ------------------------------------------------

    if (
      !response ||
      !response.data ||
      !response.data[0]
    ) {

      console.error(
        "OpenAI returned no image:",
        response
      );

      return res.status(502).json({
        error:
          "The AI service did not return an image."
      });

    }


    const generatedImage =
      response.data[0].b64_json;


    if (!generatedImage) {

      console.error(
        "No b64_json returned from OpenAI."
      );

      return res.status(502).json({
        error:
          "The generated image data was empty."
      });

    }


    // ------------------------------------------------
    // RETURN IMAGE TO OBITREND FRONTEND
    // ------------------------------------------------

    return res.status(200).json({

      success: true,

      image:
        `data:image/png;base64,${generatedImage}`

    });


  } catch (error) {

    console.error(
      "OBITREND GENERATION ERROR:",
      error
    );


    // ----------------------------------------------
    // OPENAI SAFETY ERROR
    // ----------------------------------------------

    const errorMessage =
      error?.message || "";


    if (
      errorMessage.toLowerCase().includes("safety") ||
      errorMessage.toLowerCase().includes("policy") ||
      errorMessage.toLowerCase().includes("sexual")
    ) {

      return res.status(400).json({

        error:
          "The image or creative direction was rejected by the AI safety system. Please use a professional fashion photo and a non-sexual fashion description."

      });

    }


    // ----------------------------------------------
    // AUTHENTICATION ERROR
    // ----------------------------------------------

    if (
      error?.status === 401 ||
      errorMessage.toLowerCase().includes("api key") ||
      errorMessage.toLowerCase().includes("authentication")
    ) {

      return res.status(500).json({

        error:
          "OBITREND could not authenticate with the AI service. Check the OPENAI_API_KEY environment variable."

      });

    }


    // ----------------------------------------------
    // RATE LIMIT
    // ----------------------------------------------

    if (error?.status === 429) {

      return res.status(429).json({

        error:
          "The AI service is temporarily busy or the account has reached its usage limit. Please try again shortly."

      });

    }


    // ----------------------------------------------
    // GENERAL ERROR
    // ----------------------------------------------

    return res.status(500).json({

      error:
        "OBITREND could not generate the image. Please try again."

    });

  }
}
