import { auth } from "@/lib/auth"
import { generateText } from "ai"
import { headers } from "next/headers"
import { z } from "zod"

export const maxDuration = 30

const inputSchema = z.object({ message: z.string().trim().min(1).max(1200) })

const instructions = `You are Worx worker support. Help workers understand tasks, task review, DATA balances, Base USDC cash-outs, wallet addresses, and the 80% worker / 20% owner split. Explain that DATA is an internal reward balance redeemed only from a funded Base USDC treasury; do not say data itself creates cryptocurrency. Never request or expose wallet seed phrases, passwords, API keys, or private data. You cannot change payouts, review decisions, accounts, task availability, or funding. For missing payouts, direct workers to check their wallet address and contact the platform owner.`

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = inputSchema.safeParse(await request.json())
  if (!parsed.success) return Response.json({ error: "Enter a support question under 1,200 characters." }, { status: 400 })

  try {
    const { text } = await generateText({
      model: "google/gemini-2.5-flash-lite",
      system: instructions,
      prompt: parsed.data.message,
    })
    return Response.json({ answer: text })
  } catch {
    return Response.json({ error: "Support chat is temporarily unavailable." }, { status: 503 })
  }
}
