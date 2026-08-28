// OBITREND SUPABASE CLIENT
// Public browser configuration only.
// NEVER put SUPABASE_SERVICE_ROLE_KEY here.

const SUPABASE_URL =
  "https://vjlitqujcujwsislprfg.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_vxKAcrlrdZ3wfNH_n7EuZg_joZKejD6";

/*
 * The Supabase CDN creates window.supabase as the
 * JavaScript library.
 *
 * OBITREND index.html imports:
 *
 *   import { supabase } from "./supabase.js";
 *
 * Therefore this file MUST export the initialized
 * Supabase client.
 */

const supabaseLibrary =
  window.supabase;

if (
  !supabaseLibrary ||
  typeof supabaseLibrary.createClient !== "function"
) {
  console.error(
    "OBITREND: Supabase JavaScript library is not loaded."
  );

  throw new Error(
    "OBITREND: Supabase JavaScript library is not loaded."
  );
}

const supabase =
  supabaseLibrary.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: "pkce"
      }
    }
  );

/*
 * Stable global names used by the
 * existing OBITREND application.
 */

window.supabaseClient =
  supabase;

window.obitrendSupabase =
  supabase;

/*
 * Existing OBITREND code uses:
 *
 * window.supabase.auth
 *
 * so expose the initialized client there.
 */

window.supabase =
  supabase;

/*
 * THIS IS THE IMPORTANT FIX.
 *
 * index.html imports:
 *
 * import { supabase } from "./supabase.js";
 */

export {
  supabase
};

/*
 * Tell the rest of OBITREND that
 * authentication is ready.
 */

window.dispatchEvent(
  new CustomEvent(
    "obitrend:supabase-ready"
  )
);

console.log(
  "OBITREND: Supabase client ready."
);
