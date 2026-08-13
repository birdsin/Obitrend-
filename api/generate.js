import OpenAI from "openai";
import { toFile } from "openai/uploads";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export default async function handler(req, res) {

  if (req.method !== "POST") {

    return res.status(405).json({
      error: "Method not allowed."
    });

  }

  try {

    if (!process.env.OPENAI_API_KEY) {

      return res.status(500).json({
        error: "OPENAI_API_KEY is not configured in Vercel."
      });

    }


    const {
      prompt,
      image,
      size
    } = req.body || {};


    if (!prompt) {

      return res.status(400).json({
        error: "A prompt is required."
      });

    }


    let response;


    /*
     * If the user uploaded an image,
     * use the image editing endpoint.
     */

    if (image) {

      const match =
        image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);

      if (!match) {

        return res.status(400).json({
          error: "Invalid uploaded image."
        });

      }


      const mimeType = match[1];

      const base64Data = match[2];

      const buffer =
        Buffer.from(base64Data, "base64");


      const extension =
        mimeType.includes("png")
          ? "png"
          : mimeType.includes("webp")
            ? "webp"
            : "jpg";


      const file =
        await toFile(
          buffer,
          `obitrend-input.${extension}`,
          {
            type: mimeType
          }
        );


      response =
        await client.images.edit({

          model: "gpt-image-1.5",

          image: file,

          prompt,

          size: size || "1024x1536",

          quality: "medium",

          n: 1

        });

    }

    else {

      /*
       * No uploaded image:
       * create the campaign completely from text.
       */

      response =
        await client.images.generate({

          model: "gpt-image-1.5",

          prompt,

          size: size || "1024x1536",

          quality: "medium",

          n: 1

        });

    }


    if (
      !response ||
      !response.data ||
      !response.data[0]
    ) {

      throw new Error(
        "OpenAI returned an empty image response."
      );

    }


    const imageData =
      response.data[0].b64_json;


    if (!imageData) {

      throw new Error(
        "OpenAI did not return image data."
      );

    }


    return res.status(200).json({

      success: true,

      image:
        `data:image/png;base64,${imageData}`

    });

  }

  catch (error) {

    console.error(
      "OBITREND GENERATION ERROR:",
      error
    );


    let message =
      "Image generation failed.";


    if (error?.message) {
      message = error.message;
    }


    return res.status(500).json({
      error: message
    });

  }

}
