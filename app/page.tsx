import Link from "next/link"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { buttonVariants } from "@/components/ui/button"

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) redirect("/dashboard")

  return (
    <main className="min-h-svh bg-background">
      <header className="mx-auto flex h-16 max-w-6xl items-center px-6">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary font-mono text-sm font-bold text-primary-foreground">
            W
          </span>
          <span className="font-mono text-sm font-semibold tracking-tight text-foreground">WORX</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/sign-in" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Sign in
          </Link>
          <Link href="/sign-up" className={buttonVariants({ size: "sm" })}>
            Get started
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-20 pt-16 md:pt-28">
        <div className="max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            <span className="font-mono text-xs text-muted-foreground">Work-backed data protocol</span>
          </div>
          <h1 className="text-balance font-mono text-4xl font-semibold leading-tight tracking-tight text-foreground md:text-6xl">
            Train the machine. <span className="text-accent">Earn the token.</span>
          </h1>
          <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
            Worx turns human effort into machine intelligence. Annotate data and record voice samples that train our
            models. Every approved contribution mints DATA tokens straight to your wallet.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/sign-up" className={buttonVariants({ size: "lg" })}>
              Start earning
            </Link>
            <Link href="/for-buyers" className={buttonVariants({ variant: "outline", size: "lg" })}>
              I need data
            </Link>
          </div>
        </div>

        <div className="mt-20 grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-3">
          {[
            {
              step: "Contribute",
              title: "Label & record",
              body: "Pick from a live queue of annotation and voice tasks. Each one is a small unit of training data.",
            },
            {
              step: "Get reviewed",
              title: "AI quality gate",
              body: "An AI reviewer scores every submission instantly. Quality work is approved and rewarded.",
            },
            {
              step: "Earn",
              title: "Mint DATA tokens",
              body: "Approved work credits DATA tokens to your wallet ledger — the crypto your data helped create.",
            },
          ].map((c) => (
            <div key={c.step} className="bg-card p-6">
              <p className="font-mono text-xs uppercase tracking-widest text-primary">{c.step}</p>
              <h3 className="mt-3 text-lg font-semibold text-foreground">{c.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.body}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
