import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const MAX_BODY_SIZE = 25 * 1024 * 1024;

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    }
  );
}

function isValidImageData(value) {

  if (typeof value !== "string") {
    return false;
  }

  return /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(value);

}

export default async function handler(request) {

  if (request.method !== "POST") {
    return json(
      {
        error: "Only POST requests are allowed."
      },
      405
    );
  }

  try {

    if (!process.env.OPENAI_API_KEY) {

      return json(
        {
          error:
            "OPENAI_API_KEY is not configured on the server."
        },
        500
      );

    }

    const contentLength =
      Number(
        request.headers.get("content-length") || 0
      );

    if (
      contentLength &&
      contentLength > MAX_BODY_SIZE
    ) {

      return json(
        {
          error:
            "The uploaded request is too large."
        },
        413
      );

    }

    const body = await request.json();

    const image = body.image;
    const prompt = body.prompt;
    const size = body.size || "1024x1536";

    if (!isValidImageData(image)) {

      return json(
        {
          error:
            "Please upload a valid PNG, JPG or WEBP image."
        },
        400
      );

    }

    if (
      typeof prompt !== "string" ||
      prompt.trim().length < 10
    ) {

      return json(
        {
          error:
            "A valid fashion prompt is required."
        },
        400
      );

    }

    const base64 = image.split(",")[1];

    if (!base64) {

      return json(
        {
          error:
            "The uploaded image data is invalid."
        },
        400
      );

    }

    /*
      OBITREND currently uses GPT Image through
      the OpenAI Images API.

      The uploaded image is sent as the source image
      so the AI can create the fashion campaign
      around the uploaded clothing.
    */

    const imageBuffer =
      Buffer.from(base64, "base64");

    const mimeMatch =
      image.match(
        /^data:(image\/(?:png|jpeg|jpg|webp));base64,/i
      );

    const mimeType =
      mimeMatch
        ? mimeMatch[1].toLowerCase()
        : "image/png";

    const extension =
      mimeType.includes("jpeg") ||
      mimeType.includes("jpg")
        ? "jpg"
        : mimeType.includes("webp")
          ? "webp"
          : "png";

    const file = new File(
      [
        imageBuffer
      ],
      `obitrend-upload.${extension}`,
      {
        type: mimeType
      }
    );

    const result =
      await client.images.edit({

        model: "gpt-image-1",

        image: file,

        prompt: prompt.trim(),

        size: [
          "1024x1024",
          "1024x1536",
          "1536x1024"
        ].includes(size)
          ? size
          : "1024x1536",

        quality: "high",

        n: 1

      });

    const output =
      result &&
      result.data &&
      result.data[0];

    if (!output) {

      return json(
        {
          error:
            "OpenAI returned no image."
        },
        502
      );

    }

    if (output.b64_json) {

      return json({
        image:
          "data:image/png;base64," +
          output.b64_json
      });

    }

    if (output.url) {

      return json({
        image: output.url
      });

    }

    return json(
      {
        error:
          "The AI returned an unsupported image format."
      },
      502
    );

  } catch (error) {

    console.error(
      "OBITREND API ERROR:",
      error
    );

    let message =
      "OBITREND could not generate the image.";

    if (error && error.message) {
      message = error.message;
    }

    return json(
      {
        error: message
      },
      500
    );

  }

}
