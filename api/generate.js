import OpenAI, { toFile } from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,

  // Do not allow the SDK to keep retrying until Vercel times out.
  maxRetries: 0,

  // Leave enough time for image generation, but fail before
  // Vercel's 5-minute function limit.
  timeout: 240000,
});

const MAX_BODY_SIZE = 4 * 1024 * 1024;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function isValidImageData(value) {
  if (typeof value !== "string") {
    return false;
  }

  return /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(value);
}

function getContentLength(request) {
  try {
    const headers = request.headers;

    // Fetch Request / Web Headers
    if (headers && typeof headers.get === "function") {
      return Number(headers.get("content-length") || 0);
    }

    // Vercel / Node style headers object
    if (headers && typeof headers === "object") {
      return Number(
        headers["content-length"] ||
        headers["Content-Length"] ||
        0
      );
    }

    return 0;
  } catch {
    return 0;
  }
}

function getMimeType(dataUrl) {
  const match = dataUrl.match(
    /^data:image\/(png|jpeg|jpg|webp);base64,/i
  );

  if (!match) {
    return "image/png";
  }

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

export default async function handler(request) {
  // Only POST is allowed.
  if (request.method !== "POST") {
    return json(
      {
        error: "Only POST requests are allowed.",
      },
      405
    );
  }

  // Check API key before doing anything expensive.
  if (!process.env.OPENAI_API_KEY) {
    console.error("OBITREND: OPENAI_API_KEY is missing.");

    return json(
      {
        error: "OPENAI_API_KEY is not configured on the server.",
      },
      500
    );
  }

  try {
    // ---------------------------------------------------------
    // 1. Check request size
    // ---------------------------------------------------------

    const contentLength = getContentLength(request);

    if (contentLength > MAX_BODY_SIZE) {
      return json(
        {
          error:
            "The uploaded image is too large. Please use an image smaller than 4 MB.",
        },
        413
      );
    }

    // ---------------------------------------------------------
    // 2. Read JSON body
    // ---------------------------------------------------------

    let body;

    try {
      body = await request.json();
    } catch (error) {
      console.error("OBITREND JSON ERROR:", error);

      return json(
        {
          error: "Invalid request data.",
        },
        400
      );
    }

    const image = body?.image;
    const prompt = body?.prompt;
    const requestedSize = body?.size;

    // ---------------------------------------------------------
    // 3. Validate uploaded image
    // ---------------------------------------------------------

    if (!isValidImageData(image)) {
      return json(
        {
          error:
            "Please upload a valid PNG, JPG, JPEG, or WEBP image.",
        },
        400
      );
    }

    // ---------------------------------------------------------
    // 4. Validate prompt
    // ---------------------------------------------------------

    if (
      typeof prompt !== "string" ||
      prompt.trim().length < 3
    ) {
      return json(
        {
          error: "A valid fashion prompt is required.",
        },
        400
      );
    }

    // ---------------------------------------------------------
    // 5. Extract Base64 image
    // ---------------------------------------------------------

    const commaIndex = image.indexOf(",");

    if (commaIndex === -1) {
      return json(
        {
          error: "The uploaded image data is invalid.",
        },
        400
      );
    }

    const base64Data = image.substring(commaIndex + 1);

    if (!base64Data) {
      return json(
        {
          error: "The uploaded image contains no image data.",
        },
        400
      );
    }

    // ---------------------------------------------------------
    // 6. Convert image into an OpenAI-compatible file
    // ---------------------------------------------------------

    const mimeType = getMimeType(image);
    const extension = getExtension(mimeType);

    const imageBuffer = Buffer.from(base64Data, "base64");

    if (!imageBuffer.length) {
      return json(
        {
          error: "Unable to decode the uploaded image.",
        },
        400
      );
    }

    const file = await toFile(
      imageBuffer,
      `obitrend-upload.${extension}`,
      {
        type: mimeType,
      }
    );

    // ---------------------------------------------------------
    // 7. Select supported output size
    // ---------------------------------------------------------

    const allowedSizes = [
      "1024x1024",
      "1024x1536",
      "1536x1024",
    ];

    const size = allowedSizes.includes(requestedSize)
      ? requestedSize
      : "1024x1536";

    // ---------------------------------------------------------
    // 8. Build professional OBITREND fashion prompt
    // ---------------------------------------------------------

    const finalPrompt = `
Create a professional high-end fashion campaign image using
the uploaded image as the primary clothing/reference image.

IMPORTANT:
- Preserve the clothing design, colors, patterns, proportions,
  material appearance, and important details from the uploaded image.
- Do not replace the clothing with unrelated clothing.
- Make the clothing look naturally worn by the generated model.
- Create a realistic adult fashion model.
- Natural realistic anatomy.
- Professional fashion photography.
- High-end editorial quality.
- Realistic skin texture.
- Realistic fabric texture.
- Accurate clothing construction.
- Natural lighting.
- Natural shadows.
- Sharp clothing details.
- Premium luxury fashion campaign appearance.
- Do not add random text.
- Do not add watermarks.
- Do not add fake logos.
- Do not distort hands, face, body, clothing, or accessories.

FASHION CAMPAIGN REQUEST:
${prompt.trim()}
`;

    console.log("OBITREND: Starting image generation.");
    console.log("OBITREND: Model = gpt-image-1");
    console.log("OBITREND: Size =", size);
    console.log("OBITREND: Image type =", mimeType);

    // ---------------------------------------------------------
    // 9. Generate the image
    // ---------------------------------------------------------

    const result = await client.images.edit({
      model: "gpt-image-1",

      image: file,

      prompt: finalPrompt,

      size,

      quality: "high",

      n: 1,
    });

    console.log("OBITREND: OpenAI image request completed.");

    // ---------------------------------------------------------
    // 10. Read generated image
    // ---------------------------------------------------------

    const output = result?.data?.[0];

    if (!output) {
      console.error("OBITREND: OpenAI returned no image.");

      return json(
        {
          error: "OpenAI returned no generated image.",
        },
        502
      );
    }

    // GPT Image models normally return base64 image data.
    if (output.b64_json) {
      console.log("OBITREND: Base64 image received.");

      return json({
        success: true,
        image: `data:image/png;base64,${output.b64_json}`,
      });
    }

    // Some API responses may contain a URL.
    if (output.url) {
      console.log("OBITREND: Image URL received.");

      return json({
        success: true,
        image: output.url,
      });
    }

    console.error(
      "OBITREND: Unsupported OpenAI image response:",
      output
    );

    return json(
      {
        error: "The AI returned an unsupported image format.",
      },
      502
    );
  } catch (error) {
    console.error("OBITREND API ERROR:", error);

    let message = "OBITREND could not generate the image.";

    if (error?.message) {
      message = error.message;
    }

    // Helpful messages for common OpenAI errors.
    if (error?.status === 401) {
      message =
        "OpenAI API key is invalid or not authorized.";
    }

    if (error?.status === 429) {
      message =
        "OpenAI API rate limit or account limit was reached. Please try again later.";
    }

    if (error?.status >= 500) {
      message =
        "OpenAI's image service returned a server error. Please try again.";
    }

    if (
      error?.name === "APIConnectionTimeoutError" ||
      error?.code === "ETIMEDOUT"
    ) {
      message =
        "The image generation request took too long. Please try again with a smaller uploaded image.";
    }

    return json(
      {
        error: message,
      },
      500
    );
  }
}
