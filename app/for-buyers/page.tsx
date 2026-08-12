import Link from "next/link"
import { PurchaserIntake } from "@/components/purchaser-intake"
import { buttonVariants } from "@/components/ui/button"

export default function ForBuyersPage() {
  return <main className="min-h-svh bg-background"><header className="mx-auto flex h-16 max-w-4xl items-center px-6"><Link href="/" className="font-mono text-sm font-semibold text-foreground">WORX</Link><Link href="/sign-in" className={`${buttonVariants({ variant: "ghost", size: "sm" })} ml-auto`}>Sign in</Link></header><section className="mx-auto max-w-2xl px-6 py-16"><p className="font-mono text-xs uppercase tracking-widest text-primary">For data purchasers</p><h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground">Fund reliable human data collection.</h1><p className="mt-4 text-base leading-relaxed text-muted-foreground">Submit a scoped request. We verify the buyer, agree permitted use, and confirm treasury USDC before publishing worker tasks. Approved work is paid at an 80% worker / 20% platform split.</p><PurchaserIntake /></section></main>
}
