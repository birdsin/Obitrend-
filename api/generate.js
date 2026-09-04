import OpenAI, { toFile } from "openai";

import {
  reserveCredit,
  commitCredit,
  releaseCreditReservation,
  getProStatus,
  getRedisConfig,
  getAuthenticatedUser,
} from "./credits.js";

/* =========================================================
   CONFIG
========================================================= */

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "12mb",
    },
  },
};

export const maxDuration = 300;

const MODEL =
  process.env.OPENAI_IMAGE_MODEL ||
  "gpt-image-2";

const MAX_COLOUR_IMAGES = 4;
const MAX_IMAGE_BYTES =
  9 * 1024 * 1024;

const openai = new OpenAI({
  apiKey:
    process.env.OPENAI_API_KEY,
});

/* =========================================================
   HELPERS
========================================================= */

function clean(
  value,
  fallback = ""
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return fallback;
  }

  return String(value).trim();
}

function getValue(
  body,
  ...names
) {
  for (const name of names) {
    if (
      body?.[name] !== undefined &&
      body?.[name] !== null &&
      body?.[name] !== ""
    ) {
      return body[name];
    }
  }

  return "";
}

function getBoolean(
  body,
  ...names
) {
  for (const name of names) {
    const value =
      body?.[name];

    if (
      value === true ||
      value === "true" ||
      value === 1 ||
      value === "1"
    ) {
      return true;
    }

    if (
      value === false ||
      value === "false" ||
      value === 0 ||
      value === "0"
    ) {
      return false;
    }
  }

  return false;
}

/* =========================================================
   BASE64
========================================================= */

function normalizeBase64(
  input
) {
  if (!input) return null;

  let value =
    String(input).trim();

  if (
    value.startsWith(
      "data:image/"
    )
  ) {
    const comma =
      value.indexOf(",");

    if (comma !== -1) {
      value =
        value.slice(
          comma + 1
        );
    }
  }

  value =
    value.replace(
      /\s/g,
      ""
    );

  return value.length >= 100
    ? value
    : null;
}

/* =========================================================
   MIME
========================================================= */

function getMimeType(
  input
) {
  const match =
    String(input || "")
      .match(
        /^data:(image\/[a-zA-Z0-9.+-]+);base64,/i
      );

  return match
    ? match[1].toLowerCase()
    : "image/jpeg";
}

function extensionFromMime(
  mime
) {
  if (
    mime.includes("png")
  ) {
    return "png";
  }

  if (
    mime.includes("webp")
  ) {
    return "webp";
  }

  return "jpg";
}

/* =========================================================
   IMAGE SIZE
========================================================= */

function getImageSize(
  value
) {
  const ratio =
    clean(
      value,
      "5:4"
    ).toLowerCase();

  if (
    ratio.includes("5:4") ||
    ratio.includes("9:16") ||
    ratio.includes("portrait") ||
    ratio.includes("vertical") ||
    ratio.includes("4:5")
  ) {
    return "1024x1536";
  }

  if (
    ratio.includes("1:1") ||
    ratio.includes("square")
  ) {
    return "1024x1024";
  }

  return "1536x1024";
}

/* =========================================================
   COLOUR SUPPORT
========================================================= */

function getColourList(
  body
) {
  const raw =
    getValue(
      body,
      "clothingColors",
      "colors",
      "selectedColors"
    );

  let list = [];

  if (
    Array.isArray(raw)
  ) {
    list = raw;
  } else if (
    typeof raw === "string" &&
    raw.trim()
  ) {
    list =
      raw
        .split(",")
        .map(
          item =>
            item.trim()
        );
  }

  return [
    ...new Set(
      list
        .map(
          value =>
            String(value)
              .trim()
        )
        .filter(Boolean)
    ),
  ].slice(
    0,
    MAX_COLOUR_IMAGES
  );
}

/* =========================================================
   GARMENT PROMPT
========================================================= */

