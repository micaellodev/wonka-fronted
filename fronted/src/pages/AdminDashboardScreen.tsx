import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
 Package,
 Users,
 Calculator,
 BarChart3,
 FileText,
 History,
 ShoppingCart,
 ClipboardList,
 AlertTriangle,
 Wallet,
 TrendingUp,
 Receipt,
 Ban,
 PackageX,
 LineChart,
 UserPlus,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '@/lib/format'

// ============================================================
// AdminDashboardScreen — Main admin landing with KPIs + navigation
// ============================================================

type CashStatus = 'NO_ABIERTA' | 'ABIERTA' | 'PENDIENTE' | 'CERRADA'

// Subset of the backend DaySummary (GET /dashboard/metrics) used here
interface DashboardStats {
 cashStatus: CashStatus
 sales: { count: number; total: number }
 voided: { count: number; total: number }
 expectedCash: number
 pending: { voids: number; closes: number }
 stock: { lowStock: number; outOfStock: number }
}

const CASH_LABEL: Record<CashStatus, string> = {
 NO_ABIERTA: 'No abierta',
 ABIERTA: 'Abierta',
 PENDIENTE: 'Pendiente',
 CERRADA: 'Cerrada',
}

const CASH_TONE: Record<CashStatus, string> = {
 NO_ABIERTA: 'text-foreground bg-muted',
 ABIERTA: 'text-info bg-info-soft',
 PENDIENTE: 'text-warning bg-warning-soft',
 CERRADA: 'text-success bg-success-soft',
}

