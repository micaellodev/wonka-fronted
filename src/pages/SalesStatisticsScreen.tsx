import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Banknote, BarChart3, RefreshCw, ShoppingBag, DollarSign, CreditCard } from 'lucide-react'
import { api } from '@/lib/api'
import { apiErrorMessage } from '@/lib/api-error'
import { formatCurrency } from '@/lib/format'
import { useAuthStore } from '@/store/authStore'
import { useCan } from '@/lib/permissions'
import { TerminalShell } from '@/components/TerminalShell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ExportButtons } from '@/components/ExportButtons'

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

export function SalesStatisticsScreen() {
 const { tenantId } = useAuthStore()
 const isAdmin = useCan().canEnterAdmin
 const [loadError, setLoadError] = useState<string | null>(null)
 const navigate = useNavigate()
 const [loading, setLoading] = useState(true)
 const [days, setDays] = useState(30)
 const [search, setSearch] = useState('')
 const [sales, setSales] = useState<Sale[]>([])
 const [report, setReport] = useState({ total: 0, count: 0, byMethod: {} as Record<string, number> })

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
 const s = (response.data as unknown as { summary: { sales: { total: number; count: number; byMethod: Record<string, number> } } }).summary.sales
 setReport({ total: s.total, count: s.count, byMethod: s.byMethod })
 } catch (err) {
 setLoadError(apiErrorMessage(err, 'Error de conexión'))
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

 // Backend totals for the whole period (the search box only filters the table)
 const summary = { total: report.total, byMethod: report.byMethod, avgTicket: report.count ? report.total / report.count : 0 }

 const paymentMethodLabel = (value: string) => ({ efectivo: 'Efectivo', yape: 'Yape', tarjeta: 'Tarjeta' }[value] ?? value)

 return (
 <TerminalShell activeSection="sales-stats">
 <div className="space-y-4">
 <div className="flex flex-col gap-1">
 <div className="flex items-center gap-2">
 <Button variant="ghost" size="icon" onClick={() => navigate(isAdmin ? '/admin' : '/pos')}>
 <ArrowLeft className="h-4 w-4" />
 </Button>
 <h1 className="text-2xl font-black tracking-tight text-foreground">Estadísticas de venta</h1>
 </div>
 <p className="text-sm text-muted-foreground">Resumen de ventas, métodos de pago y ticket promedio del periodo.</p>
 </div>

 <div className="flex flex-wrap items-center gap-2">
 {[7, 14, 30, 90].map((value) => (
 <Button key={value} size="sm" variant={days === value ? 'default' : 'outline'} onClick={() => setDays(value)}>
 {value} días
 </Button>
 ))}
 <div className="ml-auto flex items-center gap-2">
 <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente, cajero o método" className="w-72" />
 <ExportButtons name="estadisticas-ventas" disabled={loading || filteredSales.length === 0} getRows={() => [
 [`Resumen de los últimos ${days} días`],
 ['Total vendido', Number(summary.total.toFixed(2))], ['Ventas', report.count], ['Ticket promedio', Number(summary.avgTicket.toFixed(2))],
 ...['efectivo', 'yape', 'tarjeta'].map((m) => [paymentMethodLabel(m), Number((summary.byMethod[m] ?? 0).toFixed(2))]),
 [],
 ['Fecha', 'Cliente', 'Cajero', 'Método de pago', 'Total'],
 ...filteredSales.map((sale) => [new Date(sale.createdAt).toLocaleString('es-PE'), sale.clientName || 'Sin cliente', sale.worker?.name ?? '', paymentMethodLabel(sale.paymentMethod), Number(Number(sale.total || 0).toFixed(2))]),
 ]} />
 <Button variant="outline" size="sm" className="gap-2" onClick={fetchSales}>
 <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
 Actualizar
 </Button>
 </div>
 </div>

 <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
 <MetricCard title="Total vendido" value={formatCurrency(summary.total)} icon={<Banknote className="h-4 w-4 text-primary" />} />
 <MetricCard title="Ticket promedio" value={formatCurrency(summary.avgTicket)} icon={<BarChart3 className="h-4 w-4 text-secondary" />} />
 <MetricCard title="Ventas" value={String(report.count)} icon={<ShoppingBag className="h-4 w-4 text-secondary" />} />
 <MetricCard title="Métodos activos" value={String(["efectivo", "yape", "tarjeta"].filter((m) => (summary.byMethod[m] ?? 0) > 0).length)} icon={<CreditCard className="h-4 w-4 text-brand-500" />} />
 </div>

 <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
 <Card className="border-border bg-card shadow-sm">
 <CardHeader>
 <CardTitle className="flex items-center gap-2 text-lg">
 <DollarSign className="h-4 w-4 text-primary" />
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
 <span className="font-medium text-foreground">{paymentMethodLabel(method)}</span>
 <span className="text-muted-foreground">{formatCurrency(amount)} · {percent}%</span>
 </div>
 <div className="h-2 rounded-full bg-muted">
 <div className="h-2 rounded-full bg-primary" style={{ width: `${percent}%` }} />
 </div>
 </div>
 )
 })}
 </CardContent>
 </Card>

 <Card className="border-border bg-card shadow-sm">
 <CardHeader>
 <CardTitle className="flex items-center gap-2 text-lg">
 <ShoppingBag className="h-4 w-4 text-primary" />
 Ventas del periodo
 </CardTitle>
 <CardDescription>Lista compacta de ventas filtradas por fecha y búsqueda.</CardDescription>
 </CardHeader>
 <CardContent>
 {loading ? (
 <p className="py-8 text-center text-sm text-muted-foreground">Cargando...</p>
 ) : loadError ? (
 <p className="py-8 text-center text-sm text-destructive">No se pudieron cargar las ventas: {loadError}</p>
 ) : filteredSales.length === 0 ? (
 <p className="py-8 text-center text-sm text-muted-foreground">No hay ventas para mostrar</p>
 ) : (
 <div className="space-y-2">
 {filteredSales.slice(0, 12).map((sale) => (
 <div key={sale.id} className="flex flex-col gap-2 rounded-xl border border-border bg-muted p-3 md:flex-row md:items-center md:justify-between">
 <div>
 <p className="text-sm font-semibold text-foreground">{sale.clientName || 'Sin cliente'}</p>
 <p className="text-xs text-muted-foreground">{sale.worker?.name} · {new Date(sale.createdAt).toLocaleString('es-PE')}</p>
 </div>
 <div className="flex items-center gap-2">
 <Badge variant="outline" className="bg-card">{paymentMethodLabel(sale.paymentMethod)}</Badge>
 <span className="font-mono text-sm font-bold text-foreground">{formatCurrency(Number(sale.total || 0))}</span>
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
 <Card className="border-border bg-card shadow-sm">
 <CardContent className="flex items-center gap-3 p-4">
 <div className="rounded-xl bg-muted p-3">{icon}</div>
 <div>
 <p className="text-xs font-medium text-muted-foreground">{title}</p>
 <p className="text-lg font-bold text-foreground">{value}</p>
 </div>
 </CardContent>
 </Card>
 )
}