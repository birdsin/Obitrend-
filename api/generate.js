/*
 * OBITREND AI FASHION CREATOR
 * api/generate.js
 *
 * Handles:
 *   GET  /api/generate  -> returns OBITREND options
 *   POST /api/generate  -> generates a fashion image with OpenAI
 *
 * IMPORTANT:
 * OPENAI_API_KEY must be stored in your Vercel Environment Variables.
 */

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "12mb"
    }
  }
};

export const maxDuration = 60;


/* =========================================================
   OBITREND OPTIONS
   ========================================================= */

const options = {

  model: [
    "Luxury lifestyle model",
    "Elegant fashion model",
    "African fashion model",
    "Editorial runway model",
    "High-fashion model",
    "Commercial fashion model",
    "Street style model",
    "Luxury campaign model",
    "Beauty campaign model",
    "Sports fashion model",
    "Resort fashion model",
    "Bridal fashion model",
    "Evening fashion model",
    "Urban fashion model",
    "Professional business model",
    "Casual lifestyle model",
    "Premium catalog model",
    "Influencer fashion model",
    "Magazine cover model",
    "Luxury travel model"
  ],

  body: [
    "Slim fashion model",
    "Curvy fashion model",
    "Athletic fashion model",
    "Petite fashion model",
    "Tall fashion model",
    "Plus-size fashion model",
    "Elegant feminine figure",
    "Hourglass fashion figure",
    "Fit athletic figure",
    "Natural body proportions",
    "Petite elegant figure",
    "Tall elegant figure"
  ],

  style: [
    "Luxury fashion",
    "Streetwear",
    "High fashion",
    "Editorial",
    "Casual chic",
    "Business fashion",
    "Evening glamour",
    "Resort fashion",
    "Beach fashion",
    "Sportswear",
    "Athleisure",
    "Wedding fashion",
    "Party fashion",
    "Urban fashion",
    "Minimalist fashion",
    "African luxury fashion",
    "Contemporary fashion",
    "Red carpet fashion",
    "Travel fashion",
    "Summer fashion",
    "Winter fashion",
    "Denim fashion",
    "Classic elegance",
    "Modern luxury"
  ],

  fashionStyle: [
    "Luxury fashion",
    "Streetwear",
    "High fashion",
    "Editorial",
    "Casual chic",
    "Business fashion",
    "Evening glamour",
    "Resort fashion",
    "Beach fashion",
    "Sportswear",
    "Athleisure",
    "Wedding fashion",
    "Party fashion",
    "Urban fashion",
    "Minimalist fashion",
    "African luxury fashion",
    "Contemporary fashion",
    "Red carpet fashion",
    "Travel fashion",
    "Summer fashion",
    "Winter fashion",
    "Denim fashion",
    "Classic elegance",
    "Modern luxury"
  ],

  location: [
    "Luxury hotel",
    "Luxury resort",
    "Luxury compound",
    "Modern apartment",
    "Luxury penthouse",
    "Fashion studio",
    "Photography studio",
    "Coffee shop",
    "Beach resort",
    "Private beach",
    "Swimming pool",
    "Luxury playground",
    "Football stadium",
    "Basketball court",
    "Tennis court",
    "City street",
    "Luxury boulevard",
    "Downtown city",
    "Airport",
    "Private jet lounge",
    "Marina",
    "Park",
    "Garden",
    "Desert resort",
    "Mountain resort",
    "Nightclub",
    "Concert venue",
    "Fashion runway",
    "Photography studio",
    "Art gallery",
    "Museum",
    "Modern office",
    "Business district"
  ],

  vehicle: [
    "No vehicle",
    "Mercedes-Benz G-Wagon",
    "Mercedes-Benz S-Class",
    "Range Rover",
    "Range Rover Sport",
    "Lamborghini Urus",
    "Lamborghini Aventador",
    "Ferrari",
    "Porsche 911",
    "Bentley Continental",
    "Rolls-Royce",
    "BMW 7 Series",
    "BMW X7",
    "Audi Q8",
    "Cadillac Escalade",
    "Tesla Model S",
    "Tesla Model X",
    "Luxury SUV",
    "Luxury sports car",
    "Private jet",
    "Luxury yacht"
  ],

  store: [
    "No store",
    "Luxury fashion boutique",
    "Designer clothing store",
    "High-end shopping mall",
    "Premium department store",
    "Jewelry boutique",
    "Shoe boutique",
    "Designer handbag store",
    "Beauty store",
    "Cosmetics boutique",
    "Sports fashion store",
    "Streetwear store",
    "African fashion boutique",
    "Luxury lifestyle store",
    "Fashion showroom",
    "Designer showroom"
  ],

  lighting: [
    "Natural daylight",
    "Golden hour",
    "Soft studio lighting",
    "Luxury studio lighting",
    "Bright fashion lighting",
    "Cinematic lighting",
    "Warm evening light",
    "Sunset lighting",
    "Sunrise lighting",
    "Neon city lighting",
    "Night luxury lighting",
    "Soft window light",
    "Editorial lighting",
    "High-key fashion lighting",
    "Dramatic fashion lighting"
  ],

  imageFormat: [
    "Portrait — 1024 × 1536",
    "Landscape — 1536 × 1024",
    "Square — 1024 × 1024"
  ],

  camera: [
    "Professional fashion camera",
    "Full-body fashion photography",
    "Editorial photography",
    "Luxury campaign photography",
    "Magazine photography",
    "Cinematic photography",
    "Studio photography",
    "Street photography"
  ],

  mood: [
    "Luxury",
    "Elegant",
    "Confident",
    "Sophisticated",
    "Energetic",
    "Relaxed",
    "Glamorous",
    "Modern",
    "Powerful",
    "Romantic",
    "Professional",
    "Youthful"
  ],

  country: [
    "Nigeria",
    "Ghana",
    "South Africa",
    "Egypt",
    "Kenya",
    "Morocco",
    "United States",
    "United Kingdom",
    "France",
    "Italy",
    "Spain",
    "United Arab Emirates",
    "Qatar",
    "Saudi Arabia",
    "Turkey",
    "Greece",
    "Brazil",
    "Canada",
    "Australia",
    "Japan",
    "South Korea",
    "Singapore",
    "Thailand",
    "Switzerland",
    "Germany"
  ],

  city: [
    "Lagos",
    "Abuja",
    "Port Harcourt",
    "Ibadan",
    "Benin City",
    "Enugu",
    "Kano",
    "Accra",
    "Kumasi",
    "Takoradi",
    "Johannesburg",
    "Cape Town",
    "Durban",
    "Pretoria",
    "Cairo",
    "Alexandria",
    "Giza",
    "Sharm El Sheikh",
    "Nairobi",
    "Mombasa",
    "Kisumu",
    "Casablanca",
    "Marrakesh",
    "Rabat",
    "Tangier",
    "New York",
    "Los Angeles",
    "Miami",
    "Las Vegas",
    "Chicago",
    "Atlanta",
    "London",
    "Manchester",
    "Birmingham",
    "Liverpool",
    "Paris",
    "Nice",
    "Lyon",
    "Marseille",
    "Milan",
    "Rome",
    "Florence",
    "Venice",
    "Barcelona",
    "Madrid",
    "Seville",
    "Valencia",
    "Dubai",
    "Abu Dhabi",
    "Sharjah",
    "Doha",
    "Riyadh",
    "Jeddah",
    "Istanbul",
    "Ankara",
    "Athens",
    "Santorini",
    "Mykonos",
    "Rio de Janeiro",
    "São Paulo",
    "Toronto",
    "Vancouver",
    "Montreal",
    "Sydney",
    "Melbourne",
    "Brisbane",
    "Tokyo",
    "Osaka",
    "Kyoto",
    "Seoul",
    "Busan",
    "Singapore",
    "Bangkok",
    "Phuket",
    "Zurich",
    "Geneva",
    "Berlin",
    "Munich",
    "Frankfurt"
  ]
};


