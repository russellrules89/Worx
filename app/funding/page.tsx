import { AppShell } from "@/components/app-shell"
import { FundingPicker } from "@/components/funding-picker"
import { PRODUCTS } from "@/lib/products"

export default async function FundingPage() {
  return (
    <AppShell>
      <div>
        <h1 className="font-mono text-2xl font-semibold tracking-tight text-foreground">Fund the pool</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Card purchases add off-chain DATA credits. They do not automatically convert to Base USDC; worker cash-outs are released only from a separately funded USDC treasury.
        </p>
        <div className="mt-8">
          <FundingPicker products={PRODUCTS} />
        </div>
      </div>
    </AppShell>
  )
}
