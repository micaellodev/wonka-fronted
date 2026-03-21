// ============================================================
//  App — Root router
// ============================================================

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { LoginScreen } from '@/pages/LoginScreen'
import { POSScreen } from '@/pages/POSScreen'
import { InventoryScreen } from '@/pages/InventoryScreen'
import { EmployeesScreen } from '@/pages/EmployeesScreen'
import { ReportsScreen } from '@/pages/ReportsScreen'
import { CashierScreen } from '@/pages/CashierScreen'
import { CashCloseHistoryScreen } from '@/pages/CashCloseHistoryScreen'
import { PlayZoneScreen } from '@/pages/PlayZoneScreen'
import { SplashScreen } from '@/pages/Splash'
import { BillingNotesScreen } from '@/pages/BillingNotesScreen'
import { CashDrawerGuard } from '@/components/CashDrawerGuard'
import { useAuthStore } from '@/store/authStore'
import { useAdminStore } from '@/store/adminStore'

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

/** Guards /admin — only users with role ADMIN or ADMINISTRADOR can enter */
function AdminGuard({ children }: { children: React.ReactNode }) {
  const activeWorker = useAuthStore((s) => s.activeWorker)
  const isAdminAuthenticated = useAdminStore((s) => s.isAdminAuthenticated)
  if (!activeWorker) return <Navigate to="/" replace />
  const isAdmin = activeWorker.role?.name === 'ADMIN' || activeWorker.role?.name === 'ADMINISTRADOR'
  return isAdmin || isAdminAuthenticated ? <>{children}</> : <Navigate to="/pos" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/splash" element={<SplashScreen />} />
        <Route path="/" element={<RootRedirect />} />
        <Route path="/cash-guard" element={<CashDrawerGuardRoute />} />
        <Route path="/pos" element={<PosGuard />} />
        <Route path="/playzone" element={<WorkerGuard><PlayZoneScreen /></WorkerGuard>} />

        {/* Admin Routes */}
        <Route path="/admin" element={<AdminGuard><Navigate to="/pos" replace /></AdminGuard>} />
        <Route path="/admin/inventory" element={<AdminGuard><InventoryScreen /></AdminGuard>} />
        <Route path="/admin/employees" element={<AdminGuard><EmployeesScreen /></AdminGuard>} />
        <Route path="/admin/reports" element={<AdminGuard><ReportsScreen /></AdminGuard>} />
        <Route path="/admin/cashier" element={<AdminGuard><CashierScreen /></AdminGuard>} />
        <Route path="/admin/cash-history" element={<AdminGuard><CashCloseHistoryScreen /></AdminGuard>} />
        <Route path="/admin/playzone" element={<WorkerGuard><PlayZoneScreen /></WorkerGuard>} />
        <Route path="/admin/billing-notes" element={<AdminGuard><BillingNotesScreen /></AdminGuard>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
