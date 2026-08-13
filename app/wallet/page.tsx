import { AppShell } from "@/components/app-shell"
import { getWallet } from "@/app/actions/tasks"
import { getPayoutInfo } from "@/app/actions/payouts"
import { CashOut } from "@/components/cash-out"

export default async function WalletPage() {
  return (
    <AppShell>
      <WalletContent />
    </AppShell>
  )
}

async function WalletContent() {
  const { balance, entries } = await getWallet()
  const payoutInfo = await getPayoutInfo()

  const earned = entries.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0)
  const spent = entries.filter((e) => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0)

  return (
    <div>
      <h1 className="font-mono text-2xl font-semibold tracking-tight text-foreground">Wallet</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your DATA token balance — the crypto minted from data you helped create.
      </p>

      <div className="mt-6 rounded-xl border border-border bg-card p-6">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Balance</p>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-mono text-5xl font-semibold tabular-nums text-accent">{balance.toLocaleString()}</span>
          <span className="text-lg text-muted-foreground">DATA</span>
        </div>
        <div className="mt-4 flex gap-6 text-sm">
          <span className="text-muted-foreground">
            Earned <span className="font-mono text-foreground">{earned.toLocaleString()}</span>
          </span>
          <span className="text-muted-foreground">
            Spent <span className="font-mono text-foreground">{spent.toLocaleString()}</span>
          </span>
        </div>
      </div>

      <CashOut
        balance={payoutInfo.balance}
        payoutAddress={payoutInfo.payoutAddress}
        history={payoutInfo.history.map((p) => ({ ...p, createdAt: p.createdAt as unknown as string }))}
        threshold={payoutInfo.threshold}
        dataPerUsd={payoutInfo.dataPerUsd}
        feeBps={payoutInfo.feeBps}
        configured={payoutInfo.configured}
      />

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-foreground">Ledger</h2>
        <div className="mt-3 overflow-hidden rounded-xl border border-border">
          {entries.length === 0 ? (
            <p className="bg-card p-6 text-sm text-muted-foreground">
              No transactions yet. Complete tasks on the queue to start earning DATA.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {entries.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-4 bg-card px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">{e.reason}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {new Date(e.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 font-mono text-sm font-semibold tabular-nums ${
                      e.amount >= 0 ? "text-accent" : "text-destructive"
                    }`}
                  >
                    {e.amount >= 0 ? "+" : ""}
                    {e.amount.toLocaleString()}
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
