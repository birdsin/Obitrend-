OBITREND AI Generator — "api/generate.js"

export const config = {
  maxDuration: 300
};

const OPENAI_URL = "https://api.openai.com/v1/images/generations";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

function cleanText(value, fallback = "") {
  if (typeof value !== "string") return fallback;

  return value
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, 12000);
}

export default async function handler(req) {

  if (req.method !== "POST") {
    return json(
      {
        error: "Method not allowed. Use POST."
      },
      405
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return json(
      {
        error:
          "OPENAI_API_KEY is missing. Add it in Vercel → Project Settings → Environment Variables, then redeploy."
      },
      500
    );
  }

  let body;

  try {
    body = await req.json();
  } catch {
    return json(
      {
        error: "Invalid JSON request."
      },
      400
    );
  }

  const prompt = cleanText(body?.prompt);

  if (!prompt) {
    return json(
      {
        error: "A generation prompt is required."
      },
      400
    );
  }

  const allowedSizes = [
    "1024x1024",
    "1024x1536",
    "1536x1024"
  ];

  const size = allowedSizes.includes(body?.size)
    ? body.size
    : "1024x1536";

  /*
   * We use the image generation endpoint directly with fetch.
   * This avoids requiring an OpenAI npm package just to make
   * the image-generation request.
   */

  const requestBody = {
    model: "gpt-image-1",
    prompt,
    size,
    quality: "high",
    output_format: "png"
  };

  /*
   * The current frontend can send a reference image.
   *
   * The base image-generation endpoint is intentionally kept
   * simple and reliable here. The reference image is mentioned
   * in the frontend as an optional input, but the first version
   * does not send it to this endpoint because image editing uses
   * a different multipart API shape.
   */

  try {

    const openaiResponse = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    let data;

    try {
      data = await openaiResponse.json();
    } catch {
      return json(
        {
          error: "OpenAI returned an unreadable response."
        },
        502
      );
    }

    if (!openaiResponse.ok) {

      const apiError =
        data?.error?.message ||
        data?.message ||
        "OpenAI image generation failed.";

      return json(
        {
          error: apiError
        },
        openaiResponse.status
      );
    }

    const imageBase64 =
      data?.data?.[0]?.b64_json;

    const imageUrl =
      data?.data?.[0]?.url;

    if (imageBase64) {

      return json({
        success: true,
        image: `data:image/png;base64,${imageBase64}`
      });
    }

    if (imageUrl) {

      return json({
        success: true,
        image: imageUrl
      });
    }

    return json(
      {
        error:
          "OpenAI completed the request but did not return an image."
      },
      502
    );

  } catch (error) {

    console.error("OpenAI request error:", error);

    return json(
      {
        error:
          "Unable to connect to the AI image service. Please try again."
      },
      502
    );
  }
}
