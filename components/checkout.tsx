"use client"

import { useCallback } from "react"
import { loadStripe } from "@stripe/stripe-js"
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js"
import { createCheckoutSession } from "@/app/actions/stripe"

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

export function Checkout({ productId }: { productId: string }) {
  const fetchClientSecret = useCallback(async () => {
    const { clientSecret } = await createCheckoutSession(productId)
    if (!clientSecret) throw new Error("Could not start checkout")
    return clientSecret
  }, [productId])

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <EmbeddedCheckoutProvider stripe={stripePromise} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  )
}
