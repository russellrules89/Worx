"use client"

import { useState } from "react"
import { Checkout } from "@/components/checkout"
import { Button } from "@/components/ui/button"
import type { Product } from "@/lib/products"

export function FundingPicker({ products }: { products: Product[] }) {
  const [selected, setSelected] = useState<string | null>(null)

  if (selected) {
    const product = products.find((p) => p.id === selected)!
    return (
      <div>
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">{product.name}</p>
            <p className="text-sm text-muted-foreground">
              ${(product.priceInCents / 100).toFixed(2)} · {product.credits.toLocaleString()} credits
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
            Back
          </Button>
        </div>
        <Checkout productId={product.id} />
      </div>
    )
  }

  return (
    <div className="grid gap-5 md:grid-cols-3">
      {products.map((p) => (
        <div key={p.id} className="flex flex-col rounded-xl border border-border bg-card p-5">
          <h3 className="text-base font-semibold text-foreground">{p.name}</h3>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="font-mono text-3xl font-semibold text-foreground">
              ${(p.priceInCents / 100).toFixed(2)}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            <span className="font-mono text-sm text-accent">{p.credits.toLocaleString()} DATA credits</span>
          </div>
          <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{p.description}</p>
          <Button className="mt-4" onClick={() => setSelected(p.id)}>
            Fund with card
          </Button>
        </div>
      ))}
    </div>
  )
}
