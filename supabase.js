// =====================================================
// OBITREND SUPABASE CLIENT
// =====================================================

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Resolve public credentials from the current Vercel deployment so
// staging and production use their own matching Supabase project.
const configResponse = await fetch("/api/public-config", {
  method: "GET",
  headers: { Accept: "application/json" },
  cache: "no-store"
});

if (!configResponse.ok) {
  throw new Error("OBITREND Supabase configuration unavailable for this deployment.");
}

const config = await configResponse.json();
const SUPABASE_URL = config?.url;
const SUPABASE_PUBLISHABLE_KEY = config?.publishableKey;

if (
  typeof SUPABASE_URL !== "string" ||
  typeof SUPABASE_PUBLISHABLE_KEY !== "string" ||
  !SUPABASE_URL ||
  !SUPABASE_PUBLISHABLE_KEY
) {
  throw new Error("OBITREND Supabase public configuration is incomplete.");
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,

      // The callback is exchanged below before the Studio is notified that auth is ready.
      // This prevents the app router from racing Supabase's PKCE callback processing.
      detectSessionInUrl: false,
      flowType: "pkce",

      // Required for OBITREND biometric/passkey login.
      // Passkeys use the phone's secure biometric/PIN prompt.
      experimental: {
        passkey: true
      }
    }
  }
);

// Complete OAuth PKCE callbacks before the Studio auth layer starts reading the session.
// Supabase stores the PKCE verifier on the origin that initiated sign-in, so the
// callback must return to this same origin.
try {
  const callbackUrl = new URL(window.location.href);
  const oauthCode = callbackUrl.searchParams.get("code");
  if (oauthCode) {
    const { error } = await supabase.auth.exchangeCodeForSession(oauthCode);
    if (error) {
      console.error("OBITREND: Google sign-in callback could not be completed.", error);
    } else {
      callbackUrl.searchParams.delete("code");
      window.history.replaceState(window.history.state, "", callbackUrl.toString());
      console.log("OBITREND: OAuth callback completed successfully.");
    }
  }
} catch (error) {
  console.error("OBITREND: OAuth callback processing failed.", error);
}

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
