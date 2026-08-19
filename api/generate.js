const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

function getBody(req) {
  if (req.body && typeof req.body === "object") return req.body;

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch (_) {}
  }

  return {};
}

function decodeImage(value) {
  if (!value || typeof value !== "string") return null;

  const match = value.match(
    /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i
  );

  if (match) {
    return {
      mimeType: match[1].toLowerCase().replace("jpg", "jpeg"),
      buffer: Buffer.from(match[2], "base64")
    };
  }

  if (/^[A-Za-z0-9+/=\s]+$/.test(value)) {
    return {
      mimeType: "image/jpeg",
      buffer: Buffer.from(value.replace(/\s/g, ""), "base64")
    };
  }

  return null;
}

function sizeForRatio(ratio) {
  switch (String(ratio || "")) {
    case "9:16":
      return "1024x1536";

    case "16:9":
      return "1536x1024";

    case "1:1":
      return "1024x1024";

    case "5:4":
      return "1024x1024";

    default:
      return "1024x1024";
  }
}

function buildPrompt(body) {
  const original = String(body.prompt || "").trim();
  const ratio = String(body.aspectRatio || "5:4");

  return `
OBITREND CLOTHING-PRESERVATION EDIT.

The uploaded image is the PRIMARY VISUAL SOURCE OF TRUTH for the garment.

Create a photorealistic fashion photograph showing the SAME GARMENT from
the uploaded reference realistically worn by the model.

GARMENT FIDELITY IS THE HIGHEST PRIORITY.

Preserve the garment as accurately as possible:

- exact garment type
- exact construction
- exact silhouette
- exact length
- exact proportions
- exact neckline
- exact sleeve length
- exact sleeve shape
- exact cuffs
- exact hem
- exact colors
- exact color blocking
- exact stripes
- exact patterns
- exact embroidery
- exact bows
- exact graphics
- exact artwork
- exact logos
- exact lettering
- exact seams
- exact stitching
- exact fabric texture
- exact ribbing
- exact decorative details
- exact placement of every visible detail

DO NOT redesign the garment.

DO NOT create a similar garment.

DO NOT replace the garment with another fashion item.

DO NOT change the garment's colors.

DO NOT change short sleeves into long sleeves.

DO NOT add sleeves.

DO NOT remove sleeves.

DO NOT add a collar.

DO NOT add a waistband.

DO NOT add a belt.

DO NOT add cuffs.

DO NOT add piping.

DO NOT add panels.

DO NOT add bows.

DO NOT add decoration that does not exist in the reference.

DO NOT remove details that exist in the reference.

DO NOT combine different garments together.

If several garments are visible in the uploaded reference,
select ONE garment only and reproduce that garment faithfully.
Do not combine colors, patterns or details from the other garments.

The surrounding products, books, bags, furniture and background
are NOT clothing and must not be incorporated into the garment.

ONLY change:

- model
- pose
- location
- lighting
- camera
- campaign styling

The garment itself must remain the same.

USER CAMPAIGN REQUEST:

${original}

Requested output ratio:

${ratio}

Create a professional photorealistic commercial fashion photograph.

Use realistic fabric folds.

Use realistic material texture.

Use realistic anatomy.

Use natural skin texture.

Use physically correct lighting.

Use realistic shadows.

Use realistic reflections.

The final result must look like a real photograph of the uploaded garment,
NOT a newly designed outfit.
`;
}

module.exports = async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  if (!OPENAI_API_KEY) {
    return res.status(500).json({
      error: "OPENAI_API_KEY is not configured"
    });
  }

  try {

    const body = getBody(req);

    const imageValue =
      body.imageBase64 ||
      body.image;

    const decoded = decodeImage(imageValue);

    if (!decoded || !decoded.buffer?.length) {
      return res.status(400).json({
        error:
          "No valid clothing image was received. Please upload the clothing photo again."
      });
    }

    /*
     * Vercel Functions have a request-body limit.
     * Keep uploaded images reasonably small.
     */

    if (decoded.buffer.length > 4 * 1024 * 1024) {
      return res.status(413).json({
        error:
          "Clothing image is too large. Please use a smaller or compressed photo under 4 MB."
      });
    }

    const form = new FormData();

    /*
     * HIGH-FIDELITY IMAGE EDIT
     */

    form.append(
      "model",
      "gpt-image-1.5"
    );

    form.append(
      "prompt",
      buildPrompt(body)
    );

    form.append(
      "input_fidelity",
      "high"
    );

    form.append(
      "quality",
      "high"
    );

    form.append(
      "size",
      sizeForRatio(body.aspectRatio)
    );

    form.append(
      "output_format",
      "png"
    );

    form.append(
      "n",
      "1"
    );

    form.append(
      "image",
      new Blob(
        [decoded.buffer],
        {
          type: decoded.mimeType
        }
      ),
      "obitrend-clothing-reference.jpg"
    );

    console.log(
      "OBITREND: actual uploaded clothing image received"
    );

    console.log(
      "OBITREND: high-fidelity clothing preservation ON"
    );

    const response = await fetch(
      "https://api.openai.com/v1/images/edits",
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${OPENAI_API_KEY}`
        },

        body: form
      }
    );

    const text =
      await response.text();

    let result;

    try {

      result =
        JSON.parse(text);

    } catch (_) {

      console.error(
        "OpenAI returned non-JSON:",
        text.slice(0, 1000)
      );

      return res.status(502).json({
        error:
          "OpenAI returned an unexpected response. Please try again."
      });
    }

    if (!response.ok) {

      console.error(
        "OpenAI image edit error:",
        result
      );

      return res.status(response.status).json({
        error:
          result?.error?.message ||
          "OpenAI image generation failed"
      });
    }

    const base64Image =
      result?.data?.[0]?.b64_json;

    if (!base64Image) {

      console.error(
        "No image returned:",
        result
      );

      return res.status(502).json({
        error:
          "OpenAI did not return an image. Please try again."
      });
    }

    const dataUrl =
      `data:image/png;base64,${base64Image}`;

    return res.status(200).json({

      success: true,

      image: dataUrl,

      imageUrl: dataUrl,

      b64_json: base64Image,

      mimeType: "image/png"

    });

  } catch (error) {

    console.error(
      "OBITREND generation error:",
      error
    );

    return res.status(500).json({
      error:
        error?.message ||
        "Something went wrong while generating the fashion image"
    });
  }
};
