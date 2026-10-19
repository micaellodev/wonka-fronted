import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, Receipt, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { apiErrorMessage } from '@/lib/api-error'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
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

function VoidPinDialog({ open, title, prompt, request, label, resultMessage, processing, pinError, onPin, onClose }: {
 open: boolean
 title: string
 prompt: string
 request: VoidRequest | null
 label: (s: VoidRequest['sale']) => string
 resultMessage: string | null
 processing: boolean
 pinError: string | null
 onPin: (pin: string) => void
 onClose: () => void
}) {
 return (
 <Dialog open={open} onOpenChange={(o) => !o && !processing && onClose()}>
 <DialogContent size="md" showCloseButton={!processing}>
 <DialogHeader>
 <DialogTitle>{title}</DialogTitle>
 <DialogDescription>{request ? `${label(request.sale)} — ${formatCurrency(request.sale.total)} · Motivo: ${request.reason}` : ''}</DialogDescription>
 </DialogHeader>
 {resultMessage ? (
 <div role="status" className={`rounded-lg px-4 py-3 text-center text-sm ${resultMessage.startsWith('Error') ? 'bg-danger-soft text-destructive' : 'bg-success-soft text-success'}`}>
 {resultMessage}
 </div>
 ) : (
 <>
 <p className="text-center text-sm text-muted-foreground">{prompt}</p>
 <PinPad onComplete={onPin} disabled={processing} hasError={!!pinError} length={6} />
 {pinError && <p role="alert" className="text-center text-sm text-destructive">{pinError}</p>}
 {processing && (
 <div className="flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" aria-label="Procesando" /></div>
 )}
 </>
 )}
 <DialogFooter>
 <Button variant="outline" className="w-full" onClick={onClose} disabled={processing}>Cerrar</Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 )
}

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
 setLoadError(apiErrorMessage(err, 'Error de conexión'))
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
 setPinError(apiErrorMessage(error, 'Error de conexión'))
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
 setPinError(apiErrorMessage(err, 'Error de conexión'))
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
 setRejectPinError(apiErrorMessage(error, 'Error de conexión'))
 return
 }

 setRejectResultMessage('Solicitud rechazada correctamente.')
 setTimeout(() => {
 setRejectingRequest(null)
 setRejectResultMessage(null)
 fetchRequests()
 }, 1500)
 } catch (err) {
 setRejectPinError(apiErrorMessage(err, 'Error de conexión'))
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
 <Skeleton className="h-24 rounded-xl bg-muted" />
 <Skeleton className="h-24 rounded-xl bg-muted" />
 </div>
 ) : loadError ? (
 <Card className="bg-card border-border rounded-xl">
 <CardContent className="py-12 text-center space-y-3">
 <p className="text-destructive">No se pudieron cargar las solicitudes: {loadError}</p>
 <Button variant="outline" onClick={() => { setLoading(true); fetchRequests() }}>Reintentar</Button>
 </CardContent>
 </Card>
 ) : requests.length === 0 ? (
 <Card className="bg-card border-border rounded-xl">
 <CardContent className="py-12 text-center">
 <Receipt aria-hidden className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
 <p className="text-muted-foreground">No hay solicitudes de anulación pendientes.</p>
 </CardContent>
 </Card>
 ) : (
 <div className="space-y-4">
 {requests.map((request) => (
 <Card key={request.id} className="bg-card border-border rounded-xl">
 <CardContent className="p-5">
 <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
 <div className="space-y-1">
 <div className="flex items-center gap-2">
 <Badge variant="warning">Pendiente</Badge>
 <span className="text-sm text-muted-foreground">
 {formatTime(request.requestedAt)}
 </span>
 </div>
 <p className="text-lg font-semibold">
 {saleLabel(request.sale)} — {formatCurrency(request.sale.total)}
 </p>
 <p className="text-sm text-muted-foreground">
 Cajero: {request.requester.name} · Motivo: {request.reason}
 </p>
 <p className="text-xs text-muted-foreground">
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
 className="bg-success text-success-foreground hover:bg-success/90"
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

 <VoidPinDialog
 open={!!selectedRequest}
 title="Aprobar anulación"
 prompt="Ingrese el código de aprobación del dueño para confirmar"
 request={selectedRequest}
 label={saleLabel}
 resultMessage={resultMessage}
 processing={processing}
 pinError={pinError}
 onPin={handleApprove}
 onClose={() => { setSelectedRequest(null); setPinError(null); setResultMessage(null) }}
 />
 <VoidPinDialog
 open={!!rejectingRequest}
 title="Rechazar anulación"
 prompt="Ingrese el código de aprobación del dueño para confirmar el rechazo"
 request={rejectingRequest}
 label={saleLabel}
 resultMessage={rejectResultMessage}
 processing={rejectProcessing}
 pinError={rejectPinError}
 onPin={handleRejectConfirm}
 onClose={() => { setRejectingRequest(null); setRejectPinError(null); setRejectResultMessage(null) }}
 />
 </div>
 )
}
