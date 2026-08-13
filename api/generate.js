import OpenAI, { toFile } from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 0,
  timeout: 180000,
});

const MAX_BODY_SIZE = 4 * 1024 * 1024;

function send(res, status, data) {
  return res.status(status).json(data);
}

function isValidImageData(value) {
  return (
    typeof value === "string" &&
    /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(value)
  );
}

function getMimeType(dataUrl) {
  const match = dataUrl.match(
    /^data:image\/(png|jpeg|jpg|webp);base64,/i
  );

  if (!match) return "image/png";

  const type = match[1].toLowerCase();

  if (type === "jpg" || type === "jpeg") {
    return "image/jpeg";
  }

  if (type === "webp") {
    return "image/webp";
  }

  return "image/png";
}

function getExtension(mimeType) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

function getBody(req) {
  if (!req.body) return null;

  if (typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }

  return null;
}

export default async function handler(req, res) {
  console.log("OBITREND: /api/generate started");

  // ---------------------------------------------------------
  // METHOD
  // ---------------------------------------------------------

  if (req.method !== "POST") {
    return send(res, 405, {
      error: "Only POST requests are allowed.",
    });
  }

  // ---------------------------------------------------------
  // API KEY
  // ---------------------------------------------------------

  if (!process.env.OPENAI_API_KEY) {
    console.error("OBITREND: OPENAI_API_KEY is missing");

    return send(res, 500, {
      error: "OPENAI_API_KEY is not configured on the server.",
    });
  }

  try {
    // -------------------------------------------------------
    // REQUEST SIZE
    // -------------------------------------------------------

    const contentLength = Number(
      req.headers?.["content-length"] ||
      req.headers?.["Content-Length"] ||
      0
    );

    console.log(
      "OBITREND: Content-Length:",
      contentLength
    );

    if (
      contentLength &&
      contentLength > MAX_BODY_SIZE
    ) {
      return send(res, 413, {
        error:
          "The uploaded image is too large. Please use an image smaller than 4 MB.",
      });
    }

    // -------------------------------------------------------
    // BODY
    // -------------------------------------------------------

    const body = getBody(req);

    if (!body) {
      return send(res, 400, {
        error: "Invalid JSON request body.",
      });
    }

    console.log("OBITREND: Request body received");

    const image = body.image;
    const prompt = body.prompt;

    const requestedSize =
      body.size || "1024x1536";

    // -------------------------------------------------------
    // IMAGE VALIDATION
    // -------------------------------------------------------

    if (!isValidImageData(image)) {
      return send(res, 400, {
        error:
          "Please upload a valid PNG, JPG, JPEG, or WEBP image.",
      });
    }

    // -------------------------------------------------------
    // PROMPT VALIDATION
    // -------------------------------------------------------

    if (
      typeof prompt !== "string" ||
      prompt.trim().length < 3
    ) {
      return send(res, 400, {
        error: "A valid fashion prompt is required.",
      });
    }

    // -------------------------------------------------------
    // BASE64
    // -------------------------------------------------------

    const commaIndex = image.indexOf(",");

    if (commaIndex === -1) {
      return send(res, 400, {
        error: "Invalid image data.",
      });
    }

    const base64Data =
      image.substring(commaIndex + 1);

    if (!base64Data) {
      return send(res, 400, {
        error: "Image data is empty.",
      });
    }

    // -------------------------------------------------------
    // IMAGE BUFFER
    // -------------------------------------------------------

    const mimeType = getMimeType(image);
    const extension = getExtension(mimeType);

    const imageBuffer = Buffer.from(
      base64Data,
      "base64"
    );

    if (!imageBuffer.length) {
      return send(res, 400, {
        error: "Unable to decode uploaded image.",
      });
    }

    console.log(
      "OBITREND: Image decoded:",
      imageBuffer.length,
      "bytes"
    );

    // -------------------------------------------------------
    // OPENAI FILE
    // -------------------------------------------------------

    const file = await toFile(
      imageBuffer,
      `obitrend-upload.${extension}`,
      {
        type: mimeType,
      }
    );

    console.log(
      "OBITREND: OpenAI file prepared"
    );

    // -------------------------------------------------------
    // SIZE
    // -------------------------------------------------------

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

    // -------------------------------------------------------
    // PROMPT
    // -------------------------------------------------------

    const finalPrompt = `
Create a professional high-end fashion campaign
using the uploaded image as the primary clothing
reference.

Preserve the clothing design, color, pattern,
fabric appearance, proportions and important
details from the uploaded image.

The clothing must remain the main subject.

Create a realistic adult fashion model wearing
the clothing naturally.

Professional fashion photography.
Luxury editorial quality.
Realistic skin and fabric texture.
Natural anatomy.
Natural lighting.
Natural shadows.
Sharp clothing details.
Premium fashion campaign appearance.

Do not add random text.
Do not add watermarks.
Do not add fake logos.
Do not distort the clothing.
Do not distort hands or body.

Fashion campaign request:

${prompt.trim()}
`;

    console.log(
      "OBITREND: About to contact OpenAI"
    );

    console.log(
      "OBITREND: Model = gpt-image-1"
    );

    console.log(
      "OBITREND: Size =",
      size
    );

    // -------------------------------------------------------
    // OPENAI IMAGE EDIT
    // -------------------------------------------------------

    const result =
      await client.images.edit({
        model: "gpt-image-1",
        image: file,
        prompt: finalPrompt,
        size,
        quality: "high",
        n: 1,
      });

    console.log(
      "OBITREND: OpenAI response received"
    );

    // -------------------------------------------------------
    // RESULT
    // -------------------------------------------------------

    const output =
      result?.data?.[0];

    if (!output) {
      console.error(
        "OBITREND: No image returned"
      );

      return send(res, 502, {
        error:
          "OpenAI returned no generated image.",
      });
    }

    // -------------------------------------------------------
    // BASE64 RESULT
    // -------------------------------------------------------

    if (output.b64_json) {
      console.log(
        "OBITREND: Generated image received"
      );

      return send(res, 200, {
        success: true,
        image:
          "data:image/png;base64," +
          output.b64_json,
      });
    }

    // -------------------------------------------------------
    // URL RESULT
    // -------------------------------------------------------

    if (output.url) {
      console.log(
        "OBITREND: Generated image URL received"
      );

      return send(res, 200, {
        success: true,
        image: output.url,
      });
    }

    console.error(
      "OBITREND: Unsupported image response"
    );

    return send(res, 502, {
      error:
        "The AI returned an unsupported image format.",
    });
  } catch (error) {
    console.error(
      "OBITREND API ERROR:",
      error
    );

    let message =
      "OBITREND could not generate the image.";

    if (error?.message) {
      message = error.message;
    }

    if (error?.status === 401) {
      message =
        "OpenAI API key is invalid or not authorized.";
    }

    if (error?.status === 429) {
      message =
        "OpenAI API rate limit or account limit was reached.";
    }

    if (error?.status >= 500) {
      message =
        "OpenAI image service returned a server error.";
    }

    if (
      error?.name ===
        "APIConnectionTimeoutError" ||
      error?.code === "ETIMEDOUT"
    ) {
      message =
        "OpenAI image generation took too long. Please try again.";
    }

    return send(res, 500, {
      error: message,
    });
  }
}
