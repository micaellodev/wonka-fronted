// Cuadrícula de sesiones activas. Extraído de PlayZoneScreen sin cambios de comportamiento.
import { Baby, RefreshCw, Timer } from 'lucide-react'
import { type ActiveSession, type DurationOpt, SessionCard } from './shared'

export function ActiveSessionsGrid({ sessions, loadingSessions, onCheckout, checkingOut, nowTick, durationOptions }: {
 sessions: ActiveSession[]
 loadingSessions: boolean
 onCheckout: (sessionId: string) => void
 checkingOut: string | null
 nowTick: number
 durationOptions: DurationOpt[]
}) {
 return (
 <main className="flex-1 overflow-y-auto p-4 bg-background">
 <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
 <p className="text-xs font-bold font-mono text-muted-foreground uppercase tracking-widest flex items-center gap-2">
 <Baby className="w-4 h-4" />
 {sessions.length} Niños Jugando
 </p>
 <div className="flex items-center gap-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest bg-muted px-3 py-1.5 rounded-sm">
 <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-secondary-500" /> Todo OK</span>
 <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-warning" /> &lt;5 min</span>
 <span className="flex items-center gap-1.5 origin-center animate-pulse"><span className="w-2 h-2 rounded-full bg-primary" /> Tiempo Terminado</span>
 </div>
 </div>

 {loadingSessions && (
 <div className="flex items-center justify-center h-48 gap-3 text-muted-foreground">
 <RefreshCw className="w-7 h-7 animate-spin text-brand-600" />
 <p className="text-xs font-bold uppercase tracking-widest">Sincronizando...</p>
 </div>
 )}

 {!loadingSessions && sessions.length === 0 && (
 <div className="flex flex-col items-center justify-center h-64 gap-4 text-foreground">
 <Timer className="w-16 h-16 opacity-10" />
 <p className="text-sm font-bold uppercase tracking-widest">La zona de juegos está vacía</p>
 </div>
 )}

 {!loadingSessions && sessions.length > 0 && (
 <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 items-start">
 {sessions.map(s => (
 <SessionCard key={s.id} session={s} onCheckout={onCheckout}
 checking={checkingOut === s.id} nowTick={nowTick} durationOptions={durationOptions} />
 ))}
 </div>
 )}
 </main>
 )
}
