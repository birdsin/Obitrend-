import OpenAI, { toFile } from "openai";

import {
  reserveCredit,
  commitCredit,
  releaseCreditReservation,
  getRedisConfig,
  getAuthenticatedUser,
} from "./credits.js";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "12mb",
    },
  },
};

export const maxDuration = 300;

const MODEL =
  process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";

const MAX_IMAGE_BYTES = 9 * 1024 * 1024;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function clean(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
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

function normalizeBase64(value) {
  if (!value) return "";

  const text = String(value).trim();

  if (text.startsWith("data:")) {
    const comma = text.indexOf(",");

    if (comma !== -1) {
      return text.slice(comma + 1);
    }
  }

  return text;
}

function getMimeType(value) {
  const match = String(value || "").match(
    /^data:(image\/(?:png|jpeg|jpg|webp));base64,/i
  );

  if (match) {
    return match[1].toLowerCase() === "image/jpg"
      ? "image/jpeg"
      : match[1].toLowerCase();
  }

  return "image/jpeg";
}

function extensionFromMime(mime) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

function estimateBase64Bytes(base64) {
  if (!base64) return 0;

  const padding =
    base64.endsWith("==")
      ? 2
      : base64.endsWith("=")
      ? 1
      : 0;

  return Math.floor(
    (base64.length * 3) / 4
  ) - padding;
}

function getImageSize(value) {
  const ratio = clean(value, "4:5").toLowerCase();

  if (
    ratio.includes("1:1") ||
    ratio.includes("square")
  ) {
    return "1024x1024";
  }

  if (
    ratio.includes("4:5") ||
    ratio.includes("5:4") ||
    ratio.includes("9:16") ||
    ratio.includes("portrait") ||
    ratio.includes("vertical")
  ) {
    return "1024x1536";
  }

  if (
    ratio.includes("16:9") ||
    ratio.includes("landscape")
  ) {
    return "1536x1024";
  }

  return "1024x1536";
}

function getColourList(body) {
  const result = [];

  const values = [
    body?.garmentColor,
    body?.garmentColour,
    body?.topColor,
    body?.topColour,
    body?.trouserColor,
    body?.trouserColour,
    body?.pantsColor,
    body?.pantsColour,
    body?.bottomColor,
    body?.bottomColour,
  ];

  for (const value of values) {
    if (!value) continue;

    if (Array.isArray(value)) {
      result.push(
        ...value.map(clean).filter(Boolean)
      );
    } else {
      result.push(
        ...String(value)
          .split(",")
          .map(clean)
          .filter(Boolean)
      );
    }
  }

  return [...new Set(result)].slice(0, 4);
}

function buildPrompt(body) {
  const userPrompt = clean(
    getValue(body, "prompt", "description")
  );

  const model = clean(
    getValue(
      body,
      "model",
      "lady",
      "modelChoice"
    ),
    "professional adult fashion model"
  );

  const background = clean(
    getValue(
      body,
      "background",
      "location",
      "environment"
    ),
    "luxury real-world fashion environment"
  );

  const pose = clean(
    getValue(
      body,
      "pose",
      "modelPose"
    ),
    "natural professional full-body fashion pose"
  );

  const garmentType = clean(
    getValue(
      body,
      "garmentType",
      "clothingType",
      "outfit"
    ),
    "the uploaded garment"
  );

  const colours = getColourList(body);

  return `
OBITREND AI FASHION CREATOR — PREMIUM COMMERCIAL FASHION PHOTOGRAPH

Use the uploaded clothing image as the PRIMARY AND STRICT VISUAL REFERENCE.

The uploaded garment is the source of truth.

PRESERVE THE UPLOADED CLOTHING DESIGN AS ACCURATELY AS THE IMAGE MODEL ALLOWS.

Preserve exactly:

- overall garment shape and construction
- neckline and collar shape
- sleeve shape and length
- cuffs and sleeve details
- garment colour
- colour blocking
- fabric appearance and texture
- seams and stitching
- hem shape
- garment proportions
- artwork
- graphics
- logos actually present
- labels actually present
- visible lettering
- stripes
- borders
- decorative details
- graphic orientation
- graphic size
- graphic placement

DO NOT redesign the garment.

DO NOT invent new clothing details.

DO NOT add a waistband if one does not exist.

DO NOT add a belt if one does not exist.

DO NOT add stripes if they do not exist.

DO NOT add piping, ribbing, trim or decorative panels unless they are clearly present.

DO NOT replace the uploaded artwork with similar artwork.

DO NOT simplify the artwork.

DO NOT change the artwork colours.

DO NOT move the artwork.

DO NOT remove printed details.

DO NOT invent text.

The final result must look like the SAME physical garment from the uploaded reference being realistically worn by the subject.

Only change the person, pose, environment, lighting and campaign setting.

MODEL:
${model}

GARMENT:
${garmentType}

BACKGROUND:
${background}

POSE:
${pose}

COLOURS:
${
  colours.length
    ? colours.join(", ")
    : "Preserve original uploaded garment colours."
}

USER REQUEST:
${
  userPrompt ||
  "Create a premium professional fashion campaign photograph."
}


=========================================================
FULL-BODY COMPOSITION
=========================================================

Show the adult model from head to toe.

Both feet must be visible.

Both shoes must be visible.

Do not crop the head.

Do not crop the garment.

Do not crop the legs.

Do not crop the feet.

The model should occupy most of the vertical frame.

Do not make the model tiny or distant.

Avoid excessive empty floor.

Avoid excessive empty ceiling.

Keep the clothing large and clearly visible.

Use natural professional fashion-camera perspective.

Maintain realistic adult human anatomy and proportions.


=========================================================
PHOTOREALISM — REAL PHOTOGRAPH REQUIREMENT
=========================================================

THE FINAL IMAGE MUST LOOK LIKE A REAL PHOTOGRAPH.

Generate an extremely photorealistic, natural-looking fashion photograph that could realistically have been captured by a professional photographer using a modern professional camera.

The image must have authentic photographic characteristics:

- realistic human anatomy
- realistic adult proportions
- realistic skin texture
- natural skin pores
- natural facial detail
- realistic eyes
- realistic teeth
- realistic hair strands
- realistic hands
- realistic fingers
- realistic nails
- realistic feet
- realistic body posture
- realistic fabric texture
- realistic fabric folds
- realistic garment tension
- realistic stitching
- realistic shadows
- realistic reflections
- realistic depth
- realistic perspective
- realistic lighting
- realistic highlights
- realistic environmental reflections
- realistic background detail
- realistic camera depth of field
- realistic lens perspective
- natural photographic exposure
- natural colour rendition
- natural contrast
- subtle photographic imperfections

The model must look like a real adult person photographed in the selected environment.

The environment must look physically real and naturally photographed.

The clothing must look like real physical fabric being worn by a real person.

Do not make the image look like:

- CGI
- 3D rendering
- digital illustration
- cartoon
- anime
- painting
- artificial fashion render
- plastic mannequin
- wax figure
- doll
- synthetic human
- videogame character
- overly smooth AI face
- plastic skin
- artificial hair
- fake fabric
- distorted anatomy
- unrealistic lighting
- unrealistic shadows
- floating objects
- impossible reflections

Do not over-process the image.

Do not create excessive HDR.

Do not create excessive sharpening.

Do not create an artificial beauty-filter appearance.

Do not make the skin unnaturally smooth.

Do not make the model look like a mannequin.

Preserve natural skin texture and realistic photographic detail.

The final result must be convincing as a genuine professional fashion photograph captured in the real world.


=========================================================
REAL CAMERA FASHION PHOTOGRAPHY
=========================================================

Simulate the visual characteristics of a professional fashion photographer using a high-quality modern camera.

Use natural photographic perspective.

Use realistic lens behaviour.

Use believable depth of field.

Use physically plausible lighting.

Use realistic separation between the model and background.

Maintain natural proportions throughout the entire image.

The camera perspective must remain physically believable from head to toe.

The final photograph should look suitable for a professional fashion campaign, fashion catalogue, Instagram fashion post or commercial clothing advertisement.


=========================================================
FINAL REALISM CHECK
=========================================================

Before producing the final image, ensure the image looks like a real photograph rather than an AI-generated artwork.

The model must look physically present in the environment.

The clothing must look physically present on the model.

The environment must look physically present around the model.

Lighting, shadows, reflections, perspective, anatomy and fabric behaviour must all be consistent with a real photograph.

REAL PERSON.
REAL CLOTHING.
REAL FABRIC.
REAL ENVIRONMENT.
REAL LIGHTING.
REAL CAMERA LOOK.
PHOTOREALISTIC FASHION PHOTOGRAPH.
`;
}

async function generateOne({
  imageBase64,
  mimeType,
  prompt,
  size,
}) {
  const extension =
    extensionFromMime(mimeType);

  const imageFile = await toFile(
    Buffer.from(imageBase64, "base64"),
    `obitrend-garment.${extension}`,
    {
      type: mimeType,
    }
  );

  const result =
    await openai.images.edit({
      model: MODEL,
      image: imageFile,
      prompt,
      size,
      quality: "high",
      output_format: "png",
    });

  const base64 =
    result?.data?.[0]?.b64_json;

  if (!base64) {
    throw new Error(
      "OpenAI returned no image."
    );
  }

  return base64;
}

export default async function handler(req, res) {
  let reservation = null;
  let redis = null;
  let userId = null;

  try {
    if (req.method !== "POST") {
      return res.status(405).json({
        success: false,
        error: "Method not allowed.",
      });
    }

    const auth =
      await getAuthenticatedUser(req);

    if (!auth?.user?.id) {
      return res.status(401).json({
        success: false,
        error: "Please sign in again.",
      });
    }

    userId = auth.user.id;

    if (!process.env.OPENAI_API_KEY) {
      console.error(
        "OPENAI_API_KEY is not configured."
      );

      return res.status(500).json({
        success: false,
        error:
          "Generation temporarily unavailable. Please try again shortly.",
      });
    }

    const body =
      req.body &&
      typeof req.body === "object"
        ? req.body
        : {};

    const rawImage = getValue(
      body,
      "garmentImage",
      "clothingImage",
      "image",
      "photo",
      "base64Image"
    );

    const imageBase64 =
      normalizeBase64(rawImage);

    if (!imageBase64) {
      return res.status(400).json({
        success: false,
        error:
          "Please upload a clothing image first.",
      });
    }

    if (
      estimateBase64Bytes(imageBase64) >
      MAX_IMAGE_BYTES
    ) {
      return res.status(413).json({
        success: false,
        error:
          "The clothing image is too large. Please choose a smaller image.",
      });
    }

    const mimeType =
      getMimeType(rawImage);

    const ratio = clean(
      getValue(
        body,
        "aspectRatio",
        "ratio"
      ),
      "4:5"
    );

    const size =
      getImageSize(ratio);

    redis =
      await getRedisConfig();

    reservation =
      await reserveCredit(
        userId,
        redis
      );

    if (!reservation?.ok) {
      return res.status(402).json({
        success: false,
        error:
          "You do not have enough OBITREND credits.",
        credits:
          reservation?.credits ?? 0,
      });
    }

    const prompt =
      buildPrompt(body);

    let generatedBase64;

    try {
      generatedBase64 =
        await generateOne({
          imageBase64,
          mimeType,
          prompt,
          size,
        });
    } catch (error) {
      console.error(
        "OpenAI image generation error:",
        error
      );

      return res.status(502).json({
        success: false,
        error:
          "Generation temporarily unavailable. Your credit has not been charged. Please try again shortly.",
      });
    }

    /*
     * ONLY NOW deduct the credit.
     */

    const committed =
      await commitCredit(
        userId,
        redis,
        reservation
      );

    if (!committed?.ok) {
      console.error(
        "OBITREND credit commit failed:",
        committed
      );

      /*
       * The image was already generated.
       * Do not hide a successful image from the customer.
       */

      const dataUrl =
        `data:image/png;base64,${generatedBase64}`;

      return res.status(200).json({
        success: true,
        image: dataUrl,
        imageUrl: dataUrl,
        b64_json: generatedBase64,
        mimeType: "image/png",
        creditCommitted: false,
      });
    }

    const dataUrl =
      `data:image/png;base64,${generatedBase64}`;

    return res.status(200).json({
      success: true,
      image: dataUrl,
      imageUrl: dataUrl,
      b64_json: generatedBase64,
      mimeType: "image/png",
      creditCommitted: true,
      creditType:
        reservation.creditType,
      plan:
        reservation.plan || null,
    });
  } catch (error) {
    console.error(
      "OBITREND generation fatal error:",
      error
    );

    return res.status(502).json({
      success: false,
      error:
        "Generation temporarily unavailable. Your credit has not been charged. Please try again shortly.",
    });
  } finally {
    if (
      redis &&
      reservation &&
      userId
    ) {
      try {
        await releaseCreditReservation(
          userId,
          redis,
          reservation
        );
      } catch (error) {
        console.error(
          "Reservation release error:",
          error
        );
      }
    }
  }
}
