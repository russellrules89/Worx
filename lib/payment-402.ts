import { createHash } from "node:crypto"
import { z } from "zod"

const proofSchema = z.object({
  paymentId: z.string().trim().min(1).max(200),
  payer: z.string().trim().min(1).max(200),
  amountAtomic: z.string().regex(/^\d+$/),
  currency: z.literal("USDC"),
  network: z.literal("base"),
  termsVersion: z.string().trim().min(1).max(100),
})

export type PaymentProof = z.infer<typeof proofSchema>

export function paymentChallenge(product: {
  id: string
  priceAtomic: string
  currency: string
  network: string
  termsVersion: string
}, requestUrl: string) {
  return {
    protocol: "worx-402-v1",
    provider: process.env.PAYMENT_402_PROVIDER ?? "skyfire-compatible",
    resource: requestUrl,
    productId: product.id,
    amountAtomic: product.priceAtomic,
    currency: product.currency,
    network: product.network,
    termsVersion: product.termsVersion,
    paymentProofHeader: "Payment-Proof",
  }
}

export function parsePaymentProof(value: string | null): PaymentProof | null {
  if (!value) return null
  try {
    return proofSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")))
  } catch {
    return null
  }
}

export async function verifyPaymentProof(proof: PaymentProof, challenge: ReturnType<typeof paymentChallenge>) {
  const verifierUrl = process.env.PAYMENT_402_VERIFIER_URL
  const verifierKey = process.env.PAYMENT_402_VERIFIER_API_KEY
  if (!verifierUrl || !verifierKey) {
    return { settled: false as const, reason: "Payment verification is not configured." }
  }

  let response: Response
  try {
    response = await fetch(verifierUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${verifierKey}` },
      body: JSON.stringify({ protocol: "worx-402-v1", proof, challenge }),
      cache: "no-store",
    })
  } catch {
    return { settled: false as const, reason: "Payment verification is unavailable." }
  }
  if (!response.ok) return { settled: false as const, reason: "Payment was not verified." }

  const result = z.object({ settled: z.literal(true), paymentId: z.string().min(1).max(200), payer: z.string().min(1).max(200) }).safeParse(await response.json().catch(() => null))
  return result.success
    ? { settled: true as const, paymentId: result.data.paymentId, payer: result.data.payer }
    : { settled: false as const, reason: "Payment verifier returned an invalid response." }
}

export function paymentProofHash(proof: PaymentProof): string {
  return createHash("sha256").update(JSON.stringify({ paymentId: proof.paymentId, payer: proof.payer, amountAtomic: proof.amountAtomic, currency: proof.currency, network: proof.network, termsVersion: proof.termsVersion })).digest("hex")
}
