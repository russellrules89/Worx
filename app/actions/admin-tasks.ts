"use server"

import { requireOwner } from "@/app/actions/owner"
import { db } from "@/lib/db"
import { task } from "@/lib/db/schema"
import { getTreasuryBalance, payoutsConfigured } from "@/lib/payouts"
import { revalidatePath } from "next/cache"
import { and, eq, isNotNull, sql } from "drizzle-orm"
import { z } from "zod"

const fundedTaskSchema = z.object({
  title: z.string().trim().min(5).max(160),
  instructions: z.string().trim().min(20).max(4000),
  type: z.enum(["annotation", "voice"]),
  content: z.string().trim().min(5).max(2000),
  rewardUsd: z.coerce.number().min(5).max(500),
  fundingReference: z.string().trim().min(4).max(160),
})

/** Creates one bounded, sponsor-funded work unit. The owner must provide the
 * verified funding reference; unverified buyer requests cannot open tasks. */
export async function createFundedTask(input: z.input<typeof fundedTaskSchema>) {
  await requireOwner()
  const parsed = fundedTaskSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: "Use a $5–$500 reward and complete all task fields." }
  if (!payoutsConfigured()) return { ok: false as const, error: "Treasury credentials are not configured." }

  const grossData = Math.round(parsed.data.rewardUsd * 100)
  const workerUsdc = parsed.data.rewardUsd * 0.8
  const treasury = await getTreasuryBalance()
  if (!treasury) return { ok: false as const, error: "Treasury balance is unavailable." }

  const published = await db.transaction(async (tx) => {
    // Prevent concurrent owners from reserving the same treasury USDC twice.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('funded-task-reservations'))`)
    const [{ reservedData }] = await tx
      .select({ reservedData: sql<number>`coalesce(sum(${task.rewardTokens}), 0)::int` })
      .from(task)
      .where(and(eq(task.status, "open"), isNotNull(task.fundingReference)))
    const reservedWorkerUsdc = (reservedData ?? 0) / 100 * 0.8
    if (Number(treasury.usdc) < reservedWorkerUsdc + workerUsdc) return false

    await tx.insert(task).values({
      title: parsed.data.title,
      instructions: parsed.data.instructions,
      type: parsed.data.type,
      payload: parsed.data.type === "voice" ? { prompt: parsed.data.content } : { text: parsed.data.content },
      rewardTokens: grossData,
      fundingReference: parsed.data.fundingReference,
      status: "open",
    })
    return true
  })
  if (!published) {
    return { ok: false as const, error: "Treasury USDC is already reserved for open tasks. Fund the treasury before publishing this task." }
  }
  revalidatePath("/dashboard")
  revalidatePath("/admin")
  return { ok: true as const }
}
