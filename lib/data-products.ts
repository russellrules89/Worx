export type DataProduct = {
  id: string
  name: string
  description: string
  priceAtomic: string
  currency: "USDC"
  network: "base"
  termsVersion: string
  payload: Record<string, unknown>
}

// Only approved, non-sensitive derived packets belong here. Do not add raw
// submissions, contributor identifiers, or storage references to this catalog.
export const DATA_PRODUCTS: readonly DataProduct[] = [
  {
    id: "workforce-quality-summary-v1",
    name: "Workforce quality summary",
    description: "Aggregated, de-identified quality metrics for approved work.",
    priceAtomic: "100000", // 0.10 USDC (6 decimal Base USDC)
    currency: "USDC",
    network: "base",
    termsVersion: "2026-08-data-access-v1",
    payload: {
      schema: "worx.data-packet.v1",
      scope: "aggregated-quality-metrics",
      raw_contributions_included: false,
      personal_data_included: false,
    },
  },
] as const

export function getDataProduct(id: string): DataProduct | undefined {
  return DATA_PRODUCTS.find((product) => product.id === id)
}
