import OpenAI from "openai";
import {
  spendCredit,
  refundCredit,
  getRedisConfig
} from "./credits.js";
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};

const MODEL =
  process.env.OPENAI_IMAGE_MODEL || "gpt-image-1.5";

/* =========================================================
   HELPERS
========================================================= */

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

function clean(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value).trim();
}

function normalizeBase64(input) {
  if (!input) return null;

  let value = String(input).trim();

  if (value.startsWith("data:image/")) {
    const comma = value.indexOf(",");

    if (comma !== -1) {
      value = value.slice(comma + 1);
    }
  }

  value = value.replace(/\s/g, "");

  if (value.length < 100) {
    return null;
  }

  return value;
}

function getMimeType(input) {
  const value = String(input || "");

  const match = value.match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,/i
  );

  if (match) {
    return match[1].toLowerCase();
  }

  return "image/jpeg";
}

function extensionFromMime(mime) {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";

  return "jpg";
}

function pick(array, seed) {
  let hash = 0;

  for (let i = 0; i < seed.length; i++) {
    hash =
      (hash << 5) -
      hash +
      seed.charCodeAt(i);

    hash |= 0;
  }

  return array[Math.abs(hash) % array.length];
}

/* =========================================================
   SCENE OPTIONS
========================================================= */

const locations = [
  "luxury beachfront resort",
  "premium five-star hotel entrance",
  "luxury hotel pool",
  "modern rooftop lounge",
  "high-end shopping district",
  "designer fashion boutique",
  "luxury restaurant terrace",
  "tropical beach club",
  "private yacht marina",
  "modern luxury apartment",
  "professional fashion showroom",
  "premium airport lounge",
  "European fashion boulevard",
  "modern African luxury hotel",
  "Dubai luxury boulevard",
  "Miami beachfront promenade",
  "Lagos upscale shopping district",
  "Abuja luxury hotel",
  "Paris-inspired fashion street",
  "London luxury street",
  "New York fashion district",
  "Milan fashion street",
  "luxury resort garden",
  "professional fashion studio",
];

const lightingStyles = [
  "clean natural daylight",
  "soft morning sunlight",
  "warm afternoon sunlight",
  "golden hour sunlight",
  "cinematic evening light",
  "bright editorial daylight",
  "soft luxury hotel lighting",
  "professional studio lighting",
];

const cameraStyles = [
  "professional full-frame fashion photography",
  "high-end commercial fashion photography",
  "premium editorial photography",
  "luxury ecommerce photography",
  "premium lifestyle campaign photography",
  "85mm fashion portrait photography",
  "50mm commercial fashion photography",
];

const poses = [
  "natural full-body standing fashion pose",
  "walking naturally toward the camera",
  "relaxed standing editorial pose",
  "natural seated fashion pose",
  "standing beside a pool",
  "walking through a premium shopping district",
  "relaxed luxury resort pose",
  "natural three-quarter fashion pose",
  "professional catalog pose",
];
/* =========================================================
   PRODUCT / GARMENT PRESENTATION MODES
========================================================= */

const presentationModes = [
  "professional fashion model wearing the exact uploaded garment",
  "luxury mannequin product display showing the exact uploaded garment",
  "premium hanging garment product photography",
  "professional boutique clothing display",
  "high-end ecommerce catalog product photography",
  "fashion showroom garment presentation",
  "clean studio garment photography on a mannequin",
  "front-facing garment product showcase",
  "multi-angle garment product presentation",
  "close-up garment detail photography"
];
/* =========================================================
   MASTER PHOTOREALISM PROMPT
========================================================= */

