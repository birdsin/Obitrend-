import OpenAI, { toFile } from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/*
========================================================
OBITREND AI FASHION CREATOR
Clean Vercel / Node.js ES Module API
========================================================
*/

const OPTIONS = {
  models: [
    "Elegant African woman",
    "Elegant European woman",
    "Elegant Asian woman",
    "Elegant Middle Eastern woman",
    "Luxury fashion model",
    "Curvy fashion model",
    "Petite fashion model",
    "Tall fashion model",
    "Professional female model",
    "Streetwear fashion model",
  ],

  bodyStyles: [
    "Natural elegant proportions",
    "Curvy proportions",
    "Petite proportions",
    "Tall proportions",
    "Athletic proportions",
    "Slim proportions",
    "Plus-size proportions",
  ],

  fashionStyles: [
    "Luxury fashion",
    "High fashion",
    "Elegant fashion",
    "Modern streetwear",
    "Casual luxury",
    "Afro-luxury",
    "Editorial fashion",
    "Premium commercial fashion",
    "Minimalist fashion",
    "Contemporary fashion",
  ],

  poses: [
    "Confident standing pose",
    "Natural walking pose",
    "Elegant seated pose",
    "Luxury editorial pose",
    "Relaxed standing pose",
    "Full-body fashion pose",
    "Three-quarter fashion pose",
    "Natural candid pose",
  ],

  locations: [
    "Luxury hotel lobby",
    "Luxury hotel rooftop",
    "Modern luxury apartment",
    "Premium fashion studio",
    "Luxury shopping district",
    "Dubai luxury location",
    "Lagos luxury location",
    "Abuja luxury location",
    "Paris fashion street",
    "New York fashion street",
    "London fashion street",
    "Dubai marina",
    "Luxury beach resort",
    "Luxury poolside",
    "Luxury restaurant",
    "Premium coffee shop",
    "Luxury shopping mall",
    "Airport luxury lounge",
    "Luxury car showroom",
    "Yacht marina",
  ],
};

/*
========================================================
HELPERS
========================================================
*/

function sendJson(res, status, data) {
  res.status(status).json(data);
}

function cleanString(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value).trim();
}

function isDataUrl(value) {
  return (
    typeof value === "string" &&
    value.startsWith("data:image/")
  );
}

function parseDataUrl(dataUrl) {
  const match = dataUrl.match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
  );

  if (!match) {
    throw new Error(
      "Invalid image data. Please upload a valid image."
    );
  }

  return {
    mimeType: match[1],
    base64: match[2],
  };
}

function normalizeSize(value) {
  const size = cleanString(value);

  const allowed = [
    "1024x1024",
    "1024x1536",
    "1536x1024",
    "auto",
  ];

  if (allowed.includes(size)) {
    return size;
  }

  /*
   * Support common frontend values.
   */
  if (size === "portrait" || size === "9:16") {
    return "1024x1536";
  }

  if (size === "landscape" || size === "16:9") {
    return "1536x1024";
  }

  if (size === "square" || size === "1:1") {
    return "1024x1024";
  }

  return "1024x1024";
}

function normalizeQuality(value, fastMode) {
  if (fastMode) {
    return "low";
  }

  const quality = cleanString(value).toLowerCase();

  if (
    quality === "low" ||
    quality === "medium" ||
    quality === "high" ||
    quality === "auto"
  ) {
    return quality;
  }

  return "high";
}

function getFastMode(request) {
  return (
    request.fast === true ||
    request.fast === "true" ||
    request.fastMode === true ||
    request.fastMode === "true"
  );
}

function getUploadedImage(request) {
  const possibleValues = [
    request.image,
    request.uploadedDataUrl,
    request.uploadedImage,
    request.referenceImage,
    request.imageDataUrl,
  ];

  for (const value of possibleValues) {
    if (isDataUrl(value)) {
      return value;
    }
  }

  return null;
}

/*
========================================================
FASHION PROMPT
========================================================
*/

