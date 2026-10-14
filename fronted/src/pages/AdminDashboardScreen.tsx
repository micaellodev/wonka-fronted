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

interface DashboardStats {
 salesToday: {
 count: number
 amount: number
 }
 lowStockProducts: number
 pendingVoidRequests: number
 cashCloseStatus: 'OPEN' | 'PENDING_APPROVAL' | 'APPROVED' | 'NOT_OPENED'
 activeWorkersToday: number
}

const initialStats: DashboardStats = {
 salesToday: { count: 0, amount: 0 },
 lowStockProducts: 0,
 pendingVoidRequests: 0,
 cashCloseStatus: 'NOT_OPENED',
 activeWorkersToday: 0,
}

export function AdminDashboardScreen() {
 const navigate = useNavigate()
 const { activeWorker, tenantId } = useAuthStore()
 const [stats, setStats] = useState<DashboardStats>(initialStats)
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
 setStats(data.data as DashboardStats)
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

 const kpiCards = [
 {
 label: 'Ventas hoy',
 value: formatCurrency(stats.salesToday.amount),
 sub: `${stats.salesToday.count} transacciones`,
 icon: TrendingUp,
 tone: 'text-foreground bg-muted',
 },
 {
 label: 'Stock bajo',
 value: String(stats.lowStockProducts),
 sub: 'productos',
 icon: AlertTriangle,
 tone: stats.lowStockProducts > 0 ? 'text-destructive bg-danger-soft' : 'text-foreground bg-muted',
 },
 {
 label: 'Solicitudes',
 value: String(stats.pendingVoidRequests),
 sub: 'pendientes',
 icon: ClipboardList,
 tone: stats.pendingVoidRequests > 0 ? 'text-warning bg-warning-soft' : 'text-foreground bg-muted',
 },
 {
 label: 'Caja',
 value:
 stats.cashCloseStatus === 'APPROVED'
 ? 'Cerrada'
 : stats.cashCloseStatus === 'PENDING_APPROVAL'
 ? 'Pendiente'
 : stats.cashCloseStatus === 'OPEN'
 ? 'Abierta'
 : 'Sin abrir',
 sub: 'estado actual',
 icon: Wallet,
 tone:
 stats.cashCloseStatus === 'APPROVED'
 ? 'text-success bg-success-soft'
 : stats.cashCloseStatus === 'PENDING_APPROVAL'
 ? 'text-warning bg-warning-soft'
 : stats.cashCloseStatus === 'OPEN'
 ? 'text-info bg-info-soft'
 : 'text-foreground bg-muted',
 },
 ]

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
 ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
 : kpiCards.map((kpi) => (
 <Card key={kpi.label}>
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
 {card.label === 'Aprobaciones' && stats.pendingVoidRequests > 0 && (
 <Badge variant="warning" className="absolute right-3 top-3">{stats.pendingVoidRequests}</Badge>
 )}
 </button>
 ))}
 </div>
 </section>
 </div>
 )
}

import { cn } from '@/lib/utils'
