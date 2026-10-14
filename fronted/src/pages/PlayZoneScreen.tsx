// ============================================================
// PlayZoneScreen — CRM + Time Tracking (Child-Centric UI)
// Industrial flat design · Wonka POS
// ============================================================

import { useEffect, useState, useCallback } from 'react'
import {
 Timer, UserPlus, Search, LogOut, RefreshCw, Clock,
 Baby, User, CheckCircle2, AlertTriangle, XCircle,
 Infinity as InfinityIcon, ChevronRight, Plus,
 Shield, Phone, FileText, PartyPopper, Calendar, Users
} from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { usePlayzoneTicketStore, type PlayzoneCharge } from '@/store/playzoneTicketStore'
import { TerminalShell } from '@/components/TerminalShell'
// Eden treaty no tipa estas rutas dinámicas; respuesta JSON laxa a propósito
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any

// ── Constants ─────────────────────────────────────────────────

// Tarifas configuradas en backend (GET /playzone/rates); el precio final lo calcula el backend
interface PlayzoneRates {
 durations: Array<{ minutes: number; price: number; label: string }>
 extraPerMinute: number
 freePerMinute: number
}

interface DurationOpt { label: string; minutes: number | null; price: number | null }

const FREE_OPTION: DurationOpt = { label: '∞ Libre', minutes: null, price: null }

// ── Types ─────────────────────────────────────────────────────

interface Child { id: string; fullName: string; dni: string | null; age: number | null; gender: string | null; guardianId: string; tenantId: string; createdAt: string; updatedAt: string }
interface Guardian { id: string; dni: string; phone: string | null; fullName: string; tenantId: string; createdAt: string; children: Child[] }

interface ActiveSession {
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
type PanelMode =
 | { type: 'IDLE' }
 | { type: 'SEARCHING' }
 | { type: 'FOUND'; guardian: Guardian }
 | { type: 'NOT_FOUND'; q: string }
 | { type: 'REGISTERING' } // manual entry button

// ── Helpers ───────────────────────────────────────────────────

function fmtTime(m: number) {
 const h = Math.floor(m / 60); const min = m % 60
 return h ? `${h}h ${String(min).padStart(2, '0')}m` : `${m}m`
}

function fmtPrice(price: number | null) {
 return price === null ? 'A convenir' : `S/ ${price.toFixed(2)}`
}

function calcElapsed(startTime: string) {
 return Math.floor((Date.now() - new Date(startTime).getTime()) / 60_000)
}

function getApiErrorMessage(err: unknown, fallback: string) {
 const e = err as Loose
 return (
 e?.message ||
 e?.summary ||
 e?.value?.message ||
 e?.value?.summary ||
 fallback
 )
}

// ── Sub-Components ────────────────────────────────────────────

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
 return <p className={`text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ${className || ''}`}>{children}</p>
}