/* =========================================================
   CITIES BY COUNTRY
   ========================================================= */

const citiesByCountry = {
  Nigeria: [
    "Lagos",
    "Abuja",
    "Port Harcourt",
    "Ibadan",
    "Benin City",
    "Enugu",
    "Kano"
  ],

  Ghana: [
    "Accra",
    "Kumasi",
    "Takoradi"
  ],

  "South Africa": [
    "Johannesburg",
    "Cape Town",
    "Durban",
    "Pretoria"
  ],

  Egypt: [
    "Cairo",
    "Alexandria",
    "Giza",
    "Sharm El Sheikh"
  ],

  Kenya: [
    "Nairobi",
    "Mombasa",
    "Kisumu"
  ],

  Morocco: [
    "Casablanca",
    "Marrakesh",
    "Rabat",
    "Tangier"
  ],

  "United States": [
    "New York",
    "Los Angeles",
    "Miami",
    "Las Vegas",
    "Chicago",
    "Atlanta"
  ],

  "United Kingdom": [
    "London",
    "Manchester",
    "Birmingham",
    "Liverpool"
  ],

  France: [
    "Paris",
    "Nice",
    "Lyon",
    "Marseille"
  ],

  Italy: [
    "Milan",
    "Rome",
    "Florence",
    "Venice"
  ],

  Spain: [
    "Barcelona",
    "Madrid",
    "Seville",
    "Valencia"
  ],

  "United Arab Emirates": [
    "Dubai",
    "Abu Dhabi",
    "Sharjah"
  ],

  Qatar: [
    "Doha"
  ],

  "Saudi Arabia": [
    "Riyadh",
    "Jeddah",
    "Dubai"
  ],

  Turkey: [
    "Istanbul",
    "Ankara"
  ],

  Greece: [
    "Athens",
    "Santorini",
    "Mykonos"
  ],

  Brazil: [
    "Rio de Janeiro",
    "São Paulo"
  ],

  Canada: [
    "Toronto",
    "Vancouver",
    "Montreal"
  ],

  Australia: [
    "Sydney",
    "Melbourne",
    "Brisbane"
  ],

  Japan: [
    "Tokyo",
    "Osaka",
    "Kyoto"
  ],

  "South Korea": [
    "Seoul",
    "Busan"
  ],

  Singapore: [
    "Singapore"
  ],

  Thailand: [
    "Bangkok",
    "Phuket"
  ],

  Switzerland: [
    "Zurich",
    "Geneva"
  ],

  Germany: [
    "Berlin",
    "Munich",
    "Frankfurt"
  ]
};


