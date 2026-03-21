// ============================================================
//  CreateBillingNoteModal
// ============================================================

import React, { useState } from 'react'
import { X, Save, FileText } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

type Props = {
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
}

export function CreateBillingNoteModal({ isOpen, onClose, onSuccess }: Props) {
    const { activeWorker } = useAuthStore()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [form, setForm] = useState({
        type: 'CREDIT_NOTE',
        serie: 'FC01',
        correlative: '',
        modifiedDocumentSerie: 'F001',
        modifiedDocumentCorrelative: '',
        reasonCode: '01',
        reasonDescription: 'Anulación de la operación',
        clientDocType: '6',
        clientDocNumber: '',
        clientName: '',
        totalAmount: ''
    })

    if (!isOpen) return null

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!activeWorker) return

        setLoading(true)
        setError(null)
        try {
            const { error } = await api.billing.notes.post({
                tenantId: (activeWorker as any).tenantId,
                workerId: activeWorker.id,
                type: form.type as any,
                serie: form.serie,
                correlative: form.correlative,
                modifiedDocumentSerie: form.modifiedDocumentSerie,
                modifiedDocumentCorrelative: form.modifiedDocumentCorrelative,
                reasonCode: form.reasonCode,
                reasonDescription: form.reasonDescription,
                clientDocType: form.clientDocType,
                clientDocNumber: form.clientDocNumber,
                clientName: form.clientName,
                totalAmount: Number(form.totalAmount)
            })

            if (error) {
                setError(error.message || 'Error al guardar la nota')
            } else {
                onSuccess()
                onClose()
            }
        } catch (err: any) {
            setError(err.message || 'Error al conectarse al servidor')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-zinc-800 border border-zinc-700 rounded-2xl w-full max-w-2xl p-6 shadow-2xl flex flex-col gap-5 max-h-[90vh] overflow-y-auto custom-scrollbar">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <FileText className="w-5 h-5 text-violet-400" />
                            Nueva Nota de Crédito/Débito
                        </h2>
                        <p className="text-sm text-zinc-400 mt-0.5">Registra un nuevo documento modificatorio.</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-xl transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {error && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm">
                        {error}
                    </div>
                )}
                
                <form id="billingNoteForm" onSubmit={handleSubmit} className="space-y-5">
                    {/* Tipo de Nota */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-zinc-300 mb-1.5">Tipo de Nota</label>
                            <select 
                                className="w-full bg-zinc-900/50 border border-zinc-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-violet-500 transition-colors"
                                value={form.type} onChange={e => setForm({...form, type: e.target.value})}
                            >
                                <option value="CREDIT_NOTE">Nota de Crédito</option>
                                <option value="DEBIT_NOTE">Nota de Débito</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-zinc-300 mb-1.5">Monto Total</label>
                            <input 
                                type="number" step="0.01" required
                                className="w-full bg-zinc-900/50 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500 transition-colors"
                                value={form.totalAmount} onChange={e => setForm({...form, totalAmount: e.target.value})}
                                placeholder="0.00"
                            />
                        </div>
                    </div>

                    {/* Documento Actual */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-zinc-300 mb-1.5">Serie de esta Nota</label>
                            <input 
                                type="text" required
                                className="w-full bg-zinc-900/50 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500 transition-colors font-mono"
                                value={form.serie} onChange={e => setForm({...form, serie: e.target.value.toUpperCase()})}
                                placeholder="FC01 / BC01"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-zinc-300 mb-1.5">Correlativo</label>
                            <input 
                                type="text" required
                                className="w-full bg-zinc-900/50 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500 transition-colors font-mono"
                                value={form.correlative} onChange={e => setForm({...form, correlative: e.target.value})}
                                placeholder="0000001"
                            />
                        </div>
                    </div>

                    <div className="h-px w-full bg-zinc-700/50 my-2"></div>

                    {/* Documento Modificado */}
                    <h3 className="text-xs font-bold text-violet-400 uppercase tracking-widest">Documento que Modifica (Original)</h3>
                    <div className="grid grid-cols-2 gap-4 mt-1">
                        <div>
                            <label className="block text-sm font-semibold text-zinc-300 mb-1.5">Serie Original</label>
                            <input 
                                type="text" required
                                className="w-full bg-zinc-900/50 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500 transition-colors font-mono"
                                value={form.modifiedDocumentSerie} onChange={e => setForm({...form, modifiedDocumentSerie: e.target.value.toUpperCase()})}
                                placeholder="F001 / B001"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-zinc-300 mb-1.5">Correlativo Orginal</label>
                            <input 
                                type="text" required
                                className="w-full bg-zinc-900/50 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500 transition-colors font-mono"
                                value={form.modifiedDocumentCorrelative} onChange={e => setForm({...form, modifiedDocumentCorrelative: e.target.value})}
                                placeholder="0000001"
                            />
                        </div>
                    </div>

                    {/* Motivo */}
                    <div className="grid grid-cols-3 gap-4">
                        <div className="col-span-1">
                            <label className="block text-sm font-semibold text-zinc-300 mb-1.5">Cód. Motivo</label>
                            <input 
                                type="text" required
                                className="w-full bg-zinc-900/50 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500 transition-colors font-mono"
                                value={form.reasonCode} onChange={e => setForm({...form, reasonCode: e.target.value})}
                                placeholder="01"
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-sm font-semibold text-zinc-300 mb-1.5">Descripción del Motivo</label>
                            <input 
                                type="text" required
                                className="w-full bg-zinc-900/50 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500 transition-colors"
                                value={form.reasonDescription} onChange={e => setForm({...form, reasonDescription: e.target.value})}
                                placeholder="Anulación de la operación"
                            />
                        </div>
                    </div>

                    <div className="h-px w-full bg-zinc-700/50 my-2"></div>

                    {/* Cliente */}
                    <h3 className="text-xs font-bold text-violet-400 uppercase tracking-widest">Datos del Cliente</h3>
                    <div className="grid grid-cols-3 gap-4 mt-1">
                        <div className="col-span-1">
                            <label className="block text-sm font-semibold text-zinc-300 mb-1.5">Tipo Doc.</label>
                            <select 
                                className="w-full bg-zinc-900/50 border border-zinc-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-violet-500 transition-colors"
                                value={form.clientDocType} onChange={e => setForm({...form, clientDocType: e.target.value})}
                            >
                                <option value="1">DNI (1)</option>
                                <option value="6">RUC (6)</option>
                                <option value="0">Otros</option>
                            </select>
                        </div>
                        <div className="col-span-2">
                            <label className="block text-sm font-semibold text-zinc-300 mb-1.5">N° Documento</label>
                            <input 
                                type="text" required
                                className="w-full bg-zinc-900/50 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500 transition-colors font-mono"
                                value={form.clientDocNumber} onChange={e => setForm({...form, clientDocNumber: e.target.value})}
                                placeholder="12345678"
                            />
                        </div>
                        <div className="col-span-3">
                            <label className="block text-sm font-semibold text-zinc-300 mb-1.5">Razón Social / Nombre</label>
                            <input 
                                type="text" required
                                className="w-full bg-zinc-900/50 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500 transition-colors"
                                value={form.clientName} onChange={e => setForm({...form, clientName: e.target.value})}
                                placeholder="Nombre completo o Razón Social"
                            />
                        </div>
                    </div>

                </form>

                {/* Actions */}
                <div className="flex gap-3 mt-2">
                    <button 
                        type="button" 
                        onClick={onClose}
                        className="flex-1 py-3 font-semibold text-zinc-300 bg-zinc-700 hover:bg-zinc-600 rounded-xl transition-colors"
                    >
                        Cancelar
                    </button>
                    <button 
                        type="submit" 
                        form="billingNoteForm"
                        disabled={loading}
                        className="flex-1 py-3 font-semibold text-white bg-violet-600 hover:bg-violet-500 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors"
                    >
                        {loading ? 'Guardando...' : <><Save className="w-5 h-5" /> Guardar Nota</>}
                    </button>
                </div>
            </div>
        </div>
    )
}
