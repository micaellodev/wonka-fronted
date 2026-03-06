import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { BarChart2, TrendingUp, Calendar, CreditCard } from 'lucide-react'

// Assuming Sale structure based on backend implementation
interface SaleItem {
    id: string;
    productName: string;
    qty: number;
    unitPrice: string;
    lineTotal: string;
}

interface Sale {
    id: string;
    total: number;
    worker: { name: string };
    createdAt: string;
    items: SaleItem[];
}

export function ReportsScreen() {
    const { tenantId } = useAuthStore()
    const navigate = useNavigate()

    const [sales, setSales] = useState<Sale[]>([])
    const [loading, setLoading] = useState(true)
    const [totalRevenue, setTotalRevenue] = useState(0)

    const fetchSales = useCallback(async () => {
        setLoading(true)
        try {
            const res = await api.pos.sales.get({ query: { tenantId, limit: 100, page: 1 } })
            if (!res.error) {
                const response = res.data as unknown as { data: Sale[] }
                const salesData = response.data ?? []
                setSales(salesData)
                setTotalRevenue(salesData.reduce((acc, sale) => acc + Number(sale.total), 0))
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

    function formatCurrency(v: number) {
        return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 }).format(v)
    }

    function formatDate(iso: string) {
        return new Date(iso).toLocaleString('es-CO', {
            month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'
        })
    }

    return (
        <div className="min-h-screen bg-surface-900 text-slate-200 flex flex-col">
            <header className="px-6 py-4 bg-slate-800/80 border-b border-white/5 shadow-md flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/admin')} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 transition-colors rounded-xl font-medium text-white">Volver</button>
                    <div>
                        <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                            <BarChart2 className="w-5 h-5 text-emerald-400" /> Reportes de Ventas
                        </h1>
                    </div>
                </div>
            </header>

            <main className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 shrink-0">
                    <div className="bg-emerald-900/20 border border-emerald-500/20 p-6 rounded-3xl flex items-center justify-between">
                        <div>
                            <p className="text-sm font-semibold text-emerald-400">Ingresos Totales (Recientes)</p>
                            <p className="text-3xl font-extrabold text-emerald-300 mt-1">{formatCurrency(totalRevenue)}</p>
                        </div>
                        <div className="p-4 bg-emerald-500/20 rounded-2xl text-emerald-400">
                            <TrendingUp className="w-8 h-8" />
                        </div>
                    </div>

                    <div className="bg-slate-800/40 border border-slate-700/50 p-6 rounded-3xl flex items-center justify-between">
                        <div>
                            <p className="text-sm font-semibold text-slate-400">Transacciones</p>
                            <p className="text-3xl font-extrabold text-white mt-1">{sales.length}</p>
                        </div>
                        <div className="p-4 bg-slate-700/50 rounded-2xl text-slate-300">
                            <CreditCard className="w-8 h-8" />
                        </div>
                    </div>

                    <div className="bg-slate-800/40 border border-slate-700/50 p-6 rounded-3xl flex items-center justify-between">
                        <div>
                            <p className="text-sm font-semibold text-slate-400">Ticket Promedio</p>
                            <p className="text-3xl font-extrabold text-white mt-1">{sales.length > 0 ? formatCurrency(totalRevenue / sales.length) : formatCurrency(0)}</p>
                        </div>
                        <div className="p-4 bg-slate-700/50 rounded-2xl text-slate-300">
                            <BarChart2 className="w-8 h-8" />
                        </div>
                    </div>
                </div>

                <div className="flex-1 bg-slate-800/40 border border-white/5 rounded-2xl overflow-hidden flex flex-col">
                    <div className="px-6 py-4 border-b border-white/5 bg-slate-800/60 flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-slate-400" />
                        <h2 className="text-lg font-bold text-white">Historial de Ventas Recientes</h2>
                    </div>
                    <div className="overflow-x-auto flex-1 p-4">
                        <div className="flex flex-col gap-3">
                            {loading ? (
                                <p className="text-center text-slate-400 p-8">Cargando ventas...</p>
                            ) : sales.length === 0 ? (
                                <p className="text-center text-slate-400 p-8">No hay ventas registradas.</p>
                            ) : (
                                sales.map((sale) => (
                                    <div key={sale.id} className="bg-slate-800/80 border border-slate-700 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div className="flex-1">
                                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                                <span className="text-lg font-bold text-green-400">{formatCurrency(sale.total)}</span>
                                                <span className="text-xs font-mono bg-slate-700/50 px-2 py-0.5 rounded text-slate-400">ID: {sale.id.slice(0, 8)}...</span>
                                            </div>
                                            <div className="text-sm text-slate-400 flex items-center gap-2">
                                                <span>Atendido por: <strong className="text-slate-300">{sale.worker?.name || 'Desconocido'}</strong></span>
                                                <span>•</span>
                                                <span>{formatDate(sale.createdAt)}</span>
                                            </div>
                                        </div>
                                        <div className="md:w-1/2 flex flex-col gap-1">
                                            {sale.items?.slice(0, 3).map((item, i) => (
                                                <div key={i} className="text-xs flex justify-between bg-slate-900/50 px-3 py-1.5 rounded-md text-slate-300">
                                                    <span>{item.qty}x {item.productName || 'Producto'}</span>
                                                </div>
                                            ))}
                                            {sale.items?.length > 3 && (
                                                <p className="text-xs text-brand-400 font-medium px-2">+ {sale.items.length - 3} producto(s) más</p>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}
