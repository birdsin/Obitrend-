import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed."
    });
  }

  try {

    const authHeader =
      req.headers.authorization || "";

    const token =
      authHeader.startsWith("Bearer ")
        ? authHeader.slice(7)
        : "";

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication required."
      });
    }

    const supabaseAuth =
      createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY
      );

    const {
      data: {
        user
      },
      error: authError
    } =
      await supabaseAuth.auth.getUser(
        token
      );

    if (
      authError ||
      !user
    ) {
      return res.status(401).json({
        success: false,
        message: "Your session is no longer valid."
      });
    }

    const supabaseAdmin =
      createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

    const {
      error: deleteError
    } =
      await supabaseAdmin.auth.admin.deleteUser(
        user.id
      );

    if (deleteError) {
      return res.status(500).json({
        success: false,
        message: deleteError.message
      });
    }

    return res.status(200).json({
      success: true
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      message:
        error?.message ||
        "Account deletion could not be completed."
    });

  }
}
