// PlayZoneScreen — CRM + Time Tracking (Child-Centric UI)
import { useEffect, useState, useCallback } from 'react'
import {
 UserPlus, RefreshCw,
 Baby, CheckCircle2,
 ChevronRight, Plus,
 Shield, Phone, FileText, PartyPopper
} from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { usePlayzoneTicketStore, type PlayzoneCharge } from '@/store/playzoneTicketStore'
import { TerminalShell } from '@/components/TerminalShell'
import { TicketPanel } from '@/components/TicketPanel'
import { TicketDrawer } from '@/components/TicketDrawer'
import { useCan } from '@/lib/permissions'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { apiErrorMessage as getApiErrorMessage } from '@/lib/api-error'
import { toast } from '@/components/ui/toast'
import { Input } from '@/components/ui/input'
import { formatPEN } from '@/lib/format'
import {
 type Loose, type PlayzoneRates, DEFAULT_COMPANION_PRICE, type DurationOpt, FREE_OPTION, type Child, type Guardian, type ActiveSession, type PanelMode,
 SectionLabel
} from './playzone/shared'
import { BirthdaysView } from './playzone/BirthdaysView'
import { SessionStartPanel } from './playzone/SessionStartPanel'
import { ActiveSessionsGrid } from './playzone/ActiveSessionsGrid'
import { WristbandSearch } from './playzone/WristbandSearch'
import { GuardianSearchBox } from './playzone/GuardianSearchBox'
import { GenderButtons } from './playzone/GenderButtons'
import { RegisterModal } from './playzone/RegisterModal'

// ── Main Screen ───────────────────────────────────────────────

