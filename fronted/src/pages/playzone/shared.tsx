import { formatPEN } from '@/lib/format'
import {
 Baby, CheckCircle2, AlertTriangle, XCircle,
 Infinity as InfinityIcon, Shield, LogOut
} from 'lucide-react'

export type Loose = any

// ── Constants ─────────────────────────────────────────────────

// Tarifas configuradas en backend (GET /playzone/rates); el precio final lo calcula el backend
export interface PlayzoneRates {
 durations: Array<{ minutes: number; price: number; label: string }>
 extraPerMinute: number
 freePerMinute: number
}

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

export function SessionCard({
 session, onCheckout, checking, nowTick, durationOptions,
}: {
 session: ActiveSession
 onCheckout: (id: string) => void
 checking: boolean
 nowTick: number
 durationOptions: DurationOpt[]
}) {
 const elapsed = calcElapsed(session.startTime)
 const remaining = session.isUnlimited ? null : Math.max(0, (session.durationMinutes ?? 0) - elapsed)
 const isOverdue = !session.isUnlimited && remaining === 0
 const isWarning = !session.isUnlimited && !isOverdue && (remaining ?? 99) <= 5

 const border = isOverdue ? 'border-primary' : isWarning ? 'border-warning/40' : 'border-secondary-500'
 const codeCls = isOverdue ? 'text-brand-500' : isWarning ? 'text-accent-500' : 'text-secondary-500'
 const bannerBg = isOverdue ? 'bg-brand-600' : isWarning ? 'bg-warning' : 'bg-secondary-600'
 const label = isOverdue ? '¡TIEMPO!' : isWarning ? '< 5 MIN' : 'EN JUEGO'

 // use nowTick to force re-render
 void nowTick

 const price = durationOptions.find(o => o.minutes === session.durationMinutes)?.price ?? null

 return (
 <div className={`flex flex-col bg-muted border-2 ${border} rounded-md overflow-hidden relative group`}>
 <div className={`${bannerBg} px-3 py-1 flex items-center justify-between`}>
 <span className="text-[11px] font-black text-foreground uppercase tracking-widest">{label}</span>
 <span className="text-[11px] font-mono text-foreground/60">
 {new Date(session.startTime).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
 </span>
 </div>

 <div className="p-3 flex flex-col gap-2.5">
 {/* Code + price */}
 <div className="flex items-start justify-between">
 <span className={`text-5xl font-black font-mono tracking-widest ${codeCls}`}>
 {session.wristbandCode}
 </span>
 <div className="flex flex-col items-end gap-1 mt-1">
 {isOverdue ? <XCircle className="w-6 h-6 text-brand-500" />
 : isWarning ? <AlertTriangle className="w-6 h-6 text-accent-500" />
 : <CheckCircle2 className="w-6 h-6 text-secondary-500" />}
 <span className="text-[11px] font-black font-mono text-muted-foreground border border-border bg-background px-1.5 py-0.5 rounded-sm">
 {fmtPrice(price)}
 </span>
 </div>
 </div>

 {/* Names */}
 <div className="border-t border-border pt-2 flex flex-col gap-1">
 <div className="flex items-center gap-1.5">
 <Baby className="w-3.5 h-3.5 text-brand-500 shrink-0" />
 <span className="text-sm font-bold text-foreground truncate">{session.childName}</span>
 {session.childAge && <span className="text-[11px] text-muted-foreground font-mono">({session.childAge}a, {session.childGender})</span>}
 </div>
 <div className="flex items-center gap-1.5">
 <Shield className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
 <span className="text-xs text-muted-foreground truncate">{session.guardianName} ({session.guardianDni})</span>
 </div>
 </div>

 {/* Timer bar */}
 <div className="flex items-center justify-between bg-background border border-border rounded-sm px-2.5 py-1.5">
 <div className="flex flex-col">
 <span className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold">Elapsed</span>
 <span className="text-xs font-mono font-bold text-muted-foreground">{fmtTime(elapsed)}</span>
 </div>
 <span className="text-foreground">|</span>
 <div className="flex flex-col items-end">
 <span className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold">Restante</span>
 {session.isUnlimited
 ? <InfinityIcon className="w-4 h-4 text-brand-500" />
 : <span className={`text-xs font-mono font-bold ${isOverdue ? 'text-brand-500' : isWarning ? 'text-accent-500' : 'text-secondary-500'}`}>
 {fmtTime(remaining ?? 0)}
 </span>
 }
 </div>
 </div>

 <button
 onClick={() => onCheckout(session.id)}
 disabled={checking}
 className="flex items-center justify-center gap-1.5 w-full py-2 bg-muted border border-border hover:bg-brand-600 hover:border-primary text-muted-foreground hover:text-primary-foreground font-bold text-[11px] uppercase tracking-widest rounded-sm transition-none disabled:opacity-40"
 >
 <LogOut className="w-3.5 h-3.5" /> Finalizar
 </button>
 </div>
 </div>
 )
}

