import OpenAI from "openai";
import { toFile } from "openai/uploads";

import {
  spendCredit,
  refundCredit,
  getProStatus,
  getRedisConfig,
  getAuthenticatedUser,
} from "./credits.js";

/* =========================================================
   OBITREND AI FASHION CREATOR
   SECURE IMAGE GENERATION API
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
  "gpt-image-1";

/* =========================================================
   HELPERS
   ========================================================= */

function text(value, fallback = "", max = 500) {
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value)
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, max);
}

function bool(value) {
  return (
    value === true ||
    value === "true" ||
    value === 1 ||
    value === "1"
  );
}

function getBody(req) {
  if (!req.body) return {};

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  return req.body;
}

/* =========================================================
   IMAGE INPUT
   ========================================================= */

function parseImageInput(input) {
  if (!input) {
    throw new Error("No clothing image was supplied.");
  }

  let mime = "image/png";
  let base64 = String(input);

  /*
   Accept:
   data:image/png;base64,...
   data:image/jpeg;base64,...
   raw base64
  */

  if (base64.startsWith("data:")) {
    const match = base64.match(
      /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
    );

    if (!match) {
      throw new Error("Invalid clothing image format.");
    }

    mime = match[1];
    base64 = match[2];
  }

  base64 = base64.replace(/\s/g, "");

  if (!base64 || base64.length < 100) {
    throw new Error("The clothing image is empty or invalid.");
  }

  let extension = "png";

  if (mime === "image/jpeg" || mime === "image/jpg") {
    extension = "jpg";
  } else if (mime === "image/webp") {
    extension = "webp";
  } else if (mime === "image/gif") {
    extension = "gif";
  }

  const buffer = Buffer.from(base64, "base64");

  if (!buffer.length) {
    throw new Error("Unable to read the clothing image.");
  }

  return {
    buffer,
    mime,
    filename: `obitrend-garment.${extension}`,
  };
}

/* =========================================================
   SUPPORTED IMAGE SIZES
   OpenAI image generation APIs support fixed dimensions.
   ========================================================= */

function getSafeSize(aspectRatio) {
  const ratio = text(aspectRatio, "4:5", 20);

  switch (ratio) {
    case "1:1":
      return "1024x1024";

    case "5:4":
    case "16:9":
    case "landscape":
      return "1536x1024";

    case "4:5":
    case "9:16":
    case "portrait":
      return "1024x1536";

    default:
      return "1024x1024";
  }
}

/* =========================================================
   STANDARD CAMERA CONTROL
   ========================================================= */

const STANDARD_CAMERAS = new Set([
  "Professional DSLR",
  "Professional Mirrorless",
  "Canon Professional",
  "Nikon Professional",
  "Sony Professional",
  "Fashion Editorial Camera",
  "Studio Fashion Camera",
  "Professional Full-Frame Camera",
]);

function safeStandardCamera(camera) {
  const value = text(
    camera,
    "Professional Full-Frame Camera",
    100
  );

  if (STANDARD_CAMERAS.has(value)) {
    return value;
  }

  /*
   Browser values cannot unlock a camera feature.
   Unknown/advanced values are downgraded.
  */

  return "Professional Full-Frame Camera";
}

/* =========================================================
   MONTHLY FULL-PRO CAMERA
   ========================================================= */

const FULL_PRO_CAMERAS = new Set([
  "Real Person Camera",
  "Ultra Real Person Camera",
  "Premium Full-Frame Realism",
  "Cinematic Full-Frame Camera",
  "Luxury Fashion Campaign Camera",
  "True-to-Life Editorial Camera",
  "Professional Commercial Camera",
]);

function safeFullProCamera(camera) {
  const value = text(camera, "", 120);

  if (FULL_PRO_CAMERAS.has(value)) {
    return value;
  }

  return "Premium Full-Frame Realism";
}

/* =========================================================
   FULL PRO ADVANCED CONTROLS
   ========================================================= */

function safeAdvancedValue(value, fallback) {
  return text(value, fallback, 160);
}

/* =========================================================
   BUILD SECURE PROMPT
   ========================================================= */

