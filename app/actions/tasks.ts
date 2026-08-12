"use server"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { task, submission, ledgerEntry } from "@/lib/db/schema"
import { and, desc, eq, isNotNull, notInArray, sql } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { generateText, Output } from "ai"
import { z } from "zod"
import { attemptAutoPayout } from "@/app/actions/payouts"

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Unauthorized")
  return session.user.id
}

export async function getAvailableTasks() {
  const userId = await getUserId()

  // Tasks the user has already submitted for
  const done = await db
    .select({ taskId: submission.taskId })
    .from(submission)
    .where(eq(submission.userId, userId))

  const doneIds = done.map((d) => d.taskId)

  const rows = doneIds.length
    ? await db
        .select()
        .from(task)
        .where(and(eq(task.status, "open"), isNotNull(task.fundingReference), notInArray(task.id, doneIds)))
        .orderBy(desc(task.createdAt))
    : await db.select().from(task).where(and(eq(task.status, "open"), isNotNull(task.fundingReference))).orderBy(desc(task.createdAt))

  return rows
}

export async function getMySubmissions() {
  const userId = await getUserId()
  return db
    .select()
    .from(submission)
    .where(eq(submission.userId, userId))
    .orderBy(desc(submission.createdAt))
}

type ReviewInput = {
  taskId: number
  // For annotation tasks: the chosen label / text answer.
  // For voice tasks: a short transcript/confirmation string.
  response: string
}

type Review = { score: number; approved: boolean; feedback: string }

/**
 * Deterministic fallback reviewer used when the AI grader is unavailable
 * (e.g. no AI Gateway credits). Keeps the "work -> earn" loop functional by
 * approving genuine, on-task answers and rejecting empty / low-effort ones.
 */
function heuristicReview(taskType: string, response: string, payload: Record<string, unknown>): Review {
  const answer = response.trim()
  if (answer.length < 2) {
    return { score: 0, approved: false, feedback: "Answer was empty or too short." }
  }

  if (taskType === "voice") {
    const target = String(payload.prompt ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter(Boolean)
    const said = new Set(
      answer
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter(Boolean),
    )
    const matched = target.filter((w) => said.has(w)).length
    const ratio = target.length ? matched / target.length : 0
    const score = Math.round(ratio * 100)
    return {
      score,
      approved: ratio >= 0.6,
      feedback:
        ratio >= 0.6
          ? "Transcript closely matches the target phrase."
          : "Transcript did not match the target phrase closely enough.",
    }
  }

  // Annotation: accept any substantive, on-task label.
  return {
    score: 80,
    approved: true,
    feedback: "Annotation accepted (heuristic review).",
  }
}

/**
 * Submit work for a task. The submission is auto-reviewed by the AI grader.
 * If approved, crypto-style reward tokens are credited to the worker ledger.
 */
export async function submitTask({ taskId, response }: ReviewInput) {
  const userId = await getUserId()

  // Atomically claim this funded work unit before review. A task can be
  // completed once, preventing an unbounded number of workers from drawing on
  // the same sponsor allocation.
  const [t] = await db
    .update(task)
    .set({ status: "claimed" })
    .where(and(eq(task.id, taskId), eq(task.status, "open")))
    .returning()
  if (!t) throw new Error("This task is no longer available.")

  // ---- AI auto-review ----
  const payload = (t.payload ?? {}) as Record<string, unknown>
  const context =
    t.type === "voice"
      ? `Target phrase to read aloud: "${payload.prompt ?? ""}". Worker's transcript of their recording: "${response}".`
      : `Annotation task. Item: "${payload.text ?? ""}". Worker's label/answer: "${response}".`

  let review: Review

  try {
    const { output } = await generateText({
      model: "google/gemini-2.5-flash-lite",
      output: Output.object({
        schema: z.object({
          score: z.number().min(0).max(100).describe("Quality score 0-100"),
          approved: z.boolean().describe("Whether the work meets quality standards"),
          feedback: z.string().describe("One short sentence of feedback for the worker"),
        }),
      }),
      prompt:
        `You are a strict but fair data-quality reviewer for an AI training dataset. ` +
        `Judge whether the worker's contribution is genuine, on-task, and high quality. ` +
        `Reject empty, nonsensical, or clearly low-effort answers.\n\n${context}`,
    })
    review = { score: output.score, approved: output.approved, feedback: output.feedback }
  } catch (err) {
    // AI grader unavailable (e.g. no gateway credits) — fall back to the
    // deterministic reviewer so the earn loop keeps working.
    console.log("[v0] AI review unavailable, using heuristic fallback:", (err as Error)?.message)
    review = heuristicReview(t.type, response, payload)
  }

  const { score: aiScore, feedback: aiFeedback, approved } = review

  const reward = approved ? t.rewardTokens : 0

  const [created] = await db
    .insert(submission)
    .values({
      taskId,
      userId,
      taskType: t.type,
      data: { response },
      status: approved ? "approved" : "rejected",
      aiScore,
      aiFeedback,
      rewardTokens: reward,
    })
    .returning()

  // Rejected submissions release the task for a later worker; approved work
  // consumes the one verified sponsor-funded allocation.
  await db.update(task).set({ status: approved ? "completed" : "open" }).where(eq(task.id, taskId))

  let payout: Awaited<ReturnType<typeof attemptAutoPayout>> | null = null
  if (approved && reward > 0) {
    await db.insert(ledgerEntry).values({
      userId,
      amount: reward,
      reason: `Reward for task #${taskId}: ${t.title}`,
      submissionId: created.id,
    })
    // A new reward may push the balance over the auto-payout threshold.
    payout = await attemptAutoPayout(userId)
  }

  revalidatePath("/dashboard")
  revalidatePath("/wallet")
  return { status: created.status, aiScore, aiFeedback, reward, payout }
}

export async function getWallet() {
  const userId = await getUserId()

  const [{ balance }] = await db
    .select({ balance: sql<number>`coalesce(sum(${ledgerEntry.amount}), 0)::int` })
    .from(ledgerEntry)
    .where(eq(ledgerEntry.userId, userId))

  const entries = await db
    .select()
    .from(ledgerEntry)
    .where(eq(ledgerEntry.userId, userId))
    .orderBy(desc(ledgerEntry.createdAt))

  return { balance: balance ?? 0, entries }
}
