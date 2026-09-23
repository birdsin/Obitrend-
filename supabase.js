// =====================================================
// OBITREND SUPABASE CLIENT
// =====================================================

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL =
  "https://vjlitqujcujwsislprfg.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_vxKAcrlrdZ3wfNH_n7EuZg_joZKejD6";

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: "pkce",

      // Required for OBITREND biometric/passkey login.
      // Passkeys use the phone's secure biometric/PIN prompt.
      experimental: {
        passkey: true
      }
    }
  }
);

// Make the client available to the whole OBITREND app.
window.supabase = supabase;
window.supabaseClient = supabase;
window.obitrendSupabase = supabase;

// Tell the rest of the app that Supabase is ready.
window.dispatchEvent(
  new CustomEvent("obitrend:supabase-ready")
);

console.log("OBITREND: Supabase client ready.");

export { supabase };


// =====================================================
// OBITREND PASSWORD RECOVERY ROUTING FIX
// Keeps password recovery working from both the root
// redirect and the /rebuild/ application path.
// =====================================================
try {
  const originalResetPasswordForEmail =
    supabase.auth.resetPasswordForEmail.bind(supabase.auth);

  supabase.auth.resetPasswordForEmail = async (email, options = {}) => {
    const origin = window.location.origin;
    const candidates = [
      origin + "/rebuild/",
      origin + "/",
      null
    ];

    const requested = options?.redirectTo || null;
    const ordered = requested
      ? [requested, ...candidates.filter(url => url && url !== requested), null]
      : candidates;

    let lastResult = null;

    for (const redirectTo of ordered) {
      const nextOptions = { ...options };
      if (redirectTo) nextOptions.redirectTo = redirectTo;
      else delete nextOptions.redirectTo;

      const result = await originalResetPasswordForEmail(email, nextOptions);
      lastResult = result;

      if (!result?.error) return result;

      const message = String(
        result.error?.message || result.error?.error_description || ""
      );

      // Only retry URL/configuration failures. Never repeat rate-limit
      // or email-provider failures, which could make the situation worse.
      if (!/redirect|url|site.?url|not.?allowed/i.test(message)) {
        return result;
      }
    }

    return lastResult;
  };
} catch (error) {
  console.warn("OBITREND: password recovery routing patch could not be installed.", error);
}
