"use server"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { ledgerEntry, payout, user } from "@/lib/db/schema"
import { desc, eq, sql } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import {
  AUTO_PAYOUT_THRESHOLD,
  DATA_PER_USD,
  PLATFORM_FEE_BPS,
  dataToUsdc,
  feeFromData,
  isValidPayoutAddress,
  netFromData,
  getTreasuryBalance,
  payableAmount,
  payoutsConfigured,
  sendUsdcPayout,
} from "@/lib/payouts"
import type { Address } from "viem"

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Unauthorized")
  return session.user.id
}

/** Saves/updates the worker's payout wallet address, then tries an auto-payout. */
export async function savePayoutAddress(address: string) {
  const userId = await getUserId()
  const trimmed = address.trim()
  if (!isValidPayoutAddress(trimmed)) {
    return { ok: false as const, error: "That is not a valid EVM wallet address." }
  }
  await db.update(user).set({ payoutAddress: trimmed }).where(eq(user.id, userId))
  revalidatePath("/wallet")
  // Saving an address may immediately unlock a pending auto-payout.
  await attemptAutoPayout(userId)
  return { ok: true as const }
}

export async function getPayoutInfo() {
  const userId = await getUserId()

  const [{ balance }] = await db
    .select({ balance: sql<number>`coalesce(sum(${ledgerEntry.amount}), 0)::int` })
    .from(ledgerEntry)
    .where(eq(ledgerEntry.userId, userId))

  const [u] = await db.select({ payoutAddress: user.payoutAddress }).from(user).where(eq(user.id, userId)).limit(1)

  const history = await db
    .select()
    .from(payout)
    .where(eq(payout.userId, userId))
    .orderBy(desc(payout.createdAt))

  return {
    balance: balance ?? 0,
    payoutAddress: u?.payoutAddress ?? null,
    history,
    threshold: AUTO_PAYOUT_THRESHOLD,
    dataPerUsd: DATA_PER_USD,
    feeBps: PLATFORM_FEE_BPS,
    configured: payoutsConfigured(),
  }
}

/**
 * Reserve-then-send auto payout.
 *
 * 1. In a single transaction, take a per-user advisory lock, recompute the
 *    balance, and if it's at/above the threshold, DEBIT the ledger and create
 *    a `pending` payout row. The debit reserves the funds so concurrent calls
 *    cannot double-spend.
 * 2. After the transaction commits, broadcast the USDC transfer via CDP.
 *    On success, mark the payout `sent` with its tx hash. On failure, mark it
 *    `failed` and REFUND the reserved DATA with a compensating ledger entry.
 *
 * Safe to call after every earning event; it no-ops when below threshold,
 * when no wallet address is set, or when CDP isn't configured.
 */
export async function attemptAutoPayout(userId: string) {
  if (!payoutsConfigured()) return { paid: false as const, reason: "not_configured" }

  // Stripe/card funding creates an off-chain credit balance. It is not USDC.
  // Only release a worker payout after the Base treasury actually holds the
  // worker's 80% USDC share; the remaining 20% stays as owner revenue.
  const treasury = await getTreasuryBalance()
  if (!treasury) return { paid: false as const, reason: "treasury_unavailable" }

  // Phase 1: reserve funds atomically.
  const reserved = await db.transaction(async (tx) => {
    // Serialize payout attempts for this user so balance checks can't race.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`)

    const [{ balance }] = await tx
      .select({ balance: sql<number>`coalesce(sum(${ledgerEntry.amount}), 0)::int` })
      .from(ledgerEntry)
      .where(eq(ledgerEntry.userId, userId))

    const payable = payableAmount(balance ?? 0)
    if (payable <= 0) return null

    const [u] = await tx.select({ payoutAddress: user.payoutAddress }).from(user).where(eq(user.id, userId)).limit(1)
    if (!u?.payoutAddress || !isValidPayoutAddress(u.payoutAddress)) return null

    // Platform fee (20%) is withheld from the gross amount. The worker is
    // debited the full gross, receives the net as USDC, and the fee stays in
    // the treasury as platform profit.
    const fee = feeFromData(payable)
    const net = netFromData(payable)
    const netUsdc = dataToUsdc(net)
    if (Number(treasury.usdc) < Number(netUsdc)) return null

    // Debit (reserve) the full gross amount.
    await tx.insert(ledgerEntry).values({
      userId,
      amount: -payable,
      reason: `Cash-out reserve: ${payable} DATA (${net} net -> ${netUsdc} USDC, ${fee} fee)`,
    })

    const [row] = await tx
      .insert(payout)
      .values({
        userId,
        dataAmount: payable, // gross debited
        feeData: fee, // platform profit (DATA)
        usdcAmount: netUsdc, // net USDC sent to worker
        toAddress: u.payoutAddress,
        status: "pending",
      })
      .returning()

    return row
  })

  if (!reserved) return { paid: false as const, reason: "below_threshold_no_address_or_funds" }

  // Phase 2: broadcast the transfer. Funds are already reserved.
  // Send the NET amount (gross minus the withheld platform fee).
  const netData = reserved.dataAmount - reserved.feeData
  try {
    const { txHash } = await sendUsdcPayout(
      reserved.toAddress as Address,
      netData,
      `payout-${reserved.id}`,
    )
    await db
      .update(payout)
      .set({ status: "sent", txHash, updatedAt: new Date() })
      .where(eq(payout.id, reserved.id))
    revalidatePath("/wallet")
    return { paid: true as const, txHash, amount: reserved.dataAmount }
  } catch (err) {
    const message = (err as Error)?.message ?? "Payout send failed"
    console.log("[v0] payout send failed, refunding:", message)
    // Refund the reserved DATA and mark the payout failed.
    await db.transaction(async (tx) => {
      await tx.insert(ledgerEntry).values({
        userId,
        amount: reserved.dataAmount,
        reason: `Refund for failed payout #${reserved.id}`,
      })
      await tx.update(payout).set({ status: "failed", error: message, updatedAt: new Date() }).where(eq(payout.id, reserved.id))
    })
    revalidatePath("/wallet")
    return { paid: false as const, reason: "send_failed", error: message }
  }
}

/** Manual trigger used by the wallet "Cash out now" button. */
export async function requestPayout() {
  const userId = await getUserId()
  return attemptAutoPayout(userId)
}
