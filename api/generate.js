const fs = require("fs");
const formidable = require("formidable");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const IMAGE_MODEL = process.env.OBITREND_IMAGE_MODEL || "gpt-image-2";

const first = v => Array.isArray(v) ? v[0] : v;
const str = v => String(first(v) ?? "").trim();

function dataUrlToImage(value) {
  if (!value || typeof value !== "string") return null;
  const m = value.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/i);
  if (!m) return null;
  const mime = m[1].toLowerCase() === "image/jpg" ? "image/jpeg" : m[1].toLowerCase();
  return { mime, buffer: Buffer.from(m[2].replace(/\s/g, ""), "base64"), name: `obitrend-reference.${mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg"}` };
}

function rawBase64ToImage(value) {
  if (!value || typeof value !== "string") return null;
  const s = value.replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/=]+$/.test(s)) return null;
  return { mime: "image/jpeg", buffer: Buffer.from(s, "base64"), name: "obitrend-reference.jpg" };
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let bytes = 0;
    req.on("data", chunk => {
      bytes += chunk.length;
      if (bytes > 18 * 1024 * 1024) return reject(new Error("Request too large."));
      body += chunk.toString("utf8");
    });
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error("Invalid JSON request body.")); }
    });
    req.on("error", reject);
  });
}

function readMultipart(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({ multiples: true, keepExtensions: true, maxFileSize: 18 * 1024 * 1024, allowEmptyFiles: false });
    form.parse(req, (err, fields, files) => err ? reject(err) : resolve({ fields, files }));
  });
}

function findFile(files = {}) {
  for (const key of ["garment", "image", "clothing", "clothingImage", "file", "photo", "upload", ...Object.keys(files)]) {
    const v = files[key];
    if (Array.isArray(v) && v[0]?.filepath) return v[0];
    if (v?.filepath) return v;
  }
  return null;
}

function field(fields, ...names) {
  for (const n of names) { const v = str(fields?.[n]); if (v) return v; }
  return "";
}

const pick = a => a[Math.floor(Math.random() * a.length)];
const scenes = {
  locations: ["luxury tropical beach resort", "premium hotel pool deck", "modern luxury hotel entrance", "high-end shopping district", "sunny European city street", "luxury rooftop overlooking a modern city", "high-end restaurant terrace", "stylish city cafe", "luxury villa garden", "exclusive yacht deck", "modern airport terminal", "beautiful coastal promenade", "luxury fashion boutique", "premium residential neighborhood"],
  lighting: ["natural bright daylight", "soft golden-hour sunlight", "cinematic evening light", "luxury editorial lighting", "soft overcast daylight", "warm sunset light", "realistic midday sunlight"],
  poses: ["natural standing fashion pose", "walking naturally toward the camera", "relaxed seated fashion pose", "casual resort pose", "confident editorial pose", "natural candid pose", "premium fashion campaign pose"],
  cameras: ["professional full-frame fashion photography", "premium commercial campaign photography", "85mm portrait-lens look with realistic depth of field", "50mm editorial fashion photography", "high-end lifestyle campaign photography"]
};

function buildPrompt(o) {
  const model = o.model || o.face || "photorealistic adult woman with natural facial features";
  const location = o.city ? `${o.city}${o.locationType ? `, ${o.locationType}` : ""}` : (o.locationType || pick(scenes.locations));
  return `OBITREND PHOTOREALISTIC FASHION MASTER PROMPT\n\nCreate ONE premium, photorealistic fashion photograph using the uploaded garment image as the PRIMARY AND STRICT VISUAL REFERENCE.\n\nABSOLUTE PRIORITY: GARMENT FIDELITY + PHOTOREALISM.\n\nThe final image must look like a genuine professional photograph captured in the physical world. Never make it an illustration, cartoon, anime image, painting, plastic CGI render, mannequin image, or synthetic-looking artwork.\n\nGARMENT SOURCE OF TRUTH:\nReproduce the SAME physical garment from the uploaded reference. Preserve its exact visible garment type, silhouette, construction, neckline, collar, sleeve shape and length, cuffs, hem, proportions, fabric texture, ribbing, seams, stitching, folds, colors, color blocking, stripes, patterns, graphics, embroidery, bows, logos, labels, artwork and the exact relative placement, scale and orientation of visible design elements.\n\nDO NOT redesign the garment. DO NOT substitute a similar garment. DO NOT invent missing garment details. DO NOT remove visible details. DO NOT change garment colors. DO NOT add belts, waistbands, buttons, pockets, collars, trim, stripes, panels, bows or decorations unless clearly present in the reference.\n\nThe clothing must look like the SAME garment being realistically worn, with believable fabric thickness, tension, folds, seams and shadows.\n\nHUMAN: Adult woman, ${model}. ${o.bodyType || "Natural realistic adult body proportions"}. Real skin texture, natural hair, realistic eyes, anatomically correct hands and fingers, realistic proportions and natural interaction with the garment.\n\nPOSE: ${o.pose || pick(scenes.poses)}\nFASHION DIRECTION: ${o.fashionStyle || o.style || "premium fashion campaign"}\nSCENE: ${location}\n${o.property ? `PROPERTY: ${o.property}\n` : ""}${o.vehicle ? `VEHICLE: ${o.vehicle}\n` : ""}LIGHTING: ${o.lighting || pick(scenes.lighting)}\nCAMERA: ${o.camera || pick(scenes.cameras)}\nCOMPOSITION: ${o.aspectRatio || o.ratio || "4:5 portrait"}\n${o.creativeDirection || o.creative ? `CREATIVE DIRECTION: ${o.creativeDirection || o.creative}\n` : ""}${o.prompt ? `USER REQUEST: ${o.prompt}\n` : ""}\nEvery person, garment, background, building, vehicle, water surface, furniture, glass, metal, skin, hair, shadow and reflection must be physically believable and photorealistic. Avoid waxy skin, distorted hands, extra fingers, warped objects, fake reflections, impossible shadows, duplicated objects, artificial backgrounds and CGI appearance.\n\nKeep the uploaded garment design unchanged even when changing the model, pose, location, lighting or campaign direction. Generate ONE polished commercial fashion photograph.`.trim();
}

