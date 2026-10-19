// ============================================================
// Billing Notes Screen
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import { Plus, FileText, Search, Receipt, RefreshCw } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { api } from '@/lib/api'
import { toast } from '@/components/ui/toast'
import { formatPEN } from '@/lib/format'
import { CreateBillingNoteModal, type BillingNoteResult } from '@/components/CreateBillingNoteModal'

type BillingNote = {
 id: string
 createdAt: string
 type: 'CREDIT_NOTE' | 'DEBIT_NOTE'
 serie: string
 correlative: string
 modifiedDocumentSerie: string
 modifiedDocumentCorrelative: string
 clientName: string
 clientDocNumber: string
 totalAmount: string | number
 sunatStatus: string | null
 sunatResponse?: { error?: unknown; cdrResponse?: { description?: string } } | null
}

type Pending = { sales: number; notes: number }
type Flash = { type: 'success' | 'error' | 'warning'; text: string }
const showFlash = (f: Flash) => (f.type === 'success' ? toast.success : f.type === 'error' ? toast.error : toast.info)(f.text)

const STATUS: Record<string, { label: string; cls: string }> = {
 ACEPTADA: { label: 'Aceptada', cls: 'bg-success-soft text-success border-success/20' },
 RECHAZADA: { label: 'Rechazada', cls: 'bg-danger-soft text-destructive border-destructive/20' },
 PENDING_SUNAT: { label: 'Pendiente', cls: 'bg-warning-soft text-warning border-warning/30' },
 ENVIANDO: { label: 'Enviando', cls: 'bg-info-soft text-info border-info/20' },
}
const NOT_SENT = { label: 'No enviada', cls: 'bg-muted text-muted-foreground border-border' }

function sunatDetail(note: Pick<BillingNote, 'sunatResponse'>): string {
 const r = note.sunatResponse
 if (!r) return ''
 if (r.error) return typeof r.error === 'string' ? r.error : ((r.error as { message?: string }).message ?? '')
 return r.cdrResponse?.description ?? ''
}

