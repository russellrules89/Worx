"use server"

import { db } from "@/lib/db"
import { purchaserRequest } from "@/lib/db/schema"
import { z } from "zod"

const requestSchema = z.object({
  organization: z.string().trim().min(2).max(120),
  contactName: z.string().trim().min(2).max(120),
  contactEmail: z.string().trim().email().max(254),
  dataRequirements: z.string().trim().min(20).max(5000),
  estimatedBudgetUsd: z.string().trim().optional(),
})

/** Creates a buyer lead; it cannot create tasks, access data, or move funds. */
export async function submitPurchaserRequest(input: z.infer<typeof requestSchema>) {
  const parsed = requestSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: "Complete all required fields with valid contact information." }

  const budget = parsed.data.estimatedBudgetUsd ? Number(parsed.data.estimatedBudgetUsd) : null
  if (budget !== null && (!Number.isFinite(budget) || budget <= 0 || budget > 10_000_000)) {
    return { ok: false as const, error: "Enter a valid estimated budget." }
  }

  await db.insert(purchaserRequest).values({
    organization: parsed.data.organization,
    contactName: parsed.data.contactName,
    contactEmail: parsed.data.contactEmail.toLowerCase(),
    dataRequirements: parsed.data.dataRequirements,
    estimatedBudgetUsd: budget === null ? null : budget.toFixed(2),
  })
  return { ok: true as const }
}
