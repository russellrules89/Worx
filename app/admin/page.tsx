import { Suspense } from "react"
import { redirect } from "next/navigation"
import { AppShell } from "@/components/app-shell"
import { isOwner, getTreasuryOverview } from "@/app/actions/owner"
import { OwnerWithdraw } from "@/components/owner-withdraw"
import { CreateFundedTask } from "@/components/create-funded-task"

export const dynamic = "force-dynamic"

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 font-mono text-2xl font-semibold text-foreground tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

async function AdminContent() {
  const overview = await getTreasuryOverview()

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Treasury &amp; profit</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Workers receive 80% of each funded payout and your {overview.feePercent}% owner share stays in the USDC treasury.
        </p>
      </div>

      {!overview.configured && (
        <div className="mb-6 rounded-md border border-destructive/40 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">
            Treasury credentials are not configured, so balances and withdrawals are unavailable.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Profit earned" value={`$${overview.totalProfitUsd}`} hint="Lifetime platform fees" />
        <Stat label="Treasury USDC" value={`$${Number(overview.usdcBalance).toFixed(2)}`} hint="On-chain balance" />
        <Stat label="Treasury ETH" value={Number(overview.ethBalance).toFixed(4)} hint="For gas" />
        <Stat label="Withdrawn" value={`$${overview.withdrawnUsd}`} hint="Sent to your wallet" />
      </div>

      <div className="mt-6 rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">Treasury wallet</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Fund this address with Base USDC for worker payouts and ETH for Base network fees. Card purchases do not automatically become USDC.
        </p>
        <p className="mt-2 break-all rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-foreground">
          {overview.treasuryAddress ?? "Unavailable"}
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <CreateFundedTask />
        <OwnerWithdraw usdcBalance={overview.usdcBalance} />

        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">Recent withdrawals</h2>
          {overview.withdrawals.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No withdrawals yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {overview.withdrawals.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="font-mono text-sm text-foreground">${Number(w.usdcAmount).toFixed(2)}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">{w.toAddress}</p>
                  </div>
                  <span
                    className={
                      w.status === "sent"
                        ? "shrink-0 rounded-full border border-accent/40 bg-accent/5 px-2 py-0.5 text-xs text-accent"
                        : w.status === "failed"
                          ? "shrink-0 rounded-full border border-destructive/40 bg-destructive/5 px-2 py-0.5 text-xs text-destructive"
                          : "shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
                    }
                  >
                    {w.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

export default async function AdminPage() {
  // Gate the route server-side: non-owners are redirected away.
  if (!(await isOwner())) redirect("/dashboard")

  return (
    <AppShell>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading treasury...</p>}>
        <AdminContent />
      </Suspense>
    </AppShell>
  )
}