/* =========================================================
   HELPERS
   ========================================================= */

function clean(value) {
  if (value === undefined || value === null) {
    return "";
  }

  if (Array.isArray(value)) {
    return value.join(", ");
  }

  return String(value).trim();
}


function firstValue(...values) {
  for (const value of values) {
    const cleaned = clean(value);

    if (cleaned) {
      return cleaned;
    }
  }

  return "";
}


function getImageSize(value) {
  const size = clean(value).toLowerCase();

  if (
    size.includes("portrait") ||
    size.includes("1024 × 1536") ||
    size.includes("1024x1536")
  ) {
    return "1024x1536";
  }

  if (
    size.includes("landscape") ||
    size.includes("1536 × 1024") ||
    size.includes("1536x1024")
  ) {
    return "1536x1024";
  }

  return "1024x1024";
}


function getMimeType(dataUrl) {
  const match = String(dataUrl || "").match(
    /^data:([^;,]+)[;,]/i
  );

  if (!match) {
    return "image/png";
  }

  const mime = match[1].toLowerCase();

  const allowed = [
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp"
  ];

  if (allowed.includes(mime)) {
    return mime === "image/jpg" ? "image/jpeg" : mime;
  }

  return "image/png";
}


function getExtension(mime) {
  if (mime === "image/jpeg") {
    return "jpg";
  }

  if (mime === "image/webp") {
    return "webp";
  }

  return "png";
}


function dataUrlToBuffer(dataUrl) {
  const match = String(dataUrl || "").match(
    /^data:[^;,]+;base64,(.+)$/i
  );

  if (!match) {
    throw new Error(
      "The uploaded image is not a valid base64 image."
    );
  }

  return Buffer.from(match[1], "base64");
}


/* =========================================================
   BUILD THE FASHION PROMPT
   ========================================================= */

