import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { Banknote, Calculator, CheckCircle2, AlertTriangle } from 'lucide-react'

// Assuming Sale structure based on backend implementation
interface Sale {
    id: string;
    total: number;
    workerId: string;
    worker: { name: string };
    createdAt: string;
}

export function CashierScreen() {
    const { tenantId, activeWorker } = useAuthStore()
    const navigate = useNavigate()

    const [sales, setSales] = useState<Sale[]>([])
    const [loading, setLoading] = useState(true)
    const [countedCash, setCountedCash] = useState<string>('')
    const [submitted, setSubmitted] = useState(false)

    const fetchSales = useCallback(async () => {
        setLoading(true)
        try {
            // Fetch recent sales. In a real app we would filter by today's date and the current shift
            const res = await api.pos.sales.get({ query: { tenantId, limit: 200, page: 1 } })
            if (!res.error) {
                const response = res.data as unknown as { data: Sale[] }
                setSales(response.data ?? [])
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

    const todaySales = useMemo(() => {
        const today = new Date().toDateString()
        return sales.filter(s => new Date(s.createdAt).toDateString() === today)
    }, [sales])

    const mySales = useMemo(() => {
        return todaySales.filter(s => s.workerId === activeWorker?.id)
    }, [todaySales, activeWorker])

    const expectedCash = mySales.reduce((acc, sale) => acc + Number(sale.total), 0)
    const difference = Number(countedCash || 0) - expectedCash

    function formatCurrency(v: number) {
        return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 }).format(v)
    }

    const handleReconcile = () => {
        if (!countedCash) return
        setSubmitted(true)
    }

    return (
        <div className="min-h-screen bg-surface-900 text-slate-200 flex flex-col">
            <header className="px-6 py-4 bg-slate-800/80 border-b border-white/5 shadow-md flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/admin')} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 transition-colors rounded-xl font-medium text-white">Volver</button>
                    <div>
                        <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                            <Banknote className="w-5 h-5 text-amber-400" /> Arqueo de Caja
                        </h1>
                    </div>
                </div>
            </header>

            <main className="flex-1 p-6 flex flex-col items-center justify-center overflow-y-auto">
                <div className="w-full max-w-xl bg-slate-800/40 border border-white/5 rounded-3xl p-8 flex flex-col gap-8 shadow-2xl">

                    <div className="text-center space-y-2">
                        <div className="w-16 h-16 bg-amber-500/10 text-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <Calculator className="w-8 h-8" />
                        </div>
                        <h2 className="text-2xl font-bold text-white">Cierre de Turno</h2>
                        <p className="text-slate-400">Verifica el efectivo total en caja del turno actual de <strong className="text-white">{activeWorker?.name}</strong>.</p>
                    </div>

                    <div className="bg-slate-900/50 rounded-2xl p-6 border border-slate-700/50 space-y-4">
                        <div className="flex justify-between items-center text-lg">
                            <span className="text-slate-400">Ventas Registradas (Hoy)</span>
                            <span className="font-bold text-white">{mySales.length} transacciones</span>
                        </div>
                        <div className="flex justify-between items-center text-xl">
                            <span className="text-slate-400">Efectivo Esperado</span>
                            <span className="font-bold text-amber-400">{loading ? '...' : formatCurrency(expectedCash)}</span>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <label className="text-sm font-semibold text-slate-300 ml-1">Efectivo Contado en Caja</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                            <input
                                type="number"
                                value={countedCash}
                                onChange={(e) => { setCountedCash(e.target.value); setSubmitted(false); }}
                                placeholder="0"
                                className="w-full bg-slate-800 border-2 border-slate-700 rounded-xl pl-8 pr-4 py-4 text-2xl font-bold text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
                            />
                        </div>
                    </div>

                    {submitted && (
                        <div className={`p-5 rounded-2xl border flex items-start gap-3 ${difference === 0
                                ? 'bg-green-500/10 border-green-500/30 text-green-400'
                                : difference > 0
                                    ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                                    : 'bg-red-500/10 border-red-500/30 text-red-400'
                            }`}>
                            {difference === 0 ? <CheckCircle2 className="w-6 h-6 shrink-0" /> : <AlertTriangle className="w-6 h-6 shrink-0" />}
                            <div>
                                <h3 className="font-bold text-lg mb-1">
                                    {difference === 0 ? 'Caja Cuadrada Perfectamente' : difference > 0 ? 'Sobrante en Caja' : 'Faltante en Caja'}
                                </h3>
                                <p className="text-sm opacity-90">
                                    {difference === 0
                                        ? 'El efectivo contado coincide exactamente con las ventas registradas.'
                                        : `Hay una diferencia de ${formatCurrency(Math.abs(difference))} respecto al valor esperado.`}
                                </p>
                            </div>
                        </div>
                    )}

                    {!submitted && (
                        <button
                            onClick={handleReconcile}
                            disabled={!countedCash || loading}
                            className="w-full py-4 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold text-lg transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-900/20"
                        >
                            Verificar Arqueo
                        </button>
                    )}
                </div>
            </main>
        </div>
    )
}
