import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { dataAccessEntitlement } from "@/lib/db/schema"
import { getDataProduct } from "@/lib/data-products"
import { parsePaymentProof, paymentChallenge, paymentProofHash, verifyPaymentProof } from "@/lib/payment-402"

export const dynamic = "force-dynamic"

function response402(challenge: ReturnType<typeof paymentChallenge>) {
  return NextResponse.json({ error: "payment_required", payment: challenge }, {
    status: 402,
    headers: { "Payment-Required": Buffer.from(JSON.stringify(challenge)).toString("base64url"), "Cache-Control": "no-store" },
  })
}

export async function GET(request: Request, context: { params: Promise<{ productId: string }> }) {
  const { productId } = await context.params
  const product = getDataProduct(productId)
  if (!product) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const challenge = paymentChallenge(product, request.url)
  const proof = parsePaymentProof(request.headers.get("Payment-Proof"))
  if (!proof || proof.amountAtomic !== product.priceAtomic || proof.termsVersion !== product.termsVersion) return response402(challenge)

  const existing = await db.select().from(dataAccessEntitlement).where(eq(dataAccessEntitlement.paymentId, proof.paymentId)).limit(1)
  if (existing[0]) {
    if (existing[0].productId !== product.id || existing[0].payer !== proof.payer || existing[0].proofHash !== paymentProofHash(proof)) return NextResponse.json({ error: "payment_replay_rejected" }, { status: 409 })
  } else {
    const verified = await verifyPaymentProof(proof, challenge)
    if (!verified.settled || verified.paymentId !== proof.paymentId || verified.payer !== proof.payer) return response402(challenge)
    await db.insert(dataAccessEntitlement).values({ paymentId: proof.paymentId, productId: product.id, payer: proof.payer, proofHash: paymentProofHash(proof), termsVersion: product.termsVersion })
  }

  return NextResponse.json({ product: { id: product.id, name: product.name, termsVersion: product.termsVersion }, packet: product.payload }, { headers: { "Cache-Control": "private, no-store" } })
}
