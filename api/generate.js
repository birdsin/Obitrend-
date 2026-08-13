import OpenAI from "openai";

/*
 * OBITREND AI FASHION CREATOR
 * /api/generate.js
 *
 * Receives:
 * {
 *   image: "data:image/jpeg;base64,...",
 *   prompt: "fashion description",
 *   size: "1024x1536"
 * }
 *
 * Returns:
 * {
 *   success: true,
 *   image: "data:image/png;base64,..."
 * }
 */

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "12mb",
    },
  },
};

// ----------------------------------------------------
// SETTINGS
// ----------------------------------------------------

const MODEL = "gpt-image-1";

// Leave some time for Vercel to return a proper JSON response
// instead of allowing the whole function to hit 300 seconds.
const OPENAI_TIMEOUT_MS = 240000;

const MAX_IMAGE_DATA = 8 * 1024 * 1024;

// ----------------------------------------------------
// JSON RESPONSE HELPER
// ----------------------------------------------------

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

// ----------------------------------------------------
// IMAGE VALIDATION
// ----------------------------------------------------

function isImageData(value) {
  if (typeof value !== "string") {
    return false;
  }

  return /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(value);
}

// ----------------------------------------------------
// GET MIME TYPE
// ----------------------------------------------------

function getMimeType(dataUrl) {
  const match = dataUrl.match(/^data:(image\/[^;]+);base64,/i);

  if (!match) {
    return "image/png";
  }

  return match[1].toLowerCase();
}

// ----------------------------------------------------
// GET BASE64 PART
// ----------------------------------------------------

function getBase64(dataUrl) {
  const comma = dataUrl.indexOf(",");

  if (comma === -1) {
    return null;
  }

  return dataUrl.slice(comma + 1);
}

// ----------------------------------------------------
// GET FILE EXTENSION
// ----------------------------------------------------

function getExtension(mimeType) {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) {
    return "jpg";
  }

  if (mimeType.includes("webp")) {
    return "webp";
  }

  return "png";
}

// ----------------------------------------------------
// CONVERT BASE64 DATA URL TO FILE
// ----------------------------------------------------

function dataUrlToFile(dataUrl) {
  const base64 = getBase64(dataUrl);

  if (!base64) {
    throw new Error("Invalid image data.");
  }

  const mimeType = getMimeType(dataUrl);
  const extension = getExtension(mimeType);

  const buffer = Buffer.from(base64, "base64");

  return new File(
    [buffer],
    `obitrend-upload.${extension}`,
    {
      type: mimeType,
    }
  );
}

// ----------------------------------------------------
// CREATE OPENAI CLIENT
// ----------------------------------------------------

function createOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not configured on Vercel."
    );
  }

  return new OpenAI({
    apiKey,
    timeout: OPENAI_TIMEOUT_MS,
    maxRetries: 0,
  });
}

// ----------------------------------------------------
// DEFAULT FASHION PROMPT
// ----------------------------------------------------

function buildPrompt(userPrompt) {
  const cleanPrompt =
    typeof userPrompt === "string"
      ? userPrompt.trim()
      : "";

  const basePrompt = `
Create a professional high-end fashion campaign image using the uploaded fashion item as the primary clothing reference.

IMPORTANT:
- Preserve the uploaded clothing item's design, color, material, proportions, patterns, graphics and overall appearance.
- Put the clothing naturally on an adult fashion model.
- Do not replace the uploaded clothing with a different garment.
- Make the garment clearly visible.
- Create realistic human anatomy.
- Create realistic skin, hands, face and hair.
- Use professional fashion photography.
- Use realistic lighting.
- Use realistic shadows.
- Use a premium editorial photography look.
- Make the final image look commercially usable for a fashion brand.
- Do not add random text.
- Do not add watermarks.
- Do not distort the clothing.
`;

  if (cleanPrompt) {
    return `${basePrompt}

USER'S FASHION CAMPAIGN INSTRUCTIONS:
${cleanPrompt}
`;
  }

  return `${basePrompt}

Create an elegant luxury fashion campaign suitable for OBITREND AI Fashion Creator.
`;
}

