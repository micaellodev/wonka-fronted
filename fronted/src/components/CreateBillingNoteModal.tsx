// ============================================================
// CreateBillingNoteModal — nota de crédito/débito emitida a SUNAT.
// Serie/correlativo y cliente los asigna el backend a partir del
// documento modificado (deben coincidir con él según SUNAT).
// ============================================================

import React, { useState } from 'react'
import { X, Save, FileText } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { PinPad } from '@/components/PinPad'

export type BillingNoteResult = {
 serie: string
 correlative: string
 sunatStatus: string | null
 sunatResponse?: { error?: unknown; cdrResponse?: { description?: string } } | null
}

type Props = {
 isOpen: boolean
 onClose: () => void
 onSuccess: (note: BillingNoteResult) => void
}

type NoteType = 'CREDIT_NOTE' | 'DEBIT_NOTE'

// SUNAT catálogo 09 (crédito) y 10 (débito)
const REASONS: Record<NoteType, Array<[string, string]>> = {
 CREDIT_NOTE: [
 ['01', 'Anulación de la operación'],
 ['02', 'Anulación por error en el RUC'],
 ['03', 'Corrección por error en la descripción'],
 ['04', 'Descuento global'],
 ['05', 'Descuento por ítem'],
 ['06', 'Devolución total'],
 ['07', 'Devolución por ítem'],
 ['08', 'Bonificación'],
 ['09', 'Disminución en el valor'],
 ['10', 'Otros conceptos'],
 ],
 DEBIT_NOTE: [
 ['01', 'Intereses por mora'],
 ['02', 'Aumento en el valor'],
 ['03', 'Penalidades / otros conceptos'],
 ],
}

const emptyForm = {
 type: 'CREDIT_NOTE' as NoteType,
 modifiedDocumentSerie: 'B001',
 modifiedDocumentCorrelative: '',
 reasonCode: '01',
 reasonDescription: 'Anulación de la operación',
 totalAmount: '',
}

function validate(form: typeof emptyForm): string | null {
 if (!/^[BF][A-Z0-9]{3}$/.test(form.modifiedDocumentSerie)) return 'La serie del documento debe tener 4 caracteres y empezar con B (boleta) o F (factura).'
 if (!/^\d{1,8}$/.test(form.modifiedDocumentCorrelative)) return 'El correlativo del documento debe tener solo dígitos (máx. 8).'
 const amount = Number(form.totalAmount)
 if (!Number.isFinite(amount) || amount <= 0) return 'El monto debe ser mayor a 0.'
 if (!/^\d+(\.\d{1,2})?$/.test(form.totalAmount)) return 'El monto admite como máximo 2 decimales.'
 if (form.reasonDescription.trim().length < 3) return 'Describe el motivo (mínimo 3 caracteres).'
 return null
}

