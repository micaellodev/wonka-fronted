// Niños jugando: tarjetas con cuenta regresiva en vivo, ordenadas por quién termina primero.
import { Baby, RefreshCw, Timer } from 'lucide-react'
import { useNow } from '@/hooks/useNow'
import { type ActiveSession, type DurationOpt, SessionCard } from './shared'

const WARNING_SEC = 300

export function ActiveSessionsGrid({ sessions, loadingSessions, onCheckout, checkingOut, durationOptions }: {
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

 return (
 <main className="min-w-0 flex-1 overflow-y-auto bg-background p-4 pb-24">
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
 <p className="text-xs">Las sesiones aparecen aquí cuando se cobran en caja.</p>
 </div>
 )}

 {!loadingSessions && sessions.length > 0 && (
 <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] items-start gap-3">
 {ordered.map((s) => (
 <SessionCard key={s.id} session={s} onCheckout={onCheckout} checking={checkingOut === s.id} durationOptions={durationOptions} />
 ))}
 </div>
 )}
 </main>
 )
}
