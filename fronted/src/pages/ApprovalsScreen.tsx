import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, Receipt, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { PinPad } from '@/components/PinPad'
import { formatCurrency, formatTime } from '@/lib/format'

// ============================================================
// ApprovalsScreen — Approve sale voids with owner/admin approval code
// ============================================================

interface VoidRequest {
 id: string
 reason: string
 status: 'PENDING' | 'APPROVED' | 'REJECTED'
 requestedAt: string
 resolvedAt: string | null
 requester: { name: string }
 approver: { name: string } | null
 sale: {
 id: string
 total: number
 tipoComprobante: string
 serie: string | null
 correlativo: string | null
 createdAt: string
 items: Array<{ qty: number; product: { name: string } }>
 }
 creditNoteSerie: string | null
 creditNoteCorrelativo: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const apiErrorMessage = (e: any): string => e?.value?.message ?? e?.value?.error ?? 'Error de conexión'

export function ApprovalsScreen() {
 const { activeWorker, tenantId } = useAuthStore()
 const [requests, setRequests] = useState<VoidRequest[]>([])
 const [loading, setLoading] = useState(true)
 const [selectedRequest, setSelectedRequest] = useState<VoidRequest | null>(null)
 const [processing, setProcessing] = useState(false)
 const [pinError, setPinError] = useState<string | null>(null)
 const [loadError, setLoadError] = useState<string | null>(null)
 const [resultMessage, setResultMessage] = useState<string | null>(null)
 const [rejectingRequest, setRejectingRequest] = useState<VoidRequest | null>(null)
 const [rejectProcessing, setRejectProcessing] = useState(false)
 const [rejectPinError, setRejectPinError] = useState<string | null>(null)
 const [rejectResultMessage, setRejectResultMessage] = useState<string | null>(null)

 const fetchRequests = async () => {
 setLoadError(null)
 try {
 const { data, error } = await api.pos.void.get({
 query: { tenantId, status: 'PENDING' },
 })
 if (error) throw error
 setRequests((data?.data as VoidRequest[]) ?? [])
 } catch (err) {
 setLoadError(apiErrorMessage(err))
 } finally {
 setLoading(false)
 }
 }

 useEffect(() => {
 fetchRequests()
 }, [tenantId])

 const handleApprove = async (pin: string) => {
 if (!selectedRequest || !activeWorker) return
 setProcessing(true)
 setPinError(null)
 setResultMessage(null)

 try {
 const { data, error } = await api.pos.void({ id: selectedRequest.id }).resolve.post({
 tenantId,
 approverCode: pin,
 approve: true,
 })

 if (error) {
 setPinError(apiErrorMessage(error))
 return
 }

 const resolved = data?.data as VoidRequest | undefined
 if (resolved?.creditNoteSerie && resolved?.creditNoteCorrelativo) {
 setResultMessage(
 `Nota de Crédito ${resolved.creditNoteSerie}-${resolved.creditNoteCorrelativo} generada y aceptada por SUNAT.`
 )
 } else {
 setResultMessage('Anulación aprobada correctamente.')
 }

 setTimeout(() => {
 setSelectedRequest(null)
 setResultMessage(null)
 fetchRequests()
 }, 2000)
 } catch (err) {
 setPinError(apiErrorMessage(err))
 } finally {
 setProcessing(false)
 }
 }

 const handleRejectConfirm = async (pin: string) => {
 if (!rejectingRequest || !activeWorker) return
 setRejectProcessing(true)
 setRejectPinError(null)
 setRejectResultMessage(null)

 try {
 const { error } = await api.pos.void({ id: rejectingRequest.id }).resolve.post({
 tenantId,
 approverCode: pin,
 approve: false,
 })

 if (error) {
 setRejectPinError(apiErrorMessage(error))
 return
 }

 setRejectResultMessage('Solicitud rechazada correctamente.')
 setTimeout(() => {
 setRejectingRequest(null)
 setRejectResultMessage(null)
 fetchRequests()
 }, 1500)
 } catch (err) {
 setRejectPinError(apiErrorMessage(err))
 } finally {
 setRejectProcessing(false)
 }
 }

 const saleLabel = (sale: VoidRequest['sale']) => {
 if (sale.tipoComprobante === 'TICKET') return `TICKET #${sale.id.slice(-6)}`
 return `${sale.tipoComprobante} ${sale.serie}-${sale.correlativo}`
 }

 return (
  <div>
 {/* Header */}
 <header className="mb-6 flex items-center justify-between">
 <div className="flex items-center gap-3">
 <p className="text-sm text-muted-foreground">Aprueba o rechaza anulaciones de ventas</p>
 </div>
 </header>

 {/* Content */}
 {loading ? (
 <div className="space-y-4">
 <Skeleton className="h-24 rounded-xl bg-white" />
 <Skeleton className="h-24 rounded-xl bg-white" />
 </div>
 ) : loadError ? (
 <Card className="bg-white border-gray-200 rounded-xl">
 <CardContent className="py-12 text-center space-y-3">
 <p className="text-destructive">No se pudieron cargar las solicitudes: {loadError}</p>
 <Button variant="outline" onClick={() => { setLoading(true); fetchRequests() }}>Reintentar</Button>
 </CardContent>
 </Card>
 ) : requests.length === 0 ? (
 <Card className="bg-white border-gray-200 rounded-xl">
 <CardContent className="py-12 text-center">
 <Receipt className="w-12 h-12 mx-auto text-gray-500 mb-3" />
 <p className="text-gray-500">No hay solicitudes de anulación pendientes.</p>
 </CardContent>
 </Card>
 ) : (
 <div className="space-y-4">
 {requests.map((request) => (
 <Card key={request.id} className="bg-white border-gray-200 rounded-xl">
 <CardContent className="p-5">
 <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
 <div className="space-y-1">
 <div className="flex items-center gap-2">
 <Badge variant="warning">Pendiente</Badge>
 <span className="text-sm text-gray-500">
 {formatTime(request.requestedAt)}
 </span>
 </div>
 <p className="text-lg font-semibold">
 {saleLabel(request.sale)} — {formatCurrency(request.sale.total)}
 </p>
 <p className="text-sm text-gray-500">
 Cajero: {request.requester.name} · Motivo: {request.reason}
 </p>
 <p className="text-xs text-gray-400">
 {request.sale.items
 .map((item) => `${item.qty}x ${item.product.name}`)
 .join(', ')}
 </p>
 </div>
 <div className="flex items-center gap-2">
 <Button
 variant="outline"
 className="border-destructive/30 text-destructive hover:bg-danger-soft"
 onClick={() => {
 setRejectingRequest(request)
 setRejectPinError(null)
 setRejectResultMessage(null)
 }}
 >
 <XCircle className="w-4 h-4 mr-2" />
 Rechazar
 </Button>
 <Button
 className="bg-secondary-500 hover:bg-secondary-600"
 onClick={() => {
 setSelectedRequest(request)
 setPinError(null)
 setResultMessage(null)
 }}
 >
 <CheckCircle2 className="w-4 h-4 mr-2" />
 Aprobar
 </Button>
 </div>
 </div>
 </CardContent>
 </Card>
 ))}
 </div>
 )}

 {/* Approval modal */}
 {selectedRequest && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/80 p-4">
 <Card className="w-full max-w-md bg-white border-gray-200 rounded-xl">
 <CardHeader>
 <CardTitle className="text-center text-lg">
 Aprobar anulación
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-6">
 <div className="text-center text-sm text-gray-500">
 <p className="font-medium text-gray-700">
 {saleLabel(selectedRequest.sale)} — {formatCurrency(selectedRequest.sale.total)}
 </p>
 <p>Motivo: {selectedRequest.reason}</p>
 </div>

 {resultMessage ? (
 <div className="rounded-lg bg-secondary-500/20 text-secondary-500 px-4 py-3 text-center text-sm">
 {resultMessage}
 </div>
 ) : (
 <>
 <p className="text-center text-sm text-gray-500">
 Ingrese el código de aprobación del dueño para confirmar
 </p>
 <PinPad
 onComplete={handleApprove}
 disabled={processing}
 hasError={!!pinError}
 length={6}
 />
 {pinError && (
 <p className="text-center text-sm text-brand-500">{pinError}</p>
 )}
 {processing && (
 <div className="flex justify-center">
 <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
 </div>
 )}
 </>
 )}

 <Button
 variant="outline"
 className="w-full"
 onClick={() => {
 if (!processing) {
 setSelectedRequest(null)
 setPinError(null)
 setResultMessage(null)
 }
 }}
 disabled={processing}
 >
 Cerrar
 </Button>
 </CardContent>
 </Card>
 </div>
 )}

 {/* Reject modal */}
 {rejectingRequest && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/80 p-4">
 <Card className="w-full max-w-md bg-white border-gray-200 rounded-xl">
 <CardHeader>
 <CardTitle className="text-center text-lg">
 Rechazar anulación
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-6">
 <div className="text-center text-sm text-gray-500">
 <p className="font-medium text-gray-700">
 {saleLabel(rejectingRequest.sale)} — {formatCurrency(rejectingRequest.sale.total)}
 </p>
 <p>Motivo: {rejectingRequest.reason}</p>
 </div>

 {rejectResultMessage && rejectResultMessage.startsWith('Error') ? (
 <div className="rounded-lg bg-danger-soft text-destructive px-4 py-3 text-center text-sm">
 {rejectResultMessage}
 </div>
 ) : rejectResultMessage ? (
 <div className="rounded-lg bg-secondary-500/20 text-secondary-500 px-4 py-3 text-center text-sm">
 {rejectResultMessage}
 </div>
 ) : (
 <>
 <p className="text-center text-sm text-gray-500">
 Ingrese el código de aprobación del dueño para confirmar el rechazo
 </p>
 <PinPad
 onComplete={handleRejectConfirm}
 disabled={rejectProcessing}
 hasError={!!rejectPinError}
 length={6}
 />
 {rejectPinError && (
 <p className="text-center text-sm text-brand-500">{rejectPinError}</p>
 )}
 {rejectProcessing && (
 <div className="flex justify-center">
 <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
 </div>
 )}
 </>
 )}

 <Button
 variant="outline"
 className="w-full"
 onClick={() => {
 if (!rejectProcessing) {
 setRejectingRequest(null)
 setRejectPinError(null)
 setRejectResultMessage(null)
 }
 }}
 disabled={rejectProcessing}
 >
 Cerrar
 </Button>
 </CardContent>
 </Card>
 </div>
 )}
 </div>
 )
}
