"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const LINKS = [
  { href: "/dashboard", label: "Tasks" },
  { href: "/wallet", label: "Wallet" },
  { href: "/funding", label: "Fund" },
  { href: "/support", label: "Support" },
]

export function TopNav({ balance, name, isOwner = false }: { balance: number; name: string; isOwner?: boolean }) {
  const pathname = usePathname()
  const router = useRouter()

  const links = isOwner ? [...LINKS, { href: "/admin", label: "Admin" }] : LINKS

  async function handleSignOut() {
    await authClient.signOut()
    router.push("/")
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary font-mono text-sm font-bold text-primary-foreground">
            W
          </span>
          <span className="font-mono text-sm font-semibold tracking-tight text-foreground">WORX</span>
        </Link>

        <nav className="hidden items-center gap-1 sm:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                pathname === l.href
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5">
            <span className="h-2 w-2 rounded-full bg-accent" aria-hidden />
            <span className="font-mono text-sm font-semibold text-accent tabular-nums">{balance.toLocaleString()}</span>
            <span className="text-xs text-muted-foreground">DATA</span>
          </div>
          <div className="hidden text-right md:block">
            <p className="text-xs text-muted-foreground">Signed in as</p>
            <p className="text-sm font-medium text-foreground">{name}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
      </div>
    </header>
  )
}
