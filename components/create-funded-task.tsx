"use client"

import { useState, useTransition } from "react"
import { createFundedTask } from "@/app/actions/admin-tasks"
import { Button } from "@/components/ui/button"

export function CreateFundedTask() {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  function submit(formData: FormData) {
    setMessage(null)
    startTransition(async () => {
      const result = await createFundedTask({ title: String(formData.get("title") ?? ""), instructions: String(formData.get("instructions") ?? ""), type: String(formData.get("type") ?? "annotation") as "annotation" | "voice", content: String(formData.get("content") ?? ""), rewardUsd: String(formData.get("rewardUsd") ?? ""), fundingReference: String(formData.get("fundingReference") ?? "") })
      setMessage(result.ok ? "Funded task published." : result.error)
    })
  }
  return <form action={submit} className="grid gap-3 rounded-lg border border-border bg-card p-5"><div><h2 className="text-sm font-semibold text-foreground">Publish funded task</h2><p className="mt-1 text-xs text-muted-foreground">One scoped completion per worker. Rewards are limited to $5–$500 and require available treasury USDC.</p></div><Input name="title" label="Task title" required /><label className="grid gap-1 text-xs font-medium text-muted-foreground">Type<select name="type" className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground"><option value="annotation">Annotation / research</option><option value="voice">Voice collection</option></select></label><Input name="content" label="Task item or prompt" required /><label className="grid gap-1 text-xs font-medium text-muted-foreground">Instructions<textarea name="instructions" required minLength={20} rows={4} className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground" /></label><div className="grid gap-3 sm:grid-cols-2"><Input name="rewardUsd" label="Gross sponsor funding (USD)" type="number" required /><Input name="fundingReference" label="Verified sponsor funding reference" required /></div><Button type="submit" disabled={pending}>{pending ? "Publishing..." : "Publish funded task"}</Button>{message && <p className="text-xs text-muted-foreground">{message}</p>}</form>
}
function Input({ name, label, type = "text", required = false }: { name: string; label: string; type?: string; required?: boolean }) { return <label className="grid gap-1 text-xs font-medium text-muted-foreground">{label}<input name={name} type={type} required={required} min={type === "number" ? "5" : undefined} max={type === "number" ? "500" : undefined} step={type === "number" ? "0.01" : undefined} className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground" /></label> }
