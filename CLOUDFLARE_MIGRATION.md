# OBITREND Cloudflare Migration

Status: isolated migration planning and implementation workspace. This branch is not production.

## Safety requirements
- Keep Vercel active as the rollback target until the owner approves cutover after all acceptance tests pass.
- Do not change production DNS, registrar nameservers, Vercel production settings, or production secrets during migration.
- Do not delete, rotate, or expose secrets.
- Do not modify Supabase customer data, storage objects, policies, Paystack plans/webhooks, or Redis balances as part of migration.
- Keep the Android production app pointed at its current production API until staging passes and cutover is explicitly approved.

## Repository baseline
- Repository: birdsin/Obitrend-
- Production baseline: main
- Migration branch: migration/cloudflare-2026-11-19
- Current app includes static HTML/JS, API handlers, OpenAI image generation, Runway video generation, Supabase auth/database/storage, Upstash/Redis credits, Paystack, and web-push notifications.
- vercel.json currently defines a 300-second duration for api/generate.js, a video-payment rewrite, and a /studio/* rewrite.

## Initial compatibility findings
- api/generate-video.js imports @vercel/functions.
- api/generate-background.js imports @vercel/functions.
- package.json depends on @vercel/functions.
- api/paystack.js and api/video-payment.js read VERCEL_ENV and VERCEL_URL.
- api/generate.js imports node:zlib and uses Vercel-style request/response handling and body-parser configuration.
- The app contains 21 API route modules; all need route-by-route conversion and tests. Do not assume a single wrapper is sufficient.
- The 300-second Vercel function duration cannot be carried over as a Cloudflare request timeout. Long-running generation must use durable job state, status polling, recovery, and idempotent credit handling.
- Node.js compatibility does not guarantee all packages or request/response assumptions work unchanged in Workers. Validate zlib, multipart/body parsing, web-push, Runway SDK, binary image processing, and downloads in the actual Workers runtime.
- Existing /studio rewrite and video-payment alias must be preserved in Cloudflare routing.

## Staged migration plan
1. Add a Workers entrypoint and staging-only Wrangler configuration. Do not attach obitrend.com or production subdomains.
2. Convert every API handler to Fetch Request/Response semantics, preserving auth, authorization, response JSON shapes, request limits, and CORS.
3. Replace @vercel/functions background work with Workers execution-context patterns where appropriate, and use durable jobs for long operations.
4. Replace VERCEL_ENV/VERCEL_URL inference with explicit app URL/environment bindings, separately configured for staging and production.
5. Configure static asset serving from an allowlisted build/output directory. Never expose repository root; it contains source, API files, backups, and other non-public assets.
6. Configure staging-only secrets and bindings through Cloudflare dashboard/CLI. Never commit secret values.
7. Build and test on a Cloudflare staging hostname before any domain cutover.
8. Obtain explicit owner approval before production DNS changes. Keep Vercel intact until domain, payments, generation, and Android checks pass.

## Acceptance tests
- Homepage, all public pages, Studio routes, assets, manifest, and service worker.
- Registration, login, OAuth callback/session recovery, logout, account deletion.
- Upload, image analysis, garment-preserving image generation, image persistence, signed URLs, history, gallery, downloads, and recovery/status.
- Video generation, polling/status, recovery, gallery, and downloads.
- Free credits, paid credits, Pro entitlements, correct deductions, failure refunds, and retry/idempotency behavior.
- Paystack checkout, server-side transaction verification, webhook signature/idempotency, weekly/monthly subscriptions, expiry, and payment recovery.
- Supabase policies and private storage access.
- Push subscription and image-ready notifications.
- Android app API/domain compatibility.
- CORS, auth/session behavior, request-size limits, abuse controls, and logs without secrets or sensitive user data.

## Audit status
This file records the migration scope and compatibility risks. It is not evidence of a completed port or a deployed Cloudflare application. No production configuration, DNS, secrets, customer data, or payment settings have been changed by this audit.
