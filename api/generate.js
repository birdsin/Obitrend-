// ============================================================
// OBITREND AI FASHION CREATOR
// Production Image Generation API
// Vercel Serverless Function
// ============================================================

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};

// ------------------------------------------------------------
// BASIC HELPERS
// ------------------------------------------------------------

function clean(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value).trim();
}

function limitText(value, max = 500) {
  return clean(value).slice(0, max);
}

function getImageData(body) {
  return (
    body.image ||
    body.imageData ||
    body.photo ||
    body.photoData ||
    body.uploadedImage ||
    body.clothingImage ||
    ""
  );
}

function dataUrlToBuffer(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") {
    return null;
  }

  const match = dataUrl.match(
    /^data:([^;,]+)(?:;charset=[^;,]+)?;base64,(.+)$/i
  );

  if (!match) {
    return null;
  }

  const mimeType = match[1];
  const base64 = match[2];

  try {
    const buffer = Buffer.from(base64, "base64");

    return {
      buffer,
      mimeType,
    };
  } catch {
    return null;
  }
}

function mimeToExtension(mimeType) {
  const type = clean(mimeType).toLowerCase();

  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  if (type.includes("gif")) return "gif";

  return "jpg";
}

function normalizeSize(value) {
  const allowed = [
    "1024x1024",
    "1024x1536",
    "1536x1024",
    "auto",
  ];

  const valueString = clean(value);

  if (allowed.includes(valueString)) {
    return valueString;
  }

  // Accept common frontend labels.
  const lower = valueString.toLowerCase();

  if (lower.includes("portrait")) {
    return "1024x1536";
  }

  if (lower.includes("landscape")) {
    return "1536x1024";
  }

  if (lower.includes("square")) {
    return "1024x1024";
  }

  return "1024x1536";
}

function normalizeQuality(value) {
  const valueString = clean(value).toLowerCase();

  if (valueString === "high") return "high";
  if (valueString === "low") return "low";

  return "medium";
}

// ------------------------------------------------------------
// PROMPT BUILDER
// ------------------------------------------------------------

function buildFashionPrompt(body) {
  const model = limitText(
    body.model ||
      body.modelStyle ||
      body.modelType ||
      "Elegant fashion model",
    120
  );

  const bodyStyle = limitText(
    body.bodyStyle ||
      body.body ||
      body.figure ||
      "natural elegant proportions",
    120
  );

  const fashionStyle = limitText(
    body.fashionStyle ||
      body.style ||
      body.fashion ||
      "luxury fashion",
    160
  );

  const city = limitText(
    body.city ||
      body.destination ||
      body.location ||
      "Lagos",
    120
  );

  const country = limitText(
    body.country ||
      body.countryName ||
      "Nigeria",
    120
  );

  const environment = limitText(
    body.environment ||
      body.scene ||
      body.background ||
      "luxury fashion environment",
    180
  );

  const lighting = limitText(
    body.lighting ||
      "Natural Daylight",
    100
  );

  const pose = limitText(
    body.pose ||
      "confident natural fashion pose",
    120
  );

  const extra = limitText(
    body.prompt ||
      body.description ||
      body.additionalPrompt ||
      "",
    700
  );

  return `
Create a premium professional fashion campaign using the uploaded clothing/fashion photograph as the primary clothing reference.

IMPORTANT CLOTHING REQUIREMENTS:
- Preserve the main clothing design, fabric appearance, colors, patterns, structure and important details from the uploaded image.
- Make the clothing look realistically worn by the generated model.
- Do not replace the clothing with unrelated clothing.
- Do not add random logos, text, watermarks or brand names.
- Keep the clothing commercially presentable.
- Make the result look like a professional fashion advertisement.

MODEL:
${model}

BODY / PRESENTATION:
${bodyStyle}

FASHION DIRECTION:
${fashionStyle}

LOCATION:
${city}, ${country}

ENVIRONMENT:
${environment}

LIGHTING:
${lighting}

POSE:
${pose}

ADDITIONAL CREATIVE DIRECTION:
${extra || "Premium editorial fashion photography with realistic proportions."}

VISUAL QUALITY:
- photorealistic
- professional fashion photography
- realistic skin texture
- realistic fabric texture
- accurate clothing construction
- natural hands
- natural face
- realistic body proportions
- realistic shadows
- cinematic depth
- premium commercial photography
- high-end editorial composition
- clean professional finish

The final image should look suitable for a real fashion campaign, online fashion store, social media advertisement or luxury fashion magazine.
`;
}

