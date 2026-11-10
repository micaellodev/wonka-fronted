// Niños jugando: tarjetas con cuenta regresiva en vivo, ordenadas por quién termina primero.
import { Baby, RefreshCw, Timer, Users } from 'lucide-react'
import { useNow } from '@/hooks/useNow'
import { type ActiveSession, type DurationOpt, SessionCard } from './shared'

const WARNING_SEC = 300

/** Niños iniciados juntos con Ctrl+clic: el grupo viaja en la descripción como "NOMBRE · descripción", con mismo tiempo y hora de inicio */
const groupKey = (s: ActiveSession) => {
 const i = s.notes?.indexOf(' · ') ?? -1
 return i > 0 ? `${s.notes!.slice(0, i)}|${s.durationMinutes}|${Math.floor(new Date(s.startTime).getTime() / 120_000)}` : null
}

export function ActiveSessionsGrid({ sessions, loadingSessions, onCheckout, checkingOut, durationOptions, showCode, onExtend }: {
 showCode: boolean
 onExtend: (sessionId: string, minutes: number) => void
 sessions: ActiveSession[]
 loadingSessions: boolean
 onCheckout: (sessionId: string) => void
 checkingOut: string | null
 durationOptions: DurationOpt[]
}) {
 const now = useNow()
 // Segundos que le quedan a la sesión (Infinity si es de tiempo libre)
 const remaining = (s: ActiveSession) =>
 s.isUnlimited ? Infinity : (s.durationMinutes ?? 0) * 60 - (now - new Date(s.startTime).getTime()) / 1000
 const ordered = [...sessions].sort((a, b) => remaining(a) - remaining(b))
 const overdue = ordered.filter((s) => remaining(s) <= 0).length
 const ending = ordered.filter((s) => remaining(s) > 0 && remaining(s) <= WARNING_SEC).length
 // Cada grupo (2 o más niños) se muestra en un solo recuadro, en el lugar de su sesión más urgente
 const counts = new Map<string, number>()
 for (const s of ordered) { const k = groupKey(s); if (k) counts.set(k, (counts.get(k) ?? 0) + 1) }
 const blocks: Array<{ key: string; group: string | null; list: ActiveSession[] }> = []
 for (const s of ordered) {
 const k = groupKey(s)
 const gk = k && (counts.get(k) ?? 0) > 1 ? k : null
 const open = gk ? blocks.find((b) => b.group === gk) : null
 if (open) open.list.push(s)
 else blocks.push({ key: gk ?? s.id, group: gk, list: [s] })
 }
 const card = (s: ActiveSession) => <SessionCard key={s.id} session={s} onCheckout={onCheckout} checking={checkingOut === s.id} durationOptions={durationOptions} showCode={showCode} onExtend={onExtend} />
 const finishAll = async (list: ActiveSession[]) => { for (const x of list) await onCheckout(x.id) }

 return (
 <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain bg-background p-4 pb-24">
 <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border pb-3">
 <p className="flex items-center gap-2 text-sm font-bold text-foreground">
 <Baby className="h-5 w-5" aria-hidden />
 {sessions.length} {sessions.length === 1 ? 'niño jugando' : 'niños jugando'}
 </p>
 {overdue > 0 && (
 <span className="rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-bold text-white">
 {overdue} {overdue === 1 ? 'terminó su tiempo' : 'terminaron su tiempo'}
 </span>
 )}
 {ending > 0 && (
 <span className="rounded-full bg-warning px-2.5 py-0.5 text-xs font-bold text-white">
 {ending} por terminar (menos de 5 min)
 </span>
 )}
 </div>

 {loadingSessions && (
 <div className="flex h-48 items-center justify-center gap-3 text-muted-foreground">
 <RefreshCw className="h-6 w-6 animate-spin text-brand-600" aria-hidden />
 <p className="text-sm font-bold">Cargando sesiones...</p>
 </div>
 )}

 {!loadingSessions && sessions.length === 0 && (
 <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
 <Timer className="h-14 w-14 opacity-20" aria-hidden />
 <p className="text-sm font-bold">No hay niños jugando</p>
 <p className="text-xs">Las sesiones aparecen aquí cuando se inician.</p>
 </div>
 )}

 {!loadingSessions && sessions.length > 0 && (
 <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,220px),1fr))] items-start gap-3">
 {blocks.map((b) => b.group ? (
 <section key={b.key} className="col-span-full rounded-xl border-2 border-brand-500/40 bg-brand-500/5 p-3">
 <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
 <p className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-brand-500"><Users className="h-4 w-4" aria-hidden />{b.list[0]!.notes!.split(' · ')[0]} · {b.list.length} niños</p>
 <button onClick={() => void finishAll(b.list)} disabled={checkingOut !== null} className="rounded-sm bg-brand-600 px-3 py-1.5 text-xs font-black uppercase tracking-widest text-primary-foreground disabled:opacity-50">Finalizar todos</button>
 </div>
 <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,220px),1fr))] items-start gap-3">{b.list.map(card)}</div>
 </section>
 ) : card(b.list[0]!))}
 </div>
 )}
 </main>
 )
}
