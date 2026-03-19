import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useCashDrawerStore } from '@/store/cashDrawerStore'
import { CashOpeningModal } from '@/components/CashOpeningModal'

export function CashDrawerGuard() {
  const { tenantId, activeWorker } = useAuthStore()
  const { setOpening, carryOverBalance, requireManualOpening, openingBalance } = useCashDrawerStore()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)

  useEffect(() => {
    const checkCashDrawer = () => {
      if (!tenantId || !activeWorker) return
      if (requireManualOpening || openingBalance === null) {
        setShowModal(true)
        setLoading(false)
        return
      }
      setTimeout(() => {
        navigate(activeWorker?.role?.name === 'ADMIN' || activeWorker?.role?.name === 'ADMINISTRADOR' ? '/admin' : '/pos')
      }, 300)
      setLoading(false)
    }
    checkCashDrawer()
  }, [tenantId, activeWorker, setOpening, navigate, requireManualOpening, openingBalance])

  const handleOpeningBalance = async (amount: number) => {
    setSubmitLoading(true)
    try {
      if (!tenantId || !activeWorker?.id) return
      setOpening(tenantId, activeWorker.id, amount)
      setTimeout(() => {
        navigate(activeWorker?.role?.name === 'ADMIN' || activeWorker?.role?.name === 'ADMINISTRADOR' ? '/admin' : '/pos')
      }, 300)
    } catch (error) {
      console.error('Error setting opening balance:', error)
    } finally {
      setSubmitLoading(false)
    }
  }

  const Loader = ({ label }: { label: string }) => (
    <div className="fixed inset-0 bg-zinc-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-7 h-7 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-zinc-500 text-sm">{label}</p>
      </div>
    </div>
  )

  if (loading) return <Loader label="Verificando apertura de caja..." />
  if (showModal) return <CashOpeningModal onConfirm={handleOpeningBalance} isLoading={submitLoading} defaultAmount={carryOverBalance} />
  return <Loader label="Redirigiendo..." />
}