function buildPrompt(
  body,
  variantColor = ""
) {
  const model =
    clean(
      getValue(
        body,
        "model",
        "lady",
        "selectedModel"
      ),
      "adult fashion model"
    );

  const bodyStyle =
    clean(
      getValue(
        body,
        "bodyStyle",
        "body",
        "body_type"
      ),
      "natural balanced"
    );

  const pose =
    clean(
      getValue(
        body,
        "pose"
      ),
      "standing confidently"
    );

  const fashionStyle =
    clean(
      getValue(
        body,
        "fashionStyle",
        "style"
      ),
      "luxury editorial"
    );

  const country =
    clean(
      getValue(
        body,
        "country"
      )
    );

  const city =
    clean(
      getValue(
        body,
        "city"
      )
    );

  const scene =
    clean(
      getValue(
        body,
        "scene",
        "background"
      ),
      "luxury fashion studio"
    );

  const car =
    clean(
      getValue(
        body,
        "car",
        "vehicle"
      ),
      "no vehicle unless appropriate"
    );

  const camera =
    clean(
      getValue(
        body,
        "camera",
        "lighting"
      ),
      "high-end commercial fashion photography"
    );

  const ratio =
    clean(
      getValue(
        body,
        "aspectRatio",
        "ratio"
      ),
      "5:4"
    );

  const extra =
    clean(
      getValue(
        body,
        "extra",
        "additionalPrompt"
      )
    );

  const userPrompt =
    clean(
      getValue(
        body,
        "prompt",
        "description"
      )
    );

  const companionMode =
    getBoolean(
      body,
      "hasCompanion",
      "companionMode",
      "preserveCompanion"
    );

  const location =
    [
      city,
      country,
    ]
      .filter(Boolean)
      .join(", ");

  return `
OBITREND STRICT GARMENT REPRODUCTION MODE.

The uploaded image is the PRIMARY AND STRICT VISUAL REFERENCE for the GARMENT.

Create a new photorealistic fashion photograph where the selected adult model is actually wearing the SAME garment shown in the uploaded reference.

DO NOT treat the uploaded garment as loose inspiration.

DO NOT invent a replacement outfit.

=========================================================
REFERENCE IMAGE INTERPRETATION
=========================================================

Use the uploaded image to identify the garment.

Ignore the original person's:

- identity
- face
- body
- age
- pose
- hairstyle
- accessories
- handbag
- shoes
- background
- location

Preserve the GARMENT.

If the reference contains a collage or multiple views, use every visible view to understand the garment's front, back, side construction and details.

=========================================================
GARMENT MUST MATCH
=========================================================

Preserve as faithfully as possible:

- exact garment category
- exact garment type
- exact silhouette
- exact proportions
- exact length
- neckline
- collar
- straps
- sleeves or sleeveless construction
- arm openings
- waist shaping
- darts
- seams
- stitching
- panels
- pleats
- gathers
- folds
- draping
- hem shape
- button count and placement
- zipper placement
- ties
- belts only if present
- pockets
- embroidery
- prints
- artwork
- logos
- labels
- lettering
- stripes
- checks
- patterns
- borders
- trim
- fabric texture
- fabric finish
- color
- color relationships
- front construction
- back construction
- visible fastening details

Do not simplify the garment.

Do not replace it with a generic luxury outfit.

=========================================================
ABSOLUTE PROHIBITIONS
=========================================================

Never:

- redesign the garment
- replace the garment
- recolor the garment unless a colour variant was explicitly selected
- change its category
- change its neckline
- change its collar
- add sleeves that are not present
- remove sleeves that are present
- add a belt that is not present
- remove a belt that is present
- change buttons
- change stripe direction
- change stripe spacing
- change print placement
- change embroidery
- remove logos or lettering
- invent new garment panels
- turn the garment into another outfit
- substitute a cream, beige or white outfit
- use "inspired by" as permission to redesign it

The uploaded garment's visual identity has priority over the requested fashion style, location or vehicle.

=========================================================
FULL-BODY FASHION PHOTOGRAPH COMPOSITION
=========================================================

The final image MUST show the complete adult model from HEAD TO TOE.

The model must be the MAIN SUBJECT of the photograph.

The model must NOT appear tiny or distant.

FULL-BODY DOES NOT MEAN SMALL-BODY.

The adult model should occupy approximately 80–90% of the image height whenever physically possible while keeping the entire body visible.

Use a professional CLOSE FULL-LENGTH FASHION PHOTOGRAPHY composition.

Move the virtual camera close enough to clearly show:

- face
- hair
- upper body
- garment details
- waist
- hips
- legs
- ankles
- feet
- shoes

while still keeping the entire adult model inside the frame.

The complete model must remain visible.

The model should visually dominate the photograph.

The background should support the model rather than dominate the photograph.

Do NOT place the model far away from the camera.

Do NOT make the model tiny.

Do NOT create a huge amount of empty background.

Do NOT create excessive empty floor space.

Do NOT create excessive empty ceiling space.

Do NOT create excessive empty space above the head.

Do NOT create excessive empty space below the feet.

Do NOT use a wide environmental composition where the model becomes a small figure.

Do NOT prioritize architecture, furniture, scenery or vehicles over the model.

The photograph should look like a professional fashion campaign photograph where the model is the clear primary subject.

=========================================================
HEAD-TO-TOE VISIBILITY
=========================================================

The entire head must be visible.

The top of the hair must be visible.

The complete face must be visible.

Both shoulders must be visible.

Both arms must be visible when the pose allows.

Both hands should remain naturally visible when the pose allows.

The entire torso must be visible.

The complete garment must be visible.

The entire waist and hips must be visible.

Both legs must be visible.

Both knees must be visible when applicable.

Both ankles must be visible.

Both feet must be visible.

Both shoes must be visible when shoes are worn.

Do not crop the body.

Do not crop the head.

Do not crop the feet.

Do not crop the shoes.

Do not crop the garment.

Do not cut off important clothing details.

=========================================================
CAMERA DISTANCE
=========================================================

Use a camera distance appropriate for professional full-length fashion photography.

The camera must be close enough for the model and garment to be highly detailed.

The camera must still be far enough to capture the complete person.

Balance camera distance and framing so that:

COMPLETE BODY + LARGE MODEL + CLEAR GARMENT DETAILS

are all achieved at the same time.

If necessary, slightly reduce the model's scale only enough to keep both feet inside the frame.

Do NOT make the model unnecessarily small.

Do NOT zoom out excessively.

Do NOT create a distant full-body photograph.

=========================================================
PORTRAIT FASHION COMPOSITION
=========================================================

When the requested aspect ratio is portrait or 9:16, create a true vertical full-length fashion photograph.

For OBITREND's 4:5 and 5:4 full-body fashion composition, use a vertical full-length fashion photograph so that the complete adult model remains the dominant subject.

The composition should resemble a professional social-media fashion campaign photograph.

The model should fill most of the vertical frame.

The complete head and complete feet must remain visible.

Use only a small amount of natural breathing room around the model.

The model should be clearly readable on a mobile phone screen.

The clothing should remain large enough to inspect clearly.

The result should look like a real fashion post, not an environmental landscape photograph.

=========================================================
MODEL
=========================================================

Model:
${model}

Body style:
${bodyStyle}

Pose:
${pose}

Fashion style:
${fashionStyle}

The model is an adult fashion model.

The model should have realistic adult human proportions.

The selected pose should be natural and suitable for a professional fashion photograph.

The pose must not hide important garment details.

If the requested pose would cause the body to be cropped, maintain the complete body and use a suitable camera distance.

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
LIFESTYLE FASHION CAMPAIGN
=========================================================

Create a premium real-world lifestyle fashion photograph.

The image should resemble photographs commonly used for:

- Instagram fashion campaigns
- clothing brand campaigns
- fashion catalogues
- boutique advertisements
- luxury lifestyle campaigns
- professional fashion portfolios
- commercial clothing promotions

The model should look naturally photographed in the selected environment.

Use natural interaction with the environment.

The background should be realistic but secondary to the model.

The model and garment must remain the strongest visual elements.

=========================================================
SCENE
=========================================================

Setting:
${scene}

${location ? `Location: ${location}` : ""}

Vehicle:
${car}

The scene must support the fashion campaign without changing the garment.

Do not allow the environment to make the model appear distant.

Do not allow furniture, vehicles, walls, plants or foreground objects to hide important parts of the outfit.

=========================================================
PHOTOGRAPHIC BALANCE
=========================================================

The final image must balance:

REALISM
+
FULL BODY
+
LARGE MODEL
+
CLEAR GARMENT
+
REAL ENVIRONMENT
+
PROFESSIONAL FASHION COMPOSITION.

The model must be close enough to see the garment clearly.

The complete body must still fit naturally inside the frame.

Do not sacrifice garment visibility for scenery.

Do not sacrifice full-body visibility for a close-up.

Do not sacrifice photorealism for styling.

=========================================================
COMPANION HANDLING
=========================================================

${
  companionMode
    ? `
The uploaded reference may contain another person or child.

Keep that person only if the frontend explicitly requested a companion.

Do not let the companion replace or alter the garment worn by the adult model.

Any child must remain age-appropriate.

The primary adult model must remain the main subject.
`
    : `
Do not copy unrelated people from the reference image.

The garment is the important reference.
`
}

${
  variantColor
    ? `
=========================================================
COLOUR VARIANT
=========================================================

Create this requested garment colour variant:

${variantColor}

Change ONLY the garment colour.

Keep identical:

- garment category
- silhouette
- construction
- stripes
- graphics
- buttons
- seams
- trims
- fabric
- proportions
- all other garment details

Do not redesign the garment.

The complete garment must remain clearly visible.
`
    : ""
}

${
  userPrompt
    ? `
=========================================================
USER REQUEST
=========================================================

${userPrompt}
`
    : ""
}

${
  extra
    ? `
=========================================================
EXTRA DIRECTION
=========================================================

${extra}
`
    : ""
}

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

=========================================================
FINAL FULL-BODY CHECK
=========================================================

Before producing the final image:

- show the complete head
- show the complete hair
- show the complete face
- show the complete upper body
- show the complete garment
- show the complete waist
- show the complete hips
- show both legs
- show both ankles
- show both feet
- show both shoes when applicable

The model must remain LARGE and PROMINENT in the frame.

Do NOT make the model small.

Do NOT make the model distant.

Do NOT create a huge environmental photograph with a tiny model.

Do NOT create excessive empty space.

Keep the model as the dominant subject.

FULL BODY + LARGE MODEL + CLEAR GARMENT.

=========================================================
FINAL PRIORITY
=========================================================

PRIORITY ORDER:

1. Uploaded garment accuracy
2. Full head-to-toe visibility
3. Large dominant model composition
4. Photorealistic real-photograph appearance
5. Garment construction and visible details
6. Photorealistic model and garment fit
7. Requested pose
8. Requested scene/location
9. Requested vehicle
10. Fashion styling

If a scene or styling instruction conflicts with the garment, preserve the garment.

If a camera composition would make the model too small, move the camera closer while keeping the complete body visible.

If a composition would crop the feet, adjust the framing rather than making the model extremely distant.

The final image must look like a genuine professional fashion photograph.

The final image must show a LARGE, CLEAR, PHOTOREALISTIC, FULL-BODY ADULT MODEL wearing the SAME uploaded garment.

NO TINY MODEL.
NO DISTANT MODEL.
NO EXCESSIVE EMPTY BACKGROUND.
NO EXCESSIVE EMPTY FLOOR.
NO EXCESSIVE EMPTY CEILING.
NO CROPPED HEAD.
NO CROPPED FEET.
NO CROPPED SHOES.
NO CROPPED GARMENT.
NO WAIST-UP IMAGE.
NO CHEST-UP IMAGE.
NO KNEE-UP IMAGE.
NO THREE-QUARTER BODY CROP.

REAL PHOTOGRAPH.
REAL PERSON.
REAL CLOTHING.
REAL FABRIC.
REAL ENVIRONMENT.
REAL LIGHTING.
REAL CAMERA LOOK.
FULL BODY.
HEAD TO TOE.
LARGE MODEL.
CLEAR GARMENT.
PROFESSIONAL FASHION PHOTOGRAPH.
`;
}

