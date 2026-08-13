import { AppShell } from "@/components/app-shell"
import { getAvailableTasks, getMySubmissions } from "@/app/actions/tasks"
import { TaskWorkspace } from "@/components/task-workspace"

export default async function DashboardPage() {
  return (
    <AppShell>
      <DashboardContent />
    </AppShell>
  )
}

async function DashboardContent() {
  const [tasks, submissions] = await Promise.all([getAvailableTasks(), getMySubmissions()])

  const approved = submissions.filter((s) => s.status === "approved").length
  const earned = submissions.reduce((sum, s) => sum + s.rewardTokens, 0)

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-mono text-2xl font-semibold tracking-tight text-foreground">Task queue</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Complete annotation and voice tasks. Approved work mints DATA tokens.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border text-center">
          <Stat label="Open" value={tasks.length} />
          <Stat label="Approved" value={approved} />
          <Stat label="Earned" value={earned} accent />
        </div>
      </div>

      <div className="mt-8">
        <TaskWorkspace tasks={tasks as never} />
      </div>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="bg-card px-5 py-3">
      <p className={`font-mono text-lg font-semibold tabular-nums ${accent ? "text-accent" : "text-foreground"}`}>
        {value.toLocaleString()}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}