function buildPrompt(body) {
  const seed =
    clean(body.seed) ||
    `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;

  const model = clean(
    body.model,
    "a professional adult fashion model"
  );

  const bodyType = clean(
    body.bodyType,
    "natural realistic proportions"
  );

  const face = clean(
    body.face,
    "natural photorealistic adult face"
  );

  const pose =
    clean(body.pose) ||
    pick(poses, seed);

  const fashionStyle = clean(
    body.fashionStyle || body.style,
    "premium commercial fashion campaign"
  );

  const camera =
    clean(body.camera) ||
    pick(cameraStyles, seed);

  const locationType =
    clean(body.locationType);

  const city =
    clean(body.city);

  const property =
    clean(body.property);

  const vehicle =
    clean(body.vehicle);

  const lighting =
    clean(body.lighting) ||
    pick(lightingStyles, seed);

  const creativeDirection = clean(
    body.creativeDirection ||
      body.creative,
    "luxury professional fashion campaign"
  );
  const presentationMode =
    clean(body.presentationMode) ||
    pick(presentationModes, seed);
  const garmentSelection = clean(
    body.garmentSelection ||
      body.garmentFocus,
    "the main garment or outfit selected by the user"
  );
  const referenceHandling = `
REFERENCE IMAGE HANDLING — STRICT

The uploaded image may contain a mannequin, hanger, jewelry,
necklace, tag, store background, other clothing, hands, or
other objects.

Identify the ACTUAL GARMENT as the primary product.

MANNEQUIN ACCESSORIES ARE NOT PART OF THE GARMENT.

Do NOT transfer mannequin jewelry, necklaces, chains,
mannequin heads, mannequin bodies, hangers, clips, tags,
store fixtures, or unrelated background objects onto the
fashion model.

Only reproduce accessories when they are clearly attached
to or intentionally designed as part of the uploaded garment.

If a necklace is worn by a mannequin but is not physically
attached to the garment, DO NOT add that necklace to the
generated model.

If a hanger is visible, DO NOT reproduce the hanger.

If a mannequin is visible, use it only to understand the
garment's shape, construction, front, back, length and
proportions.

If multiple views of the same garment are visible, treat
them as additional reference views of ONE garment.

Use front and back views together when determining garment
construction.

The uploaded garment remains the exact physical product.

The model, background, lighting, pose and photography may
change, but the garment itself must remain faithful to the
reference.

PRODUCT PRESENTATION MODES:

The garment may be presented as:

- the exact garment worn naturally by a professional adult model
- the exact garment on a realistic mannequin
- the exact garment hanging professionally
- the exact garment displayed in a boutique
- the exact garment in ecommerce product photography
- the exact garment in a fashion showroom
- a clean front-facing product presentation
- a multi-angle product presentation
- a close-up garment-detail photograph

When a model is requested, use a realistic adult model.

When a mannequin/product presentation is requested, preserve
the garment itself and use the mannequin only as the display
method.

Never confuse the display method with the garment design.
VIRTUAL TRY-ON — GARMENT GEOMETRY LOCK

The uploaded garment is the fixed physical product.

Treat the reference garment as a cut-and-sewn real garment,
not as clothing style to reinterpret.

Transfer the actual garment onto the model without changing
its original geometry, proportions, construction or dimensions.

The model's body must conform to the garment.

DO NOT:
- taper the waist
- stretch the shirt
- enlarge the shirt
- shorten the shirt
- lengthen the shirt
- move the hem
- move the pocket
- change pocket size
- change button spacing
- change collar dimensions
- change sleeve dimensions
- change cuff dimensions
- change stripe spacing
- change stripe direction
- reshape the garment around the model

If the model is narrower, wider, taller, shorter, curvier,
or has a different pose, adjust the MODEL, NOT THE GARMENT.

The garment must retain the same physical silhouette,
length, width and construction shown in the reference.

GARMENT GEOMETRY HAS ABSOLUTE PRIORITY OVER BODY FIT.
`;
  const location =
    [
      locationType,
      city,
      property,
    ]
      .filter(Boolean)
      .join(", ") ||
    pick(locations, seed);

  return `
OBITREND AI FASHION CREATOR

PHOTOREALISTIC GARMENT-TO-MODEL MASTER STANDARD
${referenceHandling}
PRIMARY OBJECTIVE

Create one extremely photorealistic professional
fashion photograph using the uploaded clothing image
as the PRIMARY PHYSICAL GARMENT REFERENCE.

The uploaded garment is NOT merely inspiration.

Treat the uploaded garment as the actual physical
product that the model is wearing.

The generated image should look as if the exact same
physical garment was photographed on a real adult model
by a professional fashion photographer.

GARMENT FIDELITY IS THE HIGHEST PRIORITY.
=========================================================
STRICT GARMENT LOCK — DO NOT REINTERPRET THE PRODUCT
=========================================================

The uploaded clothing reference is the exact product that
must appear on the model.

DO NOT treat the reference as a style suggestion.

DO NOT redesign, restyle, reconstruct, extend, shorten,
reshape, reinterpret, or substitute the garment.

The garment must remain the SAME garment.
GARMENT DETAIL PRESERVATION — ABSOLUTE

Before generating the final image, inspect the uploaded garment
reference and preserve every visible physical construction detail.

The generated garment must retain:

- exact collar shape and collar size
- exact neckline
- exact button count and button placement
- exact button placket
- every visible pocket and its exact position
- pocket shape, size and orientation
- exact sleeve length
- exact cuff shape and cuff construction
- exact shoulder construction
- exact side seams
- exact hem shape
- exact garment length
- exact stripe direction
- exact stripe spacing and pattern
- exact colors and color relationships
- exact fabric texture
- exact stitching and seams
- exact folds and construction features that belong to the garment

A visible pocket in the reference MUST remain a visible pocket
in the generated garment.

Do NOT remove, hide, merge, simplify, relocate or invent pockets.

Do NOT remove buttons or change their spacing.

Do NOT replace the collar with another collar style.

Do NOT change long sleeves into short sleeves or vice versa.

Do NOT change the garment into a dress, tunic, jacket, blouse,
or another garment category.

BODY-FIT RULE:

Adapt the MODEL to the garment.

Never redesign the garment to fit the model.

If the model's pose causes folds or occlusion, preserve the
garment's actual construction and proportions rather than
inventing or removing garment details.

FINAL DETAIL VERIFICATION:

Before producing the final image, compare the generated garment
against the uploaded reference.

If any visible garment feature is missing or altered, prioritize
restoring that feature before completing the image.

GARMENT ACCURACY HAS PRIORITY OVER CREATIVE STYLING.
GARMENT LENGTH & PROPORTION LOCK — ABSOLUTE

The uploaded garment's original length and proportions are fixed.

Preserve the exact relationship between:

- shoulder and hem
- neckline and hem
- sleeve length and cuff
- chest width and waist width
- pocket position and hem
- button spacing and garment length

The garment must remain the same garment category and intended
silhouette regardless of the model's pose.

A shirt must remain a shirt.
A blouse must remain a blouse.
A top must remain a top.

Do NOT make a shirt appear to be a tunic, dress, oversized garment,
cropped garment, or elongated garment because of the model's pose.

Do NOT stretch the garment vertically.
Do NOT compress the garment vertically.
Do NOT widen or narrow the garment unnecessarily.
Do NOT move the hem.
Do NOT move pockets relative to the garment.
Do NOT change the distance between the collar, buttons, pockets,
cuffs and hem.

If the model is sitting, bending, walking, or posing, adapt the
MODEL'S BODY AND POSE to the garment rather than changing the
garment's original dimensions.

When a body part or pose temporarily hides part of the garment,
do not invent a new garment shape to compensate.

The garment's physical dimensions, silhouette and construction
remain locked to the uploaded reference.

FINAL PROPORTION CHECK:

Before completing the generation, verify that the garment still
has the same apparent length, width, silhouette and construction
as the uploaded reference.

GARMENT DIMENSIONS MUST NEVER BE SACRIFICED FOR POSE OR STYLING.
CRITICAL REQUIREMENT:

Preserve the exact original:

- garment type
- garment length
- garment width
- garment proportions
- neckline
- shoulder construction
- sleeve construction
- sleeve length
- cuff construction
- hemline
- side openings
- waist position
- front opening
- front panels
- ruffles
- pleats
- gathers
- ruching
- folds
- draping
- seams
- stitching
- pockets
- buttons
- zippers
- straps
- bows
- decorative elements
- prints
- patterns
- logos
- embroidery
- texture
- transparency
- color
- color distribution
VISUAL GARMENT IDENTITY LOCK — MAXIMUM FIDELITY:

The uploaded garment image is the definitive visual source of truth.

The garment shown on the generated model must match the reference garment as closely as physically possible.

Preserve the exact visual identity of the garment, including:
- exact silhouette and overall shape
- exact neckline geometry
- exact sleeve geometry and volume
- exact ruffle size, placement and layering
- exact gathering and ruching pattern
- exact front drape and hanging fabric
- exact hemline and garment boundaries
- exact proportions between all garment sections
- exact fabric transparency or opacity
- exact texture and surface appearance
- exact color tone, shading and color distribution
- exact construction details visible in the reference

REFERENCE-ONLY CHANGES ARE FORBIDDEN:

Do not create a "similar" garment.
Do not substitute another garment.
Do not redesign any garment detail.
Do not simplify complicated details.
Do not remove small details because they are difficult to reproduce.
Do not add details that are absent from the reference.
Do not change the garment's proportions to fit the model.
Do not automatically lengthen, shorten, tighten, loosen or reshape the garment.

If the model's body shape, pose or camera angle makes the garment difficult to reproduce, preserve the garment's original construction and proportions first.

The model must adapt to the garment — the garment must NOT adapt to the model.

GARMENT IDENTITY OVERRIDES CREATIVE INTERPRETATION.
============================================================
STRICT GARMENT SHAPE, LENGTH & PROPORTION LOCK
============================================================

The uploaded garment is the exact physical product.

The garment must remain visually identical to the reference
in shape, proportions, construction and length.

GARMENT LENGTH — ABSOLUTE RULE:

- Preserve the exact original garment length.
- Preserve the exact original hemline position.
- Preserve the exact distance from neckline to hem.
- Preserve the exact front and back hem shape.
- Never lengthen the garment.
- Never shorten the garment.
- Never turn a top into a tunic.
- Never turn a blouse into a dress.
- Never extend the garment below its original boundary.
- Never crop away any important part of the garment.
- Never invent additional fabric.

GARMENT WIDTH & SILHOUETTE:

- Preserve the original garment width.
- Preserve the original shoulder width.
- Preserve the original chest width.
- Preserve the original waist width.
- Preserve the original sleeve width.
- Preserve the original overall silhouette.
- Do not make the garment tighter unless the reference is tight.
- Do not make the garment oversized unless the reference is oversized.
- Do not make the garment slimmer, wider, longer or shorter.

CONSTRUCTION LOCK:

Preserve the exact:

- neckline
- shoulder construction
- sleeve construction
- sleeve length
- cuffs
- hemline
- side openings
- waist position
- front opening
- front panels
- ruffles
- pleats
- gathers
- ruching
- folds
- draping
- seams
- stitching
- pockets
- buttons
- zippers
- straps
- bows
- decorative elements
- prints
- patterns
- logos
- embroidery
- fabric texture
- transparency
- color
- color placement

IMPORTANT:

The model's body must adapt to the garment.

DO NOT adapt the garment to the model's body.

If the selected model has a different body shape, preserve the
garment's original proportions and construction rather than
stretching, shrinking, lengthening or redesigning the garment.

The garment must look like the same real-world product being
photographed on a different adult model.

REFERENCE-FIRST RULE:

When there is any conflict between the selected model, pose,
background, styling or creative direction and the uploaded
garment reference, ALWAYS prioritize the uploaded garment.

Creative direction may change:

- model
- pose
- camera angle
- background
- location
- lighting
- hairstyle
- accessories
- campaign mood

Creative direction MUST NOT change:

- garment design
- garment length
- garment proportions
- garment silhouette
- garment construction
- garment color
- garment details

FINAL GARMENT CHECK:

Before producing the image, mentally compare the generated
garment against the uploaded reference.

Verify:

1. Same garment type
2. Same length
3. Same width
4. Same neckline
5. Same sleeves
6. Same cuffs
7. Same hemline
8. Same ruffles
9. Same gathers
10. Same ruching
11. Same front construction
12. Same colors
13. Same patterns/details
14. Same overall silhouette

If any of these would change, correct the garment before
generating the final image.

If the reference is a blouse/top, it MUST remain a blouse/top.

If the reference is a shirt, it MUST remain a shirt.

If the reference is a skirt, it MUST remain a skirt.

If the reference is trousers, it MUST remain trousers.

If the reference is a dress, it MUST remain a dress.

If the reference contains layered ruffles, preserve the
same number, position, direction and approximate size of
those ruffles.

If the reference contains gathered fabric, preserve the
same gathered construction.

If the reference contains a distinctive hemline, preserve
that exact hemline.

The model's body must adapt to the garment.

The garment must NOT adapt to the creative scene.

Creative styling, model choice, location, vehicle,
lighting and photography must NEVER override garment
fidelity.

If there is any conflict between the creative direction
and the uploaded garment, ALWAYS choose the uploaded
garment.

GARMENT IDENTITY HAS HIGHER PRIORITY THAN SCENE CREATIVITY.
USER GARMENT FOCUS:

${garmentSelection}


=========================================================
REFERENCE GARMENT PRESERVATION
=========================================================

Carefully inspect the uploaded garment before generating.

Preserve the visible garment design as accurately as
possible.

PRESERVE:

- exact garment category
- exact garment silhouette
- exact proportions
- exact garment length
- exact hem shape
- exact neckline
- exact sleeve shape
- exact sleeve length
- exact straps
- exact cuffs
- exact waist construction
- exact gathering
- exact ruching
- exact draping
- exact seams
- exact stitching
- exact buttons
- exact pearls
- exact buckles
- exact zippers
- exact pockets
- exact belt construction
- exact fabric texture
- exact ribbing
- exact knit structure
- exact denim texture
- exact woven texture
- exact color
- exact color placement
- exact color blocking
- exact stripes
- exact patterns
- exact prints
- exact graphics
- exact embroidery
- exact bows
- exact decorative details
- exact visible logos
- exact placement of visible design elements
- exact orientation of visible design elements

DO NOT redesign the garment.

DO NOT create a similar garment.

DO NOT replace the garment.

DO NOT simplify the garment.

DO NOT invent missing details.

DO NOT change the garment color.

DO NOT change the garment pattern.

DO NOT add details that are not present.

DO NOT remove visible details.

DO NOT add:

- belts
- buttons
- pockets
- collars
- zippers
- stripes
- bows
- graphics
- embroidery
- decorative panels

unless they are actually present in the uploaded
reference.

The final garment must visually correspond to the
uploaded garment.

=========================================================
REAL FABRIC PHYSICS
=========================================================

The garment must behave like real physical fabric.

Use:

- realistic folds
- realistic wrinkles
- realistic tension
- realistic compression
- realistic seams
- realistic stitching
- realistic fabric thickness
- realistic draping
- realistic highlights
- realistic shadows
- realistic contact with the body

No melted fabric.

No plastic fabric.

No artificial fabric.

No floating clothing.

No distorted clothing.

=========================================================
MODEL PHOTOREALISM
=========================================================

The model must look like a real adult human.

Use:

- realistic skin texture
- realistic facial structure
- realistic eyes
- realistic hair
- realistic hair strands
- realistic hands
- anatomically correct fingers
- realistic body proportions
- realistic posture
- realistic skin lighting
- realistic clothing interaction

Do not create:

- mannequin appearance
- doll appearance
- plastic skin
- CGI character
- cartoon
- anime
- illustration
- painted appearance
- artificial 3D character

=========================================================
ENVIRONMENT PHOTOREALISM
=========================================================

Everything in the environment must look physically real.

Preserve realistic:

- buildings
- architecture
- furniture
- vehicles
- roads
- pavement
- glass
- metal
- plants
- water
- reflections
- shadows
- perspective
- depth
- scale

The environment must look like a real place photographed
with a professional camera.

=========================================================
PHOTOGRAPHY STANDARD
=========================================================

The final image must look like a genuine photograph.

Use:

- professional full-frame camera appearance
- realistic lens rendering
- realistic depth of field
- realistic exposure
- realistic focus
- realistic shadows
- realistic reflections
- natural skin texture
- professional fashion lighting
- realistic perspective

Avoid:

- CGI look
- 3D render look
- AI-looking plastic skin
- artificial background
- oversharpening
- unrealistic blur
- distorted anatomy

=========================================================
CAMPAIGN SETTINGS
=========================================================

MODEL:
${model}

BODY TYPE:
${bodyType}

FACE:
${face}

POSE:
${pose}

FASHION STYLE:
${fashionStyle}

LOCATION:
${location}

VEHICLE:
${vehicle || "none unless naturally appropriate"}

LIGHTING:
${lighting}

CAMERA:
${camera}

CREATIVE DIRECTION:
${creativeDirection}
PRESENTATION MODE:

${presentationMode}

The presentation mode controls how the uploaded garment is displayed.

If the presentation mode requests a professional fashion model:
- Show the exact uploaded garment naturally worn by the model.
- Preserve the garment's original design, proportions, construction, colors, patterns and details.
- Make the garment fit the model naturally without redesigning it.

If the presentation mode requests a mannequin or product display:
- Show the exact uploaded garment as the primary product.
- Use a realistic fashion mannequin or professional clothing display.
- Keep the garment clearly visible and unobstructed.

If the presentation mode requests a boutique, showroom or ecommerce presentation:
- Present the uploaded garment as a premium real-world fashion product.
- Keep the garment as the main visual subject.
- Use realistic professional retail/fashion photography.

If the presentation mode requests close-up garment detail:
- Show the garment prominently.
- Preserve visible fabric texture, stitching, seams, buttons, patterns, prints and construction.
- Do not crop away important garment details.

The presentation mode may change the method of displaying the garment, but it MUST NOT redesign, replace, simplify, recolor or alter the uploaded garment.
=========================================================
COMPOSITION
=========================================================

Show the garment clearly.

Do not crop away important garment details.

If the user requests a full-body image, show the complete
outfit naturally.

If the user requests a portrait or medium shot, make sure
the important garment details remain visible.

The model should naturally wear the garment.

=========================================================
ACCESSORIES
=========================================================

Accessories may be added only when compatible with the
selected campaign.

Accessories must never:

- replace the garment
- cover important garment details
- change the garment
- redesign the garment

=========================================================
TEXT
=========================================================

Do not add:

- captions
- watermarks
- labels
- artificial text
- promotional graphics

unless explicitly requested by the user.

=========================================================
FINAL QUALITY CHECK
=========================================================

Before returning the final image, prioritize:

1. Exact garment identity.
2. Exact garment colors.
3. Exact visible garment details.
4. Realistic garment construction.
5. Realistic fabric behavior.
6. Realistic adult model.
7. Realistic environment.
8. Professional photography.
9. Natural composition.

If any creative instruction conflicts with the uploaded
garment, ALWAYS preserve the uploaded garment.

The garment reference has priority over the creative scene.

FINAL RESULT:

A premium, believable, photorealistic fashion photograph
that looks like it was captured in the real world by a
professional fashion photographer.
`;
}

/* =========================================================
   IMAGE SIZE
========================================================= */

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
    ratio.includes("16:9") ||
    ratio.includes("landscape")
  ) {
    return "1536x1024";
  }

  return "1024x1536";
}

/* =========================================================
   MAIN API
========================================================= */

export default async function handler(req, res) {
  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed. Use POST.",
    });
  }

  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        ok: false,
        error:
          "OPENAI_API_KEY is missing from Vercel Environment Variables.",
      });
    }

    const body =
      typeof req.body === "object" &&
      req.body !== null
        ? req.body
        : {};
const userId = clean(
  getValue(body, "userId", "obitrendUserId")
);

if (!userId) {
  return res.status(400).json({
    ok: false,
    error: "A valid OBITREND user ID is required."
  });
}

const redis = getRedisConfig();
let creditSpent = false;

if (!redis.url || !redis.token) {
  return res.status(500).json({
    ok: false,
    error: "OBITREND credit system is not configured."
  });
}
    const rawImage = getValue(
      body,
      "imageBase64",
      "uploadedImage",
      "image",
      "clothingImage",
      "referenceImage"
    );

    const imageBase64 =
      normalizeBase64(rawImage);

    if (!imageBase64) {
      return res.status(400).json({
        ok: false,
        error:
          "No valid clothing image was received. Upload a JPG, PNG or WEBP clothing photo and try again.",
      });
    }

    const mime =
      getMimeType(rawImage);

    if (!mime.startsWith("image/")) {
      return res.status(400).json({
        ok: false,
        error:
          "The uploaded file is not a valid image.",
      });
    }

    const buffer =
      Buffer.from(
        imageBase64,
        "base64"
      );

    if (
      buffer.length >
      9 * 1024 * 1024
    ) {
      return res.status(413).json({
        ok: false,
        error:
          "The clothing image is too large. Please use an image under 9MB.",
      });
    }

    if (buffer.length < 1000) {
      return res.status(400).json({
        ok: false,
        error:
          "The uploaded image appears to be empty or corrupted.",
      });
    }

    const extension =
      extensionFromMime(mime);

    const imageFile = new File(
      [buffer],
      `obitrend-reference.${extension}`,
      {
        type: mime,
      }
    );

    const prompt =
      buildPrompt(body);

    const aspectRatio = clean(
      body.aspectRatio ||
        body.ratio,
      "4:5"
    );

    const size =
      getImageSize(aspectRatio);

    /*
      IMAGE EDIT MODE

      The uploaded garment is passed directly to the
      image editing model.

      High input fidelity is enabled to give the model
      stronger preservation of important input details.
    */
const creditResult = await spendCredit(userId, redis);

if (!creditResult.success) {
  return res.status(402).json({
    ok: false,
    error: "You have no OBITREND image generations remaining.",
    balance: creditResult.balance
  });
}

creditSpent = true;
    const result =
      await openai.images.edit({
        model: MODEL,

        image: imageFile,

        prompt,

        input_fidelity: "high",

        size,

        quality: "high",

        output_format: "jpeg",

        output_compression: 92,

        n: 1,
      });

    const image =
      result?.data?.[0];

    if (!image?.b64_json) {
  const responseKeys = Object.keys(image || {});

  const invalidImageError = new Error(
    "The image service returned an invalid image response."
  );

  invalidImageError.status = 502;
  invalidImageError.type = "invalid_image_response";
  invalidImageError.code = "MISSING_B64_JSON";
  invalidImageError.responseKeys = responseKeys;

  throw invalidImageError;
    }

    const imageUrl =
      `data:image/jpeg;base64,${image.b64_json}`;

    return res.status(200).json({
      ok: true,

      imageUrl,

      url: imageUrl,

      image: imageUrl,

      generatedImage:
        imageUrl,

      model: MODEL,

      aspectRatio,

      size,

      message:
        "OBITREND photorealistic fashion image generated successfully.",
    });

  } catch (error) {
    console.error(
      "OBITREND GENERATION ERROR:",
      error
    );
    if (creditSpent) {
      try {
        await refundCredit(userId, redis);
      } catch (refundError) {
        console.error(
          "OBITREND CREDIT REFUND ERROR:",
          refundError
        );
      }
    }

    const status =
      error?.status &&
      Number.isInteger(
        error.status
      )
        ? error.status
        : 500;

    let message =
      error?.message ||
      "The image generation service failed.";

    if (status === 401) {
      message =
        "OpenAI API authentication failed. Check OPENAI_API_KEY in Vercel.";
    }

    else if (status === 403) {
      message =
        "The OpenAI account or API key is not permitted to use this image service.";
    }

    else if (status === 429) {
      message =
        "OpenAI API rate or billing limit reached. Check your OpenAI API usage and billing.";
    }

    else if (status >= 500) {
      message =
        "The image service temporarily failed. Please try again.";
    }

    return res.status(status).json({
      ok: false,

      error: message,

      diagnostic: {
        status,

        model: MODEL,

        type:
          error?.type || null,

        code:
          error?.code || null,

        name:
          error?.name || null,
      },
    });
  }
}
