const SUPABASE_URL = "https://vjlitqujcujwsislprfg.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_vxKAcrlrdZ3wfNH_n7EuZg_joZKejD6";

const supabaseModule = await import(
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"
);

export const supabase = supabaseModule.createClient(
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

window.obitrendSupabase = supabase;
