import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getWallet } from "@/app/actions/tasks"
import { isOwner } from "@/app/actions/owner"
import { TopNav } from "@/components/top-nav"

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/sign-in")

  const { balance } = await getWallet()
  const owner = await isOwner()

  return (
    <div className="min-h-svh bg-background">
      <TopNav balance={balance} name={session.user.name} isOwner={owner} />
      <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
    </div>
  )
}
