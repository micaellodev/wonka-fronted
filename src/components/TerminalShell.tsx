import { type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Gamepad2, LayoutDashboard, LogOut, Monitor } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import { CASH_LABEL, useCashStatusStore } from '@/store/cashStatusStore'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useCan } from '@/lib/permissions'

type ActiveSection = 'pos' | 'sales-history' | 'sales-stats' | 'cash-history' | 'movimientos-caja' | 'cash-close' | 'reports' | 'register-client' | 'playzone'

interface TerminalShellProps {
 children: ReactNode
 activeSection?: ActiveSection
}

export function TerminalShell({ children, activeSection }: TerminalShellProps) {
 const location = useLocation()
 const navigate = useNavigate()
 const { activeWorker, logout } = useAuthStore()
 const { canEnterAdmin } = useCan()
 // Opening amount and status come from the shared cash store (backend summary, auto-refreshed)
 const cash = useCashStatusStore((st) => st.summary)
 const routeSection = getSectionFromPath(location.pathname)
 const effectiveSection = activeSection ?? routeSection

 const handleLogout = () => {
 logout()
 navigate('/')
 }

 // Dentro de /admin el AdminLayout ya aporta navegación y cabecera
 if (location.pathname.startsWith('/admin')) return <>{children}</>

 return (
 <div className="flex min-h-screen flex-col bg-muted text-foreground">
 <header className="flex shrink-0 items-center justify-between border-b border-border bg-background px-4 py-3 sm:px-6">
 <div className="flex items-center gap-3">
 <Logo variant="full" className="h-10 w-auto" />
 <div className="hidden sm:block">
 <p className="text-sm font-bold tracking-wide text-foreground">Punto de venta</p>
 <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Wonka</p>
 </div>
 </div>

 <div className="flex items-center gap-2 sm:gap-3">
 <div className="hidden rounded-lg border border-border bg-muted px-3 py-2 text-right sm:block">
 <span className="block text-[11px] font-bold uppercase text-muted-foreground">Apertura</span>
 <span className="font-mono text-sm font-black text-foreground">{cash ? (cash.opening?.amount ?? 0) : '—'}</span>
 <span className="block text-[11px] font-semibold uppercase text-muted-foreground">{cash ? CASH_LABEL[cash.cashStatus] : 'Consultando...'}</span>
 </div>
 {canEnterAdmin ? (
 <Button variant="outline" size="sm" onClick={() => navigate('/admin')}>
 <LayoutDashboard className="mr-2 h-4 w-4" />
 Admin
 </Button>
 ) : null}
 <ThemeToggle />
 <Button variant="outline" size="icon" onClick={handleLogout} title="Cerrar sesión">
 <LogOut className="h-4 w-4" />
 </Button>
 </div>
 </header>

 <div className="flex flex-1 overflow-hidden">
 <aside className="hidden w-65 shrink-0 flex-col border-r border-border bg-background md:flex">
 <div className="flex-1 overflow-y-auto py-2">
 <SectionGroup
 icon={<Monitor className="h-5 w-5 text-destructive" />}
 label="Punto de venta"
 items={[
 { label: 'Caja', to: '/pos', active: effectiveSection === 'pos' },
 { label: 'Historial de ventas', to: '/sales-history', active: effectiveSection === 'sales-history' },
 { label: 'Estadísticas de venta', to: '/estadisticas-venta', active: effectiveSection === 'sales-stats' },
 { label: 'Movimientos de caja', to: '/movimientos-caja', active: effectiveSection === 'movimientos-caja' || effectiveSection === 'cash-history' },
 { label: 'Apertura y cierre de caja', to: '/cash-close', active: effectiveSection === 'cash-close' },
 { label: 'Reporte cierre/turno', to: '/reporte-cierre-turno', active: effectiveSection === 'reports' },
 ]}
 />

 <SectionGroup
 icon={<Gamepad2 className="h-5 w-5 text-destructive" />}
 label="Juegos"
 items={[
 { label: 'Registrar cliente', to: '/register-client', active: effectiveSection === 'register-client' },
 { label: 'Tiempos', to: '/playzone', active: effectiveSection === 'playzone' },
 ]}
 />
 </div>

 <div className="border-t border-border p-4">
 <div className="rounded-lg bg-muted p-3">
 <p className="text-[11px] uppercase text-muted-foreground">Cajero</p>
 <p className="text-sm font-bold text-foreground">{activeWorker?.name ?? 'Sin sesión'}</p>
 </div>
 </div>
 </aside>

 <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
 </div>
 </div>
 )
}

function SectionGroup({
 icon,
 label,
 items,
}: {
 icon: ReactNode
 label: string
 items: Array<{ label: string; to: string; active?: boolean }>
}) {
 const navigate = useNavigate()

 return (
 <div className="px-3 py-2">
 <button className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted">
 <div className="flex items-center gap-3">
 {icon}
 <span className="text-sm font-bold text-foreground">{label}</span>
 </div>
 </button>
 <div className="mt-1 space-y-0.5">
 {items.map((item) => (
 <button
 key={item.label}
 onClick={() => navigate(item.to)}
 className={cn(
 'w-full rounded-md px-4 py-2 text-left text-sm transition-colors',
 item.active ? 'bg-danger-soft font-medium text-destructive' : 'text-muted-foreground hover:bg-muted',
 )}
 >
 {item.label}
 </button>
 ))}
 </div>
 </div>
 )
}

function getSectionFromPath(pathname: string): ActiveSection | undefined {
 if (pathname === '/pos') return 'pos'
 if (pathname === '/sales-history') return 'sales-history'
 if (pathname === '/estadisticas-venta') return 'sales-stats'
 if (pathname === '/movimientos-caja' || pathname === '/admin/cash-history') return 'movimientos-caja'
 if (pathname === '/cash-close') return 'cash-close'
 if (pathname === '/reporte-cierre-turno' || pathname === '/admin/reports') return 'reports'
 if (pathname === '/register-client') return 'register-client'
 if (pathname === '/playzone') return 'playzone'
 return undefined
}