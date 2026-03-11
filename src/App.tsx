// ============================================================
//  App — Root router
// ============================================================

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { LoginScreen } from '@/pages/LoginScreen'
import { POSScreen } from '@/pages/POSScreen'
import { AdminScreen } from '@/pages/AdminScreen'
import { InventoryScreen } from '@/pages/InventoryScreen'
import { EmployeesScreen } from '@/pages/EmployeesScreen'
import { ReportsScreen } from '@/pages/ReportsScreen'
import { CashierScreen } from '@/pages/CashierScreen'
import { PlayZoneScreen } from '@/pages/PlayZoneScreen'
import { SplashScreen } from '@/pages/Splash'
import { useAuthStore } from '@/store/authStore'

function SplashGuard() {
  return <SplashScreen />
}

/** Redirects to /pos if a worker is already authenticated */
function RootRedirect() {
  const activeWorker = useAuthStore((s) => s.activeWorker)
  if (!activeWorker) return <LoginScreen />

  // If the user has an admin role, send them to admin default. 
  // Otherwise, POS.
  const isAdmin = activeWorker.role?.name === 'ADMIN' || activeWorker.role?.name === 'ADMINISTRADOR'
  return isAdmin ? <Navigate to="/admin" replace /> : <Navigate to="/pos" replace />
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
  if (!activeWorker) return <Navigate to="/" replace />
  const isAdmin = activeWorker.role?.name === 'ADMIN' || activeWorker.role?.name === 'ADMINISTRADOR'
  return isAdmin ? <>{children}</> : <Navigate to="/pos" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/splash" element={<SplashGuard />} />
        <Route path="/" element={<RootRedirect />} />
        <Route path="/pos" element={<PosGuard />} />
        <Route path="/playzone" element={<WorkerGuard><PlayZoneScreen /></WorkerGuard>} />

        {/* Admin Routes */}
        <Route path="/admin" element={<AdminGuard><AdminScreen /></AdminGuard>} />
        <Route path="/admin/inventory" element={<AdminGuard><InventoryScreen /></AdminGuard>} />
        <Route path="/admin/employees" element={<AdminGuard><EmployeesScreen /></AdminGuard>} />
        <Route path="/admin/reports" element={<AdminGuard><ReportsScreen /></AdminGuard>} />
        <Route path="/admin/cashier" element={<AdminGuard><CashierScreen /></AdminGuard>} />
        <Route path="/admin/playzone" element={<WorkerGuard><PlayZoneScreen /></WorkerGuard>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