function buildPrompt(request) {

  const model = firstValue(
    request.model,
    request.modelType,
    "Elegant fashion model"
  );

  const body = firstValue(
    request.body,
    request.bodyType,
    "Natural body proportions"
  );

  const style = firstValue(
    request.style,
    request.fashionStyle,
    "Luxury fashion"
  );

  const fashionStyle = firstValue(
    request.fashionStyle,
    request.style,
    "Luxury fashion"
  );

  const location = firstValue(
    request.location,
    request.background,
    request.scene,
    "Luxury fashion studio"
  );

  const city = firstValue(
    request.city,
    request.selectedCity
  );

  const country = firstValue(
    request.country,
    request.selectedCountry
  );

  const vehicle = firstValue(
    request.vehicle,
    request.car,
    "No vehicle"
  );

  const store = firstValue(
    request.store,
    "No store"
  );

  const lighting = firstValue(
    request.lighting,
    "Professional fashion lighting"
  );

  const camera = firstValue(
    request.camera,
    "Professional fashion camera"
  );

  const mood = firstValue(
    request.mood,
    "Elegant"
  );

  const clothing = firstValue(
    request.clothing,
    request.outfit,
    request.clothes,
    request.garment,
    request.description,
    "Create a stylish premium fashion outfit"
  );

  const extra = firstValue(
    request.prompt,
    request.customPrompt,
    request.instructions
  );

  const place = [city, country]
    .filter(Boolean)
    .join(", ");

  let prompt = `
Create a premium professional fashion campaign photograph for OBITREND AI Fashion Creator.

SUBJECT:
${model}

BODY / FIGURE:
${body}

CLOTHING / OUTFIT:
${clothing}

FASHION DIRECTION:
${fashionStyle}

STYLE:
${style}

LOCATION / BACKGROUND:
${location}

CITY / COUNTRY:
${place || "International luxury fashion location"}

VEHICLE:
${vehicle}

STORE / COMMERCIAL SETTING:
${store}

LIGHTING:
${lighting}

CAMERA:
${camera}

MOOD:
${mood}

VISUAL QUALITY:
Photorealistic.
High-end fashion photography.
Professional composition.
Natural realistic skin texture.
Detailed clothing fabric.
Sharp clothing details.
Beautiful realistic face.
Natural hands and anatomy.
Professional posing.
Premium editorial finish.
Luxury campaign quality.
Balanced exposure.
Realistic depth of field.
Clean composition.
No text.
No watermark.
No artificial-looking logo.
No distorted anatomy.
No extra fingers.
No duplicate people.

The clothing should remain the main fashion focus.
The background should complement the outfit without overpowering it.
Create a polished image suitable for a professional fashion campaign.
`.trim();

  if (extra) {
    prompt += `\n\nADDITIONAL USER INSTRUCTIONS:\n${extra}`;
  }

  return prompt;
}


/* =========================================================
   CALL OPENAI IMAGE GENERATION
   ========================================================= */

async function generateImage(prompt, size, quality) {

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is missing. Add it to your Vercel Environment Variables."
    );
  }

  const response = await fetch(
    "https://api.openai.com/v1/images/generations",
    {
      method: "POST",

      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        model: "gpt-image-1",
        prompt,
        size,
        quality,
        n: 1
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {

    const message =
      data?.error?.message ||
      data?.message ||
      `OpenAI image generation failed (${response.status}).`;

    throw new Error(message);
  }

  const image =
    data?.data?.[0]?.b64_json ||
    data?.data?.[0]?.base64;

  if (!image) {
    throw new Error(
      "OpenAI returned successfully but no image data was found."
    );
  }

  return `data:image/png;base64,${image}`;
}


/* =========================================================
   CALL OPENAI IMAGE EDIT
   ========================================================= */
async function editImage(
  prompt,
  size,
  quality,
  uploadedDataUrl
) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is missing. Add it to your Vercel Environment Variables."
    );
  }

  if (
    typeof uploadedDataUrl !== "string" ||
    !uploadedDataUrl.startsWith("data:image/")
  ) {
    throw new Error(
      "The uploaded clothing image is missing or is not a valid image."
    );
  }

  const mime = getMimeType(uploadedDataUrl);
  const extension = getExtension(mime);
  const buffer = dataUrlToBuffer(uploadedDataUrl);

  /*
   * IMPORTANT:
   * The uploaded image is the SOURCE CLOTHING IMAGE.
   *
   * Preserve the garment as accurately as possible:
   * - same clothing design
   * - same colors
   * - same patterns
   * - same logos
   * - same prints
   * - same stitching/details
   * - same neckline
   * - same sleeves
   * - same length
   * - same proportions
   *
   * Only change the model, pose, environment,
   * lighting and campaign presentation according
   * to the user's campaign selections.
   */
  const clothingPreservationPrompt = `
${prompt}

CRITICAL CLOTHING PRESERVATION INSTRUCTIONS:

The uploaded image is the PRIMARY CLOTHING REFERENCE.

Preserve the uploaded garment with maximum visual accuracy.

DO NOT redesign the clothing.
DO NOT replace the clothing with a different garment.
DO NOT invent a different outfit.
DO NOT change the garment's original color.
DO NOT change its pattern, print, logo, embroidery, texture or graphics.
DO NOT remove important garment details.
DO NOT add unnecessary accessories that cover the garment.
DO NOT alter the neckline, sleeves, waist, hemline, seams or major construction details.

The final image should clearly look like the SAME clothing item from the uploaded reference, now professionally worn by the selected model.

The garment must remain the main fashion focus.

Maintain realistic:
- fabric texture
- folds
- stitching
- seams
- garment proportions
- fit
- color accuracy
- pattern placement
- printed details

The model, pose, background, city, hotel, luxury environment,
vehicle, lighting and camera presentation may change according
to the campaign instructions.

Create a polished, photorealistic professional fashion campaign
image suitable for a premium fashion brand.

${prompt}
`.trim();

  const form = new FormData();

  form.append(
    "model",
    "gpt-image-1"
  );

  form.append(
    "prompt",
    clothingPreservationPrompt
  );

  form.append(
    "size",
    size || "1024x1024"
  );

  form.append(
    "quality",
    quality || "medium"
  );

  form.append(
    "n",
    "1"
  );

  form.append(
    "image",
    new Blob(
      [buffer],
      {
        type: mime
      }
    ),
    `obitrend-clothing-reference.${extension}`
  );

  const response = await fetch(
    "https://api.openai.com/v1/images/edits",
    {
      method: "POST",

      headers: {
        "Authorization": `Bearer ${apiKey}`
      },

      body: form
    }
  );

  let data;

  try {
    data = await response.json();
  } catch (jsonError) {
    throw new Error(
      `OpenAI returned an invalid response (${response.status}).`
    );
  }

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.message ||
      `OpenAI image editing failed (${response.status}).`;

    throw new Error(message);
  }

  /*
   * GPT Image normally returns:
   *
   * data[0].b64_json
   *
   * Keep the fallback for compatibility.
   */
  const image =
    data?.data?.[0]?.b64_json ||
    data?.data?.[0]?.base64 ||
    data?.image ||
    null;

  if (!image) {
    throw new Error(
      "OpenAI completed the request but returned no edited image data."
    );
  }

  /*
   * Return a browser-ready data URL.
   * index.html already expects data.image.
   */
  return `data:image/png;base64,${image}`;
}