export function AdminDashboardScreen() {
 const navigate = useNavigate()
 const { activeWorker, tenantId } = useAuthStore()
 const [stats, setStats] = useState<DashboardStats | null>(null)
 const [loading, setLoading] = useState(true)
 const [loadError, setLoadError] = useState(false)

 useEffect(() => {
 const fetchStats = async () => {
 try {
 const { data, error } = await api.dashboard.metrics.get({
 query: { tenantId },
 })
 if (error) throw error
 if (data?.data) {
 setStats(data.data as unknown as DashboardStats)
 }
 } catch (err) {
 console.error('Failed to load dashboard stats:', err)
 setLoadError(true)
 } finally {
 setLoading(false)
 }
 }

 fetchStats()
 }, [tenantId])

 const warn = (n: number) => (n > 0 ? 'text-warning bg-warning-soft' : 'text-foreground bg-muted')
 const kpiCards = stats
 ? [
 { label: 'Ventas hoy', value: formatCurrency(stats.sales.total), sub: `${stats.sales.count} ventas`, icon: TrendingUp, tone: 'text-foreground bg-muted', route: '/sales-history?date=hoy' },
 { label: 'Anuladas', value: String(stats.voided.count), sub: formatCurrency(stats.voided.total), icon: Ban, tone: warn(stats.voided.count), route: '/sales-history?status=CANCELLED' },
 { label: 'Solicitudes', value: String(stats.pending.voids), sub: 'pendientes', icon: ClipboardList, tone: warn(stats.pending.voids), route: '/admin/approvals' },
 { label: 'Caja', value: CASH_LABEL[stats.cashStatus], sub: 'estado actual', icon: Wallet, tone: CASH_TONE[stats.cashStatus], route: '/admin/cash-history' },
 { label: 'Saldo esperado', value: formatCurrency(stats.expectedCash), sub: 'efectivo en caja', icon: Calculator, tone: 'text-foreground bg-muted', route: '/admin/cash-history' },
 { label: 'Stock bajo', value: String(stats.stock.lowStock), sub: 'productos', icon: AlertTriangle, tone: warn(stats.stock.lowStock), route: '/admin/inventory?stock=low' },
 { label: 'Agotados', value: String(stats.stock.outOfStock), sub: 'productos', icon: PackageX, tone: stats.stock.outOfStock > 0 ? 'text-destructive bg-danger-soft' : 'text-foreground bg-muted', route: '/admin/inventory?stock=out' },
 ]
 : []
 const pendingVoids = stats?.pending.voids ?? 0

 const navCards = [
 {
 label: 'Inventario',
 desc: 'Productos y stock',
 icon: Package,
 route: '/admin/inventory',
 },
 {
 label: 'Empleados',
 desc: 'Personal y asistencia',
 icon: Users,
 route: '/admin/employees',
 },
 {
 label: 'Cuadre de Caja',
 desc: 'Historial de cierres',
 icon: Calculator,
 route: '/admin/cashier',
 },
 {
 label: 'Reportes',
 desc: 'Ventas y métricas',
 icon: BarChart3,
 route: '/admin/reports',
 },
 {
 label: 'Notas C/D',
 desc: 'Crédito y débito',
 icon: FileText,
 route: '/admin/billing-notes',
 },
 {
 label: 'Historial de Cierres',
 desc: 'Cierres aprobados',
 icon: History,
 route: '/admin/cash-history',
 },
 {
 label: 'Aprobaciones',
 desc: 'Solicitudes de anulación',
 icon: ClipboardList,
 route: '/admin/approvals',
 },
 {
 label: 'Movimientos de Caja',
 desc: 'Ingresos y salidas',
 icon: Wallet,
 route: '/movimientos-caja',
 },
 {
 label: 'Registro de Clientes',
 desc: 'Alta de clientes',
 icon: UserPlus,
 route: '/register-client',
 },
 {
 label: 'Historial de Ventas',
 desc: 'Ventas registradas',
 icon: Receipt,
 route: '/sales-history',
 },
 {
 label: 'Estadísticas de Ventas',
 desc: 'Analítica de ventas',
 icon: LineChart,
 route: '/estadisticas-venta',
 },
 {
 label: 'Punto de Venta',
 desc: 'Ir a vender',
 icon: ShoppingCart,
 route: '/pos',
 },
 ]

 return (
 <div className="space-y-8">
 <p className="text-sm text-muted-foreground">
 {activeWorker?.name ? `Hola, ${activeWorker.name}` : 'Bienvenido'}
 </p>

 {loadError && (
 <div role="alert" className="rounded-lg border border-destructive/20 bg-danger-soft px-4 py-3 text-sm text-destructive">
 No se pudieron cargar las métricas. Revisa la conexión con el servidor.
 </div>
 )}

 <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
 {loading
 ? Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
 : kpiCards.map((kpi) => (
 <Card key={kpi.label} role="link" tabIndex={0} onClick={() => navigate(kpi.route)} onKeyDown={(e) => e.key === "Enter" && navigate(kpi.route)} className="cursor-pointer transition-colors hover:border-primary/50">
 <CardContent className="flex items-start justify-between p-5">
 <div>
 <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{kpi.label}</p>
 <p className="mt-2 text-2xl font-bold">{kpi.value}</p>
 <p className="text-xs text-muted-foreground">{kpi.sub}</p>
 </div>
 <span className={cn('rounded-lg p-2.5', kpi.tone)}><kpi.icon className="h-5 w-5" /></span>
 </CardContent>
 </Card>
 ))}
 </section>

 <section>
 <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">Módulos</h2>
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
 {navCards.map((card) => (
 <button
 key={card.label}
 onClick={() => navigate(card.route)}
 className="group relative flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/50 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
 >
 <span className="rounded-lg bg-brand-50 p-2.5 text-primary group-hover:bg-primary group-hover:text-primary-foreground">
 <card.icon className="h-5 w-5" />
 </span>
 <span>
 <span className="block text-sm font-semibold">{card.label}</span>
 <span className="block text-xs text-muted-foreground">{card.desc}</span>
 </span>
 {card.label === 'Aprobaciones' && pendingVoids > 0 && (
 <Badge variant="warning" className="absolute right-3 top-3">{pendingVoids}</Badge>
 )}
 </button>
 ))}
 </div>
 </section>
 </div>
 )
}

import { cn } from '@/lib/utils'
