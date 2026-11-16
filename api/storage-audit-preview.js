import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AUDIT_TOKEN = process.env.OBITREND_STORAGE_AUDIT_TOKEN;
const BUCKET = "obitrend-generated";
const URL_TTL_SECONDS = 10 * 60;
const MAX_FILES = 19;

function tokenMatches(candidate) {
  if (!AUDIT_TOKEN || !candidate) return false;
  const a = Buffer.from(String(candidate));
  const b = Buffer.from(String(AUDIT_TOKEN));
  return a.length === b.length && timingSafeEqual(a, b);
}

function validObjectPath(value) {
  if (typeof value !== "string") return false;
  const path = value.trim();
  if (!path || path.length > 700 || path.startsWith("/") || path.includes("\\") || path.includes("..")) return false;
  const parts = path.split("/");
  if (parts.length < 2 || parts.length > 4) return false;
  // Candidate paths must be rooted under a UUID-shaped customer folder.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parts[0])) return false;
  if (!parts.every(part => /^[A-Za-z0-9._-]+$/.test(part))) return false;
  return /\.(png|jpe?g|webp)$/i.test(parts[parts.length - 1]);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, error: "Method not allowed." });
  }

  const suppliedToken = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!tokenMatches(suppliedToken)) {
    return res.status(401).json({ success: false, error: "Unauthorized audit request." });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ success: false, error: "Storage audit is not configured." });
  }

  const paths = req.body?.paths;
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > MAX_FILES || !paths.every(validObjectPath)) {
    return res.status(400).json({
      success: false,
      error: "Provide between 1 and 19 valid customer image object paths."
    });
  }

  const uniquePaths = [...new Set(paths.map(path => path.trim()))];
  if (uniquePaths.length !== paths.length) {
    return res.status(400).json({ success: false, error: "Duplicate object paths are not accepted." });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const results = await Promise.all(uniquePaths.map(async path => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, URL_TTL_SECONDS);

      if (error || !data?.signedUrl) {
        return { path, success: false, error: "Unable to create a temporary viewing link." };
      }
      return { path, success: true, signedUrl: data.signedUrl, expiresInSeconds: URL_TTL_SECONDS };
    }));

    return res.status(200).json({
      success: true,
      bucket: BUCKET,
      expiresInSeconds: URL_TTL_SECONDS,
      readOnly: true,
      results
    });
  } catch (error) {
    console.error("OBITREND private storage audit failed:", error?.message || error);
    return res.status(503).json({ success: false, error: "Unable to prepare temporary image previews." });
  }
}