// ----------------------------------------------------
// READ REQUEST BODY
// ----------------------------------------------------

async function readRequestBody(request) {
  // Modern Web Request
  if (
    request &&
    typeof request.json === "function"
  ) {
    try {
      return await request.json();
    } catch (error) {
      throw new Error(
        "Invalid JSON request body."
      );
    }
  }

  // Fallback
  if (request && request.body) {
    return request.body;
  }

  throw new Error(
    "Unable to read request body."
  );
}

// ----------------------------------------------------
// MAIN HANDLER
// ----------------------------------------------------

export default async function handler(request) {
  const startedAt = Date.now();

  console.log(
    "OBITREND: /api/generate request started."
  );

  try {
    // ------------------------------------------------
    // METHOD CHECK
    // ------------------------------------------------

    if (request.method !== "POST") {
      console.log(
        "OBITREND: Invalid HTTP method:",
        request.method
      );

      return json(
        {
          success: false,
          error: "Only POST requests are allowed.",
        },
        405
      );
    }

    // ------------------------------------------------
    // API KEY CHECK
    // ------------------------------------------------

    if (!process.env.OPENAI_API_KEY) {
      console.error(
        "OBITREND: OPENAI_API_KEY is missing."
      );

      return json(
        {
          success: false,
          error:
            "OPENAI_API_KEY is not configured on the server.",
        },
        500
      );
    }

    // ------------------------------------------------
    // READ BODY
    // ------------------------------------------------

    let body;

    try {
      body = await readRequestBody(request);
    } catch (error) {
      console.error(
        "OBITREND: Request body error:",
        error.message
      );

      return json(
        {
          success: false,
          error: "Invalid JSON request body.",
        },
        400
      );
    }

    // ------------------------------------------------
    // EXTRACT DATA
    // ------------------------------------------------

    const image = body?.image;

    const userPrompt =
      typeof body?.prompt === "string"
        ? body.prompt
        : "";

    const requestedSize =
      typeof body?.size === "string"
        ? body.size
        : "1024x1536";

    // ------------------------------------------------
    // IMAGE CHECK
    // ------------------------------------------------

    if (!isImageData(image)) {
      console.error(
        "OBITREND: Invalid image format."
      );

      return json(
        {
          success: false,
          error:
            "Please upload a valid PNG, JPG, JPEG, or WEBP image.",
        },
        400
      );
    }

    // ------------------------------------------------
    // IMAGE SIZE CHECK
    // ------------------------------------------------

    if (image.length > MAX_IMAGE_DATA) {
      console.error(
        "OBITREND: Image is too large:",
        image.length
      );

      return json(
        {
          success: false,
          error:
            "Image is too large. Please upload a smaller image.",
        },
        413
      );
    }

    // ------------------------------------------------
    // PROMPT CHECK
    // ------------------------------------------------

    if (
      userPrompt &&
      userPrompt.length > 5000
    ) {
      return json(
        {
          success: false,
          error:
            "Custom instructions are too long. Please keep them under 5000 characters.",
        },
        400
      );
    }

    // ------------------------------------------------
    // SIZE VALIDATION
    // ------------------------------------------------

    const allowedSizes = [
      "1024x1024",
      "1024x1536",
      "1536x1024",
    ];

    const size = allowedSizes.includes(
      requestedSize
    )
      ? requestedSize
      : "1024x1536";

    // ------------------------------------------------
    // LOG REQUEST
    // ------------------------------------------------

    console.log(
      "OBITREND: Image received."
    );

    console.log(
      "OBITREND: Image characters:",
      image.length
    );

    console.log(
      "OBITREND: Prompt length:",
      userPrompt.length
    );

    console.log(
      "OBITREND: Image size:",
      size
    );

    // ------------------------------------------------
    // CONVERT IMAGE
    // ------------------------------------------------

    let file;

    try {
      file = dataUrlToFile(image);
    } catch (error) {
      console.error(
        "OBITREND: Could not convert image:",
        error
      );

      return json(
        {
          success: false,
          error:
            "The uploaded image could not be processed.",
        },
        400
      );
    }

    console.log(
      "OBITREND: Image converted to file."
    );

    // ------------------------------------------------
    // OPENAI CLIENT
    // ------------------------------------------------

    let client;

    try {
      client = createOpenAIClient();
    } catch (error) {
      console.error(
        "OBITREND: OpenAI client error:",
        error.message
      );

      return json(
        {
          success: false,
          error: error.message,
        },
        500
      );
    }

    // ------------------------------------------------
    // BUILD FASHION PROMPT
    // ------------------------------------------------

    const prompt = buildPrompt(
      userPrompt
    );

    console.log(
      "OBITREND: Sending image to OpenAI..."
    );

    console.log(
      "OBITREND: Model:",
      MODEL
    );

    // ------------------------------------------------
    // IMAGE GENERATION
    // ------------------------------------------------

    let result;

    try {
      result = await client.images.edit({
        model: MODEL,

        image: file,

        prompt: prompt,

        size: size,

        quality: "low",

        n: 1,
      });
    } catch (error) {
      console.error(
        "OBITREND: OpenAI request failed."
      );

      console.error(
        "OBITREND ERROR NAME:",
        error?.name
      );

      console.error(
        "OBITREND ERROR MESSAGE:",
        error?.message
      );

      console.error(
        "OBITREND ERROR STATUS:",
        error?.status
      );

      // ----------------------------------------------
      // TIMEOUT
      // ----------------------------------------------

      if (
        error?.name === "APIConnectionTimeoutError" ||
        error?.code === "ETIMEDOUT" ||
        error?.message
          ?.toLowerCase()
          .includes("timeout")
      ) {
        return json(
          {
            success: false,
            error:
              "OpenAI image generation took too long. Please try again with a smaller image or shorter instructions.",
            code: "OPENAI_TIMEOUT",
          },
          504
        );
      }

      // ----------------------------------------------
      // OPENAI ERROR
      // ----------------------------------------------

      const message =
        error?.message ||
        "OpenAI could not generate the image.";

      return json(
        {
          success: false,
          error: message,
          code: "OPENAI_ERROR",
        },
        502
      );
    }

    // ------------------------------------------------
    // CHECK RESPONSE
    // ------------------------------------------------

    console.log(
      "OBITREND: OpenAI response received."
    );

    if (
      !result ||
      !result.data ||
      !result.data[0]
    ) {
      console.error(
        "OBITREND: OpenAI returned no image.",
        result
      );

      return json(
        {
          success: false,
          error:
            "OpenAI did not return an image.",
          code: "NO_IMAGE_RETURNED",
        },
        502
      );
    }

    const output = result.data[0];

    // ------------------------------------------------
    // BASE64 IMAGE
    // ------------------------------------------------

    if (output.b64_json) {
      console.log(
        "OBITREND: Base64 image received."
      );

      const elapsed =
        Date.now() - startedAt;

      console.log(
        "OBITREND: Completed in",
        elapsed,
        "ms."
      );

      return json(
        {
          success: true,
          image:
            `data:image/png;base64,${output.b64_json}`,
        },
        200
      );
    }

    // ------------------------------------------------
    // URL FALLBACK
    // ------------------------------------------------

    if (output.url) {
      console.log(
        "OBITREND: Image URL received."
      );

      const elapsed =
        Date.now() - startedAt;

      console.log(
        "OBITREND: Completed in",
        elapsed,
        "ms."
      );

      return json(
        {
          success: true,
          image: output.url,
        },
        200
      );
    }

    // ------------------------------------------------
    // UNSUPPORTED RESPONSE
    // ------------------------------------------------

    console.error(
      "OBITREND: Unsupported OpenAI image response.",
      output
    );

    return json(
      {
        success: false,
        error:
          "OpenAI returned an unsupported image format.",
        code: "UNSUPPORTED_IMAGE_RESPONSE",
      },
      502
    );

  } catch (error) {
    // ------------------------------------------------
    // FINAL SAFETY NET
    // ------------------------------------------------

    console.error(
      "OBITREND: Unexpected server error:",
      error
    );

    return json(
      {
        success: false,
        error:
          error?.message ||
          "OBITREND could not generate the image.",
        code: "SERVER_ERROR",
      },
      500
    );
  }
}