function buildPrompt(request) {
  const model = cleanString(
    request.model ||
      request.lady ||
      request.modelStyle ||
      "Elegant fashion model"
  );

  const bodyStyle = cleanString(
    request.bodyStyle ||
      request.body ||
      request.bodyStyling ||
      "Natural elegant proportions"
  );

  const fashionStyle = cleanString(
    request.fashionStyle ||
      request.style ||
      "Premium commercial fashion"
  );

  const pose = cleanString(
    request.pose ||
      request.modelPose ||
      "Confident standing pose"
  );

  const location = cleanString(
    request.location ||
      request.background ||
      request.destination ||
      "Luxury fashion location"
  );

  const city = cleanString(request.city);
  const country = cleanString(request.country);

  const extraInstructions = cleanString(
    request.additionalInstructions ||
      request.instructions ||
      request.creativeDirection ||
      request.prompt ||
      ""
  );

  const destinationText = [location, city, country]
    .filter(Boolean)
    .join(", ");

  return `
OBITREND PREMIUM AI FASHION CAMPAIGN

Create an extremely realistic professional commercial fashion photograph.

MODEL:
${model}

BODY / STYLING:
${bodyStyle}

FASHION STYLE:
${fashionStyle}

POSE:
${pose}

LOCATION / ENVIRONMENT:
${destinationText || "Luxury professional fashion environment"}

IMPORTANT REALISM REQUIREMENTS:

The model must look like a real adult human photographed with a professional camera.

Use realistic facial features, realistic skin texture, natural eyes, realistic hair, natural hands, correct fingers, realistic anatomy and natural body proportions.

The final image must look like a genuine high-end fashion photograph captured in the real world.

Use professional fashion photography lighting, realistic shadows, realistic reflections, realistic depth of field, realistic fabric texture and natural environmental interaction.

The model's feet, hands, arms, legs, clothing and body position must make physical sense.

Do not create:
- cartoon appearance
- CGI appearance
- 3D-rendered appearance
- plastic skin
- doll-like face
- artificial eyes
- distorted hands
- extra fingers
- missing fingers
- unnatural anatomy
- excessive skin smoothing
- fake-looking background
- unrealistic lighting
- blurry clothing
- warped garment patterns
- distorted logos
- redesigned clothing

UPLOADED CLOTHING PRESERVATION:

If an uploaded clothing/reference image is provided, it is the PRIMARY CLOTHING REFERENCE.

Preserve the clothing as accurately as possible.

Keep:
- the exact garment design
- the exact colors
- the exact patterns
- the exact stripes
- the exact prints
- the exact logos
- the exact neckline
- the exact sleeves
- the exact seams
- the exact proportions
- the important construction details
- the overall silhouette

Do NOT redesign the clothing.

Do NOT invent a different outfit.

Do NOT replace the garment with another garment.

The uploaded clothing should remain visually recognizable as the same clothing.

Only change the adult model, pose, location, environment, lighting, camera composition and campaign styling.

Make the clothing naturally fitted to the model while preserving the original garment design.

CAMERA:

Professional high-end fashion photography.

Natural realistic lens perspective.

Sharp clothing details.

Realistic skin.

Natural shadows.

Premium commercial color grading.

Luxury editorial composition.

The final image should look suitable for a professional fashion brand advertising campaign.

ADDITIONAL CREATIVE DIRECTION:

${extraInstructions || "Create a sophisticated, premium and elegant fashion campaign."}
`;
}

/*
========================================================
IMAGE GENERATION
========================================================
*/

async function generateImage(prompt, size, quality) {
  const response = await openai.images.generate({
    model: "gpt-image-1",
    prompt,
    size,
    quality,
    n: 1,
    output_format: "png",
  });

  const image =
    response?.data?.[0]?.b64_json ||
    response?.data?.[0]?.base64 ||
    null;

  if (!image) {
    throw new Error(
      "OpenAI completed the request but returned no image data."
    );
  }

  return `data:image/png;base64,${image}`;
}

/*
========================================================
IMAGE EDITING
========================================================
*/

async function editImage(
  prompt,
  size,
  quality,
  uploadedDataUrl
) {
  if (!isDataUrl(uploadedDataUrl)) {
    throw new Error(
      "The uploaded clothing image is missing or invalid."
    );
  }

  const parsed = parseDataUrl(uploadedDataUrl);

  const imageBuffer = Buffer.from(
    parsed.base64,
    "base64"
  );

  /*
   * Give the uploaded image a real filename and MIME type.
   * This prevents the multipart request from being treated
   * as an unknown/octet-stream file.
   */
  const imageFile = await toFile(
    imageBuffer,
    "obitrend-reference.png",
    {
      type: "image/png",
    }
  );

  /*
   * GPT Image 1 supports image editing and high input
   * fidelity for preserving important details from the
   * source image.
   */
  const response = await openai.images.edit({
    model: "gpt-image-1",
    image: imageFile,
    prompt,
    size,
    quality,
    n: 1,
    input_fidelity: "high",
  });

  const image =
    response?.data?.[0]?.b64_json ||
    response?.data?.[0]?.base64 ||
    null;

  if (!image) {
    throw new Error(
      "OpenAI completed the edit but returned no image data."
    );
  }

  return `data:image/png;base64,${image}`;
}

