import OpenAI, { toFile } from "openai";

import {
  spendCredit,
  refundCredit,
  getProStatus,
  getRedisConfig,
} from "./credits.js";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "12mb",
    },
  },
};

export const maxDuration = 60;

const MODEL =
  process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";

const IMAGE_QUALITY = "medium";
const MAX_IMAGE_BYTES = 9 * 1024 * 1024;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function clean(value, fallback = "") {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return String(value).trim();
}

function getValue(body, ...names) {
  for (const name of names) {
    if (
      body &&
      body[name] !== undefined &&
      body[name] !== null &&
      body[name] !== ""
    ) {
      return body[name];
    }
  }
  return "";
}

function normalizeBody(rawBody) {
  if (rawBody && typeof rawBody === "object") {
    return rawBody;
  }

  if (typeof rawBody === "string") {
    try {
      const parsed = JSON.parse(rawBody);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  return {};
}

function normalizeBase64(input) {
  if (!input) return null;

  let value = String(input).trim();
  const comma = value.indexOf(",");

  if (
    value.startsWith("data:image/") &&
    comma !== -1
  ) {
    value = value.slice(comma + 1);
  }

  value = value.replace(/\s/g, "");

  if (value.length < 100) {
    return null;
  }

  return value;
}

function getMimeType(input) {
  const value = String(input || "");

  if (value.startsWith("data:image/png")) {
    return "image/png";
  }

  if (value.startsWith("data:image/webp")) {
    return "image/webp";
  }

  if (
    value.startsWith("data:image/jpeg") ||
    value.startsWith("data:image/jpg")
  ) {
    return "image/jpeg";
  }

  return "image/jpeg";
}

function extensionFromMime(mime) {
  if (mime.includes("png")) {
    return "png";
  }

  if (mime.includes("webp")) {
    return "webp";
  }

  return "jpg";
}

function getImageSize(value) {
  const ratio =
    clean(value, "4:5").toLowerCase();

  if (
    ratio.includes("1:1") ||
    ratio.includes("square")
  ) {
    return "1024x1024";
  }

  if (
    ratio.includes("5:4") ||
    ratio.includes("16:9") ||
    ratio.includes("landscape")
  ) {
    return "1536x1024";
  }

  return "1024x1536";
}

function getUserId(body, req) {
  const supplied =
    getValue(
      body,
      "userId",
      "uid",
      "clientId"
    );

  if (supplied) {
    return clean(supplied)
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 100);
  }

  return (
    clean(
      req?.headers?.[
        "x-obitrend-user-id"
      ] || ""
    )
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 100) ||
    "guest"
  );
}

function getRedisOrNull() {
  try {
    const redis =
      getRedisConfig();

    return (
      redis?.url &&
      redis?.token
        ? redis
        : null
    );
  } catch {
    return null;
  }
}

async function isProUser(
  userId,
  redis
) {
  if (
    !redis ||
    !userId ||
    userId === "guest"
  ) {
    return false;
  }

  try {
    const status =
      await getProStatus(
        userId,
        redis
      );

    return Boolean(
      status?.active
    );
  } catch (error) {
    console.warn(
      "OBITREND Pro check failed:",
      error?.message ||
        error
    );

    return false;
  }
}

async function useCredit(
  userId,
  pro,
  redis
) {
  if (
    pro ||
    !redis
  ) {
    return {
      success: true,
      balance: null,
      usedCredit: false,
    };
  }

  const result =
    await spendCredit(
      userId,
      redis
    );

  return {
    ...result,
    usedCredit:
      Boolean(
        result?.success
      ),
  };
}