function buildSecurePrompt(body, entitlement) {
  const {
    proActive,
    plan,
    tier,
  } = entitlement;

  const isFullPro =
    proActive === true &&
    (
      tier === "full" ||
      plan === "PRO_MONTHLY"
    );

  const isStandardPro =
    proActive === true &&
    !isFullPro;

  /*
   IMPORTANT:
   These values come from the request only as descriptive
   selections. They never determine entitlement.
  */

  const garmentType = text(
    body.garmentType ||
    body.clothingType ||
    body.itemType,
    "fashion garment"
  );

  const garmentColor = text(
    body.garmentColor ||
    body.clothingColor ||
    body.color,
    "the exact original garment color"
  );

  const trouserColor = text(
    body.trouserColor ||
    body.trousersColor ||
    body.pantsColor,
    "the selected trouser color"
  );

  const garmentStyle = text(
    body.garmentStyle ||
    body.style,
    "premium contemporary fashion"
  );

  const model = text(
    body.model ||
    body.modelType ||
    body.lady,
    "adult female fashion model"
  );

  const bodyType = text(
    body.bodyType ||
    body.modelBody,
    "natural feminine body proportions"
  );

  const face = text(
    body.face ||
    body.faceType,
    "natural attractive adult facial features"
  );

  const footwear = text(
    body.footwear ||
    body.shoes,
    "fashion-appropriate footwear"
  );

  const pose = text(
    body.pose ||
    body.modelPose,
    "confident professional fashion pose"
  );

  const fashionStyle = text(
    body.fashionStyle ||
    body.aesthetic,
    "luxury fashion editorial"
  );

  const location = text(
    body.location ||
    body.city ||
    body.environment,
    "premium fashion location"
  );

  const background = text(
    body.background ||
    body.backgroundType,
    "luxury editorial background"
  );

  const property = text(
    body.property ||
    body.propertyType,
    "high-end architectural environment"
  );

  const vehicle = text(
    body.vehicle ||
    body.car,
    "no vehicle unless selected"
  );

  const lighting = text(
    body.lighting ||
    body.lightingStyle,
    "professional fashion lighting"
  );

  const composition = text(
    body.composition,
    "professional fashion composition"
  );

  const campaignType = text(
    body.campaignType,
    "premium fashion campaign"
  );

  const environmentDetail = text(
    body.environmentDetail,
    "realistic detailed environment"
  );

  /*
   ---------------------------------------------------------
   CAMERA ENTITLEMENT
   ---------------------------------------------------------
  */

  let camera;

  if (isFullPro) {
    camera = safeFullProCamera(
      body.advancedCamera ||
      body.camera
    );
  } else {
    camera = safeStandardCamera(
      body.camera
    );
  }

  /*
   ---------------------------------------------------------
   ADVANCED MONTHLY-ONLY FEATURES
   ---------------------------------------------------------
  */

  let lens = "professional fashion lens";
  let realism = "high-quality photorealistic fashion photography";

  if (isFullPro) {
    lens = safeAdvancedValue(
      body.lens,
      "85mm premium full-frame fashion lens"
    );

    realism = safeAdvancedValue(
      body.realism,
      "extreme photorealism with natural human skin, realistic pores, physically accurate fabric, natural anatomy, authentic depth of field, realistic perspective, realistic shadows and natural reflections"
    );
  }

  /*
   ---------------------------------------------------------
   WEEKLY STANDARD PRO
   ---------------------------------------------------------
  */

  const planInstruction = isFullPro
    ? `
FULL PRO ENTITLEMENT:
The authenticated account has the MONTHLY FULL PRO entitlement.

Use the premium full-frame photographic treatment:
- realistic human skin
- realistic facial detail
- realistic hair
- realistic fabric texture
- physically believable lighting
- natural anatomy
- authentic lens perspective
- realistic depth of field
- realistic shadows
- realistic reflections
- premium commercial fashion photography
- sophisticated editorial quality

Do not make the subject look artificial, plastic, CGI-generated,
or like a 3D mannequin.
`
    : isStandardPro
      ? `
STANDARD PRO ENTITLEMENT:
The authenticated account has the WEEKLY STANDARD PRO entitlement.

Use professional fashion photography with:
- professional camera quality
- clean studio/editorial lighting
- realistic fabric
- realistic anatomy
- natural skin
- professional composition

Do not apply MONTHLY FULL PRO exclusive camera modes.
`
      : `
FREE ENTITLEMENT:
Use the standard fashion generation workflow.
Do not apply Pro-only camera modes or premium-only controls.
`;

  /*
   ---------------------------------------------------------
   GARMENT PRESERVATION
   ---------------------------------------------------------
  */

  return `
OBITREND AI FASHION CREATOR — SECURE IMAGE GENERATION

The uploaded clothing image is the PRIMARY AND AUTHORITATIVE
REFERENCE for the garment.

The final image must preserve the uploaded garment as accurately
as possible.

GARMENT FIDELITY IS THE HIGHEST PRIORITY.

Do NOT redesign the garment.
Do NOT replace the garment.
Do NOT invent a different garment.
Do NOT alter the garment silhouette unnecessarily.
Do NOT change its construction.
Do NOT change its neckline.
Do NOT change sleeves.
Do NOT change seams.
Do NOT change stitching.
Do NOT change pockets.
Do NOT change buttons.
Do NOT change zippers.
Do NOT change logos.
Do NOT change prints.
Do NOT change patterns.
Do NOT change embroidery.
Do NOT change decorative elements.
Do NOT change the material appearance.
Do NOT change the original proportions unnecessarily.

Preserve all visible garment details from the uploaded image.

If the uploaded garment contains text, graphics, logos, patterns,
prints or distinctive design details, reproduce them as faithfully
as the reference permits.

The garment must remain the same actual fashion item even when
placed on the selected adult model.

IMPORTANT:
The uploaded garment reference is more important than generic
fashion styling.

============================================================
FASHION SELECTION
============================================================

Garment type:
${garmentType}

Garment color:
${garmentColor}

Trouser / lower garment color:
${trouserColor}

Garment style:
${garmentStyle}

Fashion style:
${fashionStyle}

Model:
${model}

Body type:
${bodyType}

Face:
${face}

Footwear:
${footwear}

Pose:
${pose}

Location:
${location}

Background:
${background}

Property/environment:
${property}

Vehicle:
${vehicle}

Lighting:
${lighting}

Composition:
${composition}

Campaign:
${campaignType}

Environment detail:
${environmentDetail}

============================================================
CAMERA
============================================================

Authenticated camera entitlement:
${camera}

Lens:
${lens}

Realism:
${realism}

${planInstruction}

============================================================
MODEL REQUIREMENTS
============================================================

The model must clearly be an ADULT woman.

Create a realistic adult fashion model with natural human anatomy.

The model may be slim, athletic, curvy, plus-size or another
adult body type selected by the user.

Do not sexualize the subject.

Maintain believable body proportions.

Hands, fingers, arms, legs, feet and facial features must be
anatomically realistic.

Avoid distorted limbs, duplicated fingers, malformed hands,
warped faces or unnatural body proportions.

============================================================
FASHION PHOTOGRAPHY
============================================================

Create a polished professional fashion photograph.

Use realistic:
- lighting
- shadows
- reflections
- fabric folds
- material texture
- skin texture
- hair
- depth of field
- perspective
- environmental detail

The result should look like a real professional fashion campaign
photographed by an experienced fashion photographer.

Avoid:
- cartoon appearance
- illustration
- CGI appearance
- plastic skin
- mannequin appearance
- fake-looking fabric
- distorted clothing
- artificial anatomy
- excessive smoothing
- unrealistic lighting

============================================================
FINAL PRIORITY
============================================================

1. Preserve the uploaded garment.
2. Preserve garment colors and design details.
3. Preserve realistic human anatomy.
4. Follow the selected fashion/model/location settings.
5. Apply only the camera features permitted by the authenticated
   user's server-side entitlement.
6. Produce a professional photorealistic fashion image.

Never allow browser-supplied values such as:
premium=true,
realCamera=true,
tier=full,
plan=PRO_MONTHLY,
or userId
to grant additional privileges.

Generate the final fashion image from the uploaded clothing
reference.
`.trim();
}

