import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "../lib/credits.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

function supabaseServiceClient() {
  if (
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY
  ) {
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
        persistSession: false,
      },
    }
  );
}

function send(res, status, body) {
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  /*
  =======================================================
  GET ONLY
  =======================================================
  */

  if (req.method !== "GET") {
    return send(res, 405, {
      success: false,
      error: "Method not allowed.",
    });
  }

  try {
    /*
    =======================================================
    AUTHENTICATE CURRENT USER
    =======================================================
    */

    const auth =
      await getAuthenticatedUser(req);

    if (!auth.ok) {
      return send(res, auth.status, {
        success: false,
        error: auth.error,
      });
    }

    /*
    =======================================================
    SUPABASE SERVICE CLIENT
    =======================================================
    */

    const supabase =
      supabaseServiceClient();

    /*
    =======================================================
    GET CURRENT USER'S VIDEO WALLET
    =======================================================
    */

    const {
      data: wallet,
      error: walletError,
    } = await supabase
      .from("video_credit_wallets")
      .select(
        "balance_5,balance_10,updated_at"
      )
      .eq(
        "user_id",
        auth.user.id
      )
      .maybeSingle();

    if (walletError) {
      console.error(
        "OBITREND video wallet lookup error:",
        walletError.message
      );

      return send(res, 500, {
        success: false,
        error:
          "Unable to load your video credits.",
      });
    }

    /*
    =======================================================
    NO WALLET YET
    =======================================================
    */

    if (!wallet) {
      return send(res, 200, {
        success: true,
        balance5: 0,
        balance10: 0,
        totalCredits: 0,
      });
    }

    /*
    =======================================================
    NORMALIZE CREDIT BALANCES
    =======================================================
    */

    const balance5 =
      Number(wallet.balance_5 || 0);

    const balance10 =
      Number(wallet.balance_10 || 0);

    /*
    =======================================================
    RETURN VIDEO CREDIT BALANCES
    =======================================================
    */

    return send(res, 200, {
      success: true,
      balance5,
      balance10,
      totalCredits:
        balance5 + balance10,
      updatedAt:
        wallet.updated_at || null,
    });

  } catch (error) {
    console.error(
      "OBITREND video credits error:",
      error?.message || error
    );

    return send(res, 500, {
      success: false,
      error:
        "Unable to load video credits right now.",
    });
  }
}
