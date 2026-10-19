import { useState, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
 LayoutDashboard, Package, Users, Calculator, BarChart3, FileText, History, ClipboardList,
 Wallet, UserPlus, Receipt, LineChart, ShoppingCart, Building2, LogOut, Menu, Gamepad2, X,
} from 'lucide-react'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useCan } from '@/lib/permissions'

const groups = [
 { label: 'General', items: [
 { label: 'Panel', to: '/admin', icon: LayoutDashboard, end: true },
 { label: 'Aprobaciones', to: '/admin/approvals', icon: ClipboardList },
 { label: 'Empresa', to: '/admin/company', icon: Building2 },
 ] },
 { label: 'Gestión', items: [
 { label: 'Inventario', to: '/admin/inventory', icon: Package },
 { label: 'Empleados', to: '/admin/employees', icon: Users },
 { label: 'Notas C/D', to: '/admin/billing-notes', icon: FileText },
 { label: 'Juegos', to: '/admin/playzone', icon: Gamepad2 },
 ] },
 { label: 'Caja y reportes', items: [
 { label: 'Cuadre de caja', to: '/admin/cashier', icon: Calculator },
 { label: 'Apertura y cierre', to: '/admin/cash-close', icon: History },
 { label: 'Reportes', to: '/admin/reports', icon: BarChart3 },
 { label: 'Movimientos de caja', to: '/admin/cash-movements', icon: Wallet },
 { label: 'Historial de ventas', to: '/admin/sales-history', icon: Receipt },
 { label: 'Estadísticas', to: '/admin/statistics', icon: LineChart },
 ] },
 { label: 'Operación', items: [
 { label: 'Registrar cliente', to: '/register-client', icon: UserPlus },
 { label: 'Punto de venta', to: '/pos', icon: ShoppingCart },
 ] },
]

const flat = groups.flatMap((g) => g.items)

export function AdminLayout({ children }: { children: ReactNode }) {
 const [open, setOpen] = useState(false)
 const { pathname } = useLocation()
 const navigate = useNavigate()
 const { activeWorker, logout } = useAuthStore()
 const { canRoute } = useCan()
 const title = flat.find((i) => i.to === pathname)?.label ?? 'Administración'

 const nav = (
 <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
 {groups.map((g) => (
 <div key={g.label}>
 <p className="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{g.label}</p>
 <div className="space-y-0.5">
 {g.items.filter((i) => canRoute(i.to)).map((i) => (
 <NavLink
 key={i.to}
 to={i.to}
 end={i.end}
 onClick={() => setOpen(false)}
 className={({ isActive }) =>
 cn(
 'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
 isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground/70 hover:bg-muted hover:text-foreground',
 )
 }
 >
 <i.icon className="h-4 w-4 shrink-0" />
 {i.label}
 </NavLink>
 ))}
 </div>
 </div>
 ))}
 </nav>
 )

 return (
 <div className="flex h-full bg-muted/40 text-foreground">
 <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card lg:flex">
 <div className="flex h-16 items-center gap-3 border-b border-border px-5">
 <Logo variant="icon" className="h-9 w-9" />
 <span className="text-sm font-bold tracking-wide">Wonka Admin</span>
 </div>
 {nav}
 </aside>

 {open && (
 <div className="fixed inset-0 z-40 lg:hidden">
 <div className="absolute inset-0 bg-scrim" onClick={() => setOpen(false)} />
 <aside className="relative flex h-full w-64 flex-col bg-card shadow-xl">
 <div className="flex h-16 items-center justify-between border-b border-border px-5">
 <span className="text-sm font-bold">Wonka Admin</span>
 <Button variant="ghost" size="icon" aria-label="Cerrar menú" onClick={() => setOpen(false)}><X /></Button>
 </div>
 {nav}
 </aside>
 </div>
 )}

 <div className="flex min-w-0 flex-1 flex-col">
 <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 sm:px-6">
 <div className="flex items-center gap-3">
 <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menú" onClick={() => setOpen(true)}><Menu /></Button>
 <h1 className="text-lg font-bold tracking-tight">{title}</h1>
 </div>
 <div className="flex items-center gap-3">
 <span className="hidden text-sm text-muted-foreground sm:block">{activeWorker?.name}</span>
 <ThemeToggle />
 <Button variant="outline" size="sm" onClick={() => { logout(); navigate('/') }}>
 <LogOut /> Salir
 </Button>
 </div>
 </header>
 <main className="flex-1 overflow-y-auto">
 <div className="mx-auto w-full max-w-7xl p-4 sm:p-6">{children}</div>
 </main>
 </div>
 </div>
 )
}