// ------------------------------------------------------------
// CORS
// ------------------------------------------------------------

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
}

// ------------------------------------------------------------
// MAIN API
// ------------------------------------------------------------

export default async function handler(req, res) {
  setCors(res);

  // ----------------------------------------------------------
  // PREFLIGHT
  // ----------------------------------------------------------

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // ----------------------------------------------------------
  // METHOD CHECK
  // ----------------------------------------------------------

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed. Use POST.",
    });
  }

  // ----------------------------------------------------------
  // API KEY CHECK
  // ----------------------------------------------------------

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.error("OPENAI_API_KEY is missing.");

    return res.status(500).json({
      success: false,
      error:
        "OBITREND AI is not configured yet. Add OPENAI_API_KEY to Vercel Environment Variables.",
      code: "MISSING_API_KEY",
    });
  }

  // ----------------------------------------------------------
  // REQUEST BODY
  // ----------------------------------------------------------

  let body = req.body;

  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({
        success: false,
        error: "Invalid JSON request.",
        code: "INVALID_JSON",
      });
    }
  }

  body = body || {};

  // ----------------------------------------------------------
  // GET UPLOADED IMAGE
  // ----------------------------------------------------------

  const imageData = getImageData(body);

  // ----------------------------------------------------------
  // BUILD PROMPT
  // ----------------------------------------------------------

  const prompt = buildFashionPrompt(body);

  // ----------------------------------------------------------
  // IMAGE SETTINGS
  // ----------------------------------------------------------

  const size = normalizeSize(
    body.size ||
      body.imageSize ||
      body.format ||
      body.imageFormat
  );

  const quality = normalizeQuality(
    body.quality ||
      body.imageQuality ||
      "medium"
  );

  // Use the stable image generation model by default.
  // You can change it in Vercel Environment Variables later.
  const model =
    process.env.OPENAI_IMAGE_MODEL ||
    "gpt-image-1";

  console.log("OBITREND generation started.");
  console.log({
    model,
    size,
    quality,
    hasImage: Boolean(imageData),
  });

  try {
    // ========================================================
    // MODE A:
    // IMAGE EDIT / FASHION TRANSFORMATION
    // ========================================================

    if (imageData) {
      const converted = dataUrlToBuffer(imageData);

      if (!converted) {
        return res.status(400).json({
          success: false,
          error:
            "The uploaded image format is invalid. Please upload a PNG, JPG or WEBP image.",
          code: "INVALID_IMAGE",
        });
      }

      // Protect the API from excessively large uploads.
      const maxBytes = 8 * 1024 * 1024;

      if (converted.buffer.length > maxBytes) {
        return res.status(413).json({
          success: false,
          error:
            "The uploaded image is too large. Please choose a smaller image.",
          code: "IMAGE_TOO_LARGE",
        });
      }

      const extension = mimeToExtension(
        converted.mimeType
      );

      const imageBlob = new Blob(
        [converted.buffer],
        {
          type:
            converted.mimeType ||
            "image/jpeg",
        }
      );

      const form = new FormData();

      form.append(
        "model",
        model
      );

      form.append(
        "prompt",
        prompt
      );

      form.append(
        "size",
        size
      );

      form.append(
        "quality",
        quality
      );

      form.append(
        "n",
        "1"
      );

      form.append(
        "image",
        imageBlob,
        `obitrend-fashion.${extension}`
      );

      console.log(
        "Sending fashion image edit request to OpenAI..."
      );

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

      const result = await response.json();

      if (!response.ok) {
        console.error(
          "OpenAI image edit error:",
          result
        );

        return res.status(
          response.status >= 400 &&
            response.status < 600
            ? response.status
            : 500
        ).json({
          success: false,
          error:
            result?.error?.message ||
            "OpenAI could not generate the fashion image.",
          code: "OPENAI_IMAGE_ERROR",
          details:
            process.env.NODE_ENV ===
            "development"
              ? result
              : undefined,
        });
      }

      // ======================================================
      // EXTRACT GENERATED IMAGE
      // ======================================================

      const imageResult =
        result?.data?.[0];

      if (!imageResult) {
        console.error(
          "OpenAI returned no image:",
          result
        );

        return res.status(502).json({
          success: false,
          error:
            "The AI completed the request but returned no image.",
          code: "NO_IMAGE_RETURNED",
        });
      }

      if (imageResult.b64_json) {
        const outputDataUrl =
          `data:image/png;base64,${imageResult.b64_json}`;

        return res.status(200).json({
          success: true,
          imageUrl: outputDataUrl,
          imageData: outputDataUrl,
          image: outputDataUrl,
          model,
          size,
          quality,
          message:
            "OBITREND fashion campaign generated successfully.",
        });
      }

      if (imageResult.url) {
        return res.status(200).json({
          success: true,
          imageUrl: imageResult.url,
          imageData: imageResult.url,
          image: imageResult.url,
          model,
          size,
          quality,
          message:
            "OBITREND fashion campaign generated successfully.",
        });
      }

      return res.status(502).json({
        success: false,
        error:
          "The AI returned an unexpected image response.",
        code: "INVALID_IMAGE_RESPONSE",
      });
    }

    // ========================================================
    // MODE B:
    // TEXT-ONLY FASHION CAMPAIGN
    // ========================================================

    console.log(
      "No uploaded image supplied. Creating text-only campaign..."
    );

    const form = new FormData();

    form.append(
      "model",
      model
    );

    form.append(
      "prompt",
      prompt
    );

    form.append(
      "size",
      size
    );

    form.append(
      "quality",
      quality
    );

    form.append(
      "n",
      "1"
    );

    const response = await fetch(
      "https://api.openai.com/v1/images/generations",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: form,
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error(
        "OpenAI generation error:",
        result
      );

      return res.status(
        response.status >= 400 &&
          response.status < 600
          ? response.status
          : 500
      ).json({
        success: false,
        error:
          result?.error?.message ||
          "OpenAI could not generate the fashion campaign.",
        code: "OPENAI_GENERATION_ERROR",
      });
    }

    const imageResult =
      result?.data?.[0];

    if (!imageResult) {
      return res.status(502).json({
        success: false,
        error:
          "The AI completed the request but returned no image.",
        code: "NO_IMAGE_RETURNED",
      });
    }

    if (imageResult.b64_json) {
      const outputDataUrl =
        `data:image/png;base64,${imageResult.b64_json}`;

      return res.status(200).json({
        success: true,
        imageUrl: outputDataUrl,
        imageData: outputDataUrl,
        image: outputDataUrl,
        model,
        size,
        quality,
        message:
          "OBITREND fashion campaign generated successfully.",
      });
    }

    if (imageResult.url) {
      return res.status(200).json({
        success: true,
        imageUrl: imageResult.url,
        imageData: imageResult.url,
        image: imageResult.url,
        model,
        size,
        quality,
        message:
          "OBITREND fashion campaign generated successfully.",
      });
    }

    return res.status(502).json({
      success: false,
      error:
        "The AI returned an unexpected image response.",
      code: "INVALID_IMAGE_RESPONSE",
    });
  } catch (error) {
    // ========================================================
    // NETWORK / SERVER ERROR
    // ========================================================

    console.error(
      "OBITREND API fatal error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        error?.message ||
        "OBITREND AI could not complete the generation request.",
      code: "SERVER_ERROR",
    });
  }
}