/*
========================================================
MAIN VERCEL HANDLER
========================================================
*/

export default async function handler(req, res) {
  /*
   * CORS
   */
  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  /*
   * OPTIONS
   */
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  /*
   * GET
   *
   * Used by OBITREND to load fashion options.
   */
  if (req.method === "GET") {
    return sendJson(res, 200, {
      success: true,
      models: OPTIONS.models,
      bodyStyles: OPTIONS.bodyStyles,
      fashionStyles: OPTIONS.fashionStyles,
      poses: OPTIONS.poses,
      locations: OPTIONS.locations,

      /*
       * Compatibility object for older frontend versions.
       */
      options: {
        models: OPTIONS.models,
        bodyStyles: OPTIONS.bodyStyles,
        fashionStyles: OPTIONS.fashionStyles,
        poses: OPTIONS.poses,
        locations: OPTIONS.locations,
      },

      citiesByCountry: {
        Nigeria: [
          "Lagos",
          "Abuja",
          "Port Harcourt",
          "Enugu",
          "Owerri",
          "Benin City",
          "Ibadan",
          "Calabar",
        ],

        UnitedArabEmirates: [
          "Dubai",
          "Abu Dhabi",
        ],

        UnitedKingdom: [
          "London",
          "Manchester",
          "Birmingham",
        ],

        France: [
          "Paris",
          "Nice",
          "Cannes",
        ],

        UnitedStates: [
          "New York",
          "Los Angeles",
          "Miami",
          "Atlanta",
          "Las Vegas",
        ],

        Italy: [
          "Milan",
          "Rome",
          "Venice",
        ],

        SouthAfrica: [
          "Cape Town",
          "Johannesburg",
          "Durban",
        ],
      },
    });
  }

  /*
   * POST
   *
   * Used by the Generate button.
   */
  if (req.method !== "POST") {
    return sendJson(res, 405, {
      success: false,
      error: "Method not allowed.",
      message: "Use POST /api/generate.",
    });
  }

  try {
    /*
     * Vercel normally gives us an already-parsed
     * object for JSON requests.
     */
    const request = req.body || {};

    if (
      typeof request !== "object" ||
      Array.isArray(request)
    ) {
      return sendJson(res, 400, {
        success: false,
        error: "Invalid request body.",
        message:
          "OBITREND expected a JSON object.",
      });
    }

    /*
     * Build prompt.
     */
    const prompt = buildPrompt(request);

    /*
     * Size.
     */
    const size = normalizeSize(
      request.size ||
        request.imageSize ||
        request.format
    );

    /*
     * Fast mode.
     */
    const fast = getFastMode(request);

    /*
     * Quality.
     */
    const quality = normalizeQuality(
      request.quality,
      fast
    );

    /*
     * Uploaded clothing image.
     */
    const uploadedDataUrl =
      getUploadedImage(request);

    let image;

    /*
     * IMPORTANT:
     *
     * If an uploaded clothing image exists,
     * EDIT the image.
     *
     * Otherwise generate a completely new image.
     */
    if (uploadedDataUrl) {
      image = await editImage(
        prompt,
        size,
        quality,
        uploadedDataUrl
      );
    } else {
      image = await generateImage(
        prompt,
        size,
        quality
      );
    }

    /*
     * Return the exact image property that the
     * existing OBITREND frontend expects.
     */
    return sendJson(res, 200, {
      success: true,

      image,

      size,

      quality,

      prompt,

      hasReferenceImage: Boolean(
        uploadedDataUrl
      ),

      message:
        "OBITREND fashion campaign created successfully.",
    });
  } catch (error) {
    /*
     * NEVER let an exception crash the Vercel
     * function without returning JSON.
     */

    console.error(
      "OBITREND GENERATION ERROR:",
      error
    );

    const message =
      error?.message ||
      "OBITREND could not generate the image.";

    return sendJson(res, 500, {
      success: false,
      error: message,
      message,
      image: null,
    });
  }
}
