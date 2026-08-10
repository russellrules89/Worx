# Worx worker portal

Next.js App Router rebuild of the Worx contributor portal. Portal state is persisted in Neon Postgres through `DATABASE_URL`; the application does not accept contribution bytes, handle custody keys, or provide cash-out.

## Provisioning

1. Connect a Neon database to the Vercel project and set `DATABASE_URL` in Production and Preview.
2. Apply [`db/migrations/0001_portal.sql`](db/migrations/0001_portal.sql) in the Neon SQL Editor before deploying the application.
3. Add the environment variables listed in [`.env.example`](.env.example). Stripe webhooks require `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.
4. Deploy the project. The landing page uses `/api/worker/onboarding`, `/api/worker/overview`, `/api/tasks`, and `/api/assistant`.

## Data safeguards

- `POST /api/submissions` records consent and creates a pending-review submission.
- `POST /api/contributions` stores only a private-object reference and SHA-256 digest.
- The Stripe webhook verifies the signed event before responding.
- Base Sepolia settlement remains disabled until both `BASE_SEPOLIA_SETTLEMENT_ENABLED=true` and a valid `TOKEN_CONTRACT_ADDRESS` are configured.
