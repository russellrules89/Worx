"use client"

import { useState, useTransition } from "react"
import { submitPurchaserRequest } from "@/app/actions/purchasers"
import { Button } from "@/components/ui/button"

export function PurchaserIntake() {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  function submit(formData: FormData) {
    setMessage(null)
    startTransition(async () => {
      const result = await submitPurchaserRequest({
        organization: String(formData.get("organization") ?? ""), contactName: String(formData.get("contactName") ?? ""),
        contactEmail: String(formData.get("contactEmail") ?? ""), dataRequirements: String(formData.get("dataRequirements") ?? ""),
        estimatedBudgetUsd: String(formData.get("estimatedBudgetUsd") ?? ""),
      })
      setMessage(result.ok ? "Request received. Buyer verification, terms, and USDC funding are required before collection starts." : result.error)
    })
  }

  return <form action={submit} className="mt-8 grid gap-4 rounded-xl border border-border bg-card p-6">
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Organization" name="organization" required /><Field label="Your name" name="contactName" required /></div>
    <Field label="Work email" name="contactEmail" type="email" required /><Field label="Estimated budget (USD)" name="estimatedBudgetUsd" type="number" />
    <label className="grid gap-2 text-sm font-medium text-foreground">Data requirements<textarea name="dataRequirements" required minLength={20} maxLength={5000} rows={6} placeholder="Data type, quantity, quality criteria, intended use, and timeline." className="rounded-md border border-border bg-background px-3 py-2 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
    <Button type="submit" disabled={pending}>{pending ? "Sending..." : "Request data collection"}</Button>{message && <p className="text-sm text-muted-foreground">{message}</p>}
  </form>
}
function Field({ label, name, type = "text", required = false }: { label: string; name: string; type?: string; required?: boolean }) {
  return <label className="grid gap-2 text-sm font-medium text-foreground">{label}<input name={name} type={type} required={required} min={type === "number" ? "1" : undefined} className="h-10 rounded-md border border-border bg-background px-3 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
}
