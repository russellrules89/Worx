"use server"

import { auth } from "@/lib/auth"
import { stripe } from "@/lib/stripe"
import { getProduct } from "@/lib/products"
import { db } from "@/lib/db"
import { ledgerEntry } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"

/**
 * Creates an embedded Checkout session for a credit pack.
 * Price is always looked up server-side from the products catalog,
 * so the client can never tamper with the amount.
 */
export async function createCheckoutSession(productId: string) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Unauthorized")

  const product = getProduct(productId)
  if (!product) throw new Error("Invalid product")

  const checkout = await stripe.checkout.sessions.create(
    {
      ui_mode: "embedded_page",
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: product.name,
              description: product.description,
            },
            unit_amount: product.priceInCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId: session.user.id,
        productId: product.id,
        credits: String(product.credits),
      },
      return_url: `${getBaseUrl()}/funding/return?session_id={CHECKOUT_SESSION_ID}`,
    },
    {
      idempotencyKey: `checkout_${session.user.id}_${product.id}_${Date.now()}`,
    },
  )

  return { clientSecret: checkout.client_secret }
}

/**
 * Verifies a completed Checkout session with Stripe and credits the funder's
 * balance exactly once. Called from the return page. The unique reason string
 * (keyed on the Stripe session id) makes fulfillment idempotent, so a page
 * refresh cannot double-credit.
 */
export async function fulfillCheckout(sessionId: string) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Unauthorized")

  const checkout = await stripe.checkout.sessions.retrieve(sessionId)

  if (checkout.payment_status !== "paid") {
    return { status: "unpaid" as const, credits: 0 }
  }
  // Ensure this session belongs to the signed-in user.
  if (checkout.metadata?.userId !== session.user.id) {
    throw new Error("Session does not belong to this user")
  }

  const credits = Number(checkout.metadata?.credits ?? 0)
  const reason = `Funding purchase · ${checkout.metadata?.productId} · ${sessionId}`

  // Idempotency: skip if we already recorded this session.
  const existing = await db
    .select()
    .from(ledgerEntry)
    .where(and(eq(ledgerEntry.userId, session.user.id), eq(ledgerEntry.reason, reason)))
    .limit(1)

  if (existing.length === 0 && credits > 0) {
    await db.insert(ledgerEntry).values({
      userId: session.user.id,
      amount: credits,
      reason,
    })
    revalidatePath("/wallet")
  }

  return { status: "paid" as const, credits }
}

function getBaseUrl() {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return process.env.V0_RUNTIME_URL ?? "http://localhost:3000"
}
