# Gilded Fashion Forge dashboard integration — staging plan

Status: staging only; no production deployment or merge authorized.

## Confirmed project identities
- Production Vercel project: `obitrend` (team project `prj_4XbED7alRRz2Rmo9imSRAQPZvrQQ`).
- Production repository: `birdsin/Obitrend-`, default branch `main`.
- Current production deployment source commit inspected: `a3531fd0350ddafa52627fb5114ad695fd23a4a5`.
- Separate design/demo source: Lovable project `Gilded Fashion Forge`, ID `c3cd8ef9-1dfd-4312-a558-daae91abdc0d`.
- Staging branch: `staging/gilded-dashboard-integration-2026-10-14`.

## Architecture findings
- Production's active `rebuild/index.html`, `rebuild/app.js`, and `rebuild/app.css` are a vanilla HTML/CSS/JavaScript application. Its app.js imports the existing Supabase client, handles authentication, credits, image generation, and production workflows.
- The separate Gilded Fashion Forge project is a React/TanStack Router app with component-level dependencies, demo job/output state, and demo-specific account/entitlement logic.
- The separate app's React components cannot be copied directly into the production static page without introducing a new build/runtime architecture and risking duplicate auth, credit, entitlement, and payment paths.
- Production already has a working home/create/gallery/video/credits/account/settings flow and camera selection controls. Those handlers and IDs must be preserved unless a tested replacement is proven equivalent.

## Safe integration sequence
1. Port the visual system first into production-compatible HTML/CSS: black/charcoal surfaces, metallic gold highlights, subtle purple accents, improved typography, image-led tool cards, consistent Lucide-style inline SVG iconography, and responsive desktop/mobile layout.
2. Keep the existing production authentication, Supabase session, credit ledger, generation endpoints, Paystack/payment verification, and server-side Pro enforcement as the only sources of truth. Do not copy demo entitlement or demo-job code into production.
3. Map each proposed tool card to an existing, verified production capability. Where no production capability exists, label it as a preview/unavailable and do not imply it generated output or deduct credits.
4. Preserve advertising scripts/account configuration already in production; do not add new ad accounts, reward-per-ad behavior, or duplicate ad scripts. Respect current Pro ad suppression rules.
5. Verify on a preview deployment: sign-in/out, upload and preview, prompt editing, camera selection and Pro locks, image generation/error/refund behavior, credits, payment return/verification, library/history, language controls, and Android/desktop layouts.
6. Open a reviewed PR and leave it unmerged. Production deployment requires a separate explicit approval after the staging checks pass.

## Guardrails
- Do not merge this branch or deploy to the production domain.
- Do not modify production environment variables/secrets, Supabase schemas, Paystack configuration, or ad account settings in this UI integration.
- Do not connect live services from the demo project.
- Do not claim the demo's 20 tools are production-connected unless each one has been verified against a real production capability.

## Initial verification status
- Repository and current production deployment identity: confirmed.
- Staging branch created from the inspected production commit: confirmed.
- UI code port, branch build, staging preview, and end-to-end integration tests: not yet performed.