/* =========================================================
   OPENAI IMAGE GENERATION
========================================================= */

async function generateOne(
  imageBase64,
  mimeType,
  prompt,
  size
) {
  const inputBuffer =
    Buffer.from(
      imageBase64,
      "base64"
    );

  if (!inputBuffer.length) {
    throw new Error(
      "Uploaded clothing image is empty."
    );
  }

  if (
    inputBuffer.length >
    MAX_IMAGE_BYTES
  ) {
    throw new Error(
      "Uploaded clothing image is too large."
    );
  }

  const imageFile =
    await toFile(
      inputBuffer,
      `clothing-reference.${extensionFromMime(
        mimeType
      )}`,
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

  const b64 =
    result?.data?.[0]?.b64_json;

  if (!b64) {
    throw new Error(
      "OpenAI did not return an image."
    );
  }

  return `data:image/png;base64,${b64}`;
}

/* =========================================================
   SAFE CUSTOMER ERROR
========================================================= */

function publicGenerationError(
  error
) {
  const status =
    Number.isInteger(
      error?.status
    )
      ? error.status
      : 500;

  const code =
    String(
      error?.code || ""
    ).toLowerCase();

  const type =
    String(
      error?.type || ""
    ).toLowerCase();

  const message =
    String(
      error?.message || ""
    ).toLowerCase();

  const billingOrQuotaError =
    status === 429 ||
    code.includes("quota") ||
    code.includes("credit_balance") ||
    code.includes("spend_limit") ||
    code.includes("usage_limit") ||
    type.includes("quota") ||
    message.includes(
      "you have no credits remaining"
    ) ||
    message.includes(
      "insufficient_quota"
    ) ||
    message.includes(
      "credit_balance_exhausted"
    ) ||
    message.includes(
      "organization_spend_limit_exceeded"
    ) ||
    message.includes(
      "project_spend_limit_exceeded"
    ) ||
    message.includes(
      "organization_usage_limit_exceeded"
    ) ||
    message.includes(
      "platform.openai.com"
    );

  if (
    billingOrQuotaError
  ) {
    return {
      status: 503,
      error:
        "Generation temporarily unavailable. Your credit has been returned. Please try again shortly.",
    };
  }

  if (
    status === 400
  ) {
    return {
      status: 400,
      error:
        "We could not generate this image. Please check the uploaded clothing image and try again.",
    };
  }

  if (
    status === 413
  ) {
    return {
      status: 413,
      error:
        "The uploaded clothing image is too large. Please upload a smaller image.",
    };
  }

  return {
    status: 503,
    error:
      "Generation temporarily unavailable. Your credit has been returned. Please try again shortly.",
  };
}

/* =========================================================
   API HANDLER
========================================================= */

export default async function handler(
  req,
  res
) {
  if (
    req.method !== "POST"
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
    console.error(
      "OBITREND: OpenAI configuration is missing."
    );

    return res.status(
      503
    ).json({
      success: false,
      error:
        "Generation temporarily unavailable. Please try again shortly.",
    });
  }

  let redis = null;
  let userId = "";
  let reservation = null;

  try {
    /* =======================================================
       AUTHENTICATION
    ======================================================= */

    const auth =
      await getAuthenticatedUser(
        req
      );

    if (!auth.ok) {
      return res.status(
        auth.status
      ).json({
        success: false,
        error:
          auth.error,
      });
    }

    userId =
      auth.user.id;

    const body =
      req.body || {};

    /* =======================================================
       IMAGE INPUT
    ======================================================= */

    const imageInput =
      getValue(
        body,
        "imageBase64",
        "uploadedImage",
        "image",
        "clothingImage",
        "referenceImage"
      );

    const imageBase64 =
      normalizeBase64(
        imageInput
      );

    if (!imageBase64) {
      return res.status(
        400
      ).json({
        success: false,
        error:
          "Please upload a clothing image first.",
      });
    }

    const mimeType =
      getMimeType(
        imageInput
      );

    /* =======================================================
       REDIS
    ======================================================= */

    redis =
      getRedisConfig();

    if (
      !redis?.url ||
      !redis?.token
    ) {
      console.error(
        "OBITREND: Redis configuration is missing."
      );

      return res.status(
        503
      ).json({
        success: false,
        error:
          "Generation temporarily unavailable. Please try again shortly.",
      });
    }

    /* =======================================================
       CREDIT RESERVATION
       
       IMPORTANT:
       THIS DOES NOT DEDUCT A CREDIT.
       
       It only checks availability and
       creates a short generation lock.
    ======================================================= */

    reservation =
      await reserveCredit(
        userId,
        redis
      );

    if (
      !reservation?.success
    ) {
      if (
        reservation?.generationInProgress
      ) {
        return res.status(
          409
        ).json({
          success: false,
          error:
            "A generation is already in progress. Please wait for it to finish.",
          generationInProgress:
            true,
        });
      }

      const noCreditMessage =
        reservation?.proActive
          ? "Your OBITREND Pro credits are finished. Please renew your Pro plan to continue."
          : "Your free OBITREND generations are finished. Upgrade to OBITREND Pro to continue.";

      return res.status(
        402
      ).json({
        success: false,
        error:
          noCreditMessage,
        upgradeRequired:
          true,
        balance:
          reservation?.balance ??
          0,
        proCredits:
          reservation?.proCredits ??
          0,
      });
    }

    /* =======================================================
       COLOUR REQUESTS
    ======================================================= */

    const colours =
      getColourList(
        body
      );

    const prompts =
      colours.length
        ? colours.map(
            color =>
              buildPrompt(
                body,
                color
              )
          )
        : [
            buildPrompt(
              body
            )
          ];

    const size =
      getImageSize(
        getValue(
          body,
          "aspectRatio",
          "ratio"
        )
      );

    const images = [];

    /* =======================================================
       GENERATE
       
       IMPORTANT:
       NO CREDIT IS DEDUCTED HERE.
    ======================================================= */

    for (
      let index = 0;
      index <
        Math.min(
          prompts.length,
          1
        );
      index++
    ) {
      const prompt =
        prompts[index];

      try {
        const generated =
          await generateOne(
            imageBase64,
            mimeType,
            prompt,
            size
          );

        /*
         * OpenAI successfully returned
         * a real image.
         *
         * NOW — and only now —
         * commit exactly one credit.
         */
        const committed =
          await commitCredit(
            userId,
            redis,
            reservation
          );

        if (
          !committed?.success
        ) {
          console.error(
            "OBITREND credit commit failed after successful image generation:",
            committed
          );

          /*
           * The customer is NOT charged
           * if the credit commit itself
           * cannot be safely completed.
           */
          throw new Error(
            "Credit could not be safely finalized after image generation."
          );
        }

        images.push(
          generated
        );

        reservation = null;

      } catch (
        generationError
      ) {
        console.error(
          "OBITREND generation error:",
          generationError
        );

        /*
         * IMPORTANT:
         *
         * We DO NOT refund here.
         *
         * The credit was never deducted
         * before generation.
         *
         * Therefore a failed generation
         * cannot consume the customer's
         * credit.
         */
        throw generationError;
      }
    }

    /* =======================================================
       FINAL BALANCE
    ======================================================= */

    const finalStatus =
      await getProStatus(
        userId,
        redis
      );

    const firstImage =
      images[0];

    return res.status(
      200
    ).json({
      success: true,
      ok: true,

      model:
        MODEL,

      image:
        firstImage,

      imageUrl:
        firstImage,

      url:
        firstImage,

      generatedImage:
        firstImage,

      images,

      colorImages:
        images,

      colourImages:
        images,

      balance:
        finalStatus.active
          ? finalStatus.proCredits
          : null,

      pro:
        finalStatus.active,

      proCredits:
        finalStatus.active
          ? finalStatus.proCredits
          : 0,

      message:
        "OBITREND fashion image generated successfully.",
    });

  } catch (
    error
  ) {
    console.error(
      "OBITREND GENERATION ERROR:",
      error
    );

    const safe =
      publicGenerationError(
        error
      );

    return res.status(
      safe.status
    ).json({
      success: false,
      error:
        safe.error,
    });

  } finally {

    /*
     * Always release the generation
     * lock if it is still held.
     *
     * This does NOT refund a credit because
     * credits are only deducted after success.
     */
    if (
      redis &&
      userId
    ) {
      try {
        await releaseCreditReservation(
          userId,
          redis
        );
      } catch (
        releaseError
      ) {
        console.error(
          "OBITREND generation lock cleanup error:",
          releaseError
        );
      }
    }
  }
}
