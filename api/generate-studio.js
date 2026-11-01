import { generateHandler } from "./generate.js";

/*
 * Dedicated Creator Studio endpoint.
 * The server marks this request internally; browser-provided headers or
 * body flags cannot turn a legacy request into a Studio request.
 */
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "12mb",
    },
  },
};

export const maxDuration = 300;

export default async function handler(req, res) {
  req.obitrendStudioRequest = true;
  return generateHandler(req, res);
}