/* =========================================================
   ENTITLEMENT HELPERS
   ========================================================= */

function entitlementFromStatus(status) {
  const active =
    status?.active === true;

  const plan =
    status?.plan ||
    null;

  const tier =
    status?.tier ||
    (plan === "PRO_MONTHLY"
      ? "full"
      : plan === "PRO_WEEKLY"
        ? "standard"
        : "free");

  return {
    proActive: active,
    plan,
    tier,
  };
}

function spendSucceeded(result) {
  if (!result) return false;

  if (result.reason) {
    return false;
  }

  if (result.success === false) {
    return false;
  }

  if (result.ok === false) {
    return false;
  }

  if (result.spent === false) {
    return false;
  }

  return true;
}

/* =========================================================
   MAIN HANDLER
   ========================================================= */

export default async function handler(req, res) {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate"
  );

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed.",
    });
  }

  let creditSpent = false;

  try {
    /* =====================================================
       1. SERVER-SIDE AUTHENTICATION
       ===================================================== */

    const user = await getAuthenticatedUser(req);

    if (!user?.id) {
      return res.status(401).json({
        success: false,
        error: "Authentication required. Please sign in again.",
      });
    }

    /*
     NEVER trust req.body.userId.
     The authenticated Supabase user ID is authoritative.
    */

    const userId = user.id;

    /* =====================================================
       2. REDIS
       ===================================================== */

    const redis = getRedisConfig();

    if (!redis) {
      return res.status(500).json({
        success: false,
        error:
          "Credit service is not configured. Please check the server environment variables.",
      });
    }

    /* =====================================================
       3. OPENAI
       ===================================================== */

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        success: false,
        error:
          "OpenAI image service is not configured on the server.",
      });
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    /* =====================================================
       4. REQUEST BODY
       ===================================================== */

    const body = getBody(req);

    const imageInput =
      body.imageBase64 ||
      body.image ||
      body.clothingImage ||
      body.uploadedImage ||
      body.garmentImage;

    if (!imageInput) {
      return res.status(400).json({
        success: false,
        error:
          "Please upload a clothing image before generating.",
      });
    }

    /* =====================================================
       5. CHECK AUTHENTICATED ENTITLEMENT
       ===================================================== */

    const initialStatus =
      await getProStatus(userId, redis);

    const initialEntitlement =
      entitlementFromStatus(initialStatus);

    /* =====================================================
       6. SPEND EXACTLY ONE CREDIT
       ===================================================== */

    const spent =
      await spendCredit(userId, redis);

    if (!spendSucceeded(spent)) {
      const reason =
        spent?.reason || "";

      if (
        reason === "no_pro_credits" ||
        spent?.upgradeRequired === true
      ) {
        return res.status(402).json({
          success: false,
          error:
            "Your OBITREND Pro credits are finished. Renew your Pro plan to continue.",
          code: "NO_PRO_CREDITS",
          proActive: true,
          plan:
            initialEntitlement.plan,
          tier:
            initialEntitlement.tier,
          upgradeRequired: true,
        });
      }

      if (
        reason === "no_free_credits" ||
        reason === "free_credits_exhausted"
      ) {
        return res.status(402).json({
          success: false,
          error:
            "Your free credits are finished. Upgrade to Pro to continue.",
          code: "NO_FREE_CREDITS",
          upgradeRequired: true,
        });
      }

      return res.status(402).json({
        success: false,
        error:
          spent?.error ||
          "You do not have enough credits to generate an image.",
        code:
          reason || "INSUFFICIENT_CREDITS",
      });
    }

    creditSpent = true;

    /* =====================================================
       7. READ ENTITLEMENT AGAIN
       This prevents the browser from determining the tier.
       ===================================================== */

    const finalStatus =
      await getProStatus(userId, redis);

    const finalEntitlement =
      entitlementFromStatus(finalStatus);

    /*
     If spendCredit itself returns authoritative entitlement
     information, use it only as a fallback.
    */

    const entitlement = {
      proActive:
        finalStatus?.active === true
          ? true
          : (
              spent?.proActive === true ||
              spent?.isPro === true ||
              spent?.source === "pro"
            ),

      plan:
        finalStatus?.plan ||
        spent?.plan ||
        null,

      tier:
        finalStatus?.tier ||
        spent?.tier ||
        "free",
    };

    /*
     If the final Redis status explicitly says the account is
     not Pro, it is not allowed to use a Pro-only camera.
    */

    if (finalStatus?.active === false) {
      entitlement.proActive = false;
      entitlement.plan = null;
      entitlement.tier = "free";
    }

    /* =====================================================
       8. PARSE GARMENT IMAGE
       ===================================================== */

    const image = parseImageInput(imageInput);

    /*
     Keep uploaded image size within a safe server boundary.
    */

    const maxImageBytes = 10 * 1024 * 1024;

    if (image.buffer.length > maxImageBytes) {
      await refundCredit(userId, redis);
      creditSpent = false;

      return res.status(413).json({
        success: false,
        error:
          "The clothing image is too large. Please choose a smaller image and try again.",
      });
    }

    /* =====================================================
       9. SECURE PROMPT
       Browser cannot grant itself Full Pro.
       ===================================================== */

    const prompt =
      buildSecurePrompt(
        body,
        entitlement
      );

    /* =====================================================
       10. SAFE IMAGE SIZE
       ===================================================== */

    const size =
      getSafeSize(
        body.aspectRatio ||
        body.ratio ||
        body.outputRatio
      );

    /* =====================================================
       11. SEND GARMENT TO OPENAI
       ===================================================== */

    const imageFile =
      await toFile(
        image.buffer,
        image.filename,
        {
          type: image.mime,
        }
      );

    let result;

    try {
      result =
        await openai.images.edit({
          model: MODEL,
          image: imageFile,
          prompt,
          size,
        });
    } catch (openaiError) {
      /*
       Refund the credit if OpenAI generation failed.
      */

      if (creditSpent) {
        try {
          await refundCredit(
            userId,
            redis
          );
          creditSpent = false;
        } catch (refundError) {
          console.error(
            "OBITREND CREDIT REFUND FAILED:",
            refundError
          );
        }
      }

      console.error(
        "OBITREND OPENAI IMAGE ERROR:",
        openaiError
      );

      const status =
        Number(openaiError?.status) || 502;

      if (status === 401) {
        return res.status(502).json({
          success: false,
          error:
            "The image service authentication is not configured correctly on the server.",
          code: "OPENAI_AUTH_ERROR",
        });
      }

      if (status === 429) {
        return res.status(503).json({
          success: false,
          error:
            "The image service is temporarily busy or unavailable. Your credit was returned.",
          code: "OPENAI_RATE_LIMIT",
        });
      }

      return res.status(502).json({
        success: false,
        error:
          "Image generation failed. Your credit was returned. Please try again.",
        code: "IMAGE_GENERATION_FAILED",
      });
    }

    /* =====================================================
       12. EXTRACT RESULT
       ===================================================== */

    const output =
      Array.isArray(result?.data)
        ? result.data
        : [];

    if (!output.length) {
      if (creditSpent) {
        try {
          await refundCredit(
            userId,
            redis
          );
          creditSpent = false;
        } catch (refundError) {
          console.error(
            "OBITREND CREDIT REFUND FAILED:",
            refundError
          );
        }
      }

      return res.status(502).json({
        success: false,
        error:
          "The image service returned no generated image. Your credit was returned.",
        code: "EMPTY_IMAGE_RESULT",
      });
    }

    /* =====================================================
       13. NORMALIZE OUTPUT
       ===================================================== */

    const images = [];

    for (const item of output) {
      if (item?.b64_json) {
        images.push(
          `data:image/png;base64,${item.b64_json}`
        );
      } else if (item?.url) {
        images.push(item.url);
      }
    }

    if (!images.length) {
      if (creditSpent) {
        try {
          await refundCredit(
            userId,
            redis
          );
          creditSpent = false;
        } catch (refundError) {
          console.error(
            "OBITREND CREDIT REFUND FAILED:",
            refundError
          );
        }
      }

      return res.status(502).json({
        success: false,
        error:
          "The image service returned an invalid image. Your credit was returned.",
        code: "INVALID_IMAGE_RESULT",
      });
    }

    /* =====================================================
       14. RETURN SUCCESS
       ===================================================== */

    const remaining =
      spent?.remaining ??
      spent?.creditsRemaining ??
      spent?.balance ??
      null;

    return res.status(200).json({
      success: true,

      images,

      imageUrl:
        images[0],

      generatedImage:
        images[0],

      creditSpent: true,

      remainingCredits:
        remaining,

      proActive:
        entitlement.proActive,

      plan:
        entitlement.plan,

      planTier:
        entitlement.tier,

      tier:
        entitlement.tier,

      /*
       These are SERVER-DERIVED values.
       Browser values are never echoed as authority.
      */

      features: {
        standardPro:
          entitlement.proActive === true,

        fullPro:
          entitlement.proActive === true &&
          (
            entitlement.tier === "full" ||
            entitlement.plan === "PRO_MONTHLY"
          ),

        advancedCamera:
          entitlement.proActive === true &&
          (
            entitlement.tier === "full" ||
            entitlement.plan === "PRO_MONTHLY"
          ),
      },
    });

  } catch (error) {
    console.error(
      "OBITREND GENERATE API ERROR:",
      error
    );

    /*
     If a credit was consumed but something unexpected failed,
     attempt to return it.
    */

    /*
     We need user/redis again safely for the refund.
     Authentication failure is handled without refund.
    */

    try {
      const user =
        await getAuthenticatedUser(req);

      if (creditSpent && user?.id) {
        const redis =
          getRedisConfig();

        if (redis) {
          await refundCredit(
            user.id,
            redis
          );

          creditSpent = false;
        }
      }
    } catch (refundError) {
      console.error(
        "OBITREND EMERGENCY REFUND ERROR:",
        refundError
      );
    }

    if (
      error?.message ===
      "No clothing image was supplied."
    ) {
      return res.status(400).json({
        success: false,
        error:
          "Please upload a clothing image before generating.",
      });
    }

    if (
      error?.message ===
      "Invalid clothing image format."
    ) {
      return res.status(400).json({
        success: false,
        error:
          "The uploaded clothing image format is invalid.",
      });
    }

    return res.status(500).json({
      success: false,
      error:
        "Something went wrong while preparing your generation. Please try again.",
      code: "GENERATION_SERVER_ERROR",
    });
  }
}
