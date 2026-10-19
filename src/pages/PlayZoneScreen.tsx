// PlayZoneScreen — CRM + Time Tracking (Child-Centric UI)
import { useEffect, useState, useCallback } from 'react'
import {
 UserPlus, Search, RefreshCw,
 Baby, User, CheckCircle2, XCircle,
 ChevronRight, Plus,
 Shield, Phone, FileText, PartyPopper
} from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { usePlayzoneTicketStore, type PlayzoneCharge } from '@/store/playzoneTicketStore'
import { TerminalShell } from '@/components/TerminalShell'
import { apiErrorMessage as getApiErrorMessage } from '@/lib/api-error'
import { toast } from '@/components/ui/toast'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { formatPEN } from '@/lib/format'
import {
 type Loose, type PlayzoneRates, type DurationOpt, FREE_OPTION, type Child, type Guardian, type ActiveSession, type PanelMode,
 SectionLabel
} from './playzone/shared'
import { BirthdaysView } from './playzone/BirthdaysView'
import { SessionStartPanel } from './playzone/SessionStartPanel'
import { ActiveSessionsGrid } from './playzone/ActiveSessionsGrid'
import { WristbandSearch } from './playzone/WristbandSearch'

// ── Main Screen ───────────────────────────────────────────────

export function PlayZoneScreen() {
 const { tenantId } = useAuthStore()
 const { addCharge } = usePlayzoneTicketStore()
 const [durationOptions, setDurationOptions] = useState<DurationOpt[]>([FREE_OPTION])
 const [notice, setNotice] = useState<string | null>(null)
 const [crmOpen, setCrmOpen] = useState(true)
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
 toast.error('No hay tenant activo. Vuelve a iniciar sesión.')
 return
 }

 const dni = guardianDni.trim()
 const gName = guardianName.trim()
 const cName = childName.trim()

 if (!dni || !gName || !cName) return
 if (dni.length < 7 || dni.length > 15) {
 toast.error('El DNI del apoderado debe tener entre 7 y 15 digitos.')
 return
 }
 if (childAge) {
 const ageNum = Number(childAge)
 if (!Number.isInteger(ageNum) || ageNum < 1 || ageNum > 17) {
 toast.error('La edad del niño debe estar entre 1 y 17.')
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
 toast.error(getApiErrorMessage(res.error, 'Error al registrar.'))
 }
 } catch (err) { toast.error(getApiErrorMessage(err, 'Error de conexión.')) }
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
 const res = await (api.playzone.sessions as Loose).post(body)
 if (!res.error) {
 const session = (res.data as Loose).data
 setLastCode({ code: session.wristbandCode, price: selectedDuration.price, childName: selectedChild.fullName })
 queueCharge(session.charge)
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

 // ── render ────────────────────────────────────────────────
 return (
 <TerminalShell activeSection="playzone">
 <div className="flex h-full flex-col overflow-hidden rounded-sm bg-transparent">

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
 <RefreshCw className={`w-3.5 h-3.5 ${loadingSessions ? 'animate-spin' : ''}`} /> SYNC
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

 <div className="flex gap-2 p-3 bg-muted border-b border-border">
 <button onClick={openRegistering}
 className="flex-1 flex items-center justify-center gap-2 py-3 bg-brand-600 hover:bg-brand-600 text-primary-foreground font-black text-xs uppercase tracking-widest rounded-sm transition-none">
 <Plus className="w-4 h-4" /> Nuevo niño
 </button>
 </div>

 <div className="p-4 border-b border-border">
 <SectionLabel>Ya es cliente? (DNI padre)</SectionLabel>
 <div className="flex gap-2">
 <Input
 type="text" inputMode="numeric" maxLength={15}
 value={searchQ}
 onChange={e => setSearchQ(e.target.value.replace(/\D/g, ''))}
 onKeyDown={e => e.key === 'Enter' && handleSearch()}
 placeholder="DNI apoderado"
 className="flex-1 bg-muted border-2 border-border focus:border-brand-500 rounded-sm px-3 py-2.5 text-sm font-bold text-foreground font-mono placeholder:text-muted-foreground focus:outline-none transition-colors"
 />
 <button onClick={handleSearch} disabled={searching || !searchQ}
 className="px-3 py-2.5 bg-muted hover:bg-border disabled:opacity-40 text-foreground font-bold text-xs uppercase tracking-widest rounded-sm transition-none">
 {searching ? '...' : <Search className="w-4 h-4" />}
 </button>
 </div>
 {searchError && <p className="mt-2 text-[11px] text-brand-500 font-bold uppercase">{searchError}</p>}
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
 <Select value={newChildGender} onChange={e => setNewChildGender(e.target.value as Loose)}
 className="bg-background border border-border focus:border-brand-500 rounded-sm px-2.5 py-2 text-sm font-bold text-foreground focus:outline-none appearance-none">
 <option value="">Sexo</option>
 <option value="M">Masculino</option>
 <option value="F">Femenino</option>
 </Select>
 </div>
 <Input type="text" value={newChildDni} onChange={e => setNewChildDni(e.target.value.replace(/\D/g, ''))}
 placeholder="DNI Niño (opcional)" maxLength={8}
 className="bg-background border border-border focus:border-brand-500 rounded-sm px-2.5 py-2 text-sm font-bold text-foreground font-mono placeholder:text-muted-foreground focus:outline-none" />

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

 {/* ── NOT_FOUND or MANUAL REGISTER: child-first form ── */}
 {(mode.type === 'NOT_FOUND' || mode.type === 'REGISTERING') && (
 <div className="flex flex-col p-4 gap-4 bg-muted">
 <div className="flex items-center justify-between">
 <p className="text-[11px] font-black text-brand-500 uppercase tracking-widest">
 {mode.type === 'NOT_FOUND' ? 'No existe — crear perfil' : 'Registrar Nuevo Perfil'}
 </p>
 <button onClick={() => { setMode({ type: 'IDLE' }); setSearchQ('') }}
 className="text-muted-foreground hover:text-foreground transition-none">
 <XCircle className="w-5 h-5" />
 </button>
 </div>

 <div className="flex flex-col gap-3">
 {/* CHILD INFO */}
 <div className="p-3 bg-muted border-2 border-brand-800 rounded-sm">
 <div className="flex items-center gap-1.5 mb-3">
 <Baby className="w-4 h-4 text-brand-500" />
 <SectionLabel className="mb-0 text-brand-500">Datos del Niño</SectionLabel>
 </div>
 <div className="flex flex-col gap-2">
 <Input type="text" value={childName} onChange={e => setChildName(e.target.value)}
 placeholder="Nombre completo *"
 className="w-full bg-background border border-border focus:border-brand-500 rounded-sm px-3 py-2 text-sm font-bold text-foreground placeholder:text-muted-foreground focus:outline-none transition-colors" />

 <div className="grid grid-cols-2 gap-2">
 <Input type="number" value={childAge} onChange={e => setChildAge(e.target.value)}
 placeholder="Edad" min={1} max={17}
 className="w-full bg-background border border-border focus:border-brand-500 rounded-sm px-3 py-2 text-sm font-bold text-foreground placeholder:text-muted-foreground focus:outline-none transition-colors" />
 <Select value={childGender} onChange={e => setChildGender(e.target.value as Loose)}
 className="w-full bg-background border border-border focus:border-brand-500 rounded-sm px-3 py-2 text-sm font-bold text-muted-foreground focus:outline-none transition-colors appearance-none">
 <option value="">Sexo</option>
 <option value="M">Masculino</option>
 <option value="F">Femenino</option>
 </Select>
 </div>

 <Input type="text" value={childDni} onChange={e => setChildDni(e.target.value.replace(/\D/g, ''))}
 placeholder="DNI Niño (opcional)" maxLength={8}
 className="w-full bg-background border border-border focus:border-brand-500 rounded-sm px-3 py-2 text-sm font-bold text-foreground font-mono placeholder:text-muted-foreground focus:outline-none transition-colors" />
 </div>
 </div>

 {/* GUARDIAN INFO */}
 <div className="p-3 bg-muted border-2 border-border rounded-sm">
 <div className="flex items-center gap-1.5 mb-3">
 <User className="w-4 h-4 text-muted-foreground" />
 <SectionLabel className="mb-0 text-muted-foreground">Datos del Apoderado</SectionLabel>
 </div>
 <div className="flex flex-col gap-2">
 <Input type="text" value={guardianName} onChange={e => setGuardianName(e.target.value)}
 placeholder="Nombre completo *"
 className="w-full bg-background border border-border focus:border-brand-500 rounded-sm px-3 py-2 text-sm font-bold text-foreground placeholder:text-muted-foreground focus:outline-none transition-colors" />

 <Input type="text" inputMode="numeric" value={guardianDni} onChange={e => setGuardianDni(e.target.value.replace(/\D/g, ''))}
 placeholder="DNI Apoderado *" maxLength={15}
 className="w-full bg-background border border-border focus:border-brand-500 rounded-sm px-3 py-2 text-sm font-bold text-foreground font-mono placeholder:text-muted-foreground focus:outline-none transition-colors" />

 <Input type="text" inputMode="numeric" value={guardianPhone} onChange={e => setGuardianPhone(e.target.value.replace(/\D/g, ''))}
 placeholder="Teléfono (opcional)" maxLength={15}
 className="w-full bg-background border border-border focus:border-brand-500 rounded-sm px-3 py-2 text-sm font-bold text-foreground font-mono placeholder:text-muted-foreground focus:outline-none transition-colors" />
 </div>
 </div>

 <button onClick={handleRegister}
 disabled={!guardianDni || !guardianName || !childName || registering}
 className="flex items-center justify-center gap-2 w-full py-4 mt-2 bg-brand-600 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-primary-foreground font-black text-xs uppercase tracking-widest rounded-sm transition-none">
 <UserPlus className="w-5 h-5" />
 {registering ? 'Guardando...' : 'Guardar y Seleccionar'}
 </button>
 </div>
 </div>
 )}

 {/* IDLE state text (if not in child list or form) */}
 {mode.type === 'IDLE' && (
 <div className="flex flex-col items-center justify-center flex-1 gap-3 text-foreground p-8 text-center bg-muted">
 <Baby className="w-12 h-12 text-foreground" />
 <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
 Busca un apoderado o registra un nuevo niño
 </p>
 </div>
 )}

 {/* Wristband search (bottom of side panel) */}
 <WristbandSearch codeSearch={codeSearch} setCodeSearch={setCodeSearch} codeResult={codeResult} codeSearching={codeSearching} onSearch={handleCodeSearch} onCheckout={handleCheckout} checkingOut={checkingOut} nowTick={nowTick} durationOptions={durationOptions} />
 </aside>

 {/* ═══════════════════════════════════════════
 MIDDLE PANEL — Session Start (260px)
 ═══════════════════════════════════════════ */}
 <SessionStartPanel selectedChild={selectedChild} setSelectedChild={setSelectedChild} durationOptions={durationOptions} selectedDuration={selectedDuration} setSelectedDuration={setSelectedDuration} starting={starting} onStart={handleStart} lastCode={lastCode} />

 {/* ═══════════════════════════════════════════
 RIGHT PANEL — Active Sessions Grid
 ═══════════════════════════════════════════ */}
 <ActiveSessionsGrid sessions={sessions} loadingSessions={loadingSessions} onCheckout={handleCheckout} checkingOut={checkingOut} nowTick={nowTick} durationOptions={durationOptions} />
 </div>
 )}

 </div>
 </TerminalShell>
 )
}



