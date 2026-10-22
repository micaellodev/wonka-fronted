import { formatPEN } from '@/lib/format'
import { useNow } from '@/hooks/useNow'
import {
 Baby, CheckCircle2, AlertTriangle, XCircle,
 Shield, LogOut
} from 'lucide-react'

export type Loose = any

// ── Constants ─────────────────────────────────────────────────

// Tarifas configuradas en backend (GET /playzone/rates); el precio final lo calcula el backend
export interface PlayzoneRates {
 durations: Array<{ minutes: number; price: number; label: string }>
 extraPerMinute: number
 freePerMinute: number
 companionPrice?: number
}

// Precio por acompañante si el backend (más antiguo) no lo envía
export const DEFAULT_COMPANION_PRICE = 5

export interface DurationOpt { label: string; minutes: number | null; price: number | null }

export const FREE_OPTION: DurationOpt = { label: '∞ Libre', minutes: null, price: null }

// ── Types ─────────────────────────────────────────────────────

export interface Child { id: string; fullName: string; dni: string | null; age: number | null; gender: string | null; guardianId: string; tenantId: string; createdAt: string; updatedAt: string }
export interface Guardian { id: string; dni: string; phone: string | null; fullName: string; tenantId: string; createdAt: string; children: Child[] }

export interface ActiveSession {
 id: string
 wristbandCode: string
 childId: string
 childName: string
 childAge: number | null
 childGender: string | null
 guardianName: string
 guardianDni: string
 durationMinutes: number | null
 startTime: string
 elapsedMinutes: number
 remainingMinutes: number | null
 isUnlimited: boolean
 isOverdue: boolean
 notes?: string | null
}


// UI states for the left panel
export type PanelMode =
 | { type: 'IDLE' }
 | { type: 'SEARCHING' }
 | { type: 'FOUND'; guardian: Guardian }
 | { type: 'NOT_FOUND'; q: string }
 | { type: 'REGISTERING' } // manual entry button

// ── Helpers ───────────────────────────────────────────────────

export function fmtTime(m: number) {
 const h = Math.floor(m / 60); const min = m % 60
 return h ? `${h}h ${String(min).padStart(2, '0')}m` : `${m}m`
}

export function fmtPrice(price: number | null) {
 return price === null ? 'A convenir' : formatPEN(price)
}

export function calcElapsed(startTime: string) {
 return Math.floor((Date.now() - new Date(startTime).getTime()) / 60_000)
}


// ── Sub-Components ────────────────────────────────────────────

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
 return <p className={`text-[11px] font-black text-muted-foreground uppercase tracking-widest mb-1 ${className || ''}`}>{children}</p>
}

/** 125 s → "2:05"; 3725 s → "1:02:05" */
function fmtClock(totalSec: number) {
 const s = Math.max(0, Math.floor(totalSec))
 const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60
 const mm = String(m).padStart(2, '0'); const ss = String(sec).padStart(2, '0')
 return h ? `${h}:${mm}:${ss}` : `${m}:${ss}`
}