function buildPrompt(body) {
  const model =
    clean(
      getValue(body, "model"),
      "professional adult fashion model"
    );

  const gender =
    clean(
      getValue(body, "gender"),
      "woman"
    );

  const ageGroup =
    clean(
      getValue(body, "ageGroup"),
      "adult_woman"
    );

  const bodyType =
    clean(
      getValue(
        body,
        "bodyType",
        "body"
      ),
      "natural proportioned model"
    );

  const face =
    clean(
      getValue(body, "face"),
      "natural elegant fashion beauty"
    );

  const pose =
    clean(
      getValue(body, "pose"),
      "standing confidently"
    );

  const footwear =
    clean(
      getValue(body, "footwear"),
      "footwear appropriate for the garment"
    );

  const clothingType =
    clean(
      getValue(body, "clothingType"),
      "auto detect from uploaded reference"
    );

  const clothingStyle =
    clean(
      getValue(body, "clothingStyle"),
      "premium fashion"
    );

  const fashionStyle =
    clean(
      getValue(
        body,
        "fashionStyle",
        "style"
      ),
      "luxury fashion editorial"
    );

  const clothingColors =
    getValue(
      body,
      "clothingColors",
      "clothingColor",
      "colors"
    );

  const colourText =
    Array.isArray(
      clothingColors
    )
      ? clothingColors.join(
          ", "
        )
      : clean(
          clothingColors,
          "Original Colour"
        );

  const locationType =
    clean(
      getValue(
        body,
        "locationType"
      ),
      "luxury fashion studio"
    );

  const backgroundPreset =
    clean(
      getValue(
        body,
        "backgroundPreset"
      ),
      "Auto Background"
    );

  const city =
    clean(
      getValue(
        body,
        "city"
      )
    );

  const property =
    clean(
      getValue(
        body,
        "property"
      )
    );

  const vehicle =
    clean(
      getValue(
        body,
        "vehicle"
      ),
      "none"
    );

  const camera =
    clean(
      getValue(
        body,
        "camera"
      ),
      "professional fashion photography"
    );

  const lighting =
    clean(
      getValue(
        body,
        "lighting"
      ),
      "soft professional lighting"
    );

  const creative =
    clean(
      getValue(
        body,
        "creativeDirection",
        "creative"
      ),
      "luxury fashion campaign"
    );

  const ratio =
    clean(
      getValue(
        body,
        "aspectRatio",
        "ratio"
      ),
      "4:5"
    );

  const companion =
    clean(
      getValue(
        body,
        "companion",
        "companionType"
      ),
      "none"
    );

  const userPrompt =
    clean(
      getValue(
        body,
        "prompt"
      )
    );

  const ageInstruction =
    ageGroup ===
      "toddler_girl" ||
    ageGroup ===
      "toddler_boy"

      ? `
CHILD-SAFE TODDLER MODE.

The main subject is a realistic toddler approximately
1–3 years old.

Use only age-appropriate children's clothing,
footwear and family-friendly presentation.

Do not use adult glamour styling.
Do not use provocative posing.
Do not sexualize the child.
`

      : ageGroup ===
          "teen_girl" ||
        ageGroup ===
          "teen_boy"

      ? `
TEEN MODE.

The main subject is a realistic teenager aged 13–17.

Use age-appropriate fashion presentation.

Do not sexualize the teenager.
Do not use adult glamour styling.
Do not use provocative posing.
`

      : `
ADULT MODE.

The main subject is an adult fashion model aged 18+.

Use professional fashion photography and realistic
adult anatomy.
`;

  const companionInstruction =
    companion &&
    companion !== "none"

      ? `
A secondary companion is requested:
${companion}

Keep the companion separate from the main model.

The main model remains the primary fashion subject.

Do not duplicate people.
Do not merge bodies.
Do not create extra limbs.
Do not create extra fingers.

Any child companion must remain age-appropriate and
family-friendly.
`

      : `
NO COMPANION.

The main model appears alone.
`;

  const colourInstruction =
    colourText
      .toLowerCase()
      .includes(
        "original colour"
      )

      ? `
COLOUR:
Original Colour.

Preserve the actual colour visible in the uploaded
garment reference.
`

      : `
COLOUR:
${colourText}

Recolour the SAME uploaded garment while preserving
its construction, pattern and material.

Do not use colour selection as permission to redesign
the garment.
`;

  const locationText =
    [
      locationType,
      city,
      property,
    ]
      .filter(Boolean)
      .join(
        ", "
      );

  const backgroundText =
    backgroundPreset !==
    "Auto Background"
      ? backgroundPreset
      : locationText ||
        "luxury fashion studio";

  return `

OBITREND UNIVERSAL GARMENT REPRODUCTION MODE.

Create ONE premium photorealistic fashion photograph.

=========================================================
MOST IMPORTANT RULE
=========================================================

THE UPLOADED IMAGE IS THE PRIMARY AND AUTHORITATIVE
REFERENCE FOR THE GARMENT.

THE MAIN MODEL MUST WEAR THE GARMENT SHOWN IN THE
UPLOADED IMAGE.

The uploaded clothing is NOT merely inspiration.

Do NOT invent a replacement outfit.

Do NOT substitute a generic luxury outfit.

Do NOT redesign the clothing.

=========================================================
UPLOADED IMAGE ANALYSIS
=========================================================

The reference may contain:

- one garment
- multiple garments
- front view
- back view
- side view
- mannequin
- hanger
- flat lay
- person
- product photo
- fashion photo
- collage

Analyze all useful garment views.

The reference person's face, body, pose and background
are not the target.

The GARMENT is the target.

=========================================================
GARMENT PRESERVATION
=========================================================

Preserve:

- garment type
- silhouette
- cut
- proportions
- length
- width
- neckline
- collar
- sleeves
- cuffs
- waist shaping
- darts
- seams
- stitching
- panels
- pockets
- buttons
- zippers
- closures
- straps
- ties
- belts
- pleats
- gathers
- ruching
- folds
- draping
- hem
- slits
- fabric texture
- fabric weight
- material appearance
- stripes
- checks
- patterns
- prints
- embroidery
- distinctive details

Do not simplify the garment.

Do not substitute the garment.

=========================================================
FINAL IMAGE CLEANLINESS
=========================================================

Do not add:

- watermarks
- signatures
- social media handles
- advertising text
- random text
- unrelated brand marks

=========================================================
MODEL
=========================================================

Gender:
${gender}

Model:
${model}

Body Type:
${bodyType}

Face / Beauty:
${face}

Age Group:
${ageGroup}

Pose:
${pose}

Footwear:
${footwear}

${ageInstruction}

=========================================================
CLOTHING CONTROLS
=========================================================

Clothing Type:
${clothingType}

Clothing Style:
${clothingStyle}

Fashion Style:
${fashionStyle}

${colourInstruction}

These controls describe how the uploaded garment
should be presented.

They do NOT override the uploaded garment.

=========================================================
COMPANION
=========================================================

${companionInstruction}

=========================================================
LOCATION / BACKGROUND
=========================================================

Background Preset:
${backgroundText}

Vehicle:
${vehicle}

The selected environment must never replace or redesign
the garment.

=========================================================
CAMERA
=========================================================

${camera}

Lighting:
${lighting}

Aspect Ratio:
${ratio}

Create realistic commercial fashion photography with:

- realistic camera perspective
- realistic depth of field
- realistic exposure
- realistic shadows
- realistic highlights
- realistic reflections
- realistic skin texture
- realistic fabric texture
- realistic materials

=========================================================
PHOTOREALISM
=========================================================

The result must look like a real photograph.

Use realistic:

- anatomy
- hands
- fingers
- face
- hair
- skin
- feet
- body proportions
- garment fit
- fabric folds
- shadows
- lighting
- environment

Avoid:

- cartoon
- anime
- painting
- illustration
- CGI appearance
- plastic skin
- distorted anatomy
- extra fingers
- extra limbs
- duplicated people
- malformed hands
- distorted faces
- warped clothing
- random text
- watermarks

=========================================================
GARMENT VISIBILITY
=========================================================

The garment must be clearly visible.

Do not hide important parts behind:

- hands
- bags
- furniture
- vehicles
- other people
- excessive cropping
- objects

Use natural fashion posing that allows the garment
to be inspected clearly.

=========================================================
CAMPAIGN
=========================================================

Creative Direction:
${creative}

Create ONE polished premium OBITREND fashion campaign
photograph.

The uploaded garment is the visual focus.

=========================================================
USER REQUEST
=========================================================

${userPrompt}

=========================================================
FINAL PRIORITY
=========================================================

1. Uploaded garment identity
2. Uploaded garment construction
3. Uploaded garment pattern
4. Uploaded garment colour
5. Uploaded garment details
6. Realistic garment fit
7. Model
8. Pose
9. Footwear
10. Background/location
11. Vehicle
12. Camera
13. Lighting
14. Campaign styling

If anything conflicts with the uploaded garment:

PRESERVE THE UPLOADED GARMENT.

The final result must show the selected model actually
wearing the uploaded garment.

Generate ONE photorealistic image.

`;
}

