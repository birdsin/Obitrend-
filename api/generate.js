import OpenAI, { toFile } from "openai";

import {
  spendCredit,
  refundCredit,
  getProStatus,
  getRedisConfig,
} from "./credits.js";

/*
=========================================================
OBITREND AI FASHION CREATOR
COMPLETE api/generate.js REPLACEMENT

SAFE COMPATIBILITY VERSION

Keeps:
- existing index.html
- existing upload system
- existing credits.js
- existing Pro system
- existing Paystack system
- existing response format
- one image per Generate click

MAIN FEATURES:
- Universal garment preservation
- Works with garment collages
- Works with front/back views
- Works with garments on mannequins
- Works with garments worn by people
- Works with shirts, trousers, dresses, jeans, skirts,
  jackets, suits, shorts, traditional clothing, etc.
- Removes logos/branding/watermarks from generated image
- Uses uploaded garment as primary reference
- Prevents generic outfit substitution
- Handles 4:5, 5:4, 9:16, 16:9 and 1:1
- Robustly accepts imageBase64 from current index.html
- One generation per request to reduce timeout risk
=========================================================
*/


/* =========================================================
   VERCEL
========================================================= */

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "12mb",
    },
  },
};

export const maxDuration = 60;


/* =========================================================
   OPENAI
========================================================= */

const MODEL =
  process.env.OPENAI_IMAGE_MODEL ||
  "gpt-image-2";


const IMAGE_QUALITY =
  "medium";


const MAX_IMAGE_BYTES =
  9 * 1024 * 1024;


