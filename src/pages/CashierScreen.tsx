import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { useCashDrawerStore } from '@/store/cashDrawerStore'
import { usePaymentLedgerStore } from '@/store/paymentLedgerStore'
import { useAdminStore } from '@/store/adminStore'
import { Banknote, Calculator, CheckCircle2, AlertTriangle, Users, Activity, History, ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface PlayzoneSummary {
    periodDays: number
    completedSessions: number
    activeSessions: number
    uniqueChildren: number
    totalPlayedMinutes: number
    averageMinutesPerSession: number
    averageMinutesPerChild: number
    totalOvertimeMinutes: number
}

export function CashierScreen() {
    const { tenantId, activeWorker, logout } = useAuthStore()
    const { logoutAdmin } = useAdminStore()
    const { openingBalance, setCarryOverBalance, setRequireManualOpening, clearOpening } = useCashDrawerStore()
    const { entries: paymentEntries, clearTodayEntries } = usePaymentLedgerStore()
    const navigate = useNavigate()

    const [loading, setLoading] = useState(true)
    const [countedCash, setCountedCash] = useState<string>('')
    const [submitted, setSubmitted] = useState(false)
    const [playzoneSummary, setPlayzoneSummary] = useState<PlayzoneSummary | null>(null)
    const [closingLoading, setClosingLoading] = useState(false)
    const [closeSubmitted, setCloseSubmitted] = useState(false)
    const [showHistory, setShowHistory] = useState(false)

    // Check if cash drawer is properly opened
    useEffect(() => {
        if (!openingBalance && openingBalance !== 0) {
            navigate('/')
        }
    }, [openingBalance, navigate])

    const fetchSales = useCallback(async () => {
        setLoading(true)
        try {
            const playzoneRes = await (api.playzone.reports as any).summary.get({ query: { tenantId, days: 1 } })
            if (!playzoneRes.error) {
                const response = playzoneRes.data as { data: PlayzoneSummary }
                setPlayzoneSummary(response.data)
            }
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }, [tenantId])

    useEffect(() => {
        fetchSales()
    }, [fetchSales])

    const todayPayments = useMemo(() => {
        const today = new Date().toDateString()
        const entriesToday = paymentEntries.filter(
            (e) => e.tenantId === tenantId && new Date(e.createdAt).toDateString() === today
        )

        const totalByMethod = {
            efectivo: 0,
            yape: 0,
            tarjeta: 0,
        }
        const countByMethod = {
            efectivo: 0,
            yape: 0,
            tarjeta: 0,
        }

        entriesToday.forEach((entry) => {
            totalByMethod[entry.method] += entry.amount
            countByMethod[entry.method] += 1
        })

        return {
            totalByMethod,
            countByMethod,
        }
    }, [paymentEntries, tenantId])

    const todayEfectivoSales = todayPayments.totalByMethod.efectivo
    const todayYapeSales = todayPayments.totalByMethod.yape
    const todayTarjetaSales = todayPayments.totalByMethod.tarjeta
    const efectivoTxCount = todayPayments.countByMethod.efectivo
    const yapeTxCount = todayPayments.countByMethod.yape
    const tarjetaTxCount = todayPayments.countByMethod.tarjeta

    // Expected cash = opening balance + cash sales from ledger
    const expectedCash = (openingBalance || 0) + todayEfectivoSales
    const countedAmount = Number(countedCash || 0)
    const difference = countedAmount - expectedCash

    function formatCurrency(v: number) {
        return new Intl.NumberFormat('es-PE', { 
            style: 'currency', 
            currency: 'PEN', 
            minimumFractionDigits: 2 
        }).format(v)
    }

    const handleCloseCash = async () => {
        if (!tenantId || !activeWorker?.id) return
        if (!submitted) {
            alert('Por favor verifica el arqueo primero')
            return
        }

        setClosingLoading(true)
        try {
            const response = await api.cash.close.post({
                tenantId,
                workerId: activeWorker.id,
                openingBalance: openingBalance || 0,
                totalSales: todayEfectivoSales,
                expectedEfectivo: todayEfectivoSales,
                expectedYape: todayYapeSales,
                expectedTarjeta: todayTarjetaSales,
                expectedUnknown: 0,
                countedCash: countedAmount,
            })

            if (response.error) {
                const message =
                    (response.error.value as any)?.error ||
                    (response.error.value as any)?.message ||
                    'No se pudo cerrar la caja.'
                alert(`Error al cerrar caja: ${message}`)
                return
            }

            if (!response.error) {
                setCloseSubmitted(true)
                setTimeout(() => {
                    // Reset full cashier state for a fresh next opening
                    setCountedCash('')
                    setSubmitted(false)
                    setCloseSubmitted(false)
                    // Keep Yape/Tarjeta history; only clear efectivo from current day
                    clearTodayEntries(tenantId, ['efectivo'])
                    // Carry-over for next opening (shown in POS flow)
                    setCarryOverBalance(countedAmount)
                    setRequireManualOpening(true)
                    clearOpening()
                    // Close cashier session after end-of-day close
                    logoutAdmin()
                    logout()
                    navigate('/')
                }, 2000)
            }
        } catch (error) {
            console.error('Error closing cash:', error)
            alert('Error al cerrar la caja. Verifica el servidor.')
        } finally {
            setClosingLoading(false)
        }
    }

    const handleReconcile = () => {
        if (!countedCash) return
        setSubmitted(true)
    }

    function formatMinutes(value: number) {
        const mins = Math.round(value)
        const h = Math.floor(mins / 60)
        const m = mins % 60
        return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${mins} min`
    }

    if (showHistory) {
        return <CashCloseHistory onBack={() => setShowHistory(false)} />
    }

    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col rounded-sm">
            <header className="px-6 py-4 bg-slate-900 border-b border-slate-800 shadow-md flex items-center justify-between shrink-0 rounded-sm">
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => navigate('/pos')} 
                        className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                            <Banknote className="w-5 h-5 text-amber-400" /> Cierre de Caja
                        </h1>
                        <p className="text-xs text-slate-500 uppercase tracking-widest">Solo efectivo - {new Date().toLocaleDateString('es-PE')}</p>
                    </div>
                </div>
                <button
                    onClick={() => setShowHistory(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg font-medium text-blue-300"
                >
                    <History className="w-4 h-4" />
                    Historial
                </button>
            </header>

            <main className="flex-1 p-6 flex flex-col gap-4 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <MetricCard 
                        label="Apertura del día" 
                        value={formatCurrency(openingBalance || 0)} 
                        icon={<Banknote className="w-5 h-5 text-emerald-300" />} 
                    />
                    <MetricCard 
                        label="Ventas en efectivo" 
                        value={formatCurrency(todayEfectivoSales)} 
                        icon={<Calculator className="w-5 h-5 text-amber-300" />} 
                    />
                    <MetricCard 
                        label="Esperado en caja" 
                        value={formatCurrency(expectedCash)} 
                        icon={<Banknote className="w-5 h-5 text-cyan-300" />} 
                    />
                    <MetricCard 
                        label="Prom. tiempo/niño" 
                        value={formatMinutes(playzoneSummary?.averageMinutesPerChild ?? 0)} 
                        icon={<Users className="w-5 h-5 text-cyan-300" />} 
                    />
                </div>

                {todayEfectivoSales === 0 && (
                    <div className="rounded-lg border border-amber-700/50 bg-amber-900/20 px-4 py-3 text-sm text-amber-200">
                        Sin ventas en efectivo registradas hoy. Se contará solo la apertura.
                    </div>
                )}

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    <Card className="xl:col-span-2">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Calculator className="w-4 h-4 text-amber-300" />
                                Arqueo de Efectivo
                            </CardTitle>
                            <CardDescription>Verifica el efectivo físico en la caja</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="rounded-xl border border-slate-700 bg-slate-950 p-4 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div className="rounded-lg border border-amber-700/40 bg-amber-950/20 p-3 space-y-2">
                                        <p className="text-[11px] font-bold uppercase tracking-widest text-amber-300">Efectivo</p>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-slate-400">Apertura</span>
                                            <span className="font-semibold text-emerald-300">{formatCurrency(openingBalance || 0)}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-slate-400">Transacciones</span>
                                            <span className="font-semibold text-amber-300">{efectivoTxCount}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-slate-400">Total</span>
                                            <span className="font-semibold text-slate-100">{formatCurrency(todayEfectivoSales)}</span>
                                        </div>
                                    </div>

                                    <div className="rounded-lg border border-fuchsia-700/40 bg-fuchsia-950/20 p-3 space-y-2">
                                        <p className="text-[11px] font-bold uppercase tracking-widest text-fuchsia-300">Yape</p>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-slate-400">Transacciones</span>
                                            <span className="font-semibold text-fuchsia-300">{yapeTxCount}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-slate-400">Total</span>
                                            <span className="font-semibold text-fuchsia-200">{formatCurrency(todayYapeSales)}</span>
                                        </div>
                                    </div>

                                    <div className="rounded-lg border border-cyan-700/40 bg-cyan-950/20 p-3 space-y-2">
                                        <p className="text-[11px] font-bold uppercase tracking-widest text-cyan-300">Tarjeta</p>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-slate-400">Transacciones</span>
                                            <span className="font-semibold text-cyan-300">{tarjetaTxCount}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-slate-400">Total</span>
                                            <span className="font-semibold text-cyan-200">{formatCurrency(todayTarjetaSales)}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="h-px bg-slate-800" />
                                <div className="flex justify-between items-center text-lg">
                                    <span className="text-slate-300 font-semibold">Esperado en caja</span>
                                    <span className="font-bold text-cyan-300">{loading ? '...' : formatCurrency(expectedCash)}</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-300">Efectivo contado (física en caja)</label>
                                <input
                                    type="number"
                                    value={countedCash}
                                    onChange={(e) => { setCountedCash(e.target.value); setSubmitted(false); }}
                                    placeholder="0.00"
                                    min="0"
                                    step="0.01"
                                    className="w-full bg-slate-900 border-2 border-slate-700 rounded-xl px-4 py-3 text-2xl font-bold text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
                                />
                            </div>

                            {!submitted && (
                                <button
                                    onClick={handleReconcile}
                                    disabled={!countedCash || loading}
                                    className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-semibold disabled:opacity-50"
                                >
                                    Verificar Arqueo
                                </button>
                            )}

                            {submitted && !closeSubmitted && (
                                <>
                                    <div className={`p-4 rounded-xl border flex items-start gap-3 ${difference === 0
                                        ? 'bg-emerald-700/10 border-emerald-600/40 text-emerald-300'
                                        : difference > 0
                                            ? 'bg-sky-700/10 border-sky-600/40 text-sky-300'
                                            : 'bg-red-700/10 border-red-600/40 text-red-300'
                                    }`}>
                                        {difference === 0 ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
                                        <div>
                                            <h3 className="font-semibold">
                                                {difference === 0 ? 'Caja Cuadrada ✓' : difference > 0 ? 'Sobrante' : 'Faltante'}
                                            </h3>
                                            <p className="text-sm mt-1">
                                                {difference === 0
                                                    ? 'El efectivo coincide perfectamente.'
                                                    : `Diferencia: ${formatCurrency(Math.abs(difference))}`}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            onClick={() => { setCountedCash(''); setSubmitted(false); }}
                                            className="py-2 border border-slate-700 text-slate-300 hover:text-slate-100 rounded-xl font-medium transition-colors"
                                        >
                                            Volver a contar
                                        </button>
                                        <button
                                            onClick={handleCloseCash}
                                            disabled={closingLoading}
                                            className="py-2 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white rounded-xl font-semibold disabled:opacity-50"
                                        >
                                            {closingLoading ? 'Cerrando...' : 'Cerrar y Finalizar'}
                                        </button>
                                    </div>
                                </>
                            )}

                            {closeSubmitted && (
                                <div className="p-4 rounded-xl border border-emerald-600/40 bg-emerald-700/10 flex items-start gap-3 text-emerald-300">
                                    <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                                    <div>
                                        <h3 className="font-semibold">Caja Cerrada ✓</h3>
                                        <p className="text-sm mt-1">El día ha finalizado. Redirigiendo...</p>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Activity className="w-4 h-4 text-cyan-300" />
                                Zona de Juegos
                            </CardTitle>
                            <CardDescription>Impacto del área infantil</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <StatRow label="Sesiones activas" value={String(playzoneSummary?.activeSessions ?? 0)} />
                            <StatRow label="Sesiones completadas" value={String(playzoneSummary?.completedSessions ?? 0)} />
                            <StatRow label="Niños atendidos" value={String(playzoneSummary?.uniqueChildren ?? 0)} />
                            <StatRow label="Promedio/sesión" value={formatMinutes(playzoneSummary?.averageMinutesPerSession ?? 0)} />
                            <StatRow label="Minutos extra" value={formatMinutes(playzoneSummary?.totalOvertimeMinutes ?? 0)} />
                            <div className="pt-2">
                                {(playzoneSummary?.totalOvertimeMinutes ?? 0) > 0
                                    ? <Badge variant="warning">Hay exceso de tiempo</Badge>
                                    : <Badge variant="success">Sin exceso</Badge>}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Resumen Final del Arqueo</CardTitle>
                        <CardDescription>Comparativa: Esperado vs Contado</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            <StatusBox title="Inicio" value={formatCurrency(openingBalance || 0)} />
                            <StatusBox title="Ventas" value={formatCurrency(todayEfectivoSales)} />
                            <StatusBox title="Esperado" value={formatCurrency(expectedCash)} />
                            <StatusBox title="Diferencia" value={formatCurrency(difference)} emphasize={difference !== 0} />
                        </div>
                    </CardContent>
                </Card>
            </main>
        </div>
    )
}

function CashCloseHistory({ onBack }: { onBack: () => void }) {
    const { tenantId } = useAuthStore()
    const [history, setHistory] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const response = await api.cash.history.get({ 
                    query: { tenantId, days: 30 } 
                })
                if (!response.error) {
                    const data = response.data as any
                    setHistory(data.data ?? [])
                }
            } catch (e) {
                console.error(e)
            } finally {
                setLoading(false)
            }
        }
        fetchHistory()
    }, [tenantId])

    function formatCurrency(v: number) {
        return new Intl.NumberFormat('es-PE', { 
            style: 'currency', 
            currency: 'PEN', 
            minimumFractionDigits: 2 
        }).format(v)
    }

    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col">
            <header className="px-6 py-4 bg-slate-900 border-b border-slate-800 shadow-md flex items-center gap-4 shrink-0">
                <button 
                    onClick={onBack}
                    className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                    <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                        <History className="w-5 h-5 text-blue-400" /> Historial de Cierres
                    </h1>
                    <p className="text-xs text-slate-500 uppercase tracking-widest">Últimos 30 días</p>
                </div>
            </header>

            <main className="flex-1 p-6 overflow-y-auto">
                {loading ? (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-slate-400">Cargando historial...</p>
                    </div>
                ) : history.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-slate-400">Sin registros de cierre</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {history.map((close, i) => (
                            <Card key={i}>
                                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
                                    <div>
                                        <CardTitle>{close.closedDate}</CardTitle>
                                        <CardDescription>{close.worker.name}</CardDescription>
                                    </div>
                                    <Badge variant={close.difference === 0 ? "success" : "outline"}>
                                        {close.difference === 0 ? "Cuadrada" : "Diferencia"}
                                    </Badge>
                                </CardHeader>
                                <CardContent className="grid grid-cols-5 gap-4">
                                    <div>
                                        <p className="text-xs text-slate-500">Apertura</p>
                                        <p className="font-semibold">{formatCurrency(close.openingBalance)}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500">Ventas</p>
                                        <p className="font-semibold">{formatCurrency(close.totalSales)}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500">Esperado</p>
                                        <p className="font-semibold">{formatCurrency(close.totalExpected)}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500">Contado</p>
                                        <p className="font-semibold">{formatCurrency(close.countedCash)}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500">Diferencia</p>
                                        <p className={`font-semibold ${close.difference === 0 ? 'text-emerald-300' : close.difference > 0 ? 'text-sky-300' : 'text-red-300'}`}>
                                            {formatCurrency(close.difference)}
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </main>
        </div>
    )
}

function MetricCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
    return (
        <Card>
            <CardHeader>
                <CardDescription>{label}</CardDescription>
                <CardTitle className="text-2xl">{value}</CardTitle>
            </CardHeader>
            <CardContent className="text-slate-400">{icon}</CardContent>
        </Card>
    )
}

function StatRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between rounded-lg border border-slate-700 px-3 py-2">
            <span className="text-sm text-slate-400">{label}</span>
            <span className="text-sm font-semibold text-slate-100">{value}</span>
        </div>
    )
}

function StatusBox({ title, value, emphasize }: { title: string; value: string; emphasize?: boolean }) {
    return (
        <div className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-3">
            <p className="text-xs text-slate-500 uppercase tracking-wide">{title}</p>
            <p className={emphasize ? 'text-lg font-bold text-amber-300' : 'text-lg font-semibold text-slate-100'}>{value}</p>
        </div>
    )
}