function fail(res, status, error, details) {
  console.error("OBITREND:", error, details || "");
  return res.status(status).json({ success: false, error, details: process.env.NODE_ENV === "production" ? undefined : details });
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return fail(res, 405, "Method not allowed.");
  if (!OPENAI_API_KEY) return fail(res, 500, "OPENAI_API_KEY is not configured on Vercel.");

  let tempPath = null;
  try {
    const type = String(req.headers["content-type"] || "").toLowerCase();
    let fields = {}, image = null;

    if (type.includes("application/json")) {
      fields = await readJson(req);
      const candidate = fields.imageBase64 || fields.uploadedImage || fields.image || fields.clothingImage || fields.garment;
      image = dataUrlToImage(candidate) || rawBase64ToImage(candidate);
      if (!image) return fail(res, 400, "No valid clothing image was supplied. Send imageBase64 as a PNG, JPEG or WEBP data URL.");
    } else if (type.includes("multipart/form-data")) {
      const parsed = await readMultipart(req);
      fields = parsed.fields || {};
      const file = findFile(parsed.files || {});
      if (!file?.filepath) return fail(res, 400, "No clothing image was uploaded. Use the garment, image or file field.");
      tempPath = file.filepath;
      const mime = ["image/png", "image/webp", "image/jpeg", "image/jpg"].includes(String(file.mimetype).toLowerCase()) ? String(file.mimetype).toLowerCase().replace("image/jpg", "image/jpeg") : "image/jpeg";
      image = { mime, buffer: fs.readFileSync(file.filepath), name: file.originalFilename || "obitrend-reference.jpg" };
    } else {
      return fail(res, 415, "Unsupported request format. OBITREND expects JSON or multipart/form-data.");
    }

    if (!image?.buffer || image.buffer.length < 100) return fail(res, 400, "The clothing image is empty or invalid.");
    if (image.buffer.length > 18 * 1024 * 1024) return fail(res, 413, "The clothing image is too large. Please use an image under 18 MB.");

    const options = {
      prompt: field(fields, "prompt", "description"),
      model: field(fields, "model"), bodyType: field(fields, "bodyType", "body"), face: field(fields, "face"),
      pose: field(fields, "pose"), fashionStyle: field(fields, "fashionStyle", "style"), camera: field(fields, "camera"),
      locationType: field(fields, "locationType"), city: field(fields, "city"), property: field(fields, "property"),
      vehicle: field(fields, "vehicle"), lighting: field(fields, "lighting"), creativeDirection: field(fields, "creativeDirection", "creative"),
      aspectRatio: field(fields, "aspectRatio", "ratio") || "4:5 portrait"
    };

    const form = new FormData();
    form.append("model", IMAGE_MODEL);
    form.append("prompt", buildPrompt(options));
    form.append("quality", "high");
    form.append("size", "auto");
    form.append("output_format", "png");
    form.append("n", "1");
    form.append("image", new Blob([image.buffer], { type: image.mime }), image.name);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 110000);
    let response;
    try {
      response = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: form,
        signal: controller.signal
      });
    } finally { clearTimeout(timeout); }

    const text = await response.text();
    let result;
    try { result = text ? JSON.parse(text) : null; }
    catch { return fail(res, 502, "The image server returned an invalid response.", `HTTP ${response.status}: ${text.slice(0, 1000)}`); }

    if (!response.ok) {
      return fail(res, response.status, result?.error?.message || `Image generation failed with HTTP ${response.status}`, result);
    }

    const b64 = result?.data?.[0]?.b64_json || result?.data?.[0]?.base64 || result?.b64_json;
    if (!b64) return fail(res, 502, "The image server completed the request but returned no image data.", result);

    const dataUrl = `data:image/png;base64,${b64}`;
    return res.status(200).json({ success: true, image: dataUrl, imageUrl: dataUrl, generatedImage: dataUrl, b64_json: b64, mimeType: "image/png", model: IMAGE_MODEL, photorealistic: true, clothingPreservation: true });
  } catch (error) {
    return fail(res, 500, error?.name === "AbortError" ? "Image generation timed out. Please try again." : (error?.message || "Something went wrong while generating the fashion image."), error?.stack);
  } finally {
    if (tempPath) { try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (e) { console.error("Upload cleanup failed:", e); } }
  }
};
