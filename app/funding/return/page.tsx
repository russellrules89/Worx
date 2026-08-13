import Link from "next/link"
import { AppShell } from "@/components/app-shell"
import { fulfillCheckout } from "@/app/actions/stripe"
import { buttonVariants } from "@/components/ui/button"

export default async function ReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>
}) {
  const { session_id } = await searchParams

  return (
    <AppShell>
      <ReturnContent sessionId={session_id} />
    </AppShell>
  )
}

async function ReturnContent({ sessionId }: { sessionId?: string }) {
  if (!sessionId) {
    return <Message title="Missing session" body="We couldn't find your checkout session." />
  }

  let result: { status: string; credits: number }
  try {
    result = await fulfillCheckout(sessionId)
  } catch {
    return <Message title="Something went wrong" body="We couldn't verify your payment. Please contact support." />
  }

  if (result.status !== "paid") {
    return <Message title="Payment not completed" body="Your payment was not completed. No credits were added." />
  }

  return (
    <Message
      title="Payment successful"
      body={`${result.credits.toLocaleString()} DATA credits have been added to your balance.`}
      success
    />
  )
}

function Message({ title, body, success }: { title: string; body: string; success?: boolean }) {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-8 text-center">
      <div
        className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${
          success ? "bg-accent/15 text-accent" : "bg-secondary text-muted-foreground"
        }`}
      >
        <span className="font-mono text-lg font-bold">{success ? "✓" : "!"}</span>
      </div>
      <h1 className="mt-4 text-lg font-semibold text-foreground">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/wallet" className={buttonVariants()}>
          View wallet
        </Link>
        <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>
          Back to tasks
        </Link>
      </div>
    </div>
  )
}
