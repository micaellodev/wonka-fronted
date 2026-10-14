import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { useCashDrawerStore } from '@/store/cashDrawerStore'
import { CashOpeningModal } from '@/components/CashOpeningModal'
import { Button } from '@/components/ui/button'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const apiErrorMessage = (e: any) => e?.value?.message ?? e?.value?.error ?? 'No se pudo conectar con el servidor.'

export function CashDrawerGuard() {
 const { tenantId, activeWorker } = useAuthStore()
 const { setOpening, carryOverBalance } = useCashDrawerStore()
 const navigate = useNavigate()

 const [loading, setLoading] = useState(true)
 const [showModal, setShowModal] = useState(false)
 const [submitLoading, setSubmitLoading] = useState(false)
 const [error, setError] = useState<string | null>(null)

 const goHome = useCallback(() => {
 const role = activeWorker?.role?.name
 navigate(role === 'ADMIN' || role === 'ADMINISTRADOR' ? '/admin' : '/pos')
 }, [activeWorker, navigate])

 // The opening lives in the backend (one per Lima day); the store is only a cache.
 const checkCashDrawer = useCallback(async () => {
 if (!tenantId || !activeWorker) return
 setLoading(true)
 setError(null)
 try {
 const { data, error: apiError } = await api.cash['opening-today'].get({ query: { tenantId } })
 if (apiError) throw apiError
 const d = data?.data
 if (d?.isOpened) {
 setOpening(tenantId, activeWorker.id, Number(d.openingBalance ?? 0), d.openedAt ?? undefined)
 goHome()
 return
 }
 setShowModal(true)
 } catch (err) {
 setError(apiErrorMessage(err))
 } finally {
 setLoading(false)
 }
 }, [tenantId, activeWorker, setOpening, goHome])

 useEffect(() => {
 checkCashDrawer()
 }, [checkCashDrawer])

 const handleOpeningBalance = async (amount: number) => {
 if (!tenantId || !activeWorker?.id) return
 setSubmitLoading(true)
 setError(null)
 try {
 const { data, error: apiError } = await api.cash.opening.post({ tenantId, workerId: activeWorker.id, amount })
 if (apiError) {
 // Someone else opened the drawer meanwhile: adopt the existing opening
 if (apiError.status === 409) return void (await checkCashDrawer())
 throw apiError
 }
 setOpening(tenantId, activeWorker.id, Number(data.data.openingBalance), data.data.openedAt)
 goHome()
 } catch (err) {
 setError(apiErrorMessage(err))
 } finally {
 setSubmitLoading(false)
 }
 }

 const Loader = ({ label }: { label: string }) => (
 <div className="fixed inset-0 bg-gray-50 flex items-center justify-center">
 <div className="flex flex-col items-center gap-4">
 <div className="w-7 h-7 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
 <p className="text-gray-400 text-sm">{label}</p>
 </div>
 </div>
 )

 if (loading) return <Loader label="Verificando apertura de caja..." />
 if (showModal) return <CashOpeningModal onConfirm={handleOpeningBalance} isLoading={submitLoading} defaultAmount={carryOverBalance} serverError={error} />
 if (error) {
 return (
 <div className="fixed inset-0 bg-gray-50 flex items-center justify-center p-4">
 <div className="flex flex-col items-center gap-4 text-center">
 <p className="text-sm text-red-600">{error}</p>
 <Button onClick={checkCashDrawer}>Reintentar</Button>
 </div>
 </div>
 )
 }
 return <Loader label="Redirigiendo..." />
}
