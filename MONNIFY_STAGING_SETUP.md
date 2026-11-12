# Monnify staging setup for OBITREND

This integration is intentionally isolated on `feature/multi-payment-flutterwave-monnify`. It adds Monnify as an alternative Pro checkout provider and does not replace or edit the existing Paystack API, Paystack webhook, credit ledger, or production configuration.

## Vercel preview environment variables

Add these variables to the **Preview** environment only (not Production):

- `MONNIFY_ENV=SANDBOX`
- `MONNIFY_API_KEY` — Monnify test-mode API key
- `MONNIFY_SECRET_KEY` — Monnify test-mode secret key
- `MONNIFY_CONTRACT_CODE` — test-mode contract code

Do not commit credentials or paste secret keys into GitHub, source files, chat, or screenshots. Use the Vercel environment-variable editor and keep the variables scoped to Preview. Redeploy the preview after saving them.

## Monnify dashboard sandbox webhook

After the preview deployment is READY, copy its exact HTTPS URL and configure the Monnify **Test/Sandbox** dashboard:

- Transaction Completion URL: `https://<exact-preview-host>/api/monnify?webhook=1`

The `webhook=1` query is required for sandbox notifications because Monnify does not include the production `monnify-signature` header in sandbox mode. The endpoint still performs an independent server-to-server transaction verification before activating credits.

For production, do not change the Production environment variables or configure the live webhook until Monnify has approved the account and the staging flow has passed testing. The production webhook must be HTTPS and the endpoint validates the `monnify-signature` HMAC-SHA512 header.

## What the endpoint does

- Authenticates checkout requests using the existing Supabase session.
- Derives the user identity and email from the verified session.
- Looks up the selected Pro plan and amount from the server-side OBITREND plan configuration.
- Creates a unique payment reference and stores the pending order in Redis.
- Initializes Monnify hosted checkout using the server-side API key and contract code.
- Verifies payment status, reference, NGN currency, paid amount, and customer email with Monnify before fulfillment.
- Uses the existing idempotent `activatePro` credit ledger so a webhook and browser callback cannot double-credit the same purchase.
- Leaves Paystack as the existing default option.

## Staging test checklist

1. Confirm the preview builds successfully.
2. Add only Monnify sandbox credentials to Preview.
3. Configure the sandbox transaction-completion webhook URL.
4. Sign in to the preview and test each displayed Pro plan using Monnify sandbox payment methods.
5. Confirm successful payment activates exactly the plan purchased.
6. Confirm pending, failed, wrong-amount, wrong-currency, and wrong-reference payments do not grant Pro credits.
7. Send the same successful webhook more than once and confirm the credit balance is not duplicated.
8. Test Paystack checkout on the same preview and confirm its existing flow still works.
9. Only after review and explicit approval should any production environment change be considered.
