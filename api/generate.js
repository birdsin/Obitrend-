/**
 * OBITREND AI FASHION CREATOR
 * API IMAGE GENERATION ENGINE
 *
 * Endpoint:
 * POST /api/generate
 *
 * IMPORTANT:
 * OPENAI_API_KEY must be stored in the deployment environment.
 * NEVER put the API key inside index.html.
 */

const MAX_IMAGE_DATA_LENGTH = 7_000_000;

module.exports = async function handler(req, res) {

  /* ---------------------------------------------------------
     CORS / METHOD
  --------------------------------------------------------- */

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

    return res.status(405).json({
      error: "Method not allowed. Use POST."
    });

  }

  /* ---------------------------------------------------------
     API KEY
  --------------------------------------------------------- */

  const apiKey =
    process.env.OPENAI_API_KEY;

  if (!apiKey) {

    console.error(
      "OPENAI_API_KEY is missing."
    );

    return res.status(500).json({
      error:
        "OpenAI API key is not configured on the server. Add OPENAI_API_KEY to your deployment environment."
    });

  }

  /* ---------------------------------------------------------
     REQUEST BODY
  --------------------------------------------------------- */

  try {

    let body = req.body;

    if (typeof body === "string") {

      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({
          error: "Invalid JSON request."
        });
      }

    }

    if (!body || typeof body !== "object") {

      return res.status(400).json({
        error: "Request body is missing."
      });

    }

    const image = body.image;

    const prompt =
      typeof body.prompt === "string"
        ? body.prompt.trim()
        : "";

    const size =
      normalizeSize(body.size);

    const quality =
      normalizeQuality(body.quality);

    /* -------------------------------------------------------
       VALIDATE IMAGE
    ------------------------------------------------------- */

    if (!image || typeof image !== "string") {

      return res.status(400).json({
        error:
          "No fashion image was uploaded."
      });

    }

    if (!image.startsWith("data:image/")) {

      return res.status(400).json({
        error:
          "Invalid image format. Please upload PNG, JPG or WEBP."
      });

    }

    if (image.length > MAX_IMAGE_DATA_LENGTH) {

      return res.status(413).json({
        error:
          "The uploaded image is too large. Please choose a smaller photo."
      });

    }

    /* -------------------------------------------------------
       VALIDATE PROMPT
    ------------------------------------------------------- */

    if (!prompt) {

      return res.status(400).json({
        error:
          "Your fashion instructions are empty."
      });

    }

    /* -------------------------------------------------------
       PREPARE OPENAI REQUEST
    ------------------------------------------------------- */

    const openAIRequest = {

      model: "gpt-5.6",

      input: [

        {

          role: "user",

          content: [

            {

              type: "input_text",

              text: prompt

            },

            {

              type: "input_image",

              image_url: image,

              detail: "auto"

            }

          ]

        }

      ],

      tools: [

        {

          type: "image_generation",

          action: "generate",

          size: size,

          quality: quality

        }

      ]

    };

    console.log(
      "OBITREND: sending image generation request..."
    );

    /* -------------------------------------------------------
       CALL OPENAI
    ------------------------------------------------------- */

    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () => controller.abort(),
        180000
      );

    let openAIResponse;

    try {

      openAIResponse =
        await fetch(
          "https://api.openai.com/v1/responses",
          {

            method: "POST",

            headers: {

              "Content-Type":
                "application/json",

              "Authorization":
                `Bearer ${apiKey}`

            },

            body:
              JSON.stringify(openAIRequest),

            signal:
              controller.signal

          }
        );

    } catch (networkError) {

      clearTimeout(timeout);

      console.error(
        "OBITREND NETWORK ERROR:",
        networkError
      );

      if (
        networkError &&
        networkError.name ===
          "AbortError"
      ) {

        return res.status(504).json({
          error:
            "The AI generation timed out. Please try again."
        });

      }

      return res.status(502).json({
        error:
          "Could not connect to the OpenAI image service."
      });

    }

    clearTimeout(timeout);

    /* -------------------------------------------------------
       READ OPENAI RESPONSE
    ------------------------------------------------------- */

    const responseText =
      await openAIResponse.text();

    let openAIData;

    try {

      openAIData =
        JSON.parse(responseText);

    } catch {

      console.error(
        "OBITREND: Invalid OpenAI response:",
        responseText.slice(0, 1000)
      );

      return res.status(502).json({
        error:
          "OpenAI returned an invalid response."
      });

    }

    /* -------------------------------------------------------
       OPENAI ERROR
    ------------------------------------------------------- */

    if (!openAIResponse.ok) {

      console.error(
        "OPENAI ERROR:",
        JSON.stringify(
          openAIData,
          null,
          2
        )
      );

      const message =
        openAIData?.error?.message ||
        "OpenAI image generation failed.";

      return res.status(
        openAIResponse.status >= 400 &&
        openAIResponse.status < 600
          ? openAIResponse.status
          : 502
      ).json({

        error:
          cleanErrorMessage(message)

      });

    }

    /* -------------------------------------------------------
       FIND GENERATED IMAGE
    ------------------------------------------------------- */

    const outputs =
      Array.isArray(openAIData.output)
        ? openAIData.output
        : [];

    const imageCalls =
      outputs.filter(
        item =>
          item &&
          item.type ===
            "image_generation_call"
      );

    if (!imageCalls.length) {

      console.error(
        "OBITREND: No image_generation_call found.",
        JSON.stringify(
          openAIData,
          null,
          2
        ).slice(0, 5000)
      );

      return res.status(502).json({
        error:
          "The AI finished without returning an image. Please try again."
      });

    }

    const base64Image =
      imageCalls[0]?.result;

    if (
      !base64Image ||
      typeof base64Image !== "string"
    ) {

      console.error(
        "OBITREND: Image result was empty."
      );

      return res.status(502).json({
        error:
          "The generated image data was empty."
      });

    }

    /* -------------------------------------------------------
       RETURN IMAGE TO FRONTEND
    ------------------------------------------------------- */

    const imageDataUrl =
      `data:image/png;base64,${base64Image}`;

    console.log(
      "OBITREND: image generated successfully."
    );

    return res.status(200).json({

      success: true,

      image: imageDataUrl,

      model: "gpt-5.6",

      size: size,

      quality: quality

    });

  } catch (error) {

    console.error(
      "OBITREND UNEXPECTED ERROR:",
      error
    );

    return res.status(500).json({

      error:
        "Unexpected server error. Please try again."

    });

  }

};


/* =========================================================
   HELPERS
========================================================= */

function normalizeSize(size) {

  const allowed = [

    "1024x1024",

    "1024x1536",

    "1536x1024"

  ];

  if (
    typeof size === "string" &&
    allowed.includes(size)
  ) {

    return size;

  }

  return "1024x1536";
}


function normalizeQuality(quality) {

  const allowed = [

    "low",

    "medium",

    "high",

    "auto"

  ];

  if (
    typeof quality === "string" &&
    allowed.includes(quality)
  ) {

    return quality;

  }

  return "high";
}


function cleanErrorMessage(message) {

  if (!message) {

    return "Image generation failed.";

  }

  const text =
    String(message);

  if (
    text.toLowerCase().includes(
      "organization must be verified"
    )
  ) {

    return (
      "Your OpenAI organization needs verification before this image model can be used."
    );

  }

  if (
    text.toLowerCase().includes(
      "billing"
    )
  ) {

    return (
      "Your OpenAI API account may need billing or available API credits before image generation can run."
    );

  }

  if (
    text.toLowerCase().includes(
      "rate limit"
    )
  ) {

    return (
      "The AI service is temporarily rate-limited. Please wait a moment and try again."
    );

  }

  return text.slice(0, 600);
      }
