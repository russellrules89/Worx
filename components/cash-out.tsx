"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { savePayoutAddress, requestPayout } from "@/app/actions/payouts"

type Payout = {
  id: number
  dataAmount: number
  usdcAmount: string
  toAddress: string
  status: string
  txHash: string | null
  error: string | null
  createdAt: string | Date
}

type Props = {
  balance: number
  payoutAddress: string | null
  history: Payout[]
  threshold: number
  dataPerUsd: number
  feeBps: number
  configured: boolean
}

const statusStyles: Record<string, string> = {
  sent: "text-accent",
  confirmed: "text-accent",
  pending: "text-muted-foreground",
  failed: "text-destructive",
}

function shorten(addr: string) {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr
}

export function CashOut({ balance, payoutAddress, history, threshold, dataPerUsd, feeBps, configured }: Props) {
  const router = useRouter()
  const [address, setAddress] = useState(payoutAddress ?? "")
  const [editing, setEditing] = useState(!payoutAddress)
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  const feePercent = feeBps / 100
  const progress = Math.min(100, Math.round((balance / threshold) * 100))
  const usdValue = (balance / dataPerUsd).toFixed(2)
  const netUsdValue = ((balance / dataPerUsd) * (1 - feeBps / 10000)).toFixed(2)
  const reachedThreshold = balance >= threshold

  function onSaveAddress() {
    setMessage(null)
    startTransition(async () => {
      const res = await savePayoutAddress(address)
      if (!res.ok) {
        setMessage({ kind: "error", text: res.error })
        return
      }
      setEditing(false)
      setMessage({ kind: "ok", text: "Wallet address saved." })
      router.refresh()
    })
  }

  function onCashOut() {
    setMessage(null)
    startTransition(async () => {
      const res = await requestPayout()
      if (res.paid) {
        setMessage({ kind: "ok", text: `Payout sent! ${res.amount} DATA released as an 80% USDC worker payment.` })
      } else if (res.reason === "below_threshold_no_address_or_funds") {
        setMessage({ kind: "error", text: "Payout needs the threshold, a wallet address, and funded treasury USDC." })
      } else if (res.reason === "not_configured") {
        setMessage({ kind: "error", text: "Payouts are not configured yet." })
      } else if (res.reason === "treasury_unavailable") {
        setMessage({ kind: "error", text: "Treasury balance is unavailable. No payout was reserved." })
      } else {
        setMessage({ kind: "error", text: res.error ?? "Payout failed. Your balance was refunded." })
      }
      router.refresh()
    })
  }

  return (
    <section className="mt-8 rounded-xl border border-border bg-card p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-mono text-sm font-semibold uppercase tracking-widest text-foreground">Cash out</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {dataPerUsd} DATA = $1.00 USDC · auto-pays at {threshold.toLocaleString()} DATA · 80% worker / {feePercent}% owner split
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl font-semibold tabular-nums text-accent">${netUsdValue}</p>
          <p className="text-xs text-muted-foreground">worker share (80%)</p>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground tabular-nums">${usdValue} gross</p>
        </div>
      </div>

      {/* Threshold progress */}
      <div className="mt-5">
        <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
          <span>Progress to next auto-payout</span>
          <span className="font-mono">
            {balance.toLocaleString()} / {threshold.toLocaleString()}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${progress}%` }}
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </div>

      {/* Payout wallet address */}
      <div className="mt-6">
        <label htmlFor="payout-address" className="text-xs font-medium text-muted-foreground">
          USDC payout wallet (Base network)
        </label>
        {editing ? (
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="payout-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="0x…"
              spellCheck={false}
              className="h-10 flex-1 rounded-md border border-border bg-background px-3 font-mono text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button onClick={onSaveAddress} disabled={isPending || !address.trim()}>
              {isPending ? "Saving…" : "Save address"}
            </Button>
          </div>
        ) : (
          <div className="mt-2 flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
            <span className="font-mono text-sm text-foreground">{payoutAddress && shorten(payoutAddress)}</span>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Change
            </button>
          </div>
        )}
      </div>

      {/* Manual cash-out */}
      <div className="mt-4 flex items-center gap-3">
        <Button onClick={onCashOut} disabled={isPending || !payoutAddress || !reachedThreshold} variant="outline">
          {isPending ? "Processing…" : "Cash out now"}
        </Button>
        {!reachedThreshold && (
          <span className="text-xs text-muted-foreground">
            Reach {threshold.toLocaleString()} DATA to cash out
          </span>
        )}
      </div>

      {!configured && (
        <p className="mt-3 text-xs text-muted-foreground">
          Payouts require a configured treasury funded with Base USDC and ETH for network fees.
        </p>
      )}

      {message && (
        <p className={`mt-3 text-sm ${message.kind === "error" ? "text-destructive" : "text-accent"}`}>
          {message.text}
        </p>
      )}

      {/* Payout history */}
      {history.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Payout history</h3>
          <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
            {history.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-4 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="font-mono text-sm text-foreground">
                    {p.dataAmount.toLocaleString()} DATA → ${p.usdcAmount} USDC
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {new Date(p.createdAt).toLocaleString()} · {shorten(p.toAddress)}
                    {p.txHash && (
                      <>
                        {" · "}
                        <a
                          href={`https://basescan.org/tx/${p.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-2 hover:text-foreground"
                        >
                          view tx
                        </a>
                      </>
                    )}
                  </p>
                </div>
                <span className={`shrink-0 font-mono text-xs font-semibold uppercase ${statusStyles[p.status] ?? "text-muted-foreground"}`}>
                  {p.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
