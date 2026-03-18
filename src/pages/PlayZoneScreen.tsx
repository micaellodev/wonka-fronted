// ============================================================
//  PlayZoneScreen — CRM + Time Tracking (Child-Centric UI)
//  Industrial flat design · Wonka POS
// ============================================================

import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    Timer, UserPlus, Search, LogOut, RefreshCw, Clock,
    Baby, User, CheckCircle2, AlertTriangle, XCircle,
    Infinity as InfinityIcon, ChevronRight, Plus,
    Shield, Phone, FileText
} from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { usePlayzoneTicketStore } from '@/store/playzoneTicketStore'

// ── Constants ─────────────────────────────────────────────────

const RATE_PER_MIN = 0.50
const DURATION_OPTIONS = [
    { label: '1 Min', minutes: 1,   price: 2.00 },
    { label: '15 Min', minutes: 15,   price: 15.00 },
    { label: '30 Min', minutes: 30,   price: 20.00 },
    { label: '1 Hora', minutes: 60,   price: 40.00 },
    { label: '∞ Libre', minutes: null, price: null },
] as const

// ── Types ─────────────────────────────────────────────────────

type DurationOpt = typeof DURATION_OPTIONS[number]

interface Child    { id: string; fullName: string; dni: string | null; age: number | null; gender: string | null; guardianId: string; tenantId: string; createdAt: string; updatedAt: string }
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

interface SessionCheckoutTicket {
    wristbandCode: string
    childName: string
    guardianName: string
    startTime: string
    endTime: string
    elapsedMinutes: number
    includedMinutes: number | null
    extraMinutes: number
    baseAmount: number
    extraAmount: number
    totalAmount: number
    extraRatePerMinute: number
}

// UI states for the left panel
type PanelMode =
    | { type: 'IDLE' }
    | { type: 'SEARCHING' }
    | { type: 'FOUND';    guardian: Guardian }
    | { type: 'NOT_FOUND'; q: string }
    | { type: 'REGISTERING' } // manual entry button

// ── Helpers ───────────────────────────────────────────────────

function fmtTime(m: number) {
    const h = Math.floor(m / 60); const min = m % 60
    return h ? `${h}h ${String(min).padStart(2,'0')}m` : `${m}m`
}

function fmtPrice(price: number | null) {
    return price === null ? 'A convenir' : `S/ ${price.toFixed(2)}`
}

function calcElapsed(startTime: string) {
    return Math.floor((Date.now() - new Date(startTime).getTime()) / 60_000)
}

function getApiErrorMessage(err: unknown, fallback: string) {
    const e = err as any
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
    return <p className={`text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 ${className || ''}`}>{children}</p>
}

