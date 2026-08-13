"use server"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { ownerWithdrawal, payout, user } from "@/lib/db/schema"
import { desc, eq, sql } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import {
  DATA_PER_USD,
  PLATFORM_FEE_BPS,
  getTreasuryBalance,
  isValidPayoutAddress,
  payoutsConfigured,
  sendOwnerWithdrawal,
} from "@/lib/payouts"
import type { Address } from "viem"

/**
 * Resolves whether the signed-in user is the owner.
 *
 * Ownership now lives in the database (`user.role === 'owner'`). The
 * OWNER_EMAIL env var is kept only as a bootstrap: if a signed-in account's
 * email matches it but the account isn't yet flagged in the DB, we promote it
 * to 'owner' so the role is persisted going forward.
 */
async function resolveOwnerUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null

  const [row] = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1)

  if (row?.role === "owner") return session.user.id

  // Bootstrap from OWNER_EMAIL: promote a matching account once.
  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase()
  if (ownerEmail && session.user.email.trim().toLowerCase() === ownerEmail) {
    await db.update(user).set({ role: "owner" }).where(eq(user.id, session.user.id))
    return session.user.id
  }

  return null
}

export async function requireOwner() {
  const userId = await resolveOwnerUserId()
  if (!userId) throw new Error("Forbidden")
  return userId
}

/** Non-throwing check used by the page/nav to decide whether to render admin UI. */
export async function isOwner() {
  return (await resolveOwnerUserId()) !== null
}

export async function getTreasuryOverview() {
  await requireOwner()

  // Total profit earned = owner shares from completed on-chain payouts. Failed or
  // pending payouts are excluded because their worker transfer is not final yet.
  const [{ feeData }] = await db
    .select({ feeData: sql<number>`coalesce(sum(${payout.feeData}), 0)::int` })
    .from(payout)
    .where(sql`${payout.status} in ('sent', 'confirmed')`)

  const totalFeeData = feeData ?? 0
  const totalProfitUsd = (totalFeeData / DATA_PER_USD).toFixed(2)

  const balance = await getTreasuryBalance()

  const withdrawals = await db.select().from(ownerWithdrawal).orderBy(desc(ownerWithdrawal.createdAt)).limit(20)

  const withdrawnUsd = withdrawals
    .filter((w) => w.status === "sent")
    .reduce((s, w) => s + Number(w.usdcAmount), 0)
    .toFixed(2)

  return {
    configured: payoutsConfigured(),
    treasuryAddress: balance?.address ?? null,
    usdcBalance: balance?.usdc ?? "0",
    ethBalance: balance?.eth ?? "0",
    totalProfitUsd,
    withdrawnUsd,
    feePercent: PLATFORM_FEE_BPS / 100,
    withdrawals,
  }
}

/**
 * Withdraws `dollars` of USDC treasury profit to the owner-supplied address.
 * Records the attempt, broadcasts via CDP, and marks the result. The owner
 * confirms the destination address on every withdrawal (no stored address).
 */
export async function withdrawProfit(address: string, dollars: string) {
  await requireOwner()

  if (!payoutsConfigured()) {
    return { ok: false as const, error: "Treasury credentials are not configured." }
  }

  const to = address.trim()
  if (!isValidPayoutAddress(to)) {
    return { ok: false as const, error: "That is not a valid EVM wallet address." }
  }

  const amount = Number(dollars)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false as const, error: "Enter a withdrawal amount greater than $0." }
  }

  // The owner can withdraw only their realized 20% share, never the worker
  // allocation held by the treasury. Both the on-chain balance and the
  // unwithdrawn fee ledger must cover the request.
  const [balance, [{ feeData }], withdrawals] = await Promise.all([
    getTreasuryBalance(),
    db
      .select({ feeData: sql<number>`coalesce(sum(${payout.feeData}), 0)::int` })
      .from(payout)
      .where(sql`${payout.status} in ('sent', 'confirmed')`),
    db.select({ usdcAmount: ownerWithdrawal.usdcAmount }).from(ownerWithdrawal).where(eq(ownerWithdrawal.status, "sent")),
  ])
  const treasuryAvailable = Number(balance?.usdc ?? "0")
  const realizedOwnerShare = (feeData ?? 0) / DATA_PER_USD
  const alreadyWithdrawn = withdrawals.reduce((sum, withdrawal) => sum + Number(withdrawal.usdcAmount), 0)
  const available = Math.max(0, Math.min(treasuryAvailable, realizedOwnerShare - alreadyWithdrawn))
  if (amount > available) {
    return {
      ok: false as const,
      error: `Amount exceeds available owner USDC share ($${available.toFixed(2)}).`,
    }
  }

  const normalized = amount.toFixed(6)

  // Record the pending withdrawal first so we always have an audit row.
  const [row] = await db
    .insert(ownerWithdrawal)
    .values({ usdcAmount: normalized, toAddress: to, status: "pending" })
    .returning()

  try {
    const { txHash } = await sendOwnerWithdrawal(to as Address, normalized, `owner-withdrawal-${row.id}`)
    await db
      .update(ownerWithdrawal)
      .set({ status: "sent", txHash, updatedAt: new Date() })
      .where(eq(ownerWithdrawal.id, row.id))
    revalidatePath("/admin")
    return { ok: true as const, txHash }
  } catch (err) {
    const message = (err as Error)?.message ?? "Withdrawal failed"
    await db
      .update(ownerWithdrawal)
      .set({ status: "failed", error: message, updatedAt: new Date() })
      .where(eq(ownerWithdrawal.id, row.id))
    revalidatePath("/admin")
    return { ok: false as const, error: message }
  }
}
