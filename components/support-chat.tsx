"use client"

import { FormEvent, useState } from "react"
import { Button } from "@/components/ui/button"

type Message = { role: "worker" | "support"; text: string }

export function SupportChat() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "support", text: "Ask about tasks, review results, DATA, wallet setup, or cash-outs." },
  ])
  const [input, setInput] = useState("")
  const [pending, setPending] = useState(false)

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const question = input.trim()
    if (!question || pending) return
    setInput("")
    setMessages((current) => [...current, { role: "worker", text: question }])
    setPending(true)
    try {
      const response = await fetch("/api/support-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question }),
      })
      const payload = (await response.json()) as { answer?: string; error?: string }
      setMessages((current) => [...current, { role: "support", text: payload.answer ?? payload.error ?? "Support chat is unavailable." }])
    } catch {
      setMessages((current) => [...current, { role: "support", text: "Support chat is unavailable. Please try again later." }])
    } finally {
      setPending(false)
    }
  }

  return <section className="mx-auto flex max-w-3xl flex-col rounded-xl border border-border bg-card"><div className="border-b border-border p-5"><h1 className="font-mono text-xl font-semibold text-foreground">Worker support</h1><p className="mt-1 text-sm text-muted-foreground">Never share wallet recovery phrases, passwords, or API keys.</p></div><div className="min-h-80 space-y-3 p-5">{messages.map((message, index) => <div key={index} className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${message.role === "worker" ? "ml-auto bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>{message.text}</div>)}{pending && <p className="text-sm text-muted-foreground">Support is responding...</p>}</div><form onSubmit={send} className="flex gap-2 border-t border-border p-4"><input value={input} onChange={(event) => setInput(event.target.value)} maxLength={1200} placeholder="Ask a support question" className="h-10 flex-1 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" /><Button type="submit" disabled={pending || !input.trim()}>Send</Button></form></section>
}
