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

// Remove legacy image caches that stored full Base64 images in localStorage.
// Generated images and history belong in the server-side gallery, not browser key/value storage.
(function clearLegacyImageCaches(){
  try {
    const cacheKeys = [
      "obitrendRecentCreations",
      "obitrend_latest_generated_image",
      "obitrend_latest_image"
    ];
    for (const key of cacheKeys) {
      try {
        // These keys are disposable UI caches, never the user's saved gallery.
        window.localStorage.removeItem(key);
      } catch (_) {}
    }
  } catch (_) {}
})();

// Keep normal sessions persistent in localStorage. If the browser still reports
// a quota error, fall back to tab-scoped sessionStorage instead of blocking sign-in.
const authStorage = {
  getItem(key) {
    try {
      const sessionValue = window.sessionStorage.getItem(key);
      if (sessionValue !== null) return sessionValue;
    } catch (_) {}
    try { return window.localStorage.getItem(key); }
    catch (_) { return null; }
  },
  setItem(key, value) {
    try {
      window.localStorage.setItem(key, value);
      try { window.sessionStorage.removeItem(key); } catch (_) {}
      return;
    } catch (_) {
      // Storage may be full or disabled by browser policy; keep this tab usable.
      window.sessionStorage.setItem(key, value);
      console.warn("OBITREND: auth session stored for this browser tab because persistent storage is full.");
    }
  },
  removeItem(key) {
    try { window.localStorage.removeItem(key); } catch (_) {}
    try { window.sessionStorage.removeItem(key); } catch (_) {}
  }
};

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      storage: authStorage,
      // OAuth callbacks are completed explicitly below before the Studio is notified.
      // This prevents the auth guard from reading the session before PKCE exchange finishes.
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

// Complete the PKCE callback before exposing the client to the Studio auth guard.
// Keep URL detection manual so the app does not race its own callback/session guard.
// Supabase stores the verifier on the same browser origin that started Google sign-in.
try {
  const callbackUrl = new URL(window.location.href);
  const providerError = callbackUrl.searchParams.get("error");
  const providerErrorDescription = callbackUrl.searchParams.get("error_description");
  const oauthCode = callbackUrl.searchParams.get("code");

  if (providerError) {
    const message = [providerError, providerErrorDescription].filter(Boolean).join(": ");
    window.obitrendOAuthCallbackError = {
      code: providerError,
      message: message || "The identity provider rejected the sign-in request."
    };
    console.error("OBITREND: OAuth provider returned an error.", window.obitrendOAuthCallbackError);
  } else if (oauthCode) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(oauthCode);
    if (error) throw error;
    if (!data?.session) {
      throw new Error("Supabase accepted the callback code but did not return an authenticated session.");
    }

    callbackUrl.searchParams.delete("code");
    callbackUrl.searchParams.delete("error");
    callbackUrl.searchParams.delete("error_description");
    window.history.replaceState(window.history.state, "", callbackUrl.toString());
    console.info("OBITREND: OAuth callback session established.");
  }
} catch (error) {
  const message = String(
    error?.message || error?.error_description || error?.error || "Unknown OAuth callback error."
  );
  window.obitrendOAuthCallbackError = {
    code: String(error?.code || error?.name || "oauth_callback_failed"),
    message
  };
  console.error("OBITREND: OAuth callback exchange failed.", error);
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