export function BillingNotesScreen() {
 const { activeWorker, tenantId } = useAuthStore()

 const [notes, setNotes] = useState<BillingNote[]>([])
 const [pending, setPending] = useState<Pending>({ sales: 0, notes: 0 })
 const [loading, setLoading] = useState(true)
 const [retrying, setRetrying] = useState(false)
 const [search, setSearch] = useState('')
 const [isModalOpen, setIsModalOpen] = useState(false)

 const fetchNotes = useCallback(async () => {
 if (!activeWorker || !tenantId) return
 setLoading(true)
 try {
 const { data, error } = await api.billing.notes.get({ query: { tenantId, limit: '100' } })
 if (error) throw new Error(error.value?.error ?? error.value?.message ?? 'No se pudieron cargar las notas.')
 setNotes(data?.data ?? [])
 setPending(data?.meta?.pending ?? { sales: 0, notes: 0 })
 } catch (err) {
 showFlash({ type: 'error', text: err instanceof Error ? err.message : 'No se pudieron cargar las notas.' })
 } finally {
 setLoading(false)
 }
 }, [activeWorker, tenantId])

 useEffect(() => {
 fetchNotes()
 }, [fetchNotes])

 const retryPending = async () => {
 if (!tenantId || retrying) return
 setRetrying(true)
 try {
 const { data, error } = await api.billing['retry-pending'].post({ tenantId })
 if (error) throw new Error(error.value?.error ?? error.value?.message ?? 'No se pudo reintentar.')
 const { sales, notes: n } = data.data as { sales: Record<string, number>; notes: Record<string, number> }
 const still = (sales.PENDING_SUNAT ?? 0) + (n.PENDING_SUNAT ?? 0)
 const rejected = (sales.RECHAZADA ?? 0) + (n.RECHAZADA ?? 0)
 const accepted = (sales.ACEPTADA ?? 0) + (n.ACEPTADA ?? 0)
 showFlash({
 type: still || rejected ? 'warning' : 'success',
 text: sales.processed + n.processed === 0
 ? 'No hay comprobantes pendientes.'
 : `Reintento: ${accepted} aceptados, ${rejected} rechazados, ${still} siguen pendientes (ventas ${sales.processed}, notas ${n.processed}).`,
 })
 } catch (err) {
 showFlash({ type: 'error', text: err instanceof Error ? err.message : 'No se pudo reintentar.' })
 } finally {
 setRetrying(false)
 fetchNotes()
 }
 }

 const handleCreated = (note: BillingNoteResult) => {
 const doc = `${note.serie}-${note.correlative}`
 const detail = sunatDetail(note)
 if (note.sunatStatus === 'ACEPTADA') showFlash({ type: 'success', text: `Nota ${doc} aceptada por SUNAT.` })
 else if (note.sunatStatus === 'RECHAZADA') showFlash({ type: 'error', text: `Nota ${doc} RECHAZADA por SUNAT: ${detail}` })
 else showFlash({ type: 'warning', text: `Nota ${doc} guardada; envío a SUNAT pendiente (${detail || 'sin respuesta'}). Usa "Reintentar pendientes".` })
 fetchNotes()
 }

 const q = search.trim().toLowerCase()
 const visible = q
 ? notes.filter((n) =>
 [`${n.serie}-${n.correlative}`, `${n.modifiedDocumentSerie}-${n.modifiedDocumentCorrelative}`, n.clientName, n.clientDocNumber]
 .some((v) => v?.toLowerCase().includes(q)))
 : notes
 const pendingTotal = pending.sales + pending.notes

 return (
 <div className="flex flex-col -m-4 sm:-m-6">
 {/* Header */}
 <header className="px-6 py-4 bg-card border-b border-border flex items-center justify-between shrink-0 rounded-sm gap-3 flex-wrap">
 <h1 className="text-xl font-bold text-foreground tracking-tight flex items-center gap-2">
 <Receipt className="w-5 h-5 text-primary" />
 Notas de Crédito y Débito
 </h1>

 <div className="flex items-center gap-3">
 <button
 onClick={retryPending}
 disabled={retrying}
 title="Reenvía a SUNAT las ventas y notas pendientes"
 className="flex items-center gap-2 px-4 py-2 bg-card border border-border hover:bg-muted text-foreground font-medium rounded-xl transition-all active:scale-95 disabled:opacity-50"
 >
 <RefreshCw className={`w-4 h-4 ${retrying ? 'animate-spin' : ''}`} />
 <span className="hidden sm:inline">{retrying ? 'Reintentando…' : 'Reintentar pendientes'}</span>
 {pendingTotal > 0 && (
 <span className="ml-1 rounded-full bg-warning px-2 text-xs font-bold text-white" aria-label={`${pendingTotal} pendientes`}>{pendingTotal}</span>
 )}
 </button>
 <button
 onClick={() => setIsModalOpen(true)}
 className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-xl transition-all active:scale-95"
 >
 <Plus className="w-4 h-4" />
 <span className="hidden sm:inline">Nueva Nota</span>
 </button>
 </div>
 </header>

 <main className="flex-1 w-full p-6 flex flex-col gap-4">
 {pendingTotal > 0 && (
 <p className="text-sm text-warning">
 Pendientes de envío a SUNAT: {pending.sales} venta(s) y {pending.notes} nota(s).
 </p>
 )}

 <div className="bg-muted border border-border rounded-2xl overflow-hidden flex-1 flex flex-col">
 <div className="p-4 border-b border-border flex items-center justify-between gap-4">
 <div className="relative flex-1 max-w-sm">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
 <input
 type="text"
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 placeholder="Buscar por documento o cliente..."
 aria-label="Buscar notas"
 className="w-full bg-muted border border-border rounded-xl pl-9 pr-4 py-2 text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
 />
 </div>
 </div>

 <div className="flex-1 overflow-auto custom-scrollbar">
 <div className="min-w-[800px]">
 <div className="grid grid-cols-8 gap-4 px-6 py-3 bg-muted sticky top-0 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
 <div className="col-span-1">Fecha</div>
 <div className="col-span-1">Tipo</div>
 <div className="col-span-1">Doc. Nota</div>
 <div className="col-span-1">Modifica a</div>
 <div className="col-span-2">Cliente</div>
 <div className="col-span-1 text-right">Monto</div>
 <div className="col-span-1 text-center">SUNAT</div>
 </div>

 {loading && (
 <div className="p-8 text-center text-muted-foreground flex flex-col items-center gap-3">
 <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
 <p>Cargando notas...</p>
 </div>
 )}

 {!loading && visible.length === 0 && (
 <div className="p-16 flex flex-col items-center justify-center text-muted-foreground gap-4">
 <FileText className="w-16 h-16 opacity-20" />
 <p className="text-lg">{q ? 'Sin resultados para la búsqueda' : 'No hay notas registradas'}</p>
 {!q && (
 <button onClick={() => setIsModalOpen(true)} className="text-primary hover:text-primary font-medium text-sm">
 Crear la primera nota
 </button>
 )}
 </div>
 )}

 {!loading && visible.map(note => {
 const st = note.sunatStatus ? STATUS[note.sunatStatus] ?? NOT_SENT : NOT_SENT
 return (
 <div key={note.id} className="grid grid-cols-8 gap-4 px-6 py-4 border-b border-border hover:bg-muted transition-colors items-center text-sm">
 <div className="col-span-1 text-muted-foreground">
 {new Date(note.createdAt).toLocaleDateString('es-PE')}
 </div>
 <div className="col-span-1 border border-border bg-muted text-muted-foreground text-[11px] py-1 px-2 rounded w-fit uppercase font-bold tracking-widest">
 {note.type === 'CREDIT_NOTE' ? 'N. Crédito' : 'N. Débito'}
 </div>
 <div className="col-span-1 font-mono text-primary font-bold">
 {note.serie}-{note.correlative}
 </div>
 <div className="col-span-1 font-mono text-muted-foreground">
 {note.modifiedDocumentSerie}-{note.modifiedDocumentCorrelative}
 </div>
 <div className="col-span-2">
 <p className="font-bold text-foreground truncate text-xs">{note.clientName}</p>
 <p className="text-[11px] text-muted-foreground font-mono tracking-widest uppercase mt-0.5">DOC: {note.clientDocNumber}</p>
 </div>
 <div className="col-span-1 text-right font-black font-mono text-foreground">
 {formatPEN(Number(note.totalAmount))}
 </div>
 <div className="col-span-1 flex justify-center">
 <div title={sunatDetail(note)} className={`px-2 py-0.5 rounded-full border text-[11px] uppercase font-bold tracking-widest ${st.cls}`}>
 {st.label}
 </div>
 </div>
 </div>
 )
 })}
 </div>
 </div>
 </div>
 </main>

 <CreateBillingNoteModal
 isOpen={isModalOpen}
 onClose={() => setIsModalOpen(false)}
 onSuccess={handleCreated}
 />
 </div>
 )
}