export function PlayZoneScreen() {
 const { tenantId } = useAuthStore()
 const wide = useMediaQuery('(min-width: 1536px)')
 const { addCharge } = usePlayzoneTicketStore()
 const ticketCharges = usePlayzoneTicketStore((s) => s.charges)
 const [durationOptions, setDurationOptions] = useState<DurationOpt[]>([FREE_OPTION])
 const [companionPrice, setCompanionPrice] = useState(DEFAULT_COMPANION_PRICE)
 const [rates, setRates] = useState<PlayzoneRates | null>(null)
 const { can } = useCan()
 const wristbandOn = rates?.wristbandEnabled !== false
 const [notice, setNotice] = useState<string | null>(null)
 const [crmOpen, setCrmOpen] = useState(true)
 const [activeTab, setActiveTab] = useState<'JUEGO_LIBRE' | 'CUMPLEAÑOS'>('JUEGO_LIBRE')

 // ── left panel state ──
 const [mode, setMode] = useState<PanelMode>({ type: 'IDLE' })
 const [searchQ, setSearchQ] = useState('')
 const [searching, setSearching] = useState(false)
 const [searchError, setSearchError] = useState('')

 const [registerOpen, setRegisterOpen] = useState(false)
 const [registerDni, setRegisterDni] = useState('')
 const [registerKey, setRegisterKey] = useState(0)

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
 const [companions, setCompanions] = useState(0)
 const [notes, setNotes] = useState('')
 const [starting, setStarting] = useState(false)
 const [lastCode, setLastCode] = useState<{ code: string; price: number | null; childName: string; note: string; sessionId: string; needsPayment: boolean } | null>(null)

 // ── active sessions ──
 // ── active sessions ──
 const [sessions, setSessions] = useState<ActiveSession[]>([])
 const [loadingSessions, setLoadingSessions] = useState(true)
 const [checkingOut, setCheckingOut] = useState<string | null>(null)

 // ——— search by wristband code ———
 const [codeSearch, setCodeSearch] = useState('')
 const [codeResult, setCodeResult] = useState<ActiveSession | 'not_found' | null>(null)
 const [codeSearching, setCodeSearching] = useState(false)

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
 setRates(rates)
 const tarifas: DurationOpt[] = rates.durations.map(d => ({ label: d.label, minutes: d.minutes, price: d.price }))
 // Aliado: misma tarifa de 30 min, pero el ticket lleva el descuento por el mismo monto
 const t30 = tarifas.find(d => d.minutes === 30)
 const opts: DurationOpt[] = [...tarifas, ...(t30 ? [{ label: '30 Min aliado', minutes: 30, price: t30.price, ally: true }] : []), FREE_OPTION]
 setDurationOptions(opts)
 setCompanionPrice(rates.companionPrice ?? DEFAULT_COMPANION_PRICE)
 setSelectedDuration(opts[0])
 } catch (err) {
 setNotice(getApiErrorMessage(err, 'No se pudieron cargar las tarifas.'))
 }
 })()
 }, [tenantId])

 // el dueño habilita/deshabilita el código de pulsera (se guarda con las tarifas)
 const toggleWristband = async () => {
 if (!rates) return
 const next = { ...rates, wristbandEnabled: !wristbandOn }
 try {
 const res = await (api.playzone.rates as Loose).put({ tenantId, ...next })
 if (res.error) throw res.error
 setRates(next); setCodeResult(null)
 } catch (err) {
 setNotice(getApiErrorMessage(err, 'No se pudo guardar el cambio.'))
 }
 }

 // clic derecho en una tarjeta: suma 30 min o 1 h y deja el cargo en el ticket
 const handleExtend = async (sessionId: string, minutes: number) => {
 try {
 const res = await (api.playzone.sessions as Loose)({ id: sessionId }).extend.post({ tenantId, minutes })
 if (res.error) throw res.error
 queueCharge((res.data as Loose).data.charge)
 fetchSessions()
 } catch (err) { toast.error(getApiErrorMessage(err, 'No se pudo agregar el tiempo.')) }
 }

 // agrega el cargo calculado por el backend al ticket de caja
 const queueCharge = (charge: PlayzoneCharge | null | undefined) => {
 if (!charge) return
 addCharge(charge)
 setNotice(`Agregado a caja: ${charge.label} — ${formatPEN(charge.amount)}`)
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
 if (/^[0-9]{8}$/.test(q)) { setRegisterDni(q); setRegisterKey(k => k + 1); setRegisterOpen(true) }
 }
 } catch { setSearchError('Error de conexión.') }
 finally { setSearching(false) }
 }

 const openRegistering = () => {
 setRegisterDni(''); setRegisterKey(k => k + 1); setRegisterOpen(true)
 setSelectedChild(null)
 setLastCode(null)
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
 toast.error(getApiErrorMessage(res.error, 'Error al agregar niño.'))
 }
 } catch { toast.error('Error de conexión.') }
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
 if (selectedDuration.ally) body.allyDiscount = true
 if (companions > 0) body.companions = companions
 if (notes.trim()) body.notes = notes.trim()
 const res = await (api.playzone.sessions as Loose).post(body)
 if (!res.error) {
 const session = (res.data as Loose).data
 const note = session.charge || session.companionsCharge
 ? 'Escribe este código en la pulsera. Ahora cobra en el ticket: el tiempo corre al cobrar'
 : selectedDuration.minutes === null
 ? 'Tiempo libre: escribe este código en la pulsera. Se cobra al terminar el juego, con el botón "Terminar juego"'
 : 'Escribe este código en la pulsera'
 setLastCode({ code: session.wristbandCode, price: selectedDuration.price === null && companions === 0 ? null : (selectedDuration.price ?? 0) + companions * companionPrice, childName: selectedChild.fullName, note, sessionId: session.id, needsPayment: !!(session.charge || session.companionsCharge) })
 queueCharge(session.charge)
 queueCharge(session.companionsCharge)
 queueCharge(session.discountCharge)
 if (selectedDuration.minutes !== null && !session.charge) {
 console.warn('Sesión creada sin cargo base en la respuesta:', session)
 toast.error('La sesión se creó, pero el sistema no devolvió el monto a cobrar. Avisa al administrador.')
 }
 setCompanions(0)
 setNotes('')
 setSelectedChild(null)
 setSelectedDuration(durationOptions[0])
 fetchSessions()
 } else {
 toast.error(getApiErrorMessage(res.error, 'Error al iniciar sesión.'))
 }
 } catch { toast.error('Error de conexión.') }
 finally { setStarting(false) }
 }

 // ── checkout ──────────────────────────────────────────────
 const handleCheckout = async (sessionId: string) => {
 if (!tenantId) {
 toast.error('No hay tenant activo. Vuelve a iniciar sesión.')
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
 toast.error(getApiErrorMessage(res.error, 'No se pudo finalizar la sesión.'))
 }
 } catch (err) {
 toast.error(getApiErrorMessage(err, 'Error de conexión al finalizar sesión.'))
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

 // El aviso "cobra en el ticket" solo vale mientras el cargo siga en el ticket: al pagar o quitarlo desaparece
 const shownCode = wristbandOn && lastCode && (!lastCode.needsPayment || ticketCharges.some((c) => c.sessionId === lastCode.sessionId)) ? lastCode : null

 // ── render ────────────────────────────────────────────────
 return (
 <TerminalShell activeSection="playzone">
 <div className={wide ? 'grid grid-cols-[minmax(0,1fr)_360px] grid-rows-[minmax(0,1fr)] gap-4 h-full min-h-0' : 'h-full min-h-0'}>
 <div className="flex h-full min-w-0 flex-col overflow-hidden rounded-sm bg-transparent">

 {/* HEADER */}
 <header className="flex items-center justify-between px-5 py-3 bg-background border-b border-border shrink-0">
 <div className="flex items-center gap-4">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 flex items-center justify-center bg-muted border-2 border-border rounded-md">
 <Baby className="w-6 h-6 text-brand-500" />
 </div>
 <div>
 <h1 className="text-lg font-black text-foreground uppercase tracking-wider leading-none">JUEGOS INFANTILES</h1>
 <p className="text-[11px] text-muted-foreground font-mono uppercase tracking-widest mt-0.5">
 {sessions.length} activo{sessions.length !== 1 ? 's' : ''}
 </p>
 </div>
 </div>
 </div>
 <div className="flex bg-muted p-1 rounded-sm border border-border">
 <button onClick={() => setActiveTab('JUEGO_LIBRE')} className={`px-4 py-1.5 text-xs font-black uppercase tracking-widest rounded-sm transition-colors ${activeTab === 'JUEGO_LIBRE' ? 'bg-brand-600 text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
 Juego Libre
 </button>
 <button onClick={() => setActiveTab('CUMPLEAÑOS')} className={`px-4 py-1.5 text-xs font-black uppercase tracking-widest rounded-sm transition-colors flex items-center gap-1.5 ${activeTab === 'CUMPLEAÑOS' ? 'bg-brand-600 text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
 <PartyPopper className="w-3.5 h-3.5" /> Cumpleaños
 </button>
 </div>

 <button onClick={fetchSessions} disabled={loadingSessions}
 className="flex items-center gap-1.5 px-3 py-2 bg-muted border border-border text-muted-foreground hover:text-foreground font-bold text-xs uppercase tracking-widest rounded-sm disabled:opacity-50 transition-none">
 <RefreshCw className={`w-3.5 h-3.5 ${loadingSessions ? 'animate-spin' : ''}`} /> Actualizar
 </button>
 </header>

 {notice && (
 <div role="status" className="flex items-center justify-between gap-3 px-5 py-2 bg-secondary-50 border-b border-secondary-200 text-xs font-bold text-foreground">
 <span>{notice}</span>
 <button onClick={() => setNotice(null)} className="text-muted-foreground hover:text-foreground uppercase tracking-widest">Cerrar</button>
 </div>
 )}

 {activeTab === 'CUMPLEAÑOS' ? (
 <BirthdaysView />
 ) : (
 <div className="flex flex-1 flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">

 {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 LEFT PANEL — CRM (320px) — CHILD FIRST
 â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
 <button type="button" onClick={() => setCrmOpen(o => !o)} aria-expanded={crmOpen} className="lg:hidden flex items-center justify-between px-4 py-2 bg-muted border-b border-border text-xs font-black uppercase tracking-widest text-foreground">
 Registro de niños <ChevronRight className={`w-4 h-4 transition-transform ${crmOpen ? 'rotate-90' : ''}`} />
 </button>
 <aside className={`${crmOpen ? 'flex' : 'hidden'} lg:flex flex-col w-full lg:w-[320px] lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border overflow-y-auto max-h-[60vh] lg:max-h-none bg-background`}>

 <GuardianSearchBox
 tenantId={tenantId}
 value={searchQ}
 onChange={setSearchQ}
 onPick={(g) => {
 setSearchError(''); setLastCode(null); setMode({ type: 'FOUND', guardian: g })
 const only = g.children.length === 1 ? g.children[0] : null
 setSelectedChild(only && !sessions.some((x) => x.childId === only.id) ? { ...only, guardianName: g.fullName } : null)
 }}
 onSubmit={handleSearch}
 searching={searching}
 error={searchError}
 />

 <RegisterModal key={registerKey} open={registerOpen} initialDni={registerDni} tenantId={tenantId} onClose={() => setRegisterOpen(false)}
 onDone={(g) => { setRegisterOpen(false); setSearchError(''); setMode({ type: 'FOUND', guardian: g }); setSelectedChild(g.children.length === 1 ? { ...g.children[0]!, guardianName: g.fullName } : null) }} />
 {wristbandOn && <WristbandSearch codeSearch={codeSearch} setCodeSearch={setCodeSearch} codeResult={codeResult} codeSearching={codeSearching} onSearch={handleCodeSearch} onCheckout={handleCheckout} checkingOut={checkingOut} durationOptions={durationOptions} />}
 {can('company.settings') && rates && (
 <label className="flex items-center gap-2 px-4 py-2 border-b border-border text-xs font-bold uppercase tracking-widest text-muted-foreground cursor-pointer">
 <input type="checkbox" checked={wristbandOn} onChange={toggleWristband} />
 Código de pulsera
 </label>
 )}
 <div className="flex gap-2 p-3 bg-muted border-b border-border">
 <button onClick={openRegistering}
 className="flex-1 flex items-center justify-center gap-2 py-3 bg-background border-2 border-border hover:border-muted-foreground text-foreground font-bold text-sm rounded-sm transition-none">
 <Plus className="w-4 h-4" /> Cliente nuevo (registrar)
 </button>
 </div>


 {/* ── FOUND state: children + guardian info ── */}
 {mode.type === 'FOUND' && (
 <div className="flex flex-col p-4 gap-3">
 <div className="flex items-center justify-between mb-1">
 <SectionLabel className="mb-0">Elige un niño</SectionLabel>
 <button onClick={() => { setMode({ type: 'IDLE' }); setSearchQ(''); setSelectedChild(null) }}
 className="text-muted-foreground hover:text-foreground transition-none border border-border px-2 py-1 bg-muted text-[11px] font-bold uppercase rounded-sm">
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
 className={`flex items-center justify-between px-3 py-2.5 rounded-sm border-2 text-left transition-none ${isSel ? 'bg-brand-600 border-brand-500 text-primary-foreground'
 : isActive ? 'bg-muted border-border text-muted-foreground cursor-not-allowed'
 : 'bg-muted border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground'
 }`}
 >
 <div className="flex items-center gap-2">
 <Baby className="w-4 h-4 shrink-0" />
 <div>
 <p className="text-sm font-bold truncate pr-2">{child.fullName}</p>
 <div className="flex gap-2 opacity-70 mt-0.5 font-mono text-[11px] uppercase tracking-widest">
 {child.age && <span>{child.age}A</span>}
 {child.gender && <span>{child.gender}</span>}
 {child.dni && <span>{child.dni}</span>}
 </div>
 </div>
 </div>
 {isActive
 ? <span className="text-[11px] font-black text-secondary-500 border border-secondary-500 bg-secondary-500/10 px-1.5 py-0.5 rounded-sm uppercase tracking-widest">Activo</span>
 : isSel ? <CheckCircle2 className="w-4 h-4 shrink-0" />
 : <ChevronRight className="w-4 h-4 shrink-0 opacity-50" />}
 </button>
 )
 })}
 </div>

 {/* Add child inline */}
 {!showAddChild ? (
 <button onClick={() => setShowAddChild(true)}
 className="flex items-center justify-center gap-2 w-full py-2.5 mt-1 bg-muted border border-dashed border-border hover:border-muted-foreground text-muted-foreground hover:text-foreground font-bold text-xs uppercase tracking-widest rounded-sm transition-none">
 <Plus className="w-3.5 h-3.5" /> Otro niño ({mode.guardian.fullName.split(' ')[0]})
 </button>
 ) : (
 <div className="flex flex-col gap-2 p-3 bg-muted border-2 border-border rounded-sm mt-1">
 <SectionLabel>Nuevo Niño</SectionLabel>
 <Input type="text" value={newChildName} onChange={e => setNewChildName(e.target.value)}
 placeholder="Nombre del niño *"
 className="bg-background border border-border focus:border-brand-500 rounded-sm px-2.5 py-2 text-sm font-bold text-foreground placeholder:text-muted-foreground focus:outline-none" />
 <div className="grid grid-cols-2 gap-2">
 <Input type="number" value={newChildAge} onChange={e => setNewChildAge(e.target.value)}
 placeholder="Edad" min={1} max={17}
 className="bg-background border border-border focus:border-brand-500 rounded-sm px-2.5 py-2 text-sm font-bold text-foreground placeholder:text-muted-foreground focus:outline-none" />
 <GenderButtons value={newChildGender} onChange={setNewChildGender} />
 </div>
 <details className="group"><summary className="cursor-pointer select-none py-1 text-xs font-bold text-muted-foreground">DNI del niño (opcional)</summary><div className="mt-2">
 <Input type="text" value={newChildDni} onChange={e => setNewChildDni(e.target.value.replace(/\D/g, ''))}
 placeholder="DNI Niño (opcional)" maxLength={8}
 className="bg-background border border-border focus:border-brand-500 rounded-sm px-2.5 py-2 text-sm font-bold text-foreground font-mono placeholder:text-muted-foreground focus:outline-none" />
 </div></details>

 <div className="flex gap-2 mt-1">
 <button onClick={() => { setShowAddChild(false); setNewChildName(''); setNewChildAge(''); setNewChildDni(''); setNewChildGender('') }}
 className="flex-1 py-2 bg-muted border border-border text-muted-foreground font-bold text-xs uppercase tracking-widest rounded-sm hover:bg-border transition-none">
 Cancelar
 </button>
 <button onClick={() => handleAddChild(mode.guardian.id)}
 disabled={!newChildName || addingChild}
 className="flex-1 py-2 bg-brand-600 hover:bg-brand-600 disabled:opacity-40 text-primary-foreground font-bold text-xs uppercase tracking-widest rounded-sm transition-none">
 {addingChild ? '...' : 'Guardar'}
 </button>
 </div>
 </div>
 )}

 {/* Guardian info */}
 <div className="mt-4 pt-4 border-t border-border text-muted-foreground flex flex-col gap-1">
 <SectionLabel>Apoderado</SectionLabel>
 <div className="flex items-center gap-2">
 <Shield className="w-3.5 h-3.5" />
 <span className="text-xs text-muted-foreground font-bold">{mode.guardian.fullName}</span>
 </div>
 <div className="flex items-center gap-4 mt-1">
 <div className="flex items-center gap-1 opacity-70">
 <FileText className="w-3 h-3" /> <span className="text-[11px] font-mono">{mode.guardian.dni}</span>
 </div>
 {mode.guardian.phone && (
 <div className="flex items-center gap-1 opacity-70">
 <Phone className="w-3 h-3" /> <span className="text-[11px] font-mono">{mode.guardian.phone}</span>
 </div>
 )}
 </div>
 </div>
 </div>
 )}

 {/* ── NOT_FOUND: el registro se hace en el modal ── */}
 {mode.type === 'NOT_FOUND' && (
 <div className="flex flex-col items-center gap-3 p-6 text-center bg-muted">
 <p className="text-xs font-black uppercase tracking-widest text-brand-500">No encontramos ese DNI</p>
 <button onClick={() => { setRegisterDni(mode.q); setRegisterKey(k => k + 1); setRegisterOpen(true) }}
 className="flex items-center gap-2 rounded-sm bg-brand-600 px-4 py-2 text-xs font-black uppercase tracking-widest text-primary-foreground">
 <UserPlus className="w-4 h-4" /> Registrar cliente
 </button>
 </div>
 )}

 {/* IDLE state text (if not in child list or form) */}
 {mode.type === 'IDLE' && (
 <div className="flex flex-col items-center justify-center flex-1 gap-3 text-foreground p-8 text-center bg-muted">
 <Baby className="w-12 h-12 text-foreground" />
 <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
 Escribe el DNI del apoderado para empezar
 </p>
 </div>
 )}

 </aside>

 {/* ═══════════════════════════════════════════
 MIDDLE PANEL — Session Start (260px)
 ═══════════════════════════════════════════ */}
 {/* Solo aparece cuando hay un niño elegido o un código recién generado: así las sesiones activas usan todo el ancho */}
 {(selectedChild || shownCode) && (
 <SessionStartPanel companionPrice={companionPrice} selectedChild={selectedChild} setSelectedChild={setSelectedChild} durationOptions={durationOptions} selectedDuration={selectedDuration} setSelectedDuration={setSelectedDuration} companions={companions} setCompanions={setCompanions} notes={notes} setNotes={setNotes} starting={starting} onStart={handleStart} lastCode={shownCode} />
 )}

 {/* ═══════════════════════════════════════════
 RIGHT PANEL — Active Sessions Grid
 ═══════════════════════════════════════════ */}
 <ActiveSessionsGrid sessions={sessions} loadingSessions={loadingSessions} onCheckout={handleCheckout} checkingOut={checkingOut} durationOptions={durationOptions} showCode={wristbandOn} onExtend={handleExtend} />
 </div>
 )}

 </div>
 {/* Al cobrar, el backend activa las sesiones pendientes: refrescar la lista sin esperar al sondeo de 60 s */}
 {wide ? <TicketPanel onSaleComplete={fetchSessions} /> : <TicketDrawer onSaleComplete={fetchSessions} />}
 </div>
 </TerminalShell>
 )
}



