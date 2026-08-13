"use client"

import { useState, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { submitTask } from "@/app/actions/tasks"
import { Button } from "@/components/ui/button"

type Task = {
  id: number
  type: string
  title: string
  instructions: string
  payload: Record<string, unknown> | null
  rewardTokens: number
}

type Result = {
  status: string
  aiScore: number
  aiFeedback: string
  reward: number
}

const ANNOTATION_LABELS = ["Positive", "Negative", "Neutral", "Question", "Complaint", "Request"]

export function TaskWorkspace({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="font-mono text-sm text-muted-foreground">
          No open tasks right now. Check back soon — new training tasks are added continuously.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {tasks.map((t) => (
        <TaskCard key={t.id} task={t} />
      ))}
    </div>
  )
}

function TaskCard({ task }: { task: Task }) {
  const router = useRouter()
  const [response, setResponse] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!response.trim()) {
      setError("Add your answer before submitting.")
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const r = await submitTask({ taskId: task.id, response })
      setResult(r)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed")
    } finally {
      setSubmitting(false)
    }
  }

  const payload = task.payload ?? {}

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="font-mono text-[11px] uppercase tracking-widest text-primary">
            {task.type === "voice" ? "Voice recording" : "Annotation"}
          </span>
          <h3 className="mt-1 text-base font-semibold text-foreground">{task.title}</h3>
        </div>
        <div className="flex shrink-0 flex-col items-end rounded-md border border-border px-2.5 py-1">
          <span className="font-mono text-sm font-semibold text-accent tabular-nums">
            ${(task.rewardTokens / 100).toFixed(0)}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
            +{task.rewardTokens.toLocaleString()} DATA
          </span>
        </div>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{task.instructions}</p>

      {task.type === "voice" ? (
        <VoiceTask prompt={String(payload.prompt ?? "")} onTranscript={setResponse} disabled={!!result} />
      ) : (
        <AnnotationTask
          text={String(payload.text ?? "")}
          value={response}
          onChange={setResponse}
          disabled={!!result}
        />
      )}

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {result ? (
        <ResultBanner result={result} />
      ) : (
        <Button onClick={handleSubmit} disabled={submitting} className="mt-4">
          {submitting ? "Reviewing with AI..." : "Submit for review"}
        </Button>
      )}
    </div>
  )
}

function AnnotationTask({
  text,
  value,
  onChange,
  disabled,
}: {
  text: string
  value: string
  onChange: (v: string) => void
  disabled: boolean
}) {
  return (
    <div className="mt-4">
      <div className="rounded-lg border border-border bg-background p-4">
        <p className="font-mono text-xs text-muted-foreground">ITEM</p>
        <p className="mt-1 text-sm leading-relaxed text-foreground">{text}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {ANNOTATION_LABELS.map((label) => (
          <button
            key={label}
            type="button"
            disabled={disabled}
            onClick={() => onChange(label)}
            className={`rounded-md border px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ${
              value === label
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-secondary text-secondary-foreground hover:border-primary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

function VoiceTask({
  prompt,
  onTranscript,
  disabled,
}: {
  prompt: string
  onTranscript: (v: string) => void
  disabled: boolean
}) {
  const [recording, setRecording] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [transcript, setTranscript] = useState("")
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      chunksRef.current = []
      mr.ondataavailable = (e) => chunksRef.current.push(e.data)
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" })
        setAudioUrl(URL.createObjectURL(blob))
        stream.getTracks().forEach((t) => t.stop())
      }
      mr.start()
      mediaRef.current = mr
      setRecording(true)
    } catch {
      // Fall back to transcript-only when mic is unavailable (e.g. preview sandbox)
      setAudioUrl("unavailable")
    }
  }, [])

  const stop = useCallback(() => {
    mediaRef.current?.stop()
    setRecording(false)
  }, [])

  return (
    <div className="mt-4">
      <div className="rounded-lg border border-border bg-background p-4">
        <p className="font-mono text-xs text-muted-foreground">READ ALOUD</p>
        <p className="mt-1 text-sm leading-relaxed text-foreground">&ldquo;{prompt}&rdquo;</p>
      </div>

      <div className="mt-3 flex items-center gap-3">
        {!recording ? (
          <Button type="button" variant="outline" size="sm" onClick={start} disabled={disabled}>
            {audioUrl ? "Re-record" : "Start recording"}
          </Button>
        ) : (
          <Button type="button" variant="destructive" size="sm" onClick={stop}>
            Stop recording
          </Button>
        )}
        {recording && (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" aria-hidden />
            Recording…
          </span>
        )}
      </div>

      {audioUrl && audioUrl !== "unavailable" && (
        <audio controls src={audioUrl} className="mt-3 h-9 w-full">
          <track kind="captions" />
        </audio>
      )}

      <div className="mt-3">
        <label htmlFor={`t-${prompt}`} className="text-xs text-muted-foreground">
          Confirm what you said (transcript)
        </label>
        <input
          id={`t-${prompt}`}
          type="text"
          disabled={disabled}
          value={transcript}
          onChange={(e) => {
            setTranscript(e.target.value)
            onTranscript(e.target.value)
          }}
          placeholder="Type the sentence you recorded"
          className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
      </div>
    </div>
  )
}

function ResultBanner({ result }: { result: Result }) {
  const approved = result.status === "approved"
  return (
    <div
      className={`mt-4 rounded-lg border p-4 ${
        approved ? "border-accent/40 bg-accent/10" : "border-destructive/40 bg-destructive/10"
      }`}
    >
      <div className="flex items-center justify-between">
        <p className={`text-sm font-semibold ${approved ? "text-accent" : "text-destructive"}`}>
          {approved ? `Approved · +${result.reward} DATA` : "Not approved"}
        </p>
        <span className="font-mono text-xs text-muted-foreground">AI score {result.aiScore}/100</span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{result.aiFeedback}</p>
    </div>
  )
}
