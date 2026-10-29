-- OBITREND: remove the optional location-sharing feature.
-- Apply only to the intended staging database after reviewing data-retention requirements.
drop table if exists public.user_locations;
