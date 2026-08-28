// OBITREND SUPABASE CLIENT
// Public browser configuration only.
// NEVER put SUPABASE_SERVICE_ROLE_KEY here.

const SUPABASE_URL =
  "https://vjlitqujcujwsislprfg.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_vxKAcrlrdZ3wfNH_n7EuZg_joZKejD6";

if (!window.supabase) {
  console.error(
    "OBITREND: Supabase JavaScript library is not loaded."
  );
} else {

  const obitrendSupabase =
    window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true
        }
      }
    );

  // Global client used by OBITREND frontend
  window.supabaseClient =
    obitrendSupabase;

  window.supabase =
    obitrendSupabase;

  window.dispatchEvent(
    new CustomEvent(
      "obitrend:supabase-ready"
    )
  );

  console.log(
    "OBITREND: Supabase client ready."
  );
}
