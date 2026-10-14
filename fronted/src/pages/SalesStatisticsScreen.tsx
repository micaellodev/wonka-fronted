import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Banknote, BarChart3, RefreshCw, ShoppingBag, DollarSign, CreditCard } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { TerminalShell } from '@/components/TerminalShell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

interface Sale {
 id: string
 total: number
 paymentMethod: string
 clientName: string | null
 createdAt: string
 status: string
 worker: { name: string }
}

/** YYYY-MM-DD in Lima for `daysAgo` days before today. */
const limaDateKey = (daysAgo = 0) =>
 new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'America/Lima' })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const apiErrorMessage = (e: any): string => e?.value?.message ?? e?.value?.error ?? 'Error de conexión'

export function SalesStatisticsScreen() {
 const { tenantId, activeWorker } = useAuthStore()
 const isAdmin = activeWorker?.role?.name === 'ADMIN' || activeWorker?.role?.name === 'ADMINISTRADOR'
 const [loadError, setLoadError] = useState<string | null>(null)
 const navigate = useNavigate()
 const [loading, setLoading] = useState(true)
 const [days, setDays] = useState(30)
 const [search, setSearch] = useState('')
 const [sales, setSales] = useState<Sale[]>([])

 // Last `days` Lima days (today included), computed server-side; no page-size truncation
 const fetchSales = useCallback(async () => {
 if (!tenantId) return
 setLoading(true)
 setLoadError(null)
 try {
 const response = await api.dashboard['sales-report'].get({
 query: { tenantId, from: limaDateKey(days - 1), to: limaDateKey(0) },
 })
 if (response.error) throw response.error
 setSales((response.data.data ?? []) as Sale[])
 } catch (err) {
 setLoadError(apiErrorMessage(err))
 } finally {
 setLoading(false)
 }
 }, [tenantId, days])

 useEffect(() => { fetchSales() }, [fetchSales])

 // Voided sales never count toward statistics
 const filteredSales = useMemo(() => {
 const term = search.trim().toLowerCase()
 return sales.filter((sale) => {
 if (sale.status === 'CANCELLED') return false
 const client = (sale.clientName || 'sin cliente').toLowerCase()
 const worker = sale.worker?.name?.toLowerCase?.() ?? ''
 return !term || client.includes(term) || worker.includes(term) || sale.paymentMethod.toLowerCase().includes(term)
 })
 }, [sales, search])

 const summary = useMemo(() => {
 const total = filteredSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0)
  const byMethod = filteredSales.reduce<Record<string, number>>((acc, sale) => {
    acc[sale.paymentMethod] = (acc[sale.paymentMethod] ?? 0) + Number(sale.total || 0)
 return acc
 }, {})
 const avgTicket = filteredSales.length ? total / filteredSales.length : 0
 return { total, byMethod, avgTicket }
 }, [filteredSales])

 const formatCurrency = (value: number) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 }).format(Number(value) || 0)
 const paymentMethodLabel = (value: string) => ({ efectivo: 'Efectivo', yape: 'Yape', tarjeta: 'Tarjeta' }[value] ?? value)

 return (
 <TerminalShell activeSection="sales-stats">
 <div className="space-y-4">
 <div className="flex flex-col gap-1">
 <div className="flex items-center gap-2">
 <Button variant="ghost" size="icon" onClick={() => navigate(isAdmin ? '/admin' : '/pos')}>
 <ArrowLeft className="h-4 w-4" />
 </Button>
 <h1 className="text-2xl font-black tracking-tight text-gray-900">Estadísticas de venta</h1>
 </div>
 <p className="text-sm text-gray-500">Resumen de ventas, métodos de pago y ticket promedio del periodo.</p>
 </div>

 <div className="flex flex-wrap items-center gap-2">
 {[7, 14, 30, 90].map((value) => (
 <Button key={value} size="sm" variant={days === value ? 'default' : 'outline'} onClick={() => setDays(value)}>
 {value} días
 </Button>
 ))}
 <div className="ml-auto flex items-center gap-2">
 <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente, cajero o método" className="w-72" />
 <Button variant="outline" size="sm" className="gap-2" onClick={fetchSales}>
 <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
 Actualizar
 </Button>
 </div>
 </div>

 <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
 <MetricCard title="Total vendido" value={formatCurrency(summary.total)} icon={<Banknote className="h-4 w-4 text-red-500" />} />
 <MetricCard title="Ticket promedio" value={formatCurrency(summary.avgTicket)} icon={<BarChart3 className="h-4 w-4 text-secondary-500" />} />
 <MetricCard title="Ventas filtradas" value={String(filteredSales.length)} icon={<ShoppingBag className="h-4 w-4 text-secondary-500" />} />
 <MetricCard title="Métodos activos" value={String(Object.keys(summary.byMethod).length)} icon={<CreditCard className="h-4 w-4 text-brand-500" />} />
 </div>

 <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
 <Card className="border-gray-200 bg-white shadow-sm">
 <CardHeader>
 <CardTitle className="flex items-center gap-2 text-lg">
 <DollarSign className="h-4 w-4 text-red-500" />
 Distribución por método
 </CardTitle>
 <CardDescription>Montos agrupados por forma de pago.</CardDescription>
 </CardHeader>
 <CardContent className="space-y-3">
 {['efectivo', 'yape', 'tarjeta'].map((method) => {
 const amount = summary.byMethod[method] ?? 0
 const percent = summary.total ? Math.round((amount / summary.total) * 100) : 0
 return (
 <div key={method} className="space-y-1">
 <div className="flex items-center justify-between text-sm">
 <span className="font-medium text-gray-700">{paymentMethodLabel(method)}</span>
 <span className="text-gray-500">{formatCurrency(amount)} · {percent}%</span>
 </div>
 <div className="h-2 rounded-full bg-gray-100">
 <div className="h-2 rounded-full bg-red-500" style={{ width: `${percent}%` }} />
 </div>
 </div>
 )
 })}
 </CardContent>
 </Card>

 <Card className="border-gray-200 bg-white shadow-sm">
 <CardHeader>
 <CardTitle className="flex items-center gap-2 text-lg">
 <ShoppingBag className="h-4 w-4 text-red-500" />
 Ventas del periodo
 </CardTitle>
 <CardDescription>Lista compacta de ventas filtradas por fecha y búsqueda.</CardDescription>
 </CardHeader>
 <CardContent>
 {loading ? (
 <p className="py-8 text-center text-sm text-gray-400">Cargando...</p>
 ) : loadError ? (
 <p className="py-8 text-center text-sm text-red-600">No se pudieron cargar las ventas: {loadError}</p>
 ) : filteredSales.length === 0 ? (
 <p className="py-8 text-center text-sm text-gray-400">No hay ventas para mostrar</p>
 ) : (
 <div className="space-y-2">
 {filteredSales.slice(0, 12).map((sale) => (
 <div key={sale.id} className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3 md:flex-row md:items-center md:justify-between">
 <div>
 <p className="text-sm font-semibold text-gray-900">{sale.clientName || 'Sin cliente'}</p>
 <p className="text-xs text-gray-500">{sale.worker?.name} · {new Date(sale.createdAt).toLocaleString('es-PE')}</p>
 </div>
 <div className="flex items-center gap-2">
 <Badge variant="outline" className="bg-white">{paymentMethodLabel(sale.paymentMethod)}</Badge>
 <span className="font-mono text-sm font-bold text-gray-900">{formatCurrency(Number(sale.total || 0))}</span>
 </div>
 </div>
 ))}
 </div>
 )}
 </CardContent>
 </Card>
 </div>
 </div>
 </TerminalShell>
 )
}

function MetricCard({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
 return (
 <Card className="border-gray-200 bg-white shadow-sm">
 <CardContent className="flex items-center gap-3 p-4">
 <div className="rounded-xl bg-gray-100 p-3">{icon}</div>
 <div>
 <p className="text-xs font-medium text-gray-500">{title}</p>
 <p className="text-lg font-bold text-gray-900">{value}</p>
 </div>
 </CardContent>
 </Card>
 )
}