import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { apiErrorMessage } from '@/lib/api-error'
import { useAuthStore } from '@/store/authStore'
import { useCan } from '@/lib/permissions'
import { CASH_LABEL, useCashStatusStore, type CashStatus } from '@/store/cashStatusStore'
import { CashOpeningModal } from '@/components/CashOpeningModal'
import { Button } from '@/components/ui/button'


export function CashDrawerGuard() {
 const { tenantId, activeWorker } = useAuthStore()
 const { canEnterAdmin } = useCan()
 const refreshCash = useCashStatusStore((s) => s.refresh)
 const navigate = useNavigate()

 const [loading, setLoading] = useState(true)
 const [showModal, setShowModal] = useState(false)
 const [blockedStatus, setBlockedStatus] = useState<CashStatus | null>(null)
 const [submitLoading, setSubmitLoading] = useState(false)
 const [error, setError] = useState<string | null>(null)

 const goHome = useCallback(() => {
 navigate(canEnterAdmin ? '/admin' : '/pos')
 }, [canEnterAdmin, navigate])

 // The opening lives in the backend (one per shift); the store is only a cache.
 const checkCashDrawer = useCallback(async () => {
 if (!tenantId || !activeWorker) return
 setLoading(true)
 setError(null)
 try {
 const { data, error: apiError } = await api.cash['opening-today'].get({ query: { tenantId } })
 if (apiError) throw apiError
 const d = data?.data
 void refreshCash(tenantId)
 if (d?.cashStatus === 'ABIERTA') {
 goHome()
 return
 }
 // Turno cerrado: si está aprobado se puede abrir uno nuevo; si está pendiente, hay que esperar la aprobación
 if (d?.cashStatus === 'PENDIENTE' || d?.cashStatus === 'CERRADA') {
 setBlockedStatus(d.cashStatus)
 return
 }
 setShowModal(true)
 } catch (err) {
 setError(apiErrorMessage(err))
 } finally {
 setLoading(false)
 }
 }, [tenantId, activeWorker, refreshCash, goHome])

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
 void data
 void refreshCash(tenantId)
 goHome()
 } catch (err) {
 setError(apiErrorMessage(err))
 } finally {
 setSubmitLoading(false)
 }
 }

 const Loader = ({ label }: { label: string }) => (
 <div className="fixed inset-0 bg-muted flex items-center justify-center">
 <div className="flex flex-col items-center gap-4">
 <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
 <p className="text-muted-foreground text-sm">{label}</p>
 </div>
 </div>
 )

 if (loading) return <Loader label="Verificando apertura de caja..." />
 if (blockedStatus) {
 const isAdmin = canEnterAdmin
 return (
 <div className="fixed inset-0 bg-muted flex items-center justify-center p-4">
 <div className="flex flex-col items-center gap-4 text-center">
 <p className="text-base font-semibold text-foreground">El turno de caja está {CASH_LABEL[blockedStatus].toLowerCase()}.</p>
 <p className="text-sm text-muted-foreground">
 {blockedStatus === 'CERRADA'
 ? 'Para seguir vendiendo abre un turno nuevo.'
 : 'Un administrador debe aprobar el cierre antes de abrir un turno nuevo.'}
 </p>
 <div className="flex gap-2">
 {blockedStatus === 'CERRADA' && (
 <Button onClick={() => { setBlockedStatus(null); setShowModal(true) }}>Abrir turno nuevo</Button>
 )}
 <Button variant="outline" onClick={() => navigate('/cash-close')}>Ver cierre de caja</Button>
 {isAdmin && <Button onClick={() => navigate('/admin')}>Panel admin</Button>}
 </div>
 </div>
 </div>
 )
 }
 if (showModal) return <CashOpeningModal onConfirm={handleOpeningBalance} isLoading={submitLoading} defaultAmount={null} serverError={error} />
 if (error) {
 return (
 <div className="fixed inset-0 bg-muted flex items-center justify-center p-4">
 <div className="flex flex-col items-center gap-4 text-center">
 <p className="text-sm text-destructive">{error}</p>
 <Button onClick={checkCashDrawer}>Reintentar</Button>
 </div>
 </div>
 )
 }
 return <Loader label="Redirigiendo..." />
}
