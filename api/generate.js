module.exports = async function (req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { image, prompt } = req.body || {};

    if (!image) {
      return res.status(400).json({
        error: "No clothing image was provided."
      });
    }

    if (!prompt) {
      return res.status(400).json({
        error: "No AI prompt was provided."
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "OPENAI_API_KEY is not configured on the server."
      });
    }

    /*
      Convert the uploaded base64 image into a file
      that can be sent to the OpenAI image API.
    */

    const match = image.match(/^data:(image\/[^;]+);base64,(.+)$/);

    if (!match) {
      return res.status(400).json({
        error: "Invalid image format."
      });
    }

    const mimeType = match[1];
    const base64Data = match[2];

    const binary = Buffer.from(base64Data, "base64");

    const blob = new Blob(
      [binary],
      { type: mimeType }
    );

    const form = new FormData();

    form.append(
      "model",
      "gpt-image-1"
    );

    form.append(
      "prompt",
      prompt
    );

    form.append(
      "image",
      blob,
      "clothing-reference.png"
    );

    form.append(
      "size",
      "1024x1024"
    );

    form.append(
      "quality",
      "high"
    );

    const response = await fetch(
      "https://api.openai.com/v1/images/edits",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`
        },
        body: form
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI error:", data);

      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "OpenAI image generation failed."
      });
    }

    const generatedImage =
      data?.data?.[0]?.b64_json;

    if (!generatedImage) {
      return res.status(500).json({
        error: "OpenAI returned no generated image."
      });
    }

    return res.status(200).json({
      image: `data:image/png;base64,${generatedImage}`
    });

  } catch (error) {

    console.error("Generation error:", error);

    return res.status(500).json({
      error:
        error?.message ||
        "Something went wrong while generating the image."
    });
  }
};
