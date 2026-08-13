# Worx

This is a [Next.js](https://nextjs.org) project bootstrapped with [v0](https://v0.app).

## Built with v0

This repository is linked to a [v0](https://v0.app) project. You can continue developing by visiting the link below -- start new chats to make changes, and v0 will push commits directly to this repo. Every merge to `main` will automatically deploy.

[Continue working on v0 →](https://v0.app/chat/projects/prj_H0SKnAzSWWrv6ZvZaNfdLF5lR8ub)

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Learn More

To learn more, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [v0 Documentation](https://v0.app/docs) - learn about v0 and how to use it.

## Paid data packets (402)

`GET /api/v1/data-packets/:productId` returns `402 Payment Required` until it receives a URL-safe base64 JSON `Payment-Proof` header. Production verification is fail-closed: configure `PAYMENT_402_VERIFIER_URL` and `PAYMENT_402_VERIFIER_API_KEY` for a Skyfire-compatible settlement verifier. The verifier receives `{ protocol, proof, challenge }` and must return `{ "settled": true, "paymentId": "…", "payer": "…" }`. Apply `drizzle/0001_add_data_access_entitlements.sql` before deployment. Only the explicitly cataloged, aggregated packets can be released; raw contributor data is never a data product.
