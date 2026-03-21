// ============================================================
//  Billing Notes Screen
// ============================================================

import { useEffect, useState } from 'react'
import { Plus, FileText, Search, Receipt } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { api } from '@/lib/api'
import { CreateBillingNoteModal } from '@/components/CreateBillingNoteModal'

export function BillingNotesScreen() {
    const { activeWorker } = useAuthStore()
    
    const [notes, setNotes] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)

    const fetchNotes = async () => {
        if (!activeWorker) return
        setLoading(true)
        try {
            const { data, error } = await api.billing.notes.get({
                query: { tenantId: (activeWorker as any).tenantId }
            })
            if (data && !error) {
                setNotes(data.data || [])
            }
        } catch (err) {
            console.error('Failed to fetch notes', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchNotes()
    }, [activeWorker])

    return (
        <div className="min-h-screen bg-surface-900 text-zinc-200 flex flex-col">
            {/* Header */}
            <header className="px-6 py-4 bg-zinc-800/80 border-b border-white/5 shadow-md flex items-center justify-between shrink-0 rounded-sm">
                <div className="flex items-center gap-4">
                    <div>
                        <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                            <Receipt className="w-5 h-5 text-violet-400" />
                            Notas de Crédito y Débito
                        </h1>
                    </div>
                </div>
                
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => setIsModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white font-medium rounded-xl transition-all active:scale-95"
                    >
                        <Plus className="w-4 h-4" />
                        <span className="hidden sm:inline">Nueva Nota</span>
                    </button>
                </div>
            </header>

            <main className="flex-1 w-full p-6 flex flex-col">
                <div className="bg-zinc-800/40 border border-zinc-700/50 rounded-2xl overflow-hidden flex-1 flex flex-col">
                    {/* Header List */}
                    <div className="p-4 border-b border-zinc-700/50 flex items-center justify-between gap-4">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                            <input 
                                type="text" 
                                placeholder="Buscar por documento o cliente..." 
                                className="w-full bg-zinc-900/50 border border-zinc-700 rounded-xl pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors"
                            />
                        </div>
                    </div>

                    {/* Table Container */}
                    <div className="flex-1 overflow-auto custom-scrollbar">
                        <div className="min-w-[800px]">
                            {/* Table Header */}
                            <div className="grid grid-cols-8 gap-4 px-6 py-3 bg-zinc-800/60 sticky top-0 border-b border-zinc-700 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                                <div className="col-span-1">Fecha</div>
                                <div className="col-span-1">Tipo</div>
                                <div className="col-span-1">Doc. Nota</div>
                                <div className="col-span-1">Modifica a</div>
                                <div className="col-span-2">Cliente</div>
                                <div className="col-span-1 text-right">Monto</div>
                                <div className="col-span-1 text-center">Estado</div>
                            </div>
                            
                            {/* Loading State */}
                            {loading && (
                                <div className="p-8 text-center text-zinc-400 flex flex-col items-center gap-3">
                                    <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
                                    <p>Cargando notas...</p>
                                </div>
                            )}

                            {/* Empty State */}
                            {!loading && notes.length === 0 && (
                                <div className="p-16 flex flex-col items-center justify-center text-zinc-500 gap-4">
                                    <FileText className="w-16 h-16 opacity-20" />
                                    <p className="text-lg">No hay notas registradas</p>
                                    <button 
                                        onClick={() => setIsModalOpen(true)}
                                        className="text-violet-400 hover:text-violet-300 font-medium text-sm"
                                    >
                                        Crear la primera nota
                                    </button>
                                </div>
                            )}

                            {/* List items */}
                            {!loading && notes.map(note => (
                                <div key={note.id} className="grid grid-cols-8 gap-4 px-6 py-4 border-b border-zinc-700/50 hover:bg-zinc-700/20 transition-colors items-center text-sm">
                                    <div className="col-span-1 text-zinc-400">
                                        {new Date(note.createdAt).toLocaleDateString('es-PE')}
                                    </div>
                                    <div className="col-span-1 border border-zinc-700 bg-zinc-900/50 text-zinc-300 text-[10px] py-1 px-2 rounded w-fit uppercase font-bold tracking-widest">
                                        {note.type === 'CREDIT_NOTE' ? 'N. Crédito' : 'N. Débito'}
                                    </div>
                                    <div className="col-span-1 font-mono text-violet-300 font-bold">
                                        {note.serie}-{note.correlative}
                                    </div>
                                    <div className="col-span-1 font-mono text-zinc-400">
                                        {note.modifiedDocumentSerie}-{note.modifiedDocumentCorrelative}
                                    </div>
                                    <div className="col-span-2">
                                        <p className="font-bold text-white truncate text-xs">{note.clientName}</p>
                                        <p className="text-[10px] text-zinc-500 font-mono tracking-widest uppercase mt-0.5">DOC: {note.clientDocNumber}</p>
                                    </div>
                                    <div className="col-span-1 text-right font-black font-mono text-white">
                                        S/ {Number(note.totalAmount).toFixed(2)}
                                    </div>
                                    <div className="col-span-1 flex justify-center">
                                        <div className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] uppercase font-bold tracking-widest">
                                            Guardado
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </main>

            <CreateBillingNoteModal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)}
                onSuccess={fetchNotes}
            />
        </div>
    )
}
