// api/generate.js
// OBITREND AI Fashion Creator
// JSON/base64 compatible image generation + clothing preservation

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "15mb",
    },
  },
};

function getValue(value) {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

function cleanBase64Image(value) {
  if (!value || typeof value !== "string") return null;

  // Accept:
  // data:image/png;base64,...
  // data:image/jpeg;base64,...
  // raw base64
  if (value.startsWith("data:image/")) {
    return value;
  }

  return `data:image/jpeg;base64,${value}`;
}

function getImageParts(dataUrl) {
  const match = dataUrl.match(
    /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i
  );

  if (!match) {
    throw new Error(
      "Invalid image format. Please upload a PNG, JPG, JPEG or WEBP image."
    );
  }

  const mimeType = match[1].toLowerCase();
  const base64 = match[2];

  const buffer = Buffer.from(base64, "base64");

  return {
    buffer,
    mimeType,
  };
}

function buildClothingPrompt(body) {
  const userPrompt = getValue(body.prompt);
  const model = getValue(body.model);
  const bodyType = getValue(body.bodyType);
  const face = getValue(body.face);
  const pose = getValue(body.pose);
  const style = getValue(body.fashionStyle || body.style);
  const camera = getValue(body.camera);
  const locationType = getValue(body.locationType);
  const city = getValue(body.city);
  const property = getValue(body.property);
  const vehicle = getValue(body.vehicle);
  const lighting = getValue(body.lighting);
  const creativeDirection = getValue(
    body.creativeDirection || body.creative
  );
  const aspectRatio = getValue(body.aspectRatio || body.ratio);

  return `
OBITREND PREMIUM FASHION IMAGE EDIT.

The uploaded image is the PRIMARY VISUAL REFERENCE for the clothing.

CLOTHING FIDELITY IS THE HIGHEST PRIORITY.

Create a photorealistic fashion photograph in which the SAME clothing item from the uploaded reference is realistically worn by the selected model.

STRICTLY PRESERVE THE CLOTHING:

- exact garment type
- exact garment silhouette
- exact neckline
- exact sleeve length and sleeve shape
- exact cuffs
- exact garment length
- exact hem
- exact proportions
- exact fabric texture
- exact ribbing
- exact seams
- exact stitching
- exact stripes
- exact color
- exact color arrangement
- exact prints
- exact embroidery
- exact bows
- exact artwork
- exact graphics
- exact logos that are visibly present
- exact decorative elements
- exact placement of every visible design element
- exact relative size of design elements
- exact orientation of design elements

DO NOT redesign the garment.

DO NOT create a similar garment.

DO NOT substitute another garment.

DO NOT add clothing details that are not present.

DO NOT add a waistband if the reference does not have one.

DO NOT add belts.

DO NOT add buttons.

DO NOT add pockets.

DO NOT add collars.

DO NOT add stripes.

DO NOT add patterns.

DO NOT add decorative panels.

DO NOT change the garment color.

DO NOT change the graphic colors.

DO NOT move graphics.

DO NOT remove graphics.

DO NOT invent logos.

DO NOT invent text.

DO NOT reinterpret the design.

The uploaded garment must remain recognizably the SAME physical garment.

The folds may naturally change because the garment is being worn, but the underlying construction and design must remain faithful to the uploaded reference.

The person's identity, face, body, pose, environment, lighting and campaign styling may change.

THE CLOTHING MUST NOT CHANGE.

Requested model:
${model || "professional fashion model"}

Body type:
${bodyType || "natural fashion-model proportions"}

Face:
${face || "attractive natural-looking face"}

Pose:
${pose || "professional fashion pose"}

Fashion style:
${style || "premium fashion"}

Camera:
${camera || "professional fashion photography"}

Location:
${locationType || "luxury fashion environment"}

City:
${city || "premium international city"}

Property/environment:
${property || "luxury environment"}

Vehicle:
${vehicle || "none unless requested"}

Lighting:
${lighting || "professional studio-quality lighting"}

Creative direction:
${creativeDirection || "premium fashion campaign"}

Image ratio:
${aspectRatio || "4:5 portrait"}

Additional user request:
${userPrompt || "Create a premium photorealistic fashion campaign image."}

FINAL INSTRUCTION:

Use the uploaded clothing reference as the source of truth.

Prioritize clothing accuracy over artistic interpretation.

The result should look like a real professional photograph of the EXACT uploaded garment being worn by a model.
`;
}

export default async function handler(req, res) {
  // ---------------------------------------------------------
  // METHOD CHECK
  // ---------------------------------------------------------

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed. Use POST.",
    });
  }

  // ---------------------------------------------------------
  // API KEY CHECK
  // ---------------------------------------------------------

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.error("OBITREND ERROR: OPENAI_API_KEY is missing.");

    return res.status(500).json({
      success: false,
      error:
        "OPENAI_API_KEY is not configured in Vercel Environment Variables.",
    });
  }

  // ---------------------------------------------------------
  // REQUEST BODY CHECK
  // ---------------------------------------------------------

  const body = req.body || {};

  console.log("========================================");
  console.log("OBITREND GENERATION START");
  console.log("========================================");

  console.log("Request keys:", Object.keys(body));

  // ---------------------------------------------------------
  // GET UPLOADED IMAGE
  // ---------------------------------------------------------

  let imageBase64 =
    body.imageBase64 ||
    body.image ||
    body.clothingImage ||
    body.photo ||
    "";

  imageBase64 = getValue(imageBase64);

  if (!imageBase64) {
    return res.status(400).json({
      success: false,
      error:
        "No clothing image was received. Please select and upload a clothing image first.",
    });
  }

  // ---------------------------------------------------------
  // CLEAN IMAGE
  // ---------------------------------------------------------

  let dataUrl;

  try {
    dataUrl = cleanBase64Image(imageBase64);
  } catch (error) {
    console.error("Image cleanup error:", error);

    return res.status(400).json({
      success: false,
      error: "The uploaded image could not be processed.",
    });
  }

  // ---------------------------------------------------------
  // CONVERT BASE64 TO BUFFER
  // ---------------------------------------------------------

  let imageParts;

  try {
    imageParts = getImageParts(dataUrl);
  } catch (error) {
    console.error("Image conversion error:", error);

    return res.status(400).json({
      success: false,
      error: error.message,
    });
  }

  // ---------------------------------------------------------
  // IMAGE SIZE CHECK
  // ---------------------------------------------------------

  const imageSizeMB = imageParts.buffer.length / (1024 * 1024);

  console.log(
    "Uploaded image size:",
    imageSizeMB.toFixed(2),
    "MB"
  );

  if (imageSizeMB > 15) {
    return res.status(413).json({
      success: false,
      error:
        "The uploaded image is too large. Please use an image smaller than 15 MB.",
    });
  }

  // ---------------------------------------------------------
  // BUILD PROMPT
  // ---------------------------------------------------------

  const prompt = buildClothingPrompt(body);

  console.log("Clothing preservation: ENABLED");
  console.log("Model: gpt-image-1");

  // ---------------------------------------------------------
  // CREATE MULTIPART FORM
  // ---------------------------------------------------------

  try {
    const form = new FormData();

    const extension =
      imageParts.mimeType === "image/png"
        ? "png"
        : imageParts.mimeType === "image/webp"
        ? "webp"
        : "jpg";

    const filename = `obitrend-clothing-reference.${extension}`;

    const imageBlob = new Blob([imageParts.buffer], {
      type: imageParts.mimeType,
    });

    form.append("model", "gpt-image-1");

    form.append("image", imageBlob, filename);

    form.append("prompt", prompt);

    // Highest available input fidelity.
    form.append("input_fidelity", "high");

    form.append("quality", "high");

    form.append("size", "auto");

    form.append("n", "1");

    form.append("output_format", "png");

    console.log("Sending request to OpenAI...");

    // ---------------------------------------------------------
    // OPENAI IMAGE EDIT REQUEST
    // ---------------------------------------------------------

    const response = await fetch(
      "https://api.openai.com/v1/images/edits",
      {
        method: "POST",

        headers: {
          Authorization: `Bearer ${apiKey}`,
        },

        body: form,
      }
    );

    const responseText = await response.text();

    console.log("OpenAI HTTP status:", response.status);

    // ---------------------------------------------------------
    // PARSE RESPONSE
    // ---------------------------------------------------------

    let result;

    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error(
        "OpenAI returned non-JSON response:",
        responseText.substring(0, 2000)
      );

      return res.status(502).json({
        success: false,
        error:
          "OpenAI returned an invalid response. Please try again.",
        diagnosis: "OPENAI_NON_JSON_RESPONSE",
      });
    }

    // ---------------------------------------------------------
    // OPENAI ERROR
    // ---------------------------------------------------------

    if (!response.ok) {
      console.error(
        "========================================"
      );

      console.error("OPENAI IMAGE ERROR");

      console.error(
        JSON.stringify(result, null, 2)
      );

      console.error(
        "========================================"
      );

      const openAIMessage =
        result?.error?.message ||
        result?.error?.code ||
        "OpenAI image generation failed.";

      return res.status(response.status).json({
        success: false,
        error: openAIMessage,
        diagnosis: "OPENAI_IMAGE_API_ERROR",
      });
    }

    // ---------------------------------------------------------
    // GET GENERATED IMAGE
    // ---------------------------------------------------------

    const imageResult = result?.data?.[0];

    if (!imageResult) {
      console.error(
        "OpenAI returned no image:",
        JSON.stringify(result, null, 2)
      );

      return res.status(502).json({
        success: false,
        error:
          "OpenAI completed the request but did not return an image.",
        diagnosis: "NO_IMAGE_RETURNED",
      });
    }

    let generatedImage = null;

    // Most common response for image generation.
    if (imageResult.b64_json) {
      generatedImage =
        `data:image/png;base64,${imageResult.b64_json}`;
    }

    // Some responses can contain a URL.
    if (!generatedImage && imageResult.url) {
      generatedImage = imageResult.url;
    }

    if (!generatedImage) {
      console.error(
        "Unexpected image result:",
        JSON.stringify(imageResult, null, 2)
      );

      return res.status(502).json({
        success: false,
        error:
          "The image server returned an invalid image response.",
        diagnosis: "INVALID_IMAGE_RESPONSE",
      });
    }

    // ---------------------------------------------------------
    // SUCCESS
    // ---------------------------------------------------------

    console.log("========================================");
    console.log("OBITREND GENERATION SUCCESS");
    console.log("========================================");

    return res.status(200).json({
      success: true,

      image: generatedImage,

      imageUrl: generatedImage,

      url: generatedImage,

      b64_json:
        imageResult.b64_json || null,

      mimeType: "image/png",

      model: "gpt-image-1",

      clothingPreservation: true,

      inputFidelity: "high",
    });
  } catch (error) {
    // ---------------------------------------------------------
    // SERVER ERROR
    // ---------------------------------------------------------

    console.error(
      "========================================"
    );

    console.error("OBITREND SERVER ERROR");

    console.error(error);

    console.error(
      "========================================"
    );

    return res.status(500).json({
      success: false,

      error:
        error?.message ||
        "Something went wrong while generating the fashion image.",

      diagnosis: "SERVER_GENERATION_ERROR",
    });
  }
}