export function SessionCard({
 session, onCheckout, checking, durationOptions,
}: {
 session: ActiveSession
 onCheckout: (id: string) => void
 checking: boolean
 durationOptions: DurationOpt[]
}) {
 const now = useNow()
 const elapsedSec = Math.max(0, (now - new Date(session.startTime).getTime()) / 1000)
 const totalSec = session.isUnlimited ? null : (session.durationMinutes ?? 0) * 60
 const remainingSec = totalSec === null ? null : totalSec - elapsedSec
 const isOverdue = remainingSec !== null && remainingSec <= 0
 const isWarning = remainingSec !== null && !isOverdue && remainingSec <= 300
 const pct = totalSec ? Math.min(100, (elapsedSec / totalSec) * 100) : 100

 const tone = isOverdue
 ? { border: 'border-primary', banner: 'bg-brand-600', text: 'text-brand-500', bar: 'bg-brand-500', label: '¡TIEMPO TERMINADO!', Icon: XCircle }
 : isWarning
 ? { border: 'border-warning', banner: 'bg-warning', text: 'text-accent-500', bar: 'bg-warning', label: 'POR TERMINAR', Icon: AlertTriangle }
 : { border: 'border-success', banner: 'bg-success', text: 'text-success', bar: 'bg-success', label: session.isUnlimited ? 'TIEMPO LIBRE' : 'EN JUEGO', Icon: CheckCircle2 }

 const price = durationOptions.find((o) => o.minutes === session.durationMinutes)?.price ?? null
 const mainLabel = session.isUnlimited ? 'Transcurrido' : isOverdue ? 'Tiempo extra' : 'Restante'
 const mainClock = session.isUnlimited ? fmtClock(elapsedSec) : isOverdue ? fmtClock(-(remainingSec ?? 0)) : fmtClock(remainingSec ?? 0)

 return (
 <div className={`flex flex-col overflow-hidden rounded-xl border-2 bg-background shadow-sm ${tone.border}`}>
 <div className={`${tone.banner} ${isOverdue ? 'animate-pulse' : ''} flex items-center justify-between gap-2 px-3 py-1.5 text-xs font-black uppercase tracking-wide ${isOverdue || isWarning ? 'text-white' : 'text-success-foreground'}`}>
 <span className="flex min-w-0 items-center gap-1.5"><tone.Icon className="h-4 w-4" aria-hidden /> {tone.label}</span>
 <span className="shrink-0 whitespace-nowrap font-mono font-semibold opacity-90" title="Hora de inicio">{new Date(session.startTime).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</span>
 </div>

 <div className="flex flex-col gap-3 p-3">
 <div className="flex items-end justify-between gap-2">
 <div>
 <p className="text-xs font-semibold uppercase text-muted-foreground">Pulsera</p>
 <p className={`font-mono text-4xl font-black leading-none tracking-wider ${tone.text}`}>{session.wristbandCode}</p>
 </div>
 <div className="text-right">
 <p className="text-xs font-semibold uppercase text-muted-foreground">{mainLabel}</p>
 <p className={`font-mono text-3xl font-black leading-none tabular-nums ${tone.text}`} aria-live="off">
 {isOverdue && '+'}{mainClock}
 </p>
 </div>
 </div>

 <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Tiempo usado">
 <div className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${tone.bar} ${session.isUnlimited ? 'animate-pulse' : ''}`} style={{ width: `${pct}%` }} />
 </div>

 <div className="flex flex-col gap-1">
 <div className="flex items-center gap-2">
 <Baby className="h-4 w-4 shrink-0 text-brand-500" aria-hidden />
 <span className="min-w-0 flex-1 truncate text-sm font-bold text-foreground" title={session.childName}>{session.childName}</span>
 {session.childAge ? <span className="shrink-0 text-xs text-muted-foreground">{session.childAge} años</span> : null}
 </div>
 <div className="flex items-center gap-2">
 <Shield className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
 <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={session.guardianName}>{session.guardianName}</span>
 <span className="shrink-0 rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-xs font-bold text-muted-foreground">
 {session.isUnlimited ? 'Libre' : session.durationMinutes ? `${session.durationMinutes} min` : ''}{price !== null ? ` · ${formatPEN(price)}` : ''}
 </span>
 </div>
 {session.notes && <p className="break-words rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground">📝 {session.notes}</p>}
 </div>

 <button
 onClick={() => onCheckout(session.id)}
 disabled={checking}
 className={`flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-40 ${isOverdue ? 'bg-brand-600 text-white hover:bg-brand-700' : 'border border-border bg-muted text-foreground hover:bg-border'}`}
 >
 <LogOut className="h-4 w-4" aria-hidden /> {checking ? 'Terminando...' : 'Terminar juego'}
 </button>
 </div>
 </div>
 )
}
