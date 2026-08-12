export const config = {
  api: {
    bodyParser: {
      sizeLimit: "20mb",
    },
  },
};

function dataUrlToBlob(dataUrl) {
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);

  if (!match) {
    throw new Error("Invalid image data received from the browser.");
  }

  const mimeType = match[1];
  const base64 = match[2];

  const buffer = Buffer.from(base64, "base64");

  return new Blob([buffer], {
    type: mimeType,
  });
}

function cleanPrompt(prompt, options = {}) {
  const {
    modelType,
    bodyStyle,
    fashionStyle,
    cameraStyle,
    location,
  } = options;

  return `
Create a professional luxury fashion campaign using the uploaded clothing image as the primary clothing reference.

IMPORTANT:
- Preserve the clothing design, material, colors, patterns and important details from the uploaded image.
- Show the clothing naturally on an adult fashion model.
- Create a polished, realistic commercial fashion photograph.
- The model must be an adult.
- Keep the result tasteful, elegant and suitable for a fashion advertisement.
- Do not add sexualized content.
- Do not distort the clothing.
- Do not add random text, watermarks or logos.

Model:
${modelType || "Elegant adult fashion model"}

Body style:
${bodyStyle || "Natural elegant proportions"}

Fashion style:
${fashionStyle || "Luxury fashion editorial"}

Camera:
${cameraStyle || "Professional fashion photography"}

Location:
${location || "Luxury fashion location"}

User's creative direction:
${prompt || "Create a premium fashion advertisement using this outfit."}
`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed. Use POST.",
    });
  }

  try {
    console.log("OBITREND: Starting image generation...");

    if (!process.env.OPENAI_API_KEY) {
      console.error("OBITREND ERROR: OPENAI_API_KEY is missing.");

      return res.status(500).json({
        error: "OPENAI_API_KEY is not configured in Vercel.",
      });
    }

    const body = req.body || {};

    const imageData =
      body.image ||
      body.imageData ||
      body.photo ||
      body.imageUrl;

    if (!imageData || typeof imageData !== "string") {
      return res.status(400).json({
        error: "No clothing image was received.",
      });
    }

    if (!imageData.startsWith("data:image/")) {
      return res.status(400).json({
        error: "The uploaded image must be a base64 image data URL.",
      });
    }

    const imageBlob = dataUrlToBlob(imageData);

    const prompt = cleanPrompt(body.prompt, {
      modelType: body.modelType,
      bodyStyle: body.bodyStyle,
      fashionStyle: body.fashionStyle,
      cameraStyle: body.cameraStyle,
      location: body.location,
    });

    /*
     * Use multipart/form-data because the OpenAI image-edit
     * endpoint expects the uploaded image as a file.
     */
    const form = new FormData();

    form.append("model", "gpt-image-1.5");

    form.append(
      "image",
      imageBlob,
      "obitrend-clothing.png"
    );

    form.append("prompt", prompt);

    form.append("size", "1024x1536");

    form.append("quality", "medium");

    form.append("output_format", "png");

    form.append("input_fidelity", "high");

    console.log("OBITREND: Sending image file to OpenAI...");

    const openaiResponse = await fetch(
      "https://api.openai.com/v1/images/edits",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: form,
      }
    );

    const responseText = await openaiResponse.text();

    let result;

    try {
      result = JSON.parse(responseText);
    } catch {
      console.error(
        "OBITREND ERROR: OpenAI returned non-JSON response:",
        responseText
      );

      return res.status(502).json({
        error: "OpenAI returned an invalid response.",
      });
    }

    if (!openaiResponse.ok) {
      console.error(
        "OBITREND OPENAI ERROR:",
        openaiResponse.status,
        JSON.stringify(result)
      );

      return res.status(500).json({
        error:
          result?.error?.message ||
          "OpenAI image generation failed.",
        status: openaiResponse.status,
      });
    }

    const imageBase64 =
      result?.data?.[0]?.b64_json;

    if (!imageBase64) {
      console.error(
        "OBITREND ERROR: No b64_json image returned:",
        JSON.stringify(result)
      );

      return res.status(500).json({
        error: "OpenAI completed the request but returned no image.",
      });
    }

    const imageUrl =
      `data:image/png;base64,${imageBase64}`;

    console.log(
      "OBITREND: Image generated successfully."
    );

    return res.status(200).json({
      success: true,
      image: imageUrl,
    });

  } catch (error) {
    console.error(
      "OBITREND GENERATION ERROR:",
      error
    );

    return res.status(500).json({
      error:
        error?.message ||
        "OBITREND could not generate the image.",
    });
  }
}
