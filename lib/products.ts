export interface Product {
  id: string
  name: string
  description: string
  priceInCents: number
  // Number of data-credits (tokens) added to the funder's balance on purchase.
  credits: number
}

// Source of truth for all purchasable credit packs.
// Funders buy credit packs to fund the pool that pays annotation/voice workers.
export const PRODUCTS: Product[] = [
  {
    id: "starter-pack",
    name: "Starter Credit Pack",
    description: "Fund 500 data credits to reward workers on your tasks.",
    priceInCents: 999,
    credits: 500,
  },
  {
    id: "growth-pack",
    name: "Growth Credit Pack",
    description: "Fund 3,000 data credits — best for scaling annotation runs.",
    priceInCents: 4999,
    credits: 3000,
  },
  {
    id: "scale-pack",
    name: "Scale Credit Pack",
    description: "Fund 10,000 data credits for large training datasets.",
    priceInCents: 14999,
    credits: 10000,
  },
]

export function getProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id)
}
