// ============================================================
// App — Root router
// ============================================================

import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { TitleBar } from '@/components/TitleBar'
import { Toaster } from '@/components/ui/toast'
import { UpdateBanner } from '@/components/UpdateBanner'
import { LoginScreen } from '@/pages/LoginScreen'
import { POSScreen } from '@/pages/POSScreen'
import { InventoryScreen } from '@/pages/InventoryScreen'
import { EmployeesScreen } from '@/pages/EmployeesScreen'
import { ReportsScreen } from '@/pages/ReportsScreen'
import { CashCloseHistoryScreen } from '@/pages/CashCloseHistoryScreen'
import { CashMovementsScreen } from '@/pages/CashMovementsScreen'
import { PlayZoneScreen } from '@/pages/PlayZoneScreen'
import { RegisterClientScreen } from '@/pages/RegisterClientScreen'
import { BillingNotesScreen } from '@/pages/BillingNotesScreen'
import { AdminDashboardScreen } from '@/pages/AdminDashboardScreen'
import { CompanySettingsScreen } from '@/pages/CompanySettingsScreen'
import { ApprovalsScreen } from '@/pages/ApprovalsScreen'
import { CashCloseScreen } from '@/pages/CashCloseScreen'
import { SalesHistoryScreen } from '@/pages/SalesHistoryScreen'
import { SalesStatisticsScreen } from '@/pages/SalesStatisticsScreen'
import { AdminLayout } from '@/components/AdminLayout'
import { CashDrawerGuard } from '@/components/CashDrawerGuard'
import { useAuthStore } from '@/store/authStore'
import { useCan } from '@/lib/permissions'
import { useAdminStore } from '@/store/adminStore'
import { useCashStatusStore } from '@/store/cashStatusStore'

/** Redirects to /cash-guard after successful login */
function RootRedirect() {
 const activeWorker = useAuthStore((s) => s.activeWorker)
 if (!activeWorker) return <LoginScreen />
 return <Navigate to="/cash-guard" replace />
}

/** Redirects to appropriate screen after login with cash drawer check */
function CashDrawerGuardRoute() {
 const activeWorker = useAuthStore((s) => s.activeWorker)
 return activeWorker ? <CashDrawerGuard /> : <Navigate to="/" replace />
}

/** Guards /pos — unauthenticated users are sent back to login */
function PosGuard() {
 const activeWorker = useAuthStore((s) => s.activeWorker)
 return activeWorker ? <POSScreen /> : <Navigate to="/" replace />
}

/** Guards routes accessible to ANY logged-in worker (not admin-only) */
function WorkerGuard({ children }: { children: React.ReactNode }) {
 const activeWorker = useAuthStore((s) => s.activeWorker)
 return activeWorker ? <>{children}</> : <Navigate to="/" replace />
}

/** Guards /admin — ADMIN/ADMINISTRADOR o un rol con permisos de back-office; cada pantalla exige su permiso */
function AdminGuard({ children }: { children: React.ReactNode }) {
 return <AdminAuth><AdminLayout>{children}</AdminLayout></AdminAuth>
}

function AdminAuth({ children }: { children: React.ReactNode }) {
 const activeWorker = useAuthStore((s) => s.activeWorker)
 const isAdminAuthenticated = useAdminStore((s) => s.isAdminAuthenticated)
 const { canEnterAdmin, canRoute } = useCan()
 const { pathname } = useLocation()
 if (!activeWorker) return <Navigate to="/" replace />
 if (!(canEnterAdmin || isAdminAuthenticated)) return <Navigate to="/pos" replace />
 // Roles con permisos parciales (GERENTE, COCINA): solo las pantallas de su permiso
 return canRoute(pathname) || isAdminAuthenticated ? <>{children}</> : <Navigate to="/admin" replace />
}

/** Keeps the shared cash status fresh for every screen (cashier and admin): interval + focus. */
function CashStatusSync() {
 const tenantId = useAuthStore((s) => s.tenantId)
 const loggedIn = useAuthStore((s) => !!s.activeWorker)
 const refresh = useCashStatusStore((s) => s.refresh)
 const reset = useCashStatusStore((s) => s.reset)
 useEffect(() => {
 if (!loggedIn || !tenantId) { reset(); return }
 const tick = () => { if (document.visibilityState === 'visible') void refresh(tenantId) }
 tick()
 const id = setInterval(tick, 15_000)
 document.addEventListener('visibilitychange', tick)
 window.addEventListener('focus', tick)
 return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); window.removeEventListener('focus', tick) }
 }, [loggedIn, tenantId, refresh, reset])
 return null
}

export default function App() {
 return (
 <div className="h-screen flex flex-col">
 <TitleBar />
 <Toaster />
 <UpdateBanner />
 <BrowserRouter>
 <CashStatusSync />
 <div className="flex-1 overflow-hidden">
 <Routes>
 <Route path="/" element={<RootRedirect />} />
 <Route path="/cash-guard" element={<CashDrawerGuardRoute />} />
  <Route path="/pos" element={<PosGuard />} />
  <Route path="/sales-history" element={<WorkerGuard><SalesHistoryScreen /></WorkerGuard>} />
    <Route path="/register-client" element={<WorkerGuard><RegisterClientScreen /></WorkerGuard>} />
  <Route path="/playzone" element={<WorkerGuard><PlayZoneScreen /></WorkerGuard>} />
  <Route path="/cash-close" element={<WorkerGuard><CashCloseScreen /></WorkerGuard>} />
  <Route path="/movimientos-caja" element={<WorkerGuard><CashMovementsScreen /></WorkerGuard>} />
  <Route path="/reporte-cierre-turno" element={<WorkerGuard><ReportsScreen /></WorkerGuard>} />
  <Route path="/estadisticas-venta" element={<WorkerGuard><SalesStatisticsScreen /></WorkerGuard>} />

 {/* Admin Routes */}
 <Route path="/admin" element={<AdminGuard><AdminDashboardScreen /></AdminGuard>} />
 <Route path="/admin/company" element={<AdminGuard><CompanySettingsScreen /></AdminGuard>} />
 <Route path="/admin/approvals" element={<AdminGuard><ApprovalsScreen /></AdminGuard>} />
 <Route path="/admin/inventory" element={<AdminGuard><InventoryScreen /></AdminGuard>} />
 <Route path="/admin/employees" element={<AdminGuard><EmployeesScreen /></AdminGuard>} />
 <Route path="/admin/reports" element={<AdminGuard><ReportsScreen /></AdminGuard>} />
 <Route path="/admin/cashier" element={<AdminGuard><CashCloseHistoryScreen /></AdminGuard>} />
 <Route path="/admin/cash-history" element={<Navigate to="/admin/cashier" replace />} />
 <Route path="/admin/playzone" element={<AdminGuard><PlayZoneScreen /></AdminGuard>} />
 <Route path="/admin/billing-notes" element={<AdminGuard><BillingNotesScreen /></AdminGuard>} />

 <Route path="*" element={<Navigate to="/" replace />} />
 </Routes>
 </div>
 </BrowserRouter>
 </div>
 )
}
