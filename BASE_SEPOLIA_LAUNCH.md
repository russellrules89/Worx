# Base Sepolia reward launch checklist

This release supports **Base Sepolia (chain ID 84532)** only. It does not enable a mainnet token sale, exchange listing, fiat redemption, or custodial wallet service.

1. Independently audit and deploy `contracts/WorkProofToken.sol` to Base Sepolia with a dedicated oracle address.
2. Set `TOKEN_CONTRACT_ADDRESS` to the deployed contract and `BASE_SEPOLIA_SETTLEMENT_ENABLED=true` in the Vercel production environment. Keep the oracle signing key outside Vercel and outside the browser.
3. Authenticate the review and batch APIs, replace in-memory records with a durable database, and verify each submitted transaction receipt and event before marking rewards settled.
4. Require a signed wallet-ownership challenge before associating a payout wallet with a contributor; never accept a wallet address as proof of ownership.
5. Before any Base mainnet or exchange/liquidity launch, obtain legal, securities, money-transmission, tax, sanctions/KYC/AML, custody, privacy, and independent smart-contract-security review appropriate to every launch jurisdiction.

Workers can connect a wallet and switch to Base Sepolia. The application does not request recovery phrases, private keys, or client-side transaction signatures for reward minting.

## 402 data-packet settlement

The data-packet endpoint is `GET /api/v1/data-packets/workforce-quality-summary-v1`. It returns a 402 challenge in the `Payment-Required` header and response body. Clients submit the settlement receipt as URL-safe base64 JSON in `Payment-Proof`. The app fails closed unless `PAYMENT_402_VERIFIER_URL` and `PAYMENT_402_VERIFIER_API_KEY` point to a Skyfire-compatible verifier that accepts `{ protocol, proof, challenge }` and returns `{ "settled": true, "paymentId": "…", "payer": "…" }`. This Flask compatibility layer stores entitlements in memory only; production paid data access must use the Next.js/Neon implementation, which has durable idempotency records.
