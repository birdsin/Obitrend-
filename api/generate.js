import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 0,
  timeout: 180000,
});

const MAX_IMAGE_DATA = 6 * 1024 * 1024;

function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function isImageData(value) {
  return (
    typeof value === "string" &&
    /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(
      value
    )
  );
}

function getBase64(dataUrl) {
  const comma = dataUrl.indexOf(",");

  if (comma === -1) {
    return null;
  }

  return dataUrl.slice(comma + 1).replace(/\s/g, "");
}

function getMimeType(dataUrl) {
  const match = dataUrl.match(/^data:(image\/[^;]+);base64,/i);

  if (!match) {
    return "image/png";
  }

  return match[1].toLowerCase();
}

function getExtension(mimeType) {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) {
    return "jpg";
  }

  if (mimeType.includes("webp")) {
    return "webp";
  }

  return "png";
}

function base64ToFile(base64, mimeType, extension) {
  const binary = Buffer.from(base64, "base64");

  return new File(
    [binary],
    `obitrend-upload.${extension}`,
    {
      type: mimeType,
    }
  );
}

function cleanPrompt(prompt) {
  return String(prompt || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 5000);
}

export default async function handler(request) {
  const startedAt = Date.now();

  console.log("OBITREND: /api/generate started");

  try {
    // --------------------------------------------------
    // METHOD
    // --------------------------------------------------

    if (request.method !== "POST") {
      return response(
        {
          success: false,
          error: "Only POST requests are allowed.",
        },
        405
      );
    }

    // --------------------------------------------------
    // API KEY
    // --------------------------------------------------

    if (!process.env.OPENAI_API_KEY) {
      console.error("OBITREND: OPENAI_API_KEY is missing");

      return response(
        {
          success: false,
          error: "OPENAI_API_KEY is not configured on the server.",
        },
        500
      );
    }

    // --------------------------------------------------
    // READ JSON
    // --------------------------------------------------

    let body;

    try {
      body = await request.json();
    } catch (error) {
      console.error("OBITREND: Invalid JSON body", error);

      return response(
        {
          success: false,
          error: "Invalid JSON request body.",
        },
        400
      );
    }

    // --------------------------------------------------
    // GET DATA
    // --------------------------------------------------

    const image = body?.image;
    const prompt = cleanPrompt(body?.prompt);
    const requestedSize = body?.size || "1024x1536";

    console.log("OBITREND: Request received");
    console.log("OBITREND: Has image:", Boolean(image));
    console.log("OBITREND: Prompt length:", prompt.length);
    console.log("OBITREND: Requested size:", requestedSize);

    // --------------------------------------------------
    // VALIDATE IMAGE
    // --------------------------------------------------

    if (!isImageData(image)) {
      return response(
        {
          success: false,
          error:
            "Please upload a valid PNG, JPG, JPEG, or WEBP fashion image.",
        },
        400
      );
    }

    // --------------------------------------------------
    // VALIDATE PROMPT
    // --------------------------------------------------

    if (prompt.length < 3) {
      return response(
        {
          success: false,
          error: "A valid fashion prompt is required.",
        },
        400
      );
    }

    // --------------------------------------------------
    // PROTECT SERVER FROM HUGE IMAGE DATA
    // --------------------------------------------------

    if (image.length > MAX_IMAGE_DATA) {
      return response(
        {
          success: false,
          error:
            "Image is too large. Please choose a smaller image and try again.",
        },
        413
      );
    }

    // --------------------------------------------------
    // CONVERT DATA URL TO FILE
    // --------------------------------------------------

    const base64 = getBase64(image);

    if (!base64) {
      return response(
        {
          success: false,
          error: "Invalid image data.",
        },
        400
      );
    }

    const mimeType = getMimeType(image);
    const extension = getExtension(mimeType);

    const file = base64ToFile(
      base64,
      mimeType,
      extension
    );

    console.log("OBITREND: Image converted successfully");
    console.log("OBITREND: Image type:", mimeType);
    console.log("OBITREND: Sending request to OpenAI...");

    // --------------------------------------------------
    // ALLOWED IMAGE SIZES
    // --------------------------------------------------

    const allowedSizes = [
      "1024x1024",
      "1024x1536",
      "1536x1024",
    ];

    const size = allowedSizes.includes(requestedSize)
      ? requestedSize
      : "1024x1536";

    // --------------------------------------------------
    // GENERATE IMAGE
    // --------------------------------------------------

    const result = await client.images.edit(
      {
        model: "gpt-image-1",
        image: file,
        prompt,
        size,
        quality: "medium",
        n: 1,
      },
      {
        timeout: 170000,
        maxRetries: 0,
      }
    );

    console.log(
      "OBITREND: OpenAI response received in",
      `${Math.round((Date.now() - startedAt) / 1000)}s`
    );

    // --------------------------------------------------
    // CHECK RESPONSE
    // --------------------------------------------------

    const output = result?.data?.[0];

    if (!output) {
      console.error("OBITREND: No image returned", result);

      return response(
        {
          success: false,
          error: "OpenAI did not return an image.",
        },
        502
      );
    }

    // --------------------------------------------------
    // BASE64 IMAGE
    // --------------------------------------------------

    if (output.b64_json) {
      console.log("OBITREND: Base64 image received");

      return response({
        success: true,
        image: `data:image/png;base64,${output.b64_json}`,
      });
    }

    // --------------------------------------------------
    // URL FALLBACK
    // --------------------------------------------------

    if (output.url) {
      console.log("OBITREND: Image URL received");

      return response({
        success: true,
        image: output.url,
      });
    }

    // --------------------------------------------------
    // UNKNOWN RESPONSE
    // --------------------------------------------------

    console.error(
      "OBITREND: Unsupported OpenAI response",
      output
    );

    return response(
      {
        success: false,
        error: "OpenAI returned an unsupported image format.",
      },
      502
    );
  } catch (error) {
    console.error("OBITREND: GENERATION ERROR");

    console.error(error);

    let message = "OBITREND could not generate the image.";

    if (error?.name === "APIConnectionTimeoutError") {
      message =
        "The image-generation service took too long to respond. Please try again.";
    } else if (error?.status === 401) {
      message =
        "OpenAI API key is invalid or not authorized.";
    } else if (error?.status === 403) {
      message =
        "OpenAI rejected the request. Please check your API access.";
    } else if (error?.status === 429) {
      message =
        "OpenAI rate limit or billing limit reached. Please try again later.";
    } else if (error?.message) {
      message = error.message;
    }

    return response(
      {
        success: false,
        error: message,
      },
      error?.status >= 400 && error?.status < 600
        ? error.status
        : 500
    );
  }
}
