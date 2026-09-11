import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "./credits.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT ||
  "mailto:admin@obitrend.vercel.app";

function serviceClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Supabase server configuration is missing."
    );
  }

  return createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
}

async function getOrCreateKeys(supabase) {
  const { data: existing, error: readError } =
    await supabase
      .from("push_config")
      .select(
        "id,public_key,private_key,subject"
      )
      .eq("id", "default")
      .maybeSingle();

  if (readError) {
    throw readError;
  }

  if (
    existing?.public_key &&
    existing?.private_key
  ) {
    return existing;
  }

  const keys = webpush.generateVAPIDKeys();

  const row = {
    id: "default",
    public_key: keys.publicKey,
    private_key: keys.privateKey,
    subject: VAPID_SUBJECT,
    updated_at: new Date().toISOString()
  };

  const { data, error } =
    await supabase
      .from("push_config")
      .upsert(row, {
        onConflict: "id"
      })
      .select(
        "id,public_key,private_key,subject"
      )
      .single();

  if (error) {
    throw error;
  }

  return data;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed."
    });
  }

  try {
    const auth =
      await getAuthenticatedUser(req);

    if (!auth.ok) {
      return res.status(auth.status).json({
        success: false,
        error: auth.error
      });
    }

    const supabase = serviceClient();

    const keys =
      await getOrCreateKeys(supabase);

    return res.status(200).json({
      success: true,
      publicKey: keys.public_key
    });

  } catch (error) {
    console.error(
      "OBITREND VAPID key setup failed:",
      error?.message || error
    );

    return res.status(503).json({
      success: false,
      error:
        "Push notifications are not ready yet. Please try again."
    });
  }
}