function SessionCard({
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

 const border = isOverdue ? 'border-red-600' : isWarning ? 'border-amber-500' : 'border-secondary-500'
 const codeCls = isOverdue ? 'text-brand-500' : isWarning ? 'text-accent-500' : 'text-secondary-500'
 const bannerBg = isOverdue ? 'bg-brand-600' : isWarning ? 'bg-amber-600' : 'bg-secondary-600'
 const label = isOverdue ? '¡TIEMPO!' : isWarning ? '< 5 MIN' : 'EN JUEGO'

 // use nowTick to force re-render
 void nowTick

 const price = durationOptions.find(o => o.minutes === session.durationMinutes)?.price ?? null

 return (
 <div className={`flex flex-col bg-gray-100 border-2 ${border} rounded-md overflow-hidden relative group`}>
 <div className={`${bannerBg} px-3 py-1 flex items-center justify-between`}>
 <span className="text-[10px] font-black text-gray-900 uppercase tracking-widest">{label}</span>
 <span className="text-[10px] font-mono text-gray-900/60">
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
 <span className="text-[10px] font-black font-mono text-gray-500 border border-gray-200 bg-white px-1.5 py-0.5 rounded-sm">
 {fmtPrice(price)}
 </span>
 </div>
 </div>

 {/* Names */}
 <div className="border-t border-gray-200 pt-2 flex flex-col gap-1">
 <div className="flex items-center gap-1.5">
 <Baby className="w-3.5 h-3.5 text-brand-500 shrink-0" />
 <span className="text-sm font-bold text-gray-900 truncate">{session.childName}</span>
 {session.childAge && <span className="text-[10px] text-gray-400 font-mono">({session.childAge}a, {session.childGender})</span>}
 </div>
 <div className="flex items-center gap-1.5">
 <Shield className="w-3.5 h-3.5 text-gray-400 shrink-0" />
 <span className="text-xs text-gray-500 truncate">{session.guardianName} ({session.guardianDni})</span>
 </div>
 </div>

 {/* Timer bar */}
 <div className="flex items-center justify-between bg-white border border-gray-200 rounded-sm px-2.5 py-1.5">
 <div className="flex flex-col">
 <span className="text-[9px] text-gray-400 uppercase tracking-widest font-bold">Elapsed</span>
 <span className="text-xs font-mono font-bold text-gray-600">{fmtTime(elapsed)}</span>
 </div>
 <span className="text-slate-700">|</span>
 <div className="flex flex-col items-end">
 <span className="text-[9px] text-gray-400 uppercase tracking-widest font-bold">Restante</span>
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
 className="flex items-center justify-center gap-1.5 w-full py-2 bg-gray-200 border border-gray-300 hover:bg-brand-600 hover:border-red-600 text-gray-600 hover:text-gray-900 font-bold text-[11px] uppercase tracking-widest rounded-sm transition-none disabled:opacity-40"
 >
 <LogOut className="w-3.5 h-3.5" /> Finalizar
 </button>
 </div>
 </div>
 )
}

// ── Birthdays View ─────────────────────────────────────────────

function BirthdaysView() {
 const { tenantId } = useAuthStore()
 const [reservations, setReservations] = useState<Loose[]>([])
 const [loading, setLoading] = useState(true)
 const [selectedResId, setSelectedResId] = useState<string | null>(null)
 const [details, setDetails] = useState<Loose>(null)

 // Create form
 const [showCreate, setShowCreate] = useState(false)
 const [searchQ, setSearchQ] = useState('')
 const [guardian, setGuardian] = useState<Loose>(null)
 const [date, setDate] = useState('')
 const [guestCount, setGuestCount] = useState(10)
 const [notes, setNotes] = useState('')
 const [creating, setCreating] = useState(false)

 const fetchReservations = useCallback(async () => {
 setLoading(true)
 try {
 const res = await (api.birthdays as Loose).get({ query: { tenantId } })
 if (!res.error) setReservations((res.data as Loose).data ?? [])
 } finally { setLoading(false) }
 }, [tenantId])

 useEffect(() => { fetchReservations() }, [fetchReservations])

 const fetchDetails = async (id: string) => {
 try {
 const res = await (api.birthdays as Loose)({ id }).get({ query: { tenantId } })
 if (!res.error) setDetails((res.data as Loose).data)
 else alert(getApiErrorMessage(res.error, 'Error al cargar detalles'))
 } catch { alert('Error al cargar detalles') }
 }

 const handleSearchGuardian = async () => {
 if (!searchQ) return
 try {
 const res = await (api.playzone.guardians.lookup as Loose).get({ query: { tenantId, q: searchQ } })
 if (!res.error && (res.data as Loose).found) setGuardian((res.data as Loose).data)
 else { setGuardian(null); alert('Apoderado no encontrado') }
 } catch { alert('Error de conexión') }
 }

 const handleCreate = async () => {
 if (!guardian || !date) return
 if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 300) {
 alert('La cantidad de invitados debe estar entre 1 y 300.')
 return
 }
 setCreating(true)
 try {
 const res = await (api.birthdays as Loose).post({
 tenantId,
 guardianId: guardian.id,
 date: new Date(date).toISOString(),
 guestCount,
 notes
 })
 if (!res.error) {
 setShowCreate(false)
 fetchReservations()
 setGuardian(null); setDate(''); setGuestCount(10); setNotes(''); setSearchQ('')
 } else alert(getApiErrorMessage(res.error, 'Error al crear reserva'))
 } catch { alert('Error de conexión') }
 finally { setCreating(false) }
 }

 const handleUpdateGuest = async (guestId: string, data: Loose) => {
 if (!selectedResId) return
 try {
 const res = await (api.birthdays as Loose)({ id: selectedResId }).guests({ guestId }).patch(data, { query: { tenantId } })
 if (res.error) alert(getApiErrorMessage(res.error, 'Error al actualizar invitado'))
 fetchDetails(selectedResId)
 } catch { alert('Error al actualizar invitado') }
 }

 return (
 <div className="flex flex-1 overflow-hidden bg-white">
 {/* List Panel */}
 <div className="w-[320px] shrink-0 border-r border-gray-200 bg-white flex flex-col">
 <div className="p-3 border-b border-gray-200 bg-gray-100">
 <button onClick={() => { setShowCreate(true); setSelectedResId(null) }}
 className="w-full flex items-center justify-center gap-2 py-3 bg-brand-600 hover:bg-brand-500 text-gray-900 font-black text-xs uppercase tracking-widest rounded-sm">
 <Plus className="w-4 h-4" /> Nueva Reserva
 </button>
 </div>
 <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
 <SectionLabel>Próximos Cumpleaños</SectionLabel>
 {loading ? <p className="text-gray-400 text-xs">Cargando...</p> :
 reservations.map(r => (
 <button key={r.id} onClick={() => { setSelectedResId(r.id); fetchDetails(r.id); setShowCreate(false) }}
 className={`flex flex-col text-left p-3 rounded-sm border-2 transition-colors ${selectedResId === r.id ? 'border-brand-500 bg-brand-900/20' : 'border-gray-200 bg-gray-100 hover:border-gray-300'}`}>
 <div className="flex items-center gap-2 text-gray-900 font-bold text-sm">
 <PartyPopper className="w-4 h-4 text-brand-500" />
 {new Date(r.date).toLocaleDateString('es-PE', { timeZone: 'UTC' })}
 </div>
 <div className="mt-2 text-xs text-gray-500 flex items-center justify-between">
 <span>{r.guardian.fullName}</span>
 <span className="flex items-center gap-1 font-mono text-brand-400">
 <Users className="w-3 h-3" /> {r.guestCount}
 </span>
 </div>
 </button>
 ))
 }
 </div>
 </div>

 {/* Details / Create Panel */}
 <div className="flex-1 overflow-y-auto bg-white">
 {showCreate && (
 <div className="max-w-xl mx-auto p-8 flex flex-col gap-4">
 <h2 className="text-xl font-black text-gray-900 uppercase tracking-wider mb-2 border-b border-gray-200 pb-2">Crear Reserva de Cumpleaños</h2>

 <div className="bg-gray-100 p-4 rounded-sm border border-gray-200">
 <SectionLabel>1. Buscar Apoderado</SectionLabel>
 <div className="flex gap-2">
 <input type="text" value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="DNI apoderado" className="flex-1 bg-white border border-gray-200 rounded-sm px-3 py-2 text-gray-900" />
 <button onClick={handleSearchGuardian} className="px-4 bg-gray-200 text-gray-900 rounded-sm font-bold text-xs uppercase"><Search className="w-4 h-4" /></button>
 </div>
 {guardian && (
 <div className="mt-3 p-3 bg-white border border-secondary-200 rounded-sm">
 <p className="text-sm font-bold text-gray-900">{guardian.fullName}</p>
 <p className="text-xs text-gray-500 font-mono">DNI: {guardian.dni} | Niños: {guardian.children?.length}</p>
 </div>
 )}
 </div>

 {guardian && (
 <div className="bg-gray-100 p-4 rounded-sm border border-gray-200 flex flex-col gap-3">
 <SectionLabel>2. Detalles de Reserva</SectionLabel>
 <div>
 <label className="text-xs font-bold text-gray-500 uppercase">Fecha</label>
 <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-white border border-gray-200 rounded-sm px-3 py-2 text-gray-900 scheme-dark" />
 </div>
 <div>
 <label className="text-xs font-bold text-gray-500 uppercase">Cantidad de Niños (Invitados)</label>
 <input type="number" min="1" value={guestCount} onChange={e => setGuestCount(Number(e.target.value))} className="w-full bg-white border border-gray-200 rounded-sm px-3 py-2 text-gray-900" />
 </div>
 <div>
 <label className="text-xs font-bold text-gray-500 uppercase">Notas Adicionales</label>
 <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="w-full bg-white border border-gray-200 rounded-sm px-3 py-2 text-gray-900" />
 </div>
 <button onClick={handleCreate} disabled={!date || creating} className="w-full mt-2 py-3 bg-brand-600 hover:bg-brand-500 text-gray-900 font-black text-sm uppercase tracking-widest rounded-sm disabled:opacity-50">
 {creating ? 'Guardando...' : 'Confirmar Reserva'}
 </button>
 </div>
 )}
 </div>
 )}

 {!showCreate && !selectedResId && (
 <div className="flex flex-col items-center justify-center h-full text-gray-500">
 <PartyPopper className="w-16 h-16 opacity-20 mb-4" />
 <p className="font-bold uppercase tracking-widest">Selecciona una reserva para ver detalles</p>
 </div>
 )}

 {!showCreate && selectedResId && details && (
 <div className="p-8 max-w-4xl mx-auto flex flex-col gap-6">
 {/* Header Details */}
 <div className="bg-gray-100 border-2 border-brand-800 rounded-sm p-5 flex items-start justify-between">
 <div>
 <h2 className="text-2xl font-black text-gray-900 uppercase tracking-wider mb-1 flex items-center gap-2">
 <Calendar className="w-6 h-6 text-brand-500" />
 {new Date(details.date).toLocaleDateString('es-PE', { timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
 </h2>
 <p className="text-gray-500 text-sm">
 Reserva por <strong className="text-gray-900">{details.guardian.fullName}</strong> (DNI: {details.guardian.dni})
 </p>
 {details.notes && (
 <p className="mt-3 text-sm text-gray-600 bg-white border border-gray-200 p-3 rounded-sm">
 <em>"{details.notes}"</em>
 </p>
 )}
 </div>
 <div className="bg-white border border-brand-500/30 px-4 py-2 rounded-sm text-center">
 <span className="block text-[10px] font-black uppercase text-gray-400 tracking-widest">Total Invitados</span>
 <span className="text-3xl font-black text-brand-500">{details.guestCount}</span>
 <span className="block text-xs font-bold text-secondary-500 mt-1">
 {details.guests.filter((g: Loose) => g.attended).length} asistieron
 </span>
 </div>
 </div>

 {/* Guest List */}
 <div>
 <SectionLabel className="mb-3 text-brand-500">Lista de Invitados ({details.guestCount})</SectionLabel>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
 {details.guests.map((guest: Loose, idx: number) => {
 return (
 <div key={guest.id} className={`flex items-center gap-3 p-3 rounded-sm border ${guest.attended ? 'bg-secondary-50 border-secondary-200' : 'bg-gray-100 border-gray-200'}`}>
 <div className="w-6 font-mono text-xs text-gray-400 font-bold text-center">{idx + 1}</div>
 <div className="flex-1 grid grid-cols-2 gap-2">
 <input
 className="bg-white border border-gray-200 rounded-sm px-2 py-1.5 text-sm text-gray-900 focus:border-brand-500 placeholder:text-gray-500"
 placeholder="Nombre"
 defaultValue={guest.firstName}
 onBlur={e => e.target.value !== guest.firstName && handleUpdateGuest(guest.id, { firstName: e.target.value })}
 />
 <input
 className="bg-white border border-gray-200 rounded-sm px-2 py-1.5 text-sm text-gray-900 focus:border-brand-500 placeholder:text-gray-500"
 placeholder="Apellido"
 defaultValue={guest.lastName}
 onBlur={e => e.target.value !== guest.lastName && handleUpdateGuest(guest.id, { lastName: e.target.value })}
 />
 </div>
 <button
 onClick={() => handleUpdateGuest(guest.id, { attended: !guest.attended })}
 className={`w-10 h-10 flex items-center justify-center shrink-0 rounded-sm border-2 ${guest.attended ? 'bg-secondary-500 border-green-500 text-gray-900' : 'bg-white border-gray-300 text-gray-400 hover:text-gray-900'}`}
 >
 <CheckCircle2 className="w-5 h-5" />
 </button>
 </div>
 )
 })}
 </div>
 </div>
 </div>
 )}
 </div>
 </div>
 )
}

// ── Main Screen ───────────────────────────────────────────────

export function PlayZoneScreen() {
 const { tenantId } = useAuthStore()
 const { addCharge } = usePlayzoneTicketStore()
 const [durationOptions, setDurationOptions] = useState<DurationOpt[]>([FREE_OPTION])
 const [notice, setNotice] = useState<string | null>(null)
 const [activeTab, setActiveTab] = useState<'JUEGO_LIBRE' | 'CUMPLEAÑOS'>('JUEGO_LIBRE')

 // ── left panel state ──
 const [mode, setMode] = useState<PanelMode>({ type: 'IDLE' })
 const [searchQ, setSearchQ] = useState('')
 const [searching, setSearching] = useState(false)
 const [searchError, setSearchError] = useState('')

 // registration form (child prioritized)
 const [childDni, setChildDni] = useState('')
 const [childName, setChildName] = useState('')
 const [childAge, setChildAge] = useState('')
 const [childGender, setChildGender] = useState<'M' | 'F' | ''>('')

 const [guardianDni, setGuardianDni] = useState('')
 const [guardianName, setGuardianName] = useState('')
 const [guardianPhone, setGuardianPhone] = useState('')

 const [registering, setRegistering] = useState(false)

 // add child form (inline)
 const [showAddChild, setShowAddChild] = useState(false)
 const [newChildName, setNewChildName] = useState('')
 const [newChildDni, setNewChildDni] = useState('')
 const [newChildAge, setNewChildAge] = useState('')
 const [newChildGender, setNewChildGender] = useState<'M' | 'F' | ''>('')
 const [addingChild, setAddingChild] = useState(false)

 // ── selected child + session start ──
 const [selectedChild, setSelectedChild] = useState<(Child & { guardianName: string }) | null>(null)
 const [selectedDuration, setSelectedDuration] = useState<DurationOpt>(FREE_OPTION)
 const [starting, setStarting] = useState(false)
 const [lastCode, setLastCode] = useState<{ code: string; price: number | null; childName: string } | null>(null)

 // ── active sessions ──
 // ── active sessions ──
 const [sessions, setSessions] = useState<ActiveSession[]>([])
 const [loadingSessions, setLoadingSessions] = useState(true)
 const [checkingOut, setCheckingOut] = useState<string | null>(null)
 const [nowTick, setNowTick] = useState(0)

 // ——— search by wristband code ———
 const [codeSearch, setCodeSearch] = useState('')
 const [codeResult, setCodeResult] = useState<ActiveSession | 'not_found' | null>(null)
 const [codeSearching, setCodeSearching] = useState(false)

 // ——— timer tick ————————————————————————————————————————————————
 useEffect(() => {
 const id = setInterval(() => setNowTick(n => n + 1), 60_000)
 return () => clearInterval(id)
 }, [])

 // ── fetch sessions ────────────────────────────────────────
 const fetchSessions = useCallback(async () => {
 try {
 const res = await (api.playzone.sessions as Loose).get({ query: { tenantId } })
 if (!res.error) setSessions((res.data as { data: ActiveSession[] }).data ?? [])
 else setNotice(getApiErrorMessage(res.error, 'No se pudieron cargar las sesiones.'))
 } catch { setNotice('Error de conexión al cargar sesiones.') }
 finally { setLoadingSessions(false) }
 }, [tenantId])

 useEffect(() => { fetchSessions() }, [fetchSessions])

 // tarifas del tenant
 useEffect(() => {
 (async () => {
 try {
 const res = await (api.playzone.rates as Loose).get({ query: { tenantId } })
 if (res.error) throw res.error
 const rates = (res.data as { data: PlayzoneRates }).data
 const opts: DurationOpt[] = [...rates.durations.map(d => ({ label: d.label, minutes: d.minutes, price: d.price })), FREE_OPTION]
 setDurationOptions(opts)
 setSelectedDuration(opts[0])
 } catch (err) {
 setNotice(getApiErrorMessage(err, 'No se pudieron cargar las tarifas.'))
 }
 })()
 }, [tenantId])

 // agrega el cargo calculado por el backend al ticket de caja
 const queueCharge = (charge: PlayzoneCharge | null | undefined) => {
 if (!charge) return
 addCharge(charge)
 setNotice(`Agregado a caja: ${charge.label} — S/ ${charge.amount.toFixed(2)}`)
 }
 useEffect(() => {
 const id = setInterval(fetchSessions, 60_000)
 return () => clearInterval(id)
 }, [fetchSessions])

 // ── guardian lookup ───────────────────────────────────────
 const handleSearch = async () => {
 const q = searchQ.trim()
 if (!q) return
 setSearching(true)
 setSearchError('')
 setSelectedChild(null)
 setLastCode(null)
 try {
 const res = await (api.playzone.guardians.lookup as Loose).get({ query: { tenantId, q } })
 if (!res.error && (res.data as Loose).found) {
 setMode({ type: 'FOUND', guardian: (res.data as Loose).data })
 } else {
 setMode({ type: 'NOT_FOUND', q })
 setGuardianDni(q)
 setChildName('')
 setChildDni('')
 setChildAge('')
 setChildGender('')
 setGuardianName('')
 setGuardianPhone('')
 }
 } catch { setSearchError('Error de conexión.') }
 finally { setSearching(false) }
 }

 const openRegistering = () => {
 setMode({ type: 'REGISTERING' })
 setGuardianDni('')
 setGuardianName('')
 setGuardianPhone('')
 setChildName('')
 setChildDni('')
 setChildAge('')
 setChildGender('')
 setSelectedChild(null)
 setLastCode(null)
 }

 // ── register guardian + child ─────────────────────────────
 const handleRegister = async () => {
 if (registering) return
 if (!tenantId) {
 alert('No hay tenant activo. Vuelve a iniciar sesión.')
 return
 }

 const dni = guardianDni.trim()
 const gName = guardianName.trim()
 const cName = childName.trim()

 if (!dni || !gName || !cName) return
 if (dni.length < 7 || dni.length > 15) {
 alert('El DNI del apoderado debe tener entre 7 y 15 digitos.')
 return
 }
 if (childAge) {
 const ageNum = Number(childAge)
 if (!Number.isInteger(ageNum) || ageNum < 1 || ageNum > 17) {
 alert('La edad del niño debe estar entre 1 y 17.')
 return
 }
 }

 setRegistering(true)
 try {
 const body: Record<string, unknown> = {
 tenantId,
 dni,
 fullName: gName,
 childName: cName,
 }
 if (guardianPhone) body.phone = guardianPhone.trim()
 if (childDni) body.childDni = childDni.trim()
 if (childAge) body.childAge = parseInt(childAge)
 if (childGender) body.childGender = childGender

 const res = await (api.playzone.guardians as Loose).post(body)
 if (!res.error) {
 const guardian: Guardian = (res.data as Loose).data
 setMode({ type: 'FOUND', guardian })
 } else {
 alert(getApiErrorMessage(res.error, 'Error al registrar.'))
 }
 } catch (err) { alert(getApiErrorMessage(err, 'Error de conexión.')) }
 finally { setRegistering(false) }
 }

 // ── add child to existing guardian ────────────────────────
 const handleAddChild = async (guardianId: string) => {
 if (!newChildName || addingChild) return
 setAddingChild(true)
 try {
 const body: Record<string, unknown> = { tenantId, guardianId, fullName: newChildName.trim() }
 if (newChildAge) body.age = parseInt(newChildAge)
 if (newChildDni) body.dni = newChildDni.trim()
 if (newChildGender) body.gender = newChildGender

 const res = await (api.playzone.guardians as Loose)({ id: guardianId }).children.post(body)
 if (!res.error) {
 const child: Child = (res.data as Loose).data
 if (mode.type === 'FOUND') {
 const updated: Guardian = { ...mode.guardian, children: [...mode.guardian.children, child] }
 setMode({ type: 'FOUND', guardian: updated })
 }
 setNewChildName(''); setNewChildAge(''); setNewChildDni(''); setNewChildGender(''); setShowAddChild(false)
 } else {
 alert(getApiErrorMessage(res.error, 'Error al agregar niño.'))
 }
 } catch { alert('Error de conexión.') }
 finally { setAddingChild(false) }
 }

 // ── start session ─────────────────────────────────────────
 const handleStart = async () => {
 if (!selectedChild || starting) return
 setStarting(true)
 setLastCode(null)
 try {
 const body: Record<string, unknown> = { tenantId, childId: selectedChild.id }
 if (selectedDuration.minutes !== null) body.durationMinutes = selectedDuration.minutes
 const res = await (api.playzone.sessions as Loose).post(body)
 if (!res.error) {
 const session = (res.data as Loose).data
 setLastCode({ code: session.wristbandCode, price: selectedDuration.price, childName: selectedChild.fullName })
 queueCharge(session.charge)
 setSelectedChild(null)
 setSelectedDuration(durationOptions[0])
 fetchSessions()
 } else {
 alert(getApiErrorMessage(res.error, 'Error al iniciar sesión.'))
 }
 } catch { alert('Error de conexión.') }
 finally { setStarting(false) }
 }

 // ── checkout ──────────────────────────────────────────────
 const handleCheckout = async (sessionId: string) => {
 if (!tenantId) {
 alert('No hay tenant activo. Vuelve a iniciar sesión.')
 return
 }
 setCheckingOut(sessionId)
 try {
 const res = await (api.playzone.sessions as Loose)({ id: sessionId }).complete.patch(
 undefined,
 { query: { tenantId } }
 )
 if (!res.error) {
 setSessions(prev => prev.filter(s => s.id !== sessionId))
 if (typeof codeResult === 'object' && codeResult !== null && (codeResult as ActiveSession).id === sessionId) {
 setCodeResult(null); setCodeSearch('')
 }
 queueCharge((res.data as Loose)?.data?.charge as PlayzoneCharge | null)
 } else {
 alert(getApiErrorMessage(res.error, 'No se pudo finalizar la sesión.'))
 }
 } catch (err) {
 alert(getApiErrorMessage(err, 'Error de conexión al finalizar sesión.'))
 } finally { setCheckingOut(null) }
 }

 // ── code search ───────────────────────────────────────────
 const handleCodeSearch = async () => {
 const code = codeSearch.padStart(3, '0')
 if (!/^\d{3}$/.test(code)) return
 setCodeSearching(true)
 try {
 const res = await (api.playzone.sessions.lookup as Loose).get({ query: { tenantId, code } })
 if (!res.error) setCodeResult((res.data as Loose).data)
 else setCodeResult('not_found')
 } catch { setCodeResult('not_found') }
 finally { setCodeSearching(false) }
 }

 // ── render ────────────────────────────────────────────────
 return (
 <TerminalShell activeSection="playzone">
 <div className="flex h-full flex-col overflow-hidden rounded-sm bg-transparent">

 {/* HEADER */}
 <header className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shrink-0">
 <div className="flex items-center gap-4">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 flex items-center justify-center bg-gray-100 border-2 border-gray-300 rounded-md">
 <Baby className="w-6 h-6 text-brand-500" />
 </div>
 <div>
 <h1 className="text-lg font-black text-gray-900 uppercase tracking-wider leading-none">JUEGOS INFANTILES</h1>
 <p className="text-[11px] text-gray-400 font-mono uppercase tracking-widest mt-0.5">
 {sessions.length} activo{sessions.length !== 1 ? 's' : ''}
 </p>
 </div>
 </div>
 </div>
 <div className="flex bg-gray-100 p-1 rounded-sm border border-gray-200">
 <button onClick={() => setActiveTab('JUEGO_LIBRE')} className={`px-4 py-1.5 text-xs font-black uppercase tracking-widest rounded-sm transition-colors ${activeTab === 'JUEGO_LIBRE' ? 'bg-brand-600 text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}>
 Juego Libre
 </button>
 <button onClick={() => setActiveTab('CUMPLEAÑOS')} className={`px-4 py-1.5 text-xs font-black uppercase tracking-widest rounded-sm transition-colors flex items-center gap-1.5 ${activeTab === 'CUMPLEAÑOS' ? 'bg-brand-600 text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}>
 <PartyPopper className="w-3.5 h-3.5" /> Cumpleaños
 </button>
 </div>

 <button onClick={fetchSessions} disabled={loadingSessions}
 className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 border border-gray-200 text-gray-500 hover:text-gray-900 font-bold text-xs uppercase tracking-widest rounded-sm disabled:opacity-50 transition-none">
 <RefreshCw className={`w-3.5 h-3.5 ${loadingSessions ? 'animate-spin' : ''}`} /> SYNC
 </button>
 </header>

 {notice && (
 <div role="status" className="flex items-center justify-between gap-3 px-5 py-2 bg-secondary-50 border-b border-secondary-200 text-xs font-bold text-gray-900">
 <span>{notice}</span>
 <button onClick={() => setNotice(null)} className="text-gray-500 hover:text-gray-900 uppercase tracking-widest">Cerrar</button>
 </div>
 )}

 {activeTab === 'CUMPLEAÑOS' ? (
 <BirthdaysView />
 ) : (
 <div className="flex flex-1 overflow-hidden">

 {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 LEFT PANEL — CRM (320px) — CHILD FIRST
 â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
 <aside className="flex flex-col w-[320px] shrink-0 border-r border-gray-200 overflow-y-auto bg-white">

 <div className="flex gap-2 p-3 bg-gray-100 border-b border-gray-200">
 <button onClick={openRegistering}
 className="flex-1 flex items-center justify-center gap-2 py-3 bg-brand-600 hover:bg-brand-600 text-gray-900 font-black text-xs uppercase tracking-widest rounded-sm transition-none">
 <Plus className="w-4 h-4" /> Nuevo niño
 </button>
 </div>

 <div className="p-4 border-b border-gray-200">
 <SectionLabel>Ya es cliente? (DNI padre)</SectionLabel>
 <div className="flex gap-2">
 <input
 type="text" inputMode="numeric" maxLength={15}
 value={searchQ}
 onChange={e => setSearchQ(e.target.value.replace(/\D/g, ''))}
 onKeyDown={e => e.key === 'Enter' && handleSearch()}
 placeholder="DNI apoderado"
 className="flex-1 bg-gray-100 border-2 border-gray-200 focus:border-brand-500 rounded-sm px-3 py-2.5 text-sm font-bold text-gray-900 font-mono placeholder:text-slate-600 focus:outline-none transition-colors"
 />
 <button onClick={handleSearch} disabled={searching || !searchQ}
 className="px-3 py-2.5 bg-gray-200 hover:bg-gray-300 disabled:opacity-40 text-gray-900 font-bold text-xs uppercase tracking-widest rounded-sm transition-none">
 {searching ? '...' : <Search className="w-4 h-4" />}
 </button>
 </div>
 {searchError && <p className="mt-2 text-[10px] text-brand-500 font-bold uppercase">{searchError}</p>}
 </div>

 {/* ── FOUND state: children + guardian info ── */}
 {mode.type === 'FOUND' && (
 <div className="flex flex-col p-4 gap-3">
 <div className="flex items-center justify-between mb-1">
 <SectionLabel className="mb-0">Elige un niño</SectionLabel>
 <button onClick={() => { setMode({ type: 'IDLE' }); setSearchQ(''); setSelectedChild(null) }}
 className="text-gray-400 hover:text-gray-900 transition-none border border-gray-200 px-2 py-1 bg-gray-100 text-[10px] font-bold uppercase rounded-sm">
 Cerrar
 </button>
 </div>

 {/* Children list */}
 <div className="flex flex-col gap-2">
 {mode.guardian.children.map(child => {
 const isActive = sessions.some(s => s.childId === child.id)
 const isSel = selectedChild?.id === child.id
 return (
 <button key={child.id}
 onClick={() => {
 if (isActive) return
 setSelectedChild({ ...child, guardianName: mode.guardian.fullName })
 setLastCode(null)
 }}
 disabled={isActive}
 className={`flex items-center justify-between px-3 py-2.5 rounded-sm border-2 text-left transition-none ${isSel ? 'bg-brand-600 border-brand-500 text-gray-900'
 : isActive ? 'bg-gray-100 border-gray-200 text-slate-600 cursor-not-allowed'
 : 'bg-gray-100 border-gray-200 text-gray-600 hover:border-slate-500 hover:text-gray-900'
 }`}
 >
 <div className="flex items-center gap-2">
 <Baby className="w-4 h-4 shrink-0" />
 <div>
 <p className="text-sm font-bold truncate pr-2">{child.fullName}</p>
 <div className="flex gap-2 opacity-70 mt-0.5 font-mono text-[9px] uppercase tracking-widest">
 {child.age && <span>{child.age}A</span>}
 {child.gender && <span>{child.gender}</span>}
 {child.dni && <span>{child.dni}</span>}
 </div>
 </div>
 </div>
 {isActive
 ? <span className="text-[9px] font-black text-secondary-500 border border-secondary-500 bg-secondary-500/10 px-1.5 py-0.5 rounded-sm uppercase tracking-widest">Activo</span>
 : isSel ? <CheckCircle2 className="w-4 h-4 shrink-0" />
 : <ChevronRight className="w-4 h-4 shrink-0 opacity-50" />}
 </button>
 )
 })}
 </div>

 {/* Add child inline */}
 {!showAddChild ? (
 <button onClick={() => setShowAddChild(true)}
 className="flex items-center justify-center gap-2 w-full py-2.5 mt-1 bg-gray-100 border border-dashed border-gray-300 hover:border-slate-500 text-gray-500 hover:text-gray-900 font-bold text-xs uppercase tracking-widest rounded-sm transition-none">
 <Plus className="w-3.5 h-3.5" /> Otro niño ({mode.guardian.fullName.split(' ')[0]})
 </button>
 ) : (
 <div className="flex flex-col gap-2 p-3 bg-gray-100 border-2 border-gray-300 rounded-sm mt-1">
 <SectionLabel>Nuevo Niño</SectionLabel>
 <input type="text" value={newChildName} onChange={e => setNewChildName(e.target.value)}
 placeholder="Nombre del niño *"
 className="bg-white border border-gray-200 focus:border-brand-500 rounded-sm px-2.5 py-2 text-sm font-bold text-gray-900 placeholder:text-slate-600 focus:outline-none" />
 <div className="grid grid-cols-2 gap-2">
 <input type="number" value={newChildAge} onChange={e => setNewChildAge(e.target.value)}
 placeholder="Edad" min={1} max={17}
 className="bg-white border border-gray-200 focus:border-brand-500 rounded-sm px-2.5 py-2 text-sm font-bold text-gray-900 placeholder:text-slate-600 focus:outline-none" />
 <select value={newChildGender} onChange={e => setNewChildGender(e.target.value as Loose)}
 className="bg-white border border-gray-200 focus:border-brand-500 rounded-sm px-2.5 py-2 text-sm font-bold text-gray-900 focus:outline-none appearance-none">
 <option value="">Sexo</option>
 <option value="M">Masculino</option>
 <option value="F">Femenino</option>
 </select>
 </div>
 <input type="text" value={newChildDni} onChange={e => setNewChildDni(e.target.value.replace(/\D/g, ''))}
 placeholder="DNI Niño (opcional)" maxLength={8}
 className="bg-white border border-gray-200 focus:border-brand-500 rounded-sm px-2.5 py-2 text-sm font-bold text-gray-900 font-mono placeholder:text-slate-600 focus:outline-none" />

 <div className="flex gap-2 mt-1">
 <button onClick={() => { setShowAddChild(false); setNewChildName(''); setNewChildAge(''); setNewChildDni(''); setNewChildGender('') }}
 className="flex-1 py-2 bg-gray-200 border border-gray-300 text-gray-600 font-bold text-xs uppercase tracking-widest rounded-sm hover:bg-gray-300 transition-none">
 Cancelar
 </button>
 <button onClick={() => handleAddChild(mode.guardian.id)}
 disabled={!newChildName || addingChild}
 className="flex-1 py-2 bg-brand-600 hover:bg-brand-600 disabled:opacity-40 text-gray-900 font-bold text-xs uppercase tracking-widest rounded-sm transition-none">
 {addingChild ? '...' : 'Guardar'}
 </button>
 </div>
 </div>
 )}

 {/* Guardian info */}
 <div className="mt-4 pt-4 border-t border-gray-200 text-gray-400 flex flex-col gap-1">
 <SectionLabel>Apoderado</SectionLabel>
 <div className="flex items-center gap-2">
 <Shield className="w-3.5 h-3.5" />
 <span className="text-xs text-gray-600 font-bold">{mode.guardian.fullName}</span>
 </div>
 <div className="flex items-center gap-4 mt-1">
 <div className="flex items-center gap-1 opacity-70">
 <FileText className="w-3 h-3" /> <span className="text-[10px] font-mono">{mode.guardian.dni}</span>
 </div>
 {mode.guardian.phone && (
 <div className="flex items-center gap-1 opacity-70">
 <Phone className="w-3 h-3" /> <span className="text-[10px] font-mono">{mode.guardian.phone}</span>
 </div>
 )}
 </div>
 </div>
 </div>
 )}

 {/* ── NOT_FOUND or MANUAL REGISTER: child-first form ── */}
 {(mode.type === 'NOT_FOUND' || mode.type === 'REGISTERING') && (
 <div className="flex flex-col p-4 gap-4 bg-gray-100">
 <div className="flex items-center justify-between">
 <p className="text-[11px] font-black text-brand-500 uppercase tracking-widest">
 {mode.type === 'NOT_FOUND' ? 'No existe — crear perfil' : 'Registrar Nuevo Perfil'}
 </p>
 <button onClick={() => { setMode({ type: 'IDLE' }); setSearchQ('') }}
 className="text-gray-400 hover:text-gray-900 transition-none">
 <XCircle className="w-5 h-5" />
 </button>
 </div>

 <div className="flex flex-col gap-3">
 {/* CHILD INFO */}
 <div className="p-3 bg-gray-100 border-2 border-brand-800 rounded-sm">
 <div className="flex items-center gap-1.5 mb-3">
 <Baby className="w-4 h-4 text-brand-500" />
 <SectionLabel className="mb-0 text-brand-500">Datos del Niño</SectionLabel>
 </div>
 <div className="flex flex-col gap-2">
 <input type="text" value={childName} onChange={e => setChildName(e.target.value)}
 placeholder="Nombre completo *"
 className="w-full bg-white border border-gray-200 focus:border-brand-500 rounded-sm px-3 py-2 text-sm font-bold text-gray-900 placeholder:text-slate-600 focus:outline-none transition-colors" />

 <div className="grid grid-cols-2 gap-2">
 <input type="number" value={childAge} onChange={e => setChildAge(e.target.value)}
 placeholder="Edad" min={1} max={17}
 className="w-full bg-white border border-gray-200 focus:border-brand-500 rounded-sm px-3 py-2 text-sm font-bold text-gray-900 placeholder:text-slate-600 focus:outline-none transition-colors" />
 <select value={childGender} onChange={e => setChildGender(e.target.value as Loose)}
 className="w-full bg-white border border-gray-200 focus:border-brand-500 rounded-sm px-3 py-2 text-sm font-bold text-gray-600 focus:outline-none transition-colors appearance-none">
 <option value="">Sexo</option>
 <option value="M">Masculino</option>
 <option value="F">Femenino</option>
 </select>
 </div>

 <input type="text" value={childDni} onChange={e => setChildDni(e.target.value.replace(/\D/g, ''))}
 placeholder="DNI Niño (opcional)" maxLength={8}
 className="w-full bg-white border border-gray-200 focus:border-brand-500 rounded-sm px-3 py-2 text-sm font-bold text-gray-900 font-mono placeholder:text-slate-600 focus:outline-none transition-colors" />
 </div>
 </div>

 {/* GUARDIAN INFO */}
 <div className="p-3 bg-gray-100 border-2 border-gray-200 rounded-sm">
 <div className="flex items-center gap-1.5 mb-3">
 <User className="w-4 h-4 text-gray-500" />
 <SectionLabel className="mb-0 text-gray-500">Datos del Apoderado</SectionLabel>
 </div>
 <div className="flex flex-col gap-2">
 <input type="text" value={guardianName} onChange={e => setGuardianName(e.target.value)}
 placeholder="Nombre completo *"
 className="w-full bg-white border border-gray-200 focus:border-brand-500 rounded-sm px-3 py-2 text-sm font-bold text-gray-900 placeholder:text-slate-600 focus:outline-none transition-colors" />

 <input type="text" inputMode="numeric" value={guardianDni} onChange={e => setGuardianDni(e.target.value.replace(/\D/g, ''))}
 placeholder="DNI Apoderado *" maxLength={15}
 className="w-full bg-white border border-gray-200 focus:border-brand-500 rounded-sm px-3 py-2 text-sm font-bold text-gray-900 font-mono placeholder:text-slate-600 focus:outline-none transition-colors" />

 <input type="text" inputMode="numeric" value={guardianPhone} onChange={e => setGuardianPhone(e.target.value.replace(/\D/g, ''))}
 placeholder="Teléfono (opcional)" maxLength={15}
 className="w-full bg-white border border-gray-200 focus:border-brand-500 rounded-sm px-3 py-2 text-sm font-bold text-gray-900 font-mono placeholder:text-slate-600 focus:outline-none transition-colors" />
 </div>
 </div>

 <button onClick={handleRegister}
 disabled={!guardianDni || !guardianName || !childName || registering}
 className="flex items-center justify-center gap-2 w-full py-4 mt-2 bg-brand-600 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-900 font-black text-xs uppercase tracking-widest rounded-sm transition-none">
 <UserPlus className="w-5 h-5" />
 {registering ? 'Guardando...' : 'Guardar y Seleccionar'}
 </button>
 </div>
 </div>
 )}

 {/* IDLE state text (if not in child list or form) */}
 {mode.type === 'IDLE' && (
 <div className="flex flex-col items-center justify-center flex-1 gap-3 text-slate-700 p-8 text-center bg-gray-50">
 <Baby className="w-12 h-12 text-slate-800" />
 <p className="text-xs font-bold uppercase tracking-widest text-slate-600">
 Busca un apoderado o registra un nuevo niño
 </p>
 </div>
 )}

 {/* Wristband search (bottom of side panel) */}
 <div className="mt-auto p-4 border-t border-gray-200 bg-white">
 <SectionLabel>Código de Pulsera (Búsqueda local)</SectionLabel>
 <div className="flex gap-2">
 <input type="text" inputMode="numeric" maxLength={3}
 value={codeSearch}
 onChange={e => setCodeSearch(e.target.value.replace(/\D/g, '').slice(0, 3))}
 onKeyDown={e => e.key === 'Enter' && handleCodeSearch()}
 placeholder="···"
 className="flex-1 bg-gray-100 border-2 border-gray-200 focus:border-slate-500 rounded-sm px-3 py-2 text-xl font-black text-gray-900 font-mono text-center tracking-[0.6rem] placeholder:text-slate-700 focus:outline-none" />
 <button onClick={handleCodeSearch} disabled={!codeSearch || codeSearching}
 className="px-3 bg-gray-200 border border-gray-300 hover:bg-gray-300 text-gray-900 font-bold text-xs uppercase tracking-widest rounded-sm disabled:opacity-40 transition-none">
 {codeSearching ? '...' : <Search className="w-4 h-4" />}
 </button>
 </div>
 {codeResult && codeResult !== 'not_found' && (
 <div className="mt-3">
 <SessionCard session={codeResult as ActiveSession} onCheckout={handleCheckout}
 checking={checkingOut === (codeResult as ActiveSession).id} nowTick={nowTick} durationOptions={durationOptions} />
 </div>
 )}
 {codeResult === 'not_found' && codeSearch.length === 3 && (
 <p className="mt-2 text-xs font-bold text-brand-500 text-center border border-red-700 bg-brand-600/10 rounded-sm py-1.5 uppercase tracking-widest">
 Código incorrecto o inactivo
 </p>
 )}
 </div>
 </aside>

 {/* ═══════════════════════════════════════════
 MIDDLE PANEL — Session Start (260px)
 ═══════════════════════════════════════════ */}
 <section className="flex flex-col w-65 shrink-0 border-r border-gray-200 bg-white/60 overflow-y-auto shadow-xl z-10 relative">
 <div className="p-4 border-b border-gray-200">
 <div className="flex items-center gap-2 text-gray-600">
 <Timer className="w-4 h-4" />
 <h2 className="text-xs font-black uppercase tracking-widest mt-0.5">Asignar Tiempo</h2>
 </div>
 </div>

 {!selectedChild ? (
 <div className="flex flex-col items-center justify-center flex-1 gap-3 text-slate-700 p-8 text-center">
 <Clock className="w-10 h-10 opacity-30" />
 <p className="text-xs font-bold uppercase tracking-widest text-slate-600 mt-2">
 Elija al niño a la izquierda
 </p>
 </div>
 ) : (
 <div className="flex flex-col gap-4">
 {/* Selected child header */}
 <div className="px-4 py-3 bg-brand-900/30 border-b border-brand-800">
 <SectionLabel className="text-brand-500">Niño Seleccionado</SectionLabel>
 <div className="flex items-start justify-between">
 <div>
 <p className="text-sm font-black text-gray-900">{selectedChild.fullName}</p>
 <p className="text-[10px] text-brand-300 font-mono mt-0.5">
 {selectedChild.age && `${selectedChild.age}A `}{selectedChild.gender} {selectedChild.dni && `· DNI: ${selectedChild.dni}`}
 </p>
 </div>
 <button onClick={() => setSelectedChild(null)} className="text-gray-400 hover:text-gray-900 transition-none p-1">
 <XCircle className="w-4 h-4" />
 </button>
 </div>
 </div>

 {/* Duration picker */}
 <div className="px-4">
 <SectionLabel>Tarifas / Tiempos</SectionLabel>
 <div className="grid grid-cols-2 gap-2">
 {durationOptions.map(opt => {
 const isSel = selectedDuration.label === opt.label
 return (
 <button key={opt.label} onClick={() => setSelectedDuration(opt)}
 className={`flex flex-col items-center justify-center py-3 rounded-sm border-2 transition-none ${isSel ? 'bg-brand-600 border-brand-500 text-gray-900' : 'bg-gray-100 border-gray-200 text-gray-500 hover:border-slate-500 hover:text-gray-900'
 }`}>
 <div className="flex items-center gap-1 text-[11px] font-black uppercase tracking-widest">
 {opt.minutes === null ? <InfinityIcon className="w-4 h-4" /> : <Clock className="w-3 h-3" />}
 {opt.label}
 </div>
 <span className={`text-[11px] font-black font-mono mt-1 ${isSel ? 'text-gray-900/80' : 'text-brand-500'}`}>
 {opt.price !== null ? `S/ ${opt.price.toFixed(2)}` : 'libre'}
 </span>
 </button>
 )
 })}
 </div>
 </div>

 {/* Start action */}
 <div className="px-4 pb-4">
 <button onClick={handleStart} disabled={starting}
 className="flex items-center justify-center gap-2 w-full py-4 bg-brand-600 hover:bg-brand-600 disabled:opacity-40 text-gray-900 font-black text-sm uppercase tracking-widest rounded-sm transition-none relative overflow-hidden group">
 <span className="absolute inset-0 w-full h-full bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform"></span>
 <Timer className="w-5 h-5 relative z-10" />
 <span className="relative z-10">
 {starting ? 'Iniciando...' : 'INICIAR JUEGO'}
 </span>
 </button>
 </div>

 {/* Last generated code alert */}
 {lastCode && (
 <div className="mt-auto p-4 pt-6 border-t border-gray-200 bg-gray-100">
 <p className="text-[10px] text-secondary-500 font-black uppercase tracking-widest text-center mb-2">
 Código Generado: Escribir en pulsera
 </p>
 <div className="bg-white border-2 border-secondary-500 rounded-sm p-4 text-center shadow-inner">
 <span className="text-6xl font-black font-mono text-secondary-500 tracking-widest">
 {lastCode.code}
 </span>
 </div>
 <div className="flex items-center justify-between mt-3 text-gray-600">
 <span className="text-[10px] font-bold uppercase tracking-widest truncate max-w-30">{lastCode.childName}</span>
 <span className="text-sm font-black font-mono text-secondary-500">{fmtPrice(lastCode.price)}</span>
 </div>
 </div>
 )}
 </div>
 )}
 </section>

 {/* ═══════════════════════════════════════════
 RIGHT PANEL — Active Sessions Grid
 ═══════════════════════════════════════════ */}
 <main className="flex-1 overflow-y-auto p-4 bg-white">
 <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200">
 <p className="text-xs font-bold font-mono text-gray-400 uppercase tracking-widest flex items-center gap-2">
 <Baby className="w-4 h-4" />
 {sessions.length} Niños Jugando
 </p>
 <div className="flex items-center gap-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-gray-100 px-3 py-1.5 rounded-sm">
 <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-secondary-500" /> Todo OK</span>
 <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" /> &lt;5 min</span>
 <span className="flex items-center gap-1.5 origin-center animate-pulse"><span className="w-2 h-2 rounded-full bg-red-500" /> Tiempo Terminado</span>
 </div>
 </div>

 {loadingSessions && (
 <div className="flex items-center justify-center h-48 gap-3 text-slate-600">
 <RefreshCw className="w-7 h-7 animate-spin text-brand-600" />
 <p className="text-xs font-bold uppercase tracking-widest">Sincronizando...</p>
 </div>
 )}

 {!loadingSessions && sessions.length === 0 && (
 <div className="flex flex-col items-center justify-center h-64 gap-4 text-slate-700">
 <Timer className="w-16 h-16 opacity-10" />
 <p className="text-sm font-bold uppercase tracking-widest">La zona de juegos está vacía</p>
 </div>
 )}

 {!loadingSessions && sessions.length > 0 && (
 <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 items-start">
 {sessions.map(s => (
 <SessionCard key={s.id} session={s} onCheckout={handleCheckout}
 checking={checkingOut === s.id} nowTick={nowTick} durationOptions={durationOptions} />
 ))}
 </div>
 )}
 </main>
 </div>
 )}

 </div>
 </TerminalShell>
 )
}


