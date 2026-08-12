"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { withdrawProfit } from "@/app/actions/owner"

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"

export function OwnerWithdraw({ usdcBalance }: { usdcBalance: string }) {
  const [address, setAddress] = useState("")
  const [amount, setAmount] = useState("")
  const [confirm, setConfirm] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string; txHash?: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const available = Number(usdcBalance)

  function submit() {
    setResult(null)
    startTransition(async () => {
      const res = await withdrawProfit(address, amount)
      if (res.ok) {
        setResult({ ok: true, message: "Withdrawal sent.", txHash: res.txHash })
        setAmount("")
        setConfirm(false)
      } else {
        setResult({ ok: false, message: res.error })
      }
    })
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-sm font-semibold text-foreground">Withdraw profit</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Send USDC from the treasury to your personal wallet. Confirm the destination address on every withdrawal.
      </p>

      <div className="mt-4 space-y-3">
        <div>
          <label htmlFor="owner-address" className="mb-1 block text-xs font-medium text-muted-foreground">
            Destination wallet (Base network)
          </label>
          <input
            id="owner-address"
            value={address}
            onChange={(e) => {
              setAddress(e.target.value)
              setConfirm(false)
            }}
            placeholder="0x..."
            className={inputClass}
            spellCheck={false}
            autoComplete="off"
          />
        </div>

        <div>
          <label htmlFor="owner-amount" className="mb-1 block text-xs font-medium text-muted-foreground">
            Amount (USDC) · available ${available.toFixed(2)}
          </label>
          <div className="flex gap-2">
            <input
              id="owner-amount"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
                setConfirm(false)
              }}
              inputMode="decimal"
              placeholder="0.00"
              className={inputClass}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setAmount(available.toFixed(2))
                setConfirm(false)
              }}
            >
              Max
            </Button>
          </div>
        </div>

        {!confirm ? (
          <Button
            type="button"
            className="w-full"
            disabled={pending || !address || !amount || available <= 0}
            onClick={() => setConfirm(true)}
          >
            Review withdrawal
          </Button>
        ) : (
          <div className="rounded-md border border-primary/40 bg-primary/5 p-3">
            <p className="text-xs leading-relaxed text-foreground">
              Send <span className="font-mono font-semibold">${Number(amount || 0).toFixed(2)} USDC</span> to
            </p>
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{address}</p>
            <div className="mt-3 flex gap-2">
              <Button type="button" size="sm" className="flex-1" disabled={pending} onClick={submit}>
                {pending ? "Sending..." : "Confirm & send"}
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setConfirm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {result && (
          <div
            className={
              result.ok
                ? "rounded-md border border-accent/40 bg-accent/5 p-3"
                : "rounded-md border border-destructive/40 bg-destructive/5 p-3"
            }
          >
            <p className={result.ok ? "text-xs text-accent" : "text-xs text-destructive"}>{result.message}</p>
            {result.txHash && (
              <a
                href={`https://basescan.org/tx/${result.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block break-all font-mono text-xs text-primary underline"
              >
                {result.txHash}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
