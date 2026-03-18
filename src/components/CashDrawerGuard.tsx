import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useCashDrawerStore } from '@/store/cashDrawerStore'
import { CashOpeningModal } from '@/components/CashOpeningModal'

/**
 * CashDrawerGuard
 * ─────────────────────────────────────────────
 * Gate component that ensures cash drawer is opened before allowing POS access.
 * Rendered after login, before allowing navigation to /pos or other screens.
 */
export function CashDrawerGuard() {
  const { tenantId, activeWorker } = useAuthStore()
  const { setOpening, carryOverBalance, requireManualOpening, openingBalance } = useCashDrawerStore()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)

  // ── On mount: check if cash drawer is opened today ────────
  useEffect(() => {
    const checkCashDrawer = () => {
      if (!tenantId || !activeWorker) return

      // Force manual opening after an end-of-day close.
      if (requireManualOpening || openingBalance === null) {
        setShowModal(true)
        setLoading(false)
        return
      }

      // Opening already set in local store for current session/day
      setTimeout(() => {
        navigate(activeWorker?.role?.name === 'ADMIN' || activeWorker?.role?.name === 'ADMINISTRADOR' ? '/admin' : '/pos')
      }, 300)
      setLoading(false)
    }

    checkCashDrawer()
  }, [tenantId, activeWorker, setOpening, navigate, requireManualOpening, openingBalance])

  // ── Handle opening balance submission ──────────────────────
  const handleOpeningBalance = async (amount: number) => {
    setSubmitLoading(true)
    try {
      if (!tenantId || !activeWorker?.id) return

      // Store in local store
      setOpening(tenantId, activeWorker.id, amount)

      // Navigate to destination
      setTimeout(() => {
        navigate(activeWorker?.role?.name === 'ADMIN' || activeWorker?.role?.name === 'ADMINISTRADOR' ? '/admin' : '/pos')
      }, 300)
    } catch (error) {
      console.error('Error setting opening balance:', error)
    } finally {
      setSubmitLoading(false)
    }
  }

  // Show loading state while checking
  if (loading) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400">Verificando apertura de caja...</p>
        </div>
      </div>
    )
  }

  // Show modal if needed
  if (showModal) {
    return <CashOpeningModal onConfirm={handleOpeningBalance} isLoading={submitLoading} defaultAmount={carryOverBalance} />
  }

  // Already opened, redirect in progress
  return (
    <div className="fixed inset-0 bg-slate-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-400">Redirigiendo...</p>
      </div>
    </div>
  )
}
