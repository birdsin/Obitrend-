import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MAX_IMAGE_DATA = 4 * 1024 * 1024;

function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function isImageData(value) {
  return (
    typeof value === "string" &&
    /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(value)
  );
}

function getBase64(dataUrl) {
  const comma = dataUrl.indexOf(",");

  if (comma === -1) {
    return null;
  }

  return dataUrl.slice(comma + 1);
}

function getMimeType(dataUrl) {
  const match = dataUrl.match(/^data:(image\/[^;]+);base64,/i);

  return match ? match[1].toLowerCase() : "image/png";
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

export default async function handler(request) {
  try {
    // Only POST
    if (request.method !== "POST") {
      return response(
        {
          error: "Only POST requests are allowed.",
        },
        405
      );
    }

    // API key check
    if (!process.env.OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY is missing.");

      return response(
        {
          error: "OPENAI_API_KEY is not configured on the server.",
        },
        500
      );
    }

    // Read request body safely
    let body;

    try {
      if (request && typeof request.json === "function") {
        body = await request.json();
      } else if (request && request.body) {
        body =
          typeof request.body === "string"
            ? JSON.parse(request.body)
            : request.body;
      } else {
        return response(
          {
            error: "Request body is missing.",
          },
          400
        );
      }
    } catch (error) {
      console.error("JSON BODY ERROR:", error);

      return response(
        {
          error: "Invalid JSON request body.",
        },
        400
      );
    }

    const image = body?.image;
    const prompt = body?.prompt;
    const size = body?.size || "1024x1536";

    // Validate image
    if (!isImageData(image)) {
      return response(
        {
          error:
            "Please upload a valid PNG, JPG, JPEG, or WEBP image.",
        },
        400
      );
    }

    // Validate prompt
    if (
      typeof prompt !== "string" ||
      prompt.trim().length < 3
    ) {
      return response(
        {
          error: "A valid fashion prompt is required.",
        },
        400
      );
    }

    // Protect Vercel from oversized requests
    if (image.length > MAX_IMAGE_DATA) {
      return response(
        {
          error:
            "Image is too large. Please choose a smaller image.",
        },
        413
      );
    }

    const base64 = getBase64(image);

    if (!base64) {
      return response(
        {
          error: "Invalid image data.",
        },
        400
      );
    }

    const mimeType = getMimeType(image);
    const extension = getExtension(mimeType);

    console.log("OBITREND: Image received");
    console.log("OBITREND: Image type:", mimeType);
    console.log("OBITREND: Prompt length:", prompt.length);
    console.log("OBITREND: Size:", size);

    // Convert base64 to a file
    const buffer = Buffer.from(base64, "base64");

    const file = new File(
      [buffer],
      `obitrend-upload.${extension}`,
      {
        type: mimeType,
      }
    );

    console.log("OBITREND: Sending image to OpenAI...");

    const result = await client.images.edit({
      model: "gpt-image-1",
      image: file,
      prompt: prompt.trim(),
      size: [
        "1024x1024",
        "1024x1536",
        "1536x1024",
      ].includes(size)
        ? size
        : "1024x1536",
      quality: "medium",
      n: 1,
    });

    console.log("OBITREND: OpenAI response received.");

    const output = result?.data?.[0];

    if (!output) {
      console.error("OBITREND: No image returned.", result);

      return response(
        {
          error: "OpenAI did not return an image.",
        },
        502
      );
    }

    // Most GPT image responses return base64 image data
    if (output.b64_json) {
      console.log("OBITREND: Base64 image received.");

      return response({
        success: true,
        image: `data:image/png;base64,${output.b64_json}`,
      });
    }

    // Fallback if a URL is returned
    if (output.url) {
      console.log("OBITREND: Image URL received.");

      return response({
        success: true,
        image: output.url,
      });
    }

    console.error("OBITREND: Unsupported image response.", output);

    return response(
      {
        error: "OpenAI returned an unsupported image format.",
      },
      502
    );
  } catch (error) {
    console.error("OBITREND API ERROR:", error);

    let message = "OBITREND could not generate the image.";

    if (error?.message) {
      message = error.message;
    }

    return response(
      {
        error: message,
      },
      500
    );
  }
}
