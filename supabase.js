// =====================================================
// OBITREND SUPABASE CLIENT
// Browser-safe ES module
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
      flowType: "pkce"
    }
  }
);

// Keep compatibility with the existing OBITREND code.
window.supabaseClient = supabase;
window.obitrendSupabase = supabase;
window.supabase = supabase;

// Tell index.html that Supabase is ready.
window.dispatchEvent(
  new CustomEvent("obitrend:supabase-ready")
);

console.log("OBITREND: Supabase client ready.");

export { supabase };
