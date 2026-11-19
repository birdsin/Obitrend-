# Cloudflare staging setup

This migration branch is configured for a Cloudflare Workers staging deployment only. The Worker has no custom domain or production route configured.

## Before first deployment

1. Create or select the Cloudflare account that will host OBITREND.
2. Install dependencies with `npm install`.
3. Run `npm run cf:assets` to assemble the allowlisted public website files into `cloudflare/public`.
4. Add the required staging secrets in the Cloudflare Worker settings or with Wrangler secrets. Never commit secret values or put them in `wrangler.jsonc`.
5. Configure staging public URL variables separately from production. Use the final workers.dev staging URL for `APP_ORIGIN`, `OBITREND_APP_URL`, and `APP_URL` as applicable.
6. Deploy only the Worker named `obitrend-migration-staging` using `npm run cf:deploy:staging`.
7. Verify the deployed staging site and API flows before considering any production DNS change.

## Environment and secret inventory

Review the current source and configure the corresponding values for staging. The exact variable names are retained where the existing API reads them.

- OpenAI: `OPENAI_API_KEY`, optional `OPENAI_IMAGE_MODEL`.
- Runway: `RUNWAY_API_KEY` (and any legacy Runway key alias still used by the source).
- Supabase: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`, and the public/publishable/anon key variable used by the browser.
- Redis/Upstash: `KV_REST_API_URL`, `KV_REST_API_TOKEN`, and/or the `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` names accepted by the credit helpers.
- Paystack: `PAYSTACK_SECRET_KEY` and any existing plan-code variables required by the checkout implementation.
- App URLs: `APP_ORIGIN`, `OBITREND_APP_URL`, `APP_URL`, and `NEXT_PUBLIC_APP_URL`. Set them to staging URLs only during staging.
- Web push: the VAPID public/private key variables and `VAPID_SUBJECT`, if push notifications are enabled in staging.

Do not copy production secret values into staging automatically. Prefer separate staging credentials and a separate Supabase test project/Paystack test mode where possible. Never use production payment credentials for test checkouts.

## Important technical constraints

- The compatibility bridge currently adapts the existing Vercel-style request/response handler contract to Fetch Request/Response. This is a transition layer, not proof that every route is Workers-compatible.
- Verify body parsing for JSON, URL-encoded and multipart requests, response headers/cookies, binary downloads, and all error paths.
- The long-running video and background-generation handlers now receive the Workers execution context for `waitUntil`; verify task completion, recovery and refund behavior under actual Worker limits.
- Node.js compatibility is enabled by the current Workers compatibility date. Package-specific compatibility still requires a real dry-run and runtime smoke tests.
- The static asset build copies only an explicit allowlist into `cloudflare/public`. Do not change it to publish the repository root.
- Production DNS, Vercel, production Supabase data, Redis balances, Paystack live configuration, and the Android production API must remain unchanged until separately approved.