function SessionCard({
    session, onCheckout, checking, nowTick,
}: {
    session: ActiveSession
    onCheckout: (id: string) => void
    checking: boolean
    nowTick: number
}) {
    const elapsed = calcElapsed(session.startTime)
    const remaining = session.isUnlimited ? null : Math.max(0, (session.durationMinutes ?? 0) - elapsed)
    const isOverdue = !session.isUnlimited && remaining === 0
    const isWarning = !session.isUnlimited && !isOverdue && (remaining ?? 99) <= 5

    const border = isOverdue ? 'border-red-600' : isWarning ? 'border-amber-500' : 'border-green-600'
    const codeCls = isOverdue ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-green-400'
    const bannerBg = isOverdue ? 'bg-red-700' : isWarning ? 'bg-amber-600' : 'bg-green-700'
    const label = isOverdue ? '¡TIEMPO!' : isWarning ? '< 5 MIN' : 'EN JUEGO'

    // use nowTick to force re-render
    void nowTick

    const opt = DURATION_OPTIONS.find(o => o.minutes === session.durationMinutes)
    const price = opt ? opt.price : session.durationMinutes !== null ? session.durationMinutes * RATE_PER_MIN : null

    return (
        <div className={`flex flex-col bg-slate-800 border-2 ${border} rounded-md overflow-hidden relative group`}>
            <div className={`${bannerBg} px-3 py-1 flex items-center justify-between`}>
                <span className="text-[10px] font-black text-white uppercase tracking-widest">{label}</span>
                <span className="text-[10px] font-mono text-white/60">
                    {new Date(session.startTime).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'})}
                </span>
            </div>

            <div className="p-3 flex flex-col gap-2.5">
                {/* Code + price */}
                <div className="flex items-start justify-between">
                    <span className={`text-5xl font-black font-mono tracking-widest ${codeCls}`}>
                        {session.wristbandCode}
                    </span>
                    <div className="flex flex-col items-end gap-1 mt-1">
                        {isOverdue ? <XCircle className="w-6 h-6 text-red-500" />
                            : isWarning ? <AlertTriangle className="w-6 h-6 text-amber-400" />
                            : <CheckCircle2 className="w-6 h-6 text-green-500" />}
                        <span className="text-[10px] font-black font-mono text-slate-400 border border-slate-700 bg-slate-900 px-1.5 py-0.5 rounded-sm">
                            {fmtPrice(price)}
                        </span>
                    </div>
                </div>

                {/* Names */}
                <div className="border-t border-slate-700 pt-2 flex flex-col gap-1">
                    <div className="flex items-center gap-1.5">
                        <Baby className="w-3.5 h-3.5 text-brand-400 shrink-0" />
                        <span className="text-sm font-bold text-white truncate">{session.childName}</span>
                        {session.childAge && <span className="text-[10px] text-slate-500 font-mono">({session.childAge}a, {session.childGender})</span>}
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="text-xs text-slate-400 truncate">{session.guardianName} ({session.guardianDni})</span>
                    </div>
                </div>

                {/* Timer bar */}
                <div className="flex items-center justify-between bg-slate-900 border border-slate-700 rounded-sm px-2.5 py-1.5">
                    <div className="flex flex-col">
                        <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Elapsed</span>
                        <span className="text-xs font-mono font-bold text-slate-300">{fmtTime(elapsed)}</span>
                    </div>
                    <span className="text-slate-700">|</span>
                    <div className="flex flex-col items-end">
                        <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Restante</span>
                        {session.isUnlimited
                            ? <InfinityIcon className="w-4 h-4 text-brand-400" />
                            : <span className={`text-xs font-mono font-bold ${isOverdue ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-green-400'}`}>
                                {fmtTime(remaining ?? 0)}
                            </span>
                        }
                    </div>
                </div>

                <button
                    onClick={() => onCheckout(session.id)}
                    disabled={checking}
                    className="flex items-center justify-center gap-1.5 w-full py-2 bg-slate-700 border border-slate-600 hover:bg-red-700 hover:border-red-600 text-slate-300 hover:text-white font-bold text-[11px] uppercase tracking-widest rounded-sm transition-none disabled:opacity-40"
                >
                    <LogOut className="w-3.5 h-3.5" /> Finalizar
                </button>
            </div>
        </div>
    )
}

// ── Main Screen ───────────────────────────────────────────────

export function PlayZoneScreen() {
    const { tenantId } = useAuthStore()
    const navigate = useNavigate()
    const { upsertExtraCharge } = usePlayzoneTicketStore()

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
    const [selectedDuration, setSelectedDuration] = useState<DurationOpt>(DURATION_OPTIONS[1])
    const [starting, setStarting] = useState(false)
    const [lastCode, setLastCode] = useState<{ code: string; price: number | null; childName: string } | null>(null)

    // ── active sessions ──
    const [sessions, setSessions] = useState<ActiveSession[]>([])
    const [loadingSessions, setLoadingSessions] = useState(true)
    const [checkingOut, setCheckingOut] = useState<string | null>(null)
    const [nowTick, setNowTick] = useState(0)

    // ── search by wristband code ──
    const [codeSearch, setCodeSearch] = useState('')
    const [codeResult, setCodeResult] = useState<ActiveSession | 'not_found' | null>(null)
    const [codeSearching, setCodeSearching] = useState(false)

    // ── timer tick ────────────────────────────────────────────
    useEffect(() => {
        const id = setInterval(() => setNowTick(n => n + 1), 60_000)
        return () => clearInterval(id)
    }, [])

    // ── fetch sessions ────────────────────────────────────────
    const fetchSessions = useCallback(async () => {
        try {
            const res = await (api.playzone.sessions as any).get({ query: { tenantId } })
            if (!res.error) setSessions((res.data as { data: ActiveSession[] }).data ?? [])
        } finally { setLoadingSessions(false) }
    }, [tenantId])

    useEffect(() => { fetchSessions() }, [fetchSessions])
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
            const res = await (api.playzone.guardians.lookup as any).get({ query: { tenantId, q } })
            if (!res.error && (res.data as any).found) {
                setMode({ type: 'FOUND', guardian: (res.data as any).data })
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
            alert('El DNI del apoderado debe tener entre 7 y 15 dígitos.')
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

            const res = await (api.playzone.guardians as any).post(body)
            if (!res.error) {
                const guardian: Guardian = (res.data as any).data
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

            const res = await (api.playzone.guardians as any)({ id: guardianId }).children.post(body)
            if (!res.error) {
                const child: Child = (res.data as any).data
                if (mode.type === 'FOUND') {
                    const updated: Guardian = { ...mode.guardian, children: [...mode.guardian.children, child] }
                    setMode({ type: 'FOUND', guardian: updated })
                }
                setNewChildName(''); setNewChildAge(''); setNewChildDni(''); setNewChildGender(''); setShowAddChild(false)
            } else {
                alert((res.error.value as any)?.message ?? 'Error al agregar niño.')
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
            const res = await (api.playzone.sessions as any).post(body)
            if (!res.error) {
                const session = (res.data as any).data
                setLastCode({ code: session.wristbandCode, price: selectedDuration.price, childName: selectedChild.fullName })
                setSelectedChild(null)
                setSelectedDuration(DURATION_OPTIONS[1])
                fetchSessions()
            } else {
                alert((res.error.value as any)?.message ?? 'Error al iniciar sesión.')
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
            const res = await (api.playzone.sessions as any)({ id: sessionId }).complete.patch(
                undefined,
                { query: { tenantId } }
            )
            if (!res.error) {
                const ticket = (res.data as any)?.data?.ticket as SessionCheckoutTicket | undefined
                setSessions(prev => prev.filter(s => s.id !== sessionId))
                if (typeof codeResult === 'object' && codeResult !== null && (codeResult as ActiveSession).id === sessionId) {
                    setCodeResult(null); setCodeSearch('')
                }
                if (ticket) {
                    upsertExtraCharge({
                        sessionId,
                        code: ticket.wristbandCode,
                        childName: ticket.childName,
                        extraMinutes: ticket.extraMinutes,
                        extraRate: ticket.extraRatePerMinute,
                        amount: ticket.extraAmount,
                    })
                }
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
            const res = await (api.playzone.sessions.lookup as any).get({ query: { tenantId, code } })
            if (!res.error) setCodeResult((res.data as any).data)
            else setCodeResult('not_found')
        } catch { setCodeResult('not_found') }
        finally { setCodeSearching(false) }
    }

    // ── render ────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-screen bg-slate-900 overflow-hidden rounded-sm">

            {/* HEADER */}
            <header className="flex items-center justify-between px-5 py-3 bg-slate-900 border-b border-slate-700 flex-shrink-0">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 flex items-center justify-center bg-slate-800 border-2 border-slate-600 rounded-md">
                            <Baby className="w-6 h-6 text-brand-400" />
                        </div>
                        <div>
                            <h1 className="text-lg font-black text-white uppercase tracking-wider leading-none">JUEGOS INFANTILES</h1>
                            <p className="text-[11px] text-slate-500 font-mono uppercase tracking-widest mt-0.5">
                                {sessions.length} activo{sessions.length !== 1 ? 's' : ''}
                            </p>
                        </div>
                    </div>
                </div>
                <button onClick={fetchSessions} disabled={loadingSessions}
                    className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 border border-slate-700 text-slate-400 hover:text-white font-bold text-xs uppercase tracking-widest rounded-sm disabled:opacity-50 transition-none">
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingSessions ? 'animate-spin' : ''}`} /> SYNC
                </button>
            </header>

            <div className="flex flex-1 overflow-hidden">

                {/* ═══════════════════════════════════════════
                    LEFT PANEL — CRM (320px) — CHILD FIRST
                ═══════════════════════════════════════════ */}
                <aside className="flex flex-col w-[320px] flex-shrink-0 border-r border-slate-700 overflow-y-auto bg-slate-900">

                    <div className="flex gap-2 p-3 bg-slate-800 border-b border-slate-700">
                        <button onClick={openRegistering}
                            className="flex-1 flex items-center justify-center gap-2 py-3 bg-brand-600 hover:bg-brand-500 text-white font-black text-xs uppercase tracking-widest rounded-sm transition-none">
                            <Plus className="w-4 h-4" /> Nuevo Niño
                        </button>
                    </div>

                    <div className="p-4 border-b border-slate-700">
                        <SectionLabel>Ya es cliente? (DNI padre)</SectionLabel>
                        <div className="flex gap-2">
                            <input
                                type="text" inputMode="numeric" maxLength={15}
                                value={searchQ}
                                onChange={e => setSearchQ(e.target.value.replace(/\D/g, ''))}
                                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                                placeholder="DNI apoderado"
                                className="flex-1 bg-slate-800 border-2 border-slate-700 focus:border-brand-500 rounded-sm px-3 py-2.5 text-sm font-bold text-white font-mono placeholder:text-slate-600 focus:outline-none transition-colors"
                            />
                            <button onClick={handleSearch} disabled={searching || !searchQ}
                                className="px-3 py-2.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white font-bold text-xs uppercase tracking-widest rounded-sm transition-none">
                                {searching ? '...' : <Search className="w-4 h-4" />}
                            </button>
                        </div>
                        {searchError && <p className="mt-2 text-[10px] text-red-400 font-bold uppercase">{searchError}</p>}
                    </div>

                    {/* ── FOUND state: children + guardian info ── */}
                    {mode.type === 'FOUND' && (
                        <div className="flex flex-col p-4 gap-3">
                            <div className="flex items-center justify-between mb-1">
                                <SectionLabel className="mb-0">Elige un niño</SectionLabel>
                                <button onClick={() => { setMode({ type: 'IDLE' }); setSearchQ(''); setSelectedChild(null) }}
                                    className="text-slate-500 hover:text-white transition-none border border-slate-700 px-2 py-1 bg-slate-800 text-[10px] font-bold uppercase rounded-sm">
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
                                            className={`flex items-center justify-between px-3 py-2.5 rounded-sm border-2 text-left transition-none ${
                                                isSel ? 'bg-brand-600 border-brand-500 text-white'
                                                : isActive ? 'bg-slate-800 border-slate-700 text-slate-600 cursor-not-allowed'
                                                : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white'
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
                                                ? <span className="text-[9px] font-black text-green-400 border border-green-600 bg-green-600/10 px-1.5 py-0.5 rounded-sm uppercase tracking-widest">Activo</span>
                                                : isSel ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                                                : <ChevronRight className="w-4 h-4 shrink-0 opacity-50" />}
                                        </button>
                                    )
                                })}
                            </div>

                            {/* Add child inline */}
                            {!showAddChild ? (
                                <button onClick={() => setShowAddChild(true)}
                                    className="flex items-center justify-center gap-2 w-full py-2.5 mt-1 bg-slate-800 border border-dashed border-slate-600 hover:border-slate-500 text-slate-400 hover:text-white font-bold text-xs uppercase tracking-widest rounded-sm transition-none">
                                    <Plus className="w-3.5 h-3.5" /> Otro niño ({mode.guardian.fullName.split(' ')[0]})
                                </button>
                            ) : (
                                <div className="flex flex-col gap-2 p-3 bg-slate-800 border-2 border-slate-600 rounded-sm mt-1">
                                    <SectionLabel>Nuevo Niño</SectionLabel>
                                    <input type="text" value={newChildName} onChange={e => setNewChildName(e.target.value)}
                                        placeholder="Nombre del niño *"
                                        className="bg-slate-900 border border-slate-700 focus:border-brand-500 rounded-sm px-2.5 py-2 text-sm font-bold text-white placeholder:text-slate-600 focus:outline-none" />
                                    <div className="grid grid-cols-2 gap-2">
                                        <input type="number" value={newChildAge} onChange={e => setNewChildAge(e.target.value)}
                                            placeholder="Edad" min={1} max={17}
                                            className="bg-slate-900 border border-slate-700 focus:border-brand-500 rounded-sm px-2.5 py-2 text-sm font-bold text-white placeholder:text-slate-600 focus:outline-none" />
                                        <select value={newChildGender} onChange={e => setNewChildGender(e.target.value as any)}
                                            className="bg-slate-900 border border-slate-700 focus:border-brand-500 rounded-sm px-2.5 py-2 text-sm font-bold text-white focus:outline-none appearance-none">
                                            <option value="">Sexo</option>
                                            <option value="M">Masculino</option>
                                            <option value="F">Femenino</option>
                                        </select>
                                    </div>
                                    <input type="text" value={newChildDni} onChange={e => setNewChildDni(e.target.value.replace(/\D/g,''))}
                                        placeholder="DNI Niño (opcional)" maxLength={8}
                                        className="bg-slate-900 border border-slate-700 focus:border-brand-500 rounded-sm px-2.5 py-2 text-sm font-bold text-white font-mono placeholder:text-slate-600 focus:outline-none" />
                                    
                                    <div className="flex gap-2 mt-1">
                                        <button onClick={() => { setShowAddChild(false); setNewChildName(''); setNewChildAge(''); setNewChildDni(''); setNewChildGender('') }}
                                            className="flex-1 py-2 bg-slate-700 border border-slate-600 text-slate-300 font-bold text-xs uppercase tracking-widest rounded-sm hover:bg-slate-600 transition-none">
                                            Cancelar
                                        </button>
                                        <button onClick={() => handleAddChild(mode.guardian.id)}
                                            disabled={!newChildName || addingChild}
                                            className="flex-1 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white font-bold text-xs uppercase tracking-widest rounded-sm transition-none">
                                            {addingChild ? '...' : 'Guardar'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Guardian info */}
                            <div className="mt-4 pt-4 border-t border-slate-700 text-slate-500 flex flex-col gap-1">
                                <SectionLabel>Apoderado</SectionLabel>
                                <div className="flex items-center gap-2">
                                    <Shield className="w-3.5 h-3.5" />
                                    <span className="text-xs text-slate-300 font-bold">{mode.guardian.fullName}</span>
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
                        <div className="flex flex-col p-4 gap-4 bg-slate-800/50">
                            <div className="flex items-center justify-between">
                                <p className="text-[11px] font-black text-brand-400 uppercase tracking-widest">
                                    {mode.type === 'NOT_FOUND' ? 'No existe — crear perfil' : 'Registrar Nuevo Perfil'}
                                </p>
                                <button onClick={() => { setMode({ type: 'IDLE' }); setSearchQ('') }}
                                    className="text-slate-500 hover:text-white transition-none">
                                    <XCircle className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="flex flex-col gap-3">
                                {/* CHILD INFO */}
                                <div className="p-3 bg-slate-800 border-2 border-brand-800 rounded-sm">
                                    <div className="flex items-center gap-1.5 mb-3">
                                        <Baby className="w-4 h-4 text-brand-400" />
                                        <SectionLabel className="mb-0 text-brand-400">Datos del Niño</SectionLabel>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <input type="text" value={childName} onChange={e => setChildName(e.target.value)}
                                            placeholder="Nombre completo *"
                                            className="w-full bg-slate-900 border border-slate-700 focus:border-brand-500 rounded-sm px-3 py-2 text-sm font-bold text-white placeholder:text-slate-600 focus:outline-none transition-colors" />
                                        
                                        <div className="grid grid-cols-2 gap-2">
                                            <input type="number" value={childAge} onChange={e => setChildAge(e.target.value)}
                                                placeholder="Edad" min={1} max={17}
                                                className="w-full bg-slate-900 border border-slate-700 focus:border-brand-500 rounded-sm px-3 py-2 text-sm font-bold text-white placeholder:text-slate-600 focus:outline-none transition-colors" />
                                            <select value={childGender} onChange={e => setChildGender(e.target.value as any)}
                                                className="w-full bg-slate-900 border border-slate-700 focus:border-brand-500 rounded-sm px-3 py-2 text-sm font-bold text-slate-300 focus:outline-none transition-colors appearance-none">
                                                <option value="">Sexo</option>
                                                <option value="M">Masculino</option>
                                                <option value="F">Femenino</option>
                                            </select>
                                        </div>

                                        <input type="text" value={childDni} onChange={e => setChildDni(e.target.value.replace(/\D/g, ''))}
                                            placeholder="DNI Niño (opcional)" maxLength={8}
                                            className="w-full bg-slate-900 border border-slate-700 focus:border-brand-500 rounded-sm px-3 py-2 text-sm font-bold text-white font-mono placeholder:text-slate-600 focus:outline-none transition-colors" />
                                    </div>
                                </div>

                                {/* GUARDIAN INFO */}
                                <div className="p-3 bg-slate-800 border-2 border-slate-700 rounded-sm">
                                    <div className="flex items-center gap-1.5 mb-3">
                                        <User className="w-4 h-4 text-slate-400" />
                                        <SectionLabel className="mb-0 text-slate-400">Datos del Apoderado</SectionLabel>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <input type="text" value={guardianName} onChange={e => setGuardianName(e.target.value)}
                                            placeholder="Nombre completo *"
                                            className="w-full bg-slate-900 border border-slate-700 focus:border-brand-500 rounded-sm px-3 py-2 text-sm font-bold text-white placeholder:text-slate-600 focus:outline-none transition-colors" />
                                        
                                        <input type="text" inputMode="numeric" value={guardianDni} onChange={e => setGuardianDni(e.target.value.replace(/\D/g,''))}
                                            placeholder="DNI Apoderado *" maxLength={15}
                                            className="w-full bg-slate-900 border border-slate-700 focus:border-brand-500 rounded-sm px-3 py-2 text-sm font-bold text-white font-mono placeholder:text-slate-600 focus:outline-none transition-colors" />
                                            
                                        <input type="text" inputMode="numeric" value={guardianPhone} onChange={e => setGuardianPhone(e.target.value.replace(/\D/g,''))}
                                            placeholder="Teléfono (opcional)" maxLength={15}
                                            className="w-full bg-slate-900 border border-slate-700 focus:border-brand-500 rounded-sm px-3 py-2 text-sm font-bold text-white font-mono placeholder:text-slate-600 focus:outline-none transition-colors" />
                                    </div>
                                </div>

                                <button onClick={handleRegister}
                                    disabled={!guardianDni || !guardianName || !childName || registering}
                                    className="flex items-center justify-center gap-2 w-full py-4 mt-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-xs uppercase tracking-widest rounded-sm transition-none">
                                    <UserPlus className="w-5 h-5" />
                                    {registering ? 'Guardando...' : 'Guardar y Seleccionar'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* IDLE state text (if not in child list or form) */}
                    {mode.type === 'IDLE' && (
                        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-slate-700 p-8 text-center bg-slate-900/50">
                            <Baby className="w-12 h-12 text-slate-800" />
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-600">
                                Busca un apoderado o registra un nuevo niño
                            </p>
                        </div>
                    )}

                    {/* Wristband search (bottom of side panel) */}
                    <div className="mt-auto p-4 border-t border-slate-800 bg-slate-900">
                        <SectionLabel>Código de Pulsera (Búsqueda local)</SectionLabel>
                        <div className="flex gap-2">
                            <input type="text" inputMode="numeric" maxLength={3}
                                value={codeSearch}
                                onChange={e => setCodeSearch(e.target.value.replace(/\D/g,'').slice(0,3))}
                                onKeyDown={e => e.key === 'Enter' && handleCodeSearch()}
                                placeholder="···"
                                className="flex-1 bg-slate-800 border-2 border-slate-700 focus:border-slate-500 rounded-sm px-3 py-2 text-xl font-black text-white font-mono text-center tracking-[0.6rem] placeholder:text-slate-700 focus:outline-none" />
                            <button onClick={handleCodeSearch} disabled={!codeSearch || codeSearching}
                                className="px-3 bg-slate-700 border border-slate-600 hover:bg-slate-600 text-white font-bold text-xs uppercase tracking-widest rounded-sm disabled:opacity-40 transition-none">
                                {codeSearching ? '...' : <Search className="w-4 h-4"/>}
                            </button>
                        </div>
                        {codeResult && codeResult !== 'not_found' && (
                            <div className="mt-3">
                                <SessionCard session={codeResult as ActiveSession} onCheckout={handleCheckout}
                                    checking={checkingOut === (codeResult as ActiveSession).id} nowTick={nowTick} />
                            </div>
                        )}
                        {codeResult === 'not_found' && codeSearch.length === 3 && (
                            <p className="mt-2 text-xs font-bold text-red-400 text-center border border-red-700 bg-red-700/10 rounded-sm py-1.5 uppercase tracking-widest">
                                Código incorrecto o inactivo
                            </p>
                        )}
                    </div>
                </aside>

                {/* ═══════════════════════════════════════════
                    MIDDLE PANEL — Session Start (260px)
                ═══════════════════════════════════════════ */}
                <section className="flex flex-col w-[260px] flex-shrink-0 border-r border-slate-700 bg-slate-900/60 overflow-y-auto shadow-xl z-10 relative">
                    <div className="p-4 border-b border-slate-700">
                        <div className="flex items-center gap-2 text-slate-300">
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
                                <SectionLabel className="text-brand-400">Niño Seleccionado</SectionLabel>
                                <div className="flex items-start justify-between">
                                    <div>
                                        <p className="text-sm font-black text-white">{selectedChild.fullName}</p>
                                        <p className="text-[10px] text-brand-300 font-mono mt-0.5">
                                            {selectedChild.age && `${selectedChild.age}A `}{selectedChild.gender} {selectedChild.dni && `· DNI: ${selectedChild.dni}`}
                                        </p>
                                    </div>
                                    <button onClick={() => setSelectedChild(null)} className="text-slate-500 hover:text-white transition-none p-1">
                                        <XCircle className="w-4 h-4"/>
                                    </button>
                                </div>
                            </div>

                            {/* Duration picker */}
                            <div className="px-4">
                                <SectionLabel>Tarifas / Tiempos</SectionLabel>
                                <div className="grid grid-cols-2 gap-2">
                                    {DURATION_OPTIONS.map(opt => {
                                        const isSel = selectedDuration.label === opt.label
                                        return (
                                            <button key={opt.label} onClick={() => setSelectedDuration(opt)}
                                                className={`flex flex-col items-center justify-center py-3 rounded-sm border-2 transition-none ${
                                                    isSel ? 'bg-brand-600 border-brand-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white'
                                                }`}>
                                                <div className="flex items-center gap-1 text-[11px] font-black uppercase tracking-widest">
                                                    {opt.minutes === null ? <InfinityIcon className="w-4 h-4" /> : <Clock className="w-3 h-3" />}
                                                    {opt.label}
                                                </div>
                                                <span className={`text-[11px] font-black font-mono mt-1 ${isSel ? 'text-white/80' : 'text-brand-400'}`}>
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
                                    className="flex items-center justify-center gap-2 w-full py-4 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white font-black text-sm uppercase tracking-widest rounded-sm transition-none relative overflow-hidden group">
                                    <span className="absolute inset-0 w-full h-full bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform"></span>
                                    <Timer className="w-5 h-5 relative z-10" />
                                    <span className="relative z-10">
                                        {starting ? 'Iniciando...' : 'INICIAR JUEGO'}
                                    </span>
                                </button>
                            </div>

                            {/* Last generated code alert */}
                            {lastCode && (
                                <div className="mt-auto p-4 pt-6 border-t border-slate-700 bg-slate-800">
                                    <p className="text-[10px] text-green-400 font-black uppercase tracking-widest text-center mb-2">
                                        Código Generado: Escribir en pulsera
                                    </p>
                                    <div className="bg-slate-900 border-2 border-green-600 rounded-sm p-4 text-center shadow-inner">
                                        <span className="text-6xl font-black font-mono text-green-400 tracking-widest">
                                            {lastCode.code}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between mt-3 text-slate-300">
                                        <span className="text-[10px] font-bold uppercase tracking-widest truncate max-w-[120px]">{lastCode.childName}</span>
                                        <span className="text-sm font-black font-mono text-green-400">{fmtPrice(lastCode.price)}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </section>

                {/* ═══════════════════════════════════════════
                    RIGHT PANEL — Active Sessions Grid
                ═══════════════════════════════════════════ */}
                <main className="flex-1 overflow-y-auto p-4 bg-slate-900">
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                        <p className="text-xs font-bold font-mono text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <Baby className="w-4 h-4"/> 
                            {sessions.length} Niños Jugando
                        </p>
                        <div className="flex items-center gap-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-slate-800 px-3 py-1.5 rounded-sm">
                            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" /> Todo OK</span>
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
                                    checking={checkingOut === s.id} nowTick={nowTick} />
                            ))}
                        </div>
                    )}
                </main>
            </div>

        </div>
    )
}
