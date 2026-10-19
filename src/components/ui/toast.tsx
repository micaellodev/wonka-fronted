import { useSyncExternalStore } from "react"

import { cn } from "@/lib/utils"

type Kind = "success" | "error" | "info"
type Item = { id: number; kind: Kind; msg: string }

let items: Item[] = []
let nextId = 1
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

function push(kind: Kind, msg: string) {
 const id = nextId++
 items = [...items, { id, kind, msg }]
 emit()
 setTimeout(() => {
 items = items.filter((i) => i.id !== id)
 emit()
 }, 3000)
}

export const toast = {
 success: (msg: string) => push("success", msg),
 error: (msg: string) => push("error", msg),
 info: (msg: string) => push("info", msg),
}

const styles: Record<Kind, string> = {
 success: "bg-success-soft text-success border-success/30",
 error: "bg-danger-soft text-destructive border-destructive/30",
 info: "bg-info-soft text-info border-info/30",
}

export function Toaster() {
 const list = useSyncExternalStore(
 (f) => (subs.add(f), () => void subs.delete(f)),
 () => items
 )
 return (
 <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
 {list.map((t) => (
 <div key={t.id} role={t.kind === "error" ? "alert" : "status"} className={cn("pointer-events-auto rounded-md border px-4 py-2 text-sm font-medium shadow-lg animate-fade-in", styles[t.kind])}>
 {t.msg}
 </div>
 ))}
 </div>
 )
}