export function CreateBillingNoteModal({ isOpen, onClose, onSuccess }: Props) {
 const { activeWorker, tenantId } = useAuthStore()
 const [loading, setLoading] = useState(false)
 const [error, setError] = useState<string | null>(null)
 const [showApprovalModal, setShowApprovalModal] = useState(false)
 const [approvalError, setApprovalError] = useState(false)
 const [form, setForm] = useState(emptyForm)

 if (!isOpen) return null

 const close = () => {
 if (loading) return
 setForm(emptyForm)
 setError(null)
 setShowApprovalModal(false)
 onClose()
 }

 const setType = (type: NoteType) => {
 const [code, label] = REASONS[type][0]
 setForm({ ...form, type, reasonCode: code, reasonDescription: label })
 }

 const setReason = (code: string) => {
 const label = REASONS[form.type].find(([c]) => c === code)?.[1] ?? ''
 setForm({ ...form, reasonCode: code, reasonDescription: label })
 }

 const handleSubmit = (e: React.FormEvent) => {
 e.preventDefault()
 if (!activeWorker || !tenantId) return
 const invalid = validate(form)
 setError(invalid)
 if (invalid) return
 setApprovalError(false)
 setShowApprovalModal(true)
 }

 const handleApprovalCodeComplete = async (approvalCode: string) => {
 if (!activeWorker || !tenantId) return

 setLoading(true)
 setApprovalError(false)
 setError(null)
 try {
 const { data, error } = await api.billing.notes.post({
 tenantId,
 workerId: activeWorker.id,
 type: form.type,
 modifiedDocumentSerie: form.modifiedDocumentSerie,
 modifiedDocumentCorrelative: form.modifiedDocumentCorrelative,
 reasonCode: form.reasonCode,
 reasonDescription: form.reasonDescription.trim(),
 totalAmount: Number(form.totalAmount),
 approvalCode,
 })

 if (error) {
 const value = error.value as { error?: string; message?: string } | undefined
 const msg = value?.error ?? value?.message ?? 'Error al registrar la nota'
 // Only a bad approval code (401) or rate limit (429) is the PIN's fault.
 if (error.status === 401 || error.status === 429) {
 setApprovalError(true)
 } else {
 setShowApprovalModal(false)
 }
 setError(msg)
 return
 }
 setForm(emptyForm)
 setShowApprovalModal(false)
 onSuccess(data as BillingNoteResult)
 onClose()
 } catch (err) {
 setApprovalError(true)
 setError(err instanceof Error ? err.message : 'Error al conectarse al servidor')
 } finally {
 setLoading(false)
 }
 }

 const inputCls = 'w-full bg-muted border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors'

 return (
 <Dialog open onOpenChange={(o) => { if (!o) close() }}>
 <DialogContent size="xl" showCloseButton={false} className="gap-5">
 {/* Header */}
 <div className="flex items-center justify-between">
 <div>
 <DialogTitle className="text-xl font-bold flex items-center gap-2">
 <FileText className="w-5 h-5 text-primary" />
 Nueva Nota de Crédito/Débito
 </DialogTitle>
 <p className="text-sm text-muted-foreground mt-0.5">Se emite a SUNAT. La serie, el correlativo y el cliente se toman del documento modificado.</p>
 </div>
 <button onClick={close} disabled={loading} aria-label="Cerrar" className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-colors disabled:opacity-50">
 <X className="w-5 h-5" />
 </button>
 </div>

 {error && !showApprovalModal && (
 <div role="alert" className="p-3 bg-danger-soft border border-destructive/20 text-destructive rounded-xl text-sm">
 {error}
 </div>
 )}

 <form id="billingNoteForm" onSubmit={handleSubmit} noValidate className="space-y-5">
 <div className="grid grid-cols-2 gap-4">
 <div>
 <label htmlFor="bn-type" className="block text-sm font-semibold text-muted-foreground mb-1.5">Tipo de Nota</label>
 <select id="bn-type" className={inputCls} value={form.type} onChange={e => setType(e.target.value as NoteType)}>
 <option value="CREDIT_NOTE">Nota de Crédito</option>
 <option value="DEBIT_NOTE">Nota de Débito</option>
 </select>
 </div>
 <div>
 <label htmlFor="bn-amount" className="block text-sm font-semibold text-muted-foreground mb-1.5">Monto Total (S/, IGV incluido)</label>
 <input
 id="bn-amount" type="number" step="0.01" min="0.01" inputMode="decimal" className={inputCls}
 value={form.totalAmount} onChange={e => setForm({ ...form, totalAmount: e.target.value })}
 placeholder="0.00"
 />
 </div>
 </div>

 <div className="h-px w-full bg-muted my-2"></div>

 <h3 className="text-xs font-bold text-primary uppercase tracking-widest">Documento que Modifica (Boleta/Factura aceptada)</h3>
 <div className="grid grid-cols-2 gap-4 mt-1">
 <div>
 <label htmlFor="bn-serie" className="block text-sm font-semibold text-muted-foreground mb-1.5">Serie</label>
 <input
 id="bn-serie" type="text" maxLength={4} className={`${inputCls} font-mono`}
 value={form.modifiedDocumentSerie} onChange={e => setForm({ ...form, modifiedDocumentSerie: e.target.value.toUpperCase().trim() })}
 placeholder="B001 / F001"
 />
 </div>
 <div>
 <label htmlFor="bn-corr" className="block text-sm font-semibold text-muted-foreground mb-1.5">Correlativo</label>
 <input
 id="bn-corr" type="text" inputMode="numeric" maxLength={8} className={`${inputCls} font-mono`}
 value={form.modifiedDocumentCorrelative} onChange={e => setForm({ ...form, modifiedDocumentCorrelative: e.target.value.replace(/\D/g, '') })}
 placeholder="00000001"
 />
 </div>
 </div>

 <div className="grid grid-cols-3 gap-4">
 <div className="col-span-1">
 <label htmlFor="bn-reason" className="block text-sm font-semibold text-muted-foreground mb-1.5">Motivo</label>
 <select id="bn-reason" className={inputCls} value={form.reasonCode} onChange={e => setReason(e.target.value)}>
 {REASONS[form.type].map(([code, label]) => (
 <option key={code} value={code}>{code} — {label}</option>
 ))}
 </select>
 </div>
 <div className="col-span-2">
 <label htmlFor="bn-desc" className="block text-sm font-semibold text-muted-foreground mb-1.5">Descripción del Motivo</label>
 <input
 id="bn-desc" type="text" maxLength={250} className={inputCls}
 value={form.reasonDescription} onChange={e => setForm({ ...form, reasonDescription: e.target.value })}
 placeholder="Anulación de la operación"
 />
 </div>
 </div>
 </form>

 {/* Approval code modal */}
 <Dialog open={showApprovalModal} onOpenChange={(o) => { if (!o && !loading) setShowApprovalModal(false) }}>
 <DialogContent size="sm" showCloseButton={false} className="gap-5">
 <div className="flex items-center justify-between">
 <DialogTitle className="text-lg font-bold">Código de Aprobación</DialogTitle>
 <button
 onClick={() => { if (!loading) setShowApprovalModal(false) }}
 disabled={loading}
 aria-label="Cerrar"
 className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-colors disabled:opacity-50"
 >
 <X className="w-5 h-5" />
 </button>
 </div>
 <p className="text-center text-sm text-muted-foreground">
 {loading ? 'Emitiendo nota a SUNAT…' : 'Ingresa tu código de aprobación de administrador (6 dígitos).'}
 </p>
 <PinPad onComplete={handleApprovalCodeComplete} disabled={loading} hasError={approvalError} length={6} />
 {error && (
 <p role="alert" className="text-center text-sm text-primary">{error}</p>
 )}
 </DialogContent>
 </Dialog>

 {/* Actions */}
 <div className="flex gap-3 mt-2">
 <button
 type="button"
 onClick={close}
 disabled={loading}
 className="flex-1 py-3 font-semibold text-muted-foreground bg-muted hover:bg-muted rounded-xl transition-colors disabled:opacity-50"
 >
 Cancelar
 </button>
 <button
 type="submit"
 form="billingNoteForm"
 disabled={loading}
 className="flex-1 py-3 font-semibold text-primary-foreground bg-primary hover:bg-primary/90 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors"
 >
 {loading ? 'Emitiendo...' : <><Save className="w-5 h-5" /> Emitir Nota</>}
 </button>
 </div>
 </DialogContent>
 </Dialog>
 )
}