const openai =
  new OpenAI({
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
  for (
    const name of names
  ) {
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


/*
Accept JSON body even if the platform gives us a string.
This is important for keeping the endpoint compatible with
different Vercel runtime/body-parser behaviour.
*/
function normalizeBody(
  rawBody
) {
  if (
    rawBody &&
    typeof rawBody === "object"
  ) {
    return rawBody;
  }

  if (
    typeof rawBody === "string"
  ) {
    try {
      const parsed =
        JSON.parse(rawBody);

      if (
        parsed &&
        typeof parsed === "object"
      ) {
        return parsed;
      }
    } catch {
      return {};
    }
  }

  return {};
}


/* =========================================================
   IMAGE INPUT
========================================================= */

function normalizeBase64(
  input
) {
  if (!input) {
    return null;
  }

  let value =
    String(input).trim();


  /*
  Accept:
  data:image/jpeg;base64,....
  data:image/png;base64,....
  data:image/webp;base64,....
  AND raw base64.
  */

  const comma =
    value.indexOf(",");


  if (
    value.startsWith(
      "data:image/"
    ) &&
    comma !== -1
  ) {
    value =
      value.slice(
        comma + 1
      );
  }


  /*
  Remove whitespace.
  */
  value =
    value.replace(
      /\s/g,
      ""
    );


  /*
  Make sure something meaningful
  was actually received.
  */
  if (
    value.length < 100
  ) {
    return null;
  }


  return value;
}


/* =========================================================
   MIME TYPE
========================================================= */

function getMimeType(
  input
) {
  const value =
    String(
      input || ""
    );


  if (
    value.startsWith(
      "data:image/png"
    )
  ) {
    return "image/png";
  }


  if (
    value.startsWith(
      "data:image/webp"
    )
  ) {
    return "image/webp";
  }


  if (
    value.startsWith(
      "data:image/jpeg"
    ) ||
    value.startsWith(
      "data:image/jpg"
    )
  ) {
    return "image/jpeg";
  }


  /*
  Current index.html converts uploaded
  images to JPEG during compression.
  */
  return "image/jpeg";
}


/* =========================================================
   EXTENSION
========================================================= */

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
      "4:5"
    ).toLowerCase();


  /*
  Current index.html:
  4:5 Portrait
  */
  if (
    ratio.includes("4:5") ||
    ratio.includes("portrait")
  ) {
    return "1024x1536";
  }


  /*
  9:16 Story
  */
  if (
    ratio.includes("9:16")
  ) {
    return "1024x1536";
  }


  /*
  1:1 Square
  */
  if (
    ratio.includes("1:1") ||
    ratio.includes("square")
  ) {
    return "1024x1024";
  }


  /*
  5:4 Landscape
  */
  if (
    ratio.includes("5:4") ||
    ratio.includes("landscape")
  ) {
    return "1536x1024";
  }


  /*
  16:9 Landscape
  */
  if (
    ratio.includes("16:9")
  ) {
    return "1536x1024";
  }


  /*
  Safe default for current app.
  */
  return "1024x1536";
}


/* =========================================================
   USER ID
========================================================= */

function getUserId(
  body,
  req
) {
  const supplied =
    getValue(
      body,
      "userId",
      "uid",
      "clientId"
    );


  if (
    supplied
  ) {
    return clean(
      supplied
    )
      .replace(
        /[^a-zA-Z0-9_-]/g,
        ""
      )
      .slice(
        0,
        100
      );
  }


  const header =
    clean(
      req?.headers?.[
        "x-obitrend-user-id"
      ] || ""
    )
      .replace(
        /[^a-zA-Z0-9_-]/g,
        ""
      )
      .slice(
        0,
        100
      );


  return (
    header ||
    "guest"
  );
}


/* =========================================================
   REDIS
========================================================= */

function getRedisOrNull() {
  try {
    const redis =
      getRedisConfig();

    if (
      redis?.url &&
      redis?.token
    ) {
      return redis;
    }

    return null;

  } catch {
    return null;
  }
}


/* =========================================================
   PRO
========================================================= */

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


/* =========================================================
   CREDIT
========================================================= */

async function useCredit(
  userId,
  pro,
  redis
) {
  /*
  Pro users do not use the free credit counter.
  */
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


/* =========================================================
   UNIVERSAL GARMENT PROMPT
========================================================= */

function buildPrompt(
  body
) {

  const model =
    clean(
      getValue(
        body,
        "model"
      ),
      "professional adult fashion model"
    );


  const gender =
    clean(
      getValue(
        body,
        "gender"
      ),
      "woman"
    );


  const ageGroup =
    clean(
      getValue(
        body,
        "ageGroup"
      ),
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
      getValue(
        body,
        "face"
      ),
      "natural elegant fashion beauty"
    );


  const pose =
    clean(
      getValue(
        body,
        "pose"
      ),
      "standing confidently"
    );


  const footwear =
    clean(
      getValue(
        body,
        "footwear"
      ),
      "footwear appropriate for the garment"
    );


  const clothingType =
    clean(
      getValue(
        body,
        "clothingType"
      ),
      "auto detect from uploaded reference"
    );


  const clothingStyle =
    clean(
      getValue(
        body,
        "clothingStyle"
      ),
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


  /* =======================================================
     AGE-SAFE MODEL DIRECTION
  ======================================================= */

  let ageInstruction = "";


  if (
    ageGroup ===
      "toddler_girl" ||
    ageGroup ===
      "toddler_boy"
  ) {

    ageInstruction = `

CHILD-SAFE TODDLER MODE.

The main subject is a realistic toddler approximately
1–3 years old.

Use only age-appropriate children's clothing,
footwear and family-friendly presentation.

Do not use adult glamour styling.
Do not use provocative posing.
Do not sexualize the child.

The uploaded garment must be suitable for the child.
`;

  }

  else if (
    ageGroup ===
      "teen_girl" ||
    ageGroup ===
      "teen_boy"
  ) {

    ageInstruction = `

TEEN MODE.

The main subject is a realistic teenager aged 13–17.

Use age-appropriate fashion presentation.

Do not sexualize the teenager.
Do not use adult glamour styling.
Do not use provocative posing.

`;

  }

  else {

    ageInstruction = `

ADULT MODE.

The main subject is an adult fashion model aged 18+.

Use professional fashion photography and realistic
adult anatomy.

`;

  }


  /* =======================================================
     COMPANION
  ======================================================= */

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


  /* =======================================================
     COLOUR
  ======================================================= */

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

If a new colour was selected, recolour the SAME
uploaded garment while preserving its construction,
pattern and material.

Do not use colour selection as permission to redesign
the garment.

`;


  /* =======================================================
     LOCATION
  ======================================================= */

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
    backgroundPreset ||
    locationText ||
    "luxury fashion studio";
  
  /* =======================================================
     MASTER PROMPT
  ======================================================= */

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
UPLOADED IMAGE MAY BE A COLLAGE
=========================================================

The uploaded reference may contain:

- one garment
- multiple garments
- multiple colours
- front view
- back view
- side view
- garment on mannequin
- garment on hanger
- garment laid flat
- garment worn by another person
- product photography
- fashion model photography
- a collage containing several views

Analyze ALL useful garment views.

If several panels show the same garment, combine those
views to understand the garment's construction.

The reference person's face, body, hairstyle, pose and
background are NOT the target.

The GARMENT is the target.

=========================================================
UNIVERSAL GARMENT IDENTIFICATION
=========================================================

Identify the actual uploaded garment before generating.

It may be:

shirt,
blouse,
T-shirt,
polo,
tank top,
singlet,
crop top,
sweater,
hoodie,
jacket,
blazer,
coat,
cardigan,
dress,
gown,
jumpsuit,
romper,
skirt,
mini skirt,
midi skirt,
maxi skirt,
trousers,
pants,
jeans,
baggy jeans,
wide-leg jeans,
skinny jeans,
cargo pants,
shorts,
baggy shorts,
Capri pants,
leggings,
suit,
tracksuit,
traditional clothing,
African clothing,
kaftan,
agbada,
two-piece outfit,
three-piece outfit,
sportswear,
formalwear,
streetwear,
or any other garment.

Do NOT assume the garment is a shirt.

Do NOT assume the garment is a dress.

Do NOT assume the garment is a suit.

Identify it from the uploaded image.

=========================================================
GARMENT PRESERVATION
=========================================================

Preserve the uploaded garment's:

- exact garment category
- silhouette
- cut
- proportions
- length
- width
- neckline
- collar
- shoulder construction
- sleeves
- sleeve length
- cuffs
- waist shaping
- darts
- seams
- stitching
- panels
- pockets
- buttons
- button placement
- zipper placement
- closures
- straps
- ties
- belts if present
- pleats
- gathers
- ruching
- folds
- draping
- hem
- slits
- side openings
- fabric texture
- fabric weight
- material appearance
- stripes
- checks
- patterns
- prints
- embroidery
- decorative construction
- distinctive design details

=========================================================
PATTERN PRESERVATION
=========================================================

If the garment contains stripes:

Preserve stripe direction,
stripe spacing,
stripe density
and overall stripe appearance.

If the garment contains checks:

Preserve the check structure,
scale
and overall visual arrangement.

If the garment contains prints:

Preserve the overall print character and placement.

If the garment contains pleats, gathers or ruching:

Preserve those construction details.

If the garment contains buttons:

Preserve their visible position and approximate count.

If the garment contains pockets:

Preserve their position and shape.

=========================================================
NO LOGOS / NO BRANDING
=========================================================

VERY IMPORTANT.

The FINAL generated image must contain:

NO LOGOS.

NO BRAND NAMES.

NO TRADEMARKS.

NO LABELS.

NO WATERMARKS.

NO SIGNATURES.

NO SOCIAL MEDIA HANDLES.

NO ADVERTISING TEXT.

If branding is visible in the uploaded reference:

REMOVE THE BRANDING.

Keep the garment itself.

For example, if the uploaded shirt has a logo:

remove the logo but preserve:

- shirt shape
- collar
- sleeves
- buttons
- fabric
- colour
- pattern
- pockets
- seams
- construction

Do NOT replace the shirt because of the logo.

=========================================================
NO RE-DESIGN
=========================================================

NEVER:

- redesign the uploaded garment
- invent a different outfit
- replace it with similar clothing
- turn a shirt into a dress
- turn a shirt into a jumpsuit
- turn trousers into a skirt
- turn jeans into formal trousers
- turn a jacket into another jacket
- change the neckline unnecessarily
- change the sleeve construction
- remove important pockets
- add random pockets
- add random buttons
- add random belts
- remove important buttons
- change distinctive construction
- create a generic cream outfit
- create a generic white outfit
- create a generic beige outfit
- create a generic luxury outfit

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
SELECTED CLOTHING CONTROLS
=========================================================

Clothing Type:
${clothingType}

Clothing Style:
${clothingStyle}

Fashion Style:
${fashionStyle}

${colourInstruction}

These controls describe how the uploaded garment should
be presented.

They do NOT override the uploaded garment.

=========================================================
COMPANION
=========================================================

${companionInstruction}

=========================================================
LOCATION
=========================================================

${backgroundText}

Vehicle:
${vehicle}

Use the selected environment for the campaign.

The environment must NEVER change the garment.

=========================================================
CAMERA
=========================================================

Camera:
${camera}

Lighting:
${lighting}

Aspect Ratio:
${ratio}

Create:

- professional commercial fashion photography
- realistic camera perspective
- realistic depth of field
- realistic exposure
- realistic shadows
- realistic highlights
- realistic reflections
- realistic skin texture
- realistic fabric texture
- realistic materials
- premium fashion editorial quality

=========================================================
PHOTOREALISM
=========================================================

The result must look like a real photograph.

Use:

- realistic adult anatomy
- realistic hands
- realistic fingers
- realistic face
- realistic hair
- realistic skin
- realistic feet
- realistic body proportions
- realistic garment fit
- realistic fabric folds
- realistic shadows
- realistic lighting
- realistic environment

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
- distorted face
- warped garment
- random text
- fake logos
- watermarks
- brand names

=========================================================
GARMENT VISIBILITY
=========================================================

The garment must be clearly visible.

Do not hide important parts of the garment behind:

- hands
- bags
- furniture
- vehicles
- other people
- excessive cropping
- objects

Use a natural fashion pose that allows the garment to
be inspected clearly.

The garment must realistically fit the model.

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

Priority order:

1. Uploaded garment identity
2. Uploaded garment construction
3. Uploaded garment pattern
4. Uploaded garment colour
5. Uploaded garment details
6. Remove logos and branding
7. Realistic garment fit
8. Model
9. Pose
10. Footwear
11. Location
12. Vehicle
13. Camera
14. Lighting
15. Campaign styling

If anything conflicts with the uploaded garment:

PRESERVE THE UPLOADED GARMENT.

The final result must show the selected model actually
wearing the uploaded garment.

NO REPLACEMENT OUTFIT.

NO GENERIC OUTFIT.

NO LOGO.

NO BRAND NAME.

NO WATERMARK.

Generate ONE photorealistic image.

`;
}


/* =========================================================
   OPENAI GENERATION
========================================================= */

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


  if (
    !buffer.length
  ) {
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


  /*
  GPT-Image-2 supports image editing and image inputs.
  */

  const result =
    await openai.images.edit({

      model:
        MODEL,

      image:
        file,

      prompt:
        prompt,

      size:
        size,

      quality:
        IMAGE_QUALITY,

      output_format:
        "png",

    });


  const base64 =
    result?.data?.[0]?.b64_json;


  if (
    !base64
  ) {
    throw new Error(
      "OpenAI did not return an image."
    );
  }


  return (
    "data:image/png;base64," +
    base64
  );
}


/* =========================================================
   API HANDLER
========================================================= */

export default async function handler(
  req,
  res
) {

  /* =======================================================
     METHOD
  ======================================================= */

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


  /* =======================================================
     API KEY
  ======================================================= */

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


  try {

    /* =====================================================
       NORMALIZE REQUEST BODY
    ===================================================== */

    const body =
      normalizeBody(
        req.body
      );


    /*
    Current index.html sends:
    
    {
      imageBase64: uploadedImage,
      userId: userId,
      ...
    }

    This is the primary field.
    */

    let imageInput =
      getValue(
        body,
        "imageBase64",
        "uploadedImage",
        "image",
        "clothingImage",
        "referenceImage"
      );


    /*
    Extra compatibility:
    some clients may send the image inside
    body.data or body.input.
    */

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


    /* =====================================================
       NORMALIZE IMAGE
    ===================================================== */

    const imageBase64 =
      normalizeBase64(
        imageInput
      );


    /*
    THIS IS THE FIX FOR:

    "Please upload a clothing image first."

    The current frontend sends imageBase64.
    This backend now accepts that exact value.
    */

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


    /* =====================================================
       USER
    ===================================================== */

    const userId =
      getUserId(
        body,
        req
      );


    /* =====================================================
       REDIS
    ===================================================== */

    const redis =
      getRedisOrNull();


    /* =====================================================
       PRO
    ===================================================== */

    const pro =
      await isProUser(
        userId,
        redis
      );


    /* =====================================================
       CREDIT
    ===================================================== */

    const credit =
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


    /* =====================================================
       PROMPT
    ===================================================== */

    const prompt =
      buildPrompt(
        body
      );


    /* =====================================================
       SIZE
    ===================================================== */

    const size =
      getImageSize(

        getValue(
          body,
          "aspectRatio",
          "ratio"
        )

      );


    /* =====================================================
       GENERATE ONE IMAGE
       
       IMPORTANT:
       Current index.html requests one image.
       We intentionally generate ONE image here.

       This avoids the previous Vercel timeout problem
       caused by multiple sequential image generations.
    ===================================================== */

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

      /*
      Refund the free credit when generation fails.
      */

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


    /* =====================================================
       SUCCESS
    ===================================================== */

    return res.status(
      200
    ).json({

      success: true,

      ok: true,

      model:
        MODEL,

      /*
      Existing frontend supports these fields.
      */

      image:
        imageUrl,

      imageUrl:
        imageUrl,

      url:
        imageUrl,

      generatedImage:
        imageUrl,

      /*
      Existing gallery expects images[].
      */

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
