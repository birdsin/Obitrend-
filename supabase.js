// =====================================================
// OBITREND SUPABASE CLIENT
// =====================================================

// Load Supabase with a CDN fallback. The studio is served as static files,
// so this module must resolve in the browser (not as a bare npm import).
async function loadSupabaseCreateClient() {
  const sources = [
    () => import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.4/+esm"),
    () => import("https://esm.sh/@supabase/supabase-js@2.112.4?bundle")
  ];

  let lastError;
  for (const load of sources) {
    try {
      const module = await Promise.race([
        load(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Supabase module CDN timed out.")), 8000)
        )
      ]);
      if (typeof module?.createClient === "function") return module.createClient;
      throw new Error("Supabase module did not export createClient.");
    } catch (error) {
      lastError = error;
      console.warn("OBITREND: Supabase module source failed; trying fallback.", error);
    }
  }
  throw lastError || new Error("Supabase browser module could not be loaded.");
}

const createClient = await loadSupabaseCreateClient();

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
