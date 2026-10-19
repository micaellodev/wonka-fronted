// ============================================================
// AttendanceModal — zinc dark unified
// ============================================================

import { useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { PinPad } from './PinPad'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { X, Clock } from 'lucide-react'

interface AttendanceModalProps {
 isOpen: boolean
 onClose: () => void
 onSuccess?: (message: string) => void
}

export function AttendanceModal({ isOpen, onClose, onSuccess }: AttendanceModalProps) {
 const { tenantId } = useAuthStore()
 const [loading, setLoading] = useState(false)
 const [error, setError] = useState<string | null>(null)

 if (!isOpen) return null

 const handlePinComplete = async (pin: string) => {
 setLoading(true)
 setError(null)
 try {
 const { data, error: apiError } = await api.hr.attendance.post({ tenantId, pin })
 if (apiError) {
 const msg = (apiError.value as { message?: string })?.message ?? 'PIN inválido o error al registrar asistencia.'
 setError(msg)
 return
 }
 const responseData = data as { meta?: { message?: string } }
 const successMsg = responseData?.meta?.message || 'Asistencia registrada correctamente.'
 if (onSuccess) onSuccess(successMsg)
 onClose()
 } catch {
 setError('Error de conexión.')
 } finally {
 setLoading(false)
 }
 }

 return (
 <Dialog open onOpenChange={(o) => { if (!o && !loading) onClose() }}>
 <DialogContent size="sm" showCloseButton={false} className="gap-0 overflow-hidden p-0">
 {/* Header */}
 <div className="flex items-center justify-between px-6 py-4 border-b border-border">
 <div className="flex items-center gap-2.5">
 <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/15">
 <Clock className="w-4 h-4 text-brand-400" />
 </div>
 <DialogTitle className="text-sm font-bold text-foreground tracking-wide">Registro de Asistencia</DialogTitle>
 </div>
 <button
 onClick={onClose}
 disabled={loading}
 className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
 aria-label="Cerrar modal"
 >
 <X className="w-4 h-4" />
 </button>
 </div>

 {/* Body */}
 <div className="p-6">
 <p className="text-center text-sm text-muted-foreground mb-6">
 Ingresa tu PIN para registrar entrada o salida.
 </p>
 <PinPad onComplete={handlePinComplete} disabled={loading} hasError={!!error} />
 <div className="mt-5 flex justify-center items-center min-h-[1.25rem] px-2 text-center text-sm font-medium">
 {error ? (
 <span className="text-brand-500">{error}</span>
 ) : loading ? (
 <span className="text-brand-400 animate-pulse">Registrando...</span>
 ) : null}
 </div>
 </div>
 </DialogContent>
 </Dialog>
 )
}