/* =========================================================
   MAIN API HANDLER
   ========================================================= */

export default async function handler(req, res) {

  /*
   * CORS / OPTIONS
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

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }


  /*
   * GET
   *
   * Used by OBITREND to load the available
   * fashion options.
   */

  if (req.method === "GET") {

    return res.status(200).json({
      ...options,
      citiesByCountry,

      /*
       * Keep this compatibility property because
       * older OBITREND frontend versions may expect
       * an "options" object.
       */

      options
    });
  }


  /*
   * POST
   *
   * Used by the Generate button.
   */

  if (req.method !== "POST") {

    return res.status(405).json({
      error: "Method not allowed."
    });
  }


  try {

    const request = req.body || {};

    /*
     * Make sure the request is an object.
     */

    if (
      typeof request !== "object" ||
      Array.isArray(request)
    ) {

      return res.status(400).json({
        error: "Invalid request body."
      });
    }


    /*
     * Build the complete fashion prompt.
     */

    const prompt = buildPrompt(request);


    /*
     * Convert the frontend size option
     * into an OpenAI-supported size.
     */

    const size = getImageSize(
      request.size ||
      request.imageFormat ||
      request.format
    );


    /*
     * Fast mode:
     *
     * Your frontend sends:
     *
     * fast: $("#fastMode").checked
     *
     * Use lower quality when Fast Mode
     * is turned on.
     */

    const fast =
      request.fast === true ||
      request.fast === "true" ||
      request.fastMode === true ||
      request.fastMode === "true";


    const quality = fast
  ? "low"
  : "high";


    /*
     * Uploaded clothing/reference image.
     *
     * Your current index.html sends:
     *
     * image: uploadedDataUrl
     */

    const uploadedDataUrl =
      request.image ||
      request.uploadedDataUrl ||
      request.referenceImage ||
      request.imageDataUrl ||
      null;


    let image;


    /*
     * If the user uploaded a clothing/reference image,
     * use it as the source image.
     */

    if (
      typeof uploadedDataUrl === "string" &&
      uploadedDataUrl.startsWith("data:image/")
    ) {

      image = await editImage(
        prompt,
        size,
        quality,
        uploadedDataUrl
      );

    } else {

      /*
       * No uploaded image:
       * create a brand-new fashion image.
       */

      image = await generateImage(
        prompt,
        size,
        quality
      );
    }


    /*
     * Return exactly what the current
     * OBITREND frontend expects:
     *
     * data.image
     */

    return res.status(200).json({

      success: true,

      image,

      size,

      quality,

      prompt,

      message: "OBITREND fashion campaign created successfully."
    });


  } catch (error) {

    console.error(
      "OBITREND GENERATION ERROR:",
      error
    );


    const message =
      error?.message ||
      "OBITREND could not generate the image.";


    return res.status(500).json({

      success: false,

      error: message,

      message,

      image: null
    });
  }
  }
