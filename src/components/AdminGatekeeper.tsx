// ============================================================
//  Admin Gatekeeper — zinc dark unified
// ============================================================

import { useState } from 'react'
import { PinPad } from './PinPad'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { useAdminStore } from '@/store/adminStore'
import { X, ShieldCheck } from 'lucide-react'

interface AdminGatekeeperProps {
    isOpen: boolean
    onClose: () => void
    onSuccess?: () => void
}

export function AdminGatekeeper({ isOpen, onClose, onSuccess }: AdminGatekeeperProps) {
    const { tenantId } = useAuthStore()
    const { loginAdmin } = useAdminStore()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    if (!isOpen) return null

    const handlePinComplete = async (pin: string) => {
        setLoading(true)
        setError(null)
        try {
            const { error: apiError } = await api.hr['verify-admin'].post({ tenantId, pin })
            if (apiError) {
                const msg = (apiError.value as { message?: string })?.message ?? 'Error verificando PIN.'
                setError(msg)
                return
            }
            loginAdmin()
            if (onSuccess) onSuccess()
            onClose()
        } catch {
            setError('Error de conexión.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-zinc-900 border border-zinc-800 shadow-2xl rounded-2xl w-full max-w-sm overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15">
                            <ShieldCheck className="w-4 h-4 text-amber-400" />
                        </div>
                        <h2 className="text-sm font-bold text-white tracking-wide">Acceso de Administrador</h2>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="p-1.5 text-zinc-500 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50"
                        aria-label="Cerrar modal"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6">
                    <p className="text-center text-sm text-zinc-400 mb-6">
                        Ingresa un PIN con privilegios de administrador para continuar.
                    </p>
                    <PinPad onComplete={handlePinComplete} disabled={loading} hasError={!!error} />
                    <div className="mt-5 flex justify-center items-center min-h-[1.25rem] px-2 text-center text-sm font-medium">
                        {error ? (
                            <span className="text-red-400">{error}</span>
                        ) : loading ? (
                            <span className="text-brand-400 animate-pulse">Verificando...</span>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    )
}