async function generateImage(
  imageBase64,
  mimeType,
  prompt,
  size
) {
  const buffer =
    Buffer.from(
      imageBase64,
      "base64"
    );

  if (!buffer.length) {
    throw new Error(
      "The uploaded clothing image is empty."
    );
  }

  if (
    buffer.length >
    MAX_IMAGE_BYTES
  ) {
    throw new Error(
      "The clothing image is too large. Please upload the image again."
    );
  }

  const file =
    await toFile(
      buffer,
      `obitrend-clothing-reference.${extensionFromMime(
        mimeType
      )}`,
      {
        type: mimeType,
      }
    );

  const result =
    await openai.images.edit({
      model: MODEL,
      image: file,
      prompt,
      size,
      quality:
        IMAGE_QUALITY,
      output_format:
        "png",
    });

  const base64 =
    result?.data?.[0]?.b64_json;

  if (!base64) {
    throw new Error(
      "OpenAI did not return an image."
    );
  }

  return (
    "data:image/png;base64," +
    base64
  );
}

export default async function handler(
  req,
  res
) {
  if (
    req.method !==
    "POST"
  ) {
    res.setHeader(
      "Allow",
      "POST"
    );

    return res.status(
      405
    ).json({
      success: false,
      error:
        "Method not allowed.",
    });
  }

  if (
    !process.env.OPENAI_API_KEY
  ) {
    return res.status(
      500
    ).json({
      success: false,
      error:
        "OPENAI_API_KEY is not configured.",
    });
  }

  let credit = null;
  let redis = null;
  let userId =
    "guest";

  try {
    const body =
      normalizeBody(
        req.body
      );

    let imageInput =
      getValue(
        body,
        "imageBase64",
        "uploadedImage",
        "image",
        "clothingImage",
        "referenceImage"
      );

    if (
      !imageInput &&
      body?.data &&
      typeof body.data ===
        "object"
    ) {
      imageInput =
        getValue(
          body.data,
          "imageBase64",
          "uploadedImage",
          "image",
          "clothingImage",
          "referenceImage"
        );
    }

    if (
      !imageInput &&
      body?.input &&
      typeof body.input ===
        "object"
    ) {
      imageInput =
        getValue(
          body.input,
          "imageBase64",
          "uploadedImage",
          "image",
          "clothingImage",
          "referenceImage"
        );
    }

    const imageBase64 =
      normalizeBase64(
        imageInput
      );

    if (
      !imageBase64
    ) {
      return res.status(
        400
      ).json({
        success: false,
        error:
          "Please upload a clothing image first.",
        code:
          "MISSING_CLOTHING_IMAGE",
      });
    }

    const mimeType =
      getMimeType(
        imageInput
      );

    userId =
      getUserId(
        body,
        req
      );

    redis =
      getRedisOrNull();

    const pro =
      await isProUser(
        userId,
        redis
      );

    credit =
      await useCredit(
        userId,
        pro,
        redis
      );

    if (
      !credit.success
    ) {
      return res.status(
        402
      ).json({
        success: false,
        error:
          "Your free generations are finished. Upgrade to OBITREND Pro to continue.",
        upgradeRequired:
          true,
        balance:
          credit.balance,
      });
    }

    const prompt =
      buildPrompt(
        body
      );

    const size =
      getImageSize(
        getValue(
          body,
          "aspectRatio",
          "ratio"
        )
      );

    let imageUrl;

    try {
      imageUrl =
        await generateImage(
          imageBase64,
          mimeType,
          prompt,
          size
        );
    } catch (
      generationError
    ) {
      if (
        credit.usedCredit &&
        redis
      ) {
        try {
          await refundCredit(
            userId,
            redis
          );
        } catch (
          refundError
        ) {
          console.error(
            "OBITREND refund failed:",
            refundError
          );
        }
      }

      throw generationError;
    }

    return res.status(
      200
    ).json({
      success: true,
      ok: true,
      model:
        MODEL,

      image:
        imageUrl,

      imageUrl:
        imageUrl,

      url:
        imageUrl,

      generatedImage:
        imageUrl,

      images: [
        imageUrl
      ],

      colorImages: [
        imageUrl
      ],

      colourImages: [
        imageUrl
      ],

      balance:
        credit.balance,

      pro:
        pro,
    });

  } catch (
    error
  ) {
    console.error(
      "OBITREND /api/generate error:",
      error?.message ||
        error
    );

    return res.status(
      500
    ).json({
      success: false,
      error:
        error?.message ||
        "Image generation failed.",
    });
  }
}
