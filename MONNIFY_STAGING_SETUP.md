# Monnify staging setup for the exact working OBITREND baseline

This branch is based on the confirmed working OBITREND production/staging commit. It adds Monnify as an optional Pro payment method; the existing Paystack flow is retained.

## Vercel environment variables

In the OBITREND Vercel project, add these variables for **Preview** deployments (not Production):

- `MONNIFY_ENV=SANDBOX`
- `MONNIFY_API_KEY` = your Monnify Sandbox API key
- `MONNIFY_SECRET_KEY` = your Monnify Sandbox Secret Key
- `MONNIFY_CONTRACT_CODE` = your Monnify Sandbox Contract Code

Ensure the Preview environment scope is project-wide, not restricted to the earlier feature branch. Never commit credentials or send them in chat.

## Monnify dashboard webhook

After Vercel creates this branch's preview deployment, copy its exact deployment hostname and set the Monnify **Transaction completion** webhook URL to:

`https://<this-branch-preview-host>/api/monnify?webhook=1`

Leave Refund completion, Disbursement, Settlement, Mandate, Wallet, and other webhook fields blank unless a separate feature specifically requires them. Save changes.

## Sandbox verification checklist

1. Open the branch preview and sign in to an OBITREND account.
2. Open Pro / Plans and confirm both Paystack and Monnify payment choices appear for the existing plans.
3. Start a Monnify Sandbox checkout and complete a test payment.
4. Confirm Monnify reports a successful transaction and OBITREND grants exactly the server-configured credits and expiry for that plan.
5. Retry the same callback/webhook and confirm no duplicate credits are granted.
6. Test a failed/cancelled payment and confirm no credits are granted.
7. Confirm Paystack checkout still works.
8. Confirm garment generation, account authentication, credits, history/downloads, and Pro gating are unchanged.

Do not switch to LIVE, configure Production secrets, merge to the production branch, or deploy to production until sandbox verification is complete and explicitly approved.
