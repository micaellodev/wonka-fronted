// ============================================================
//  Admin Gatekeeper
//  A modal component that asks for a PIN before allowing an action
// ============================================================

import { useState } from 'react'
import { PinPad } from './PinPad'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { useAdminStore } from '@/store/adminStore'
import { X, ShieldAlert } from 'lucide-react'

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

            // Valid Admin!
            loginAdmin()
            if (onSuccess) onSuccess()
            onClose()
        } catch (e) {
            setError('Error de conexión.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-slate-900 border border-slate-700/50 shadow-2xl shadow-brand-900/40 rounded-3xl w-full max-w-sm overflow-hidden relative">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50 bg-slate-800/40">
                    <div className="flex items-center gap-3 text-amber-500">
                        <ShieldAlert className="w-5 h-5" />
                        <h2 className="text-sm font-bold text-white tracking-wide">Acceso de Administrador</h2>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-50"
                        aria-label="Cerrar modal"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6">
                    <p className="text-center text-sm text-slate-300 mb-6">
                        Ingresa un PIN con privilegios de administrador para continuar.
                    </p>

                    <PinPad
                        onComplete={handlePinComplete}
                        disabled={loading}
                        hasError={!!error}
                    />

                    {/* Status Message */}
                    <div className="mt-6 flex justify-center items-center min-h-[1.5rem] px-2 text-center text-sm font-medium">
                        {error ? (
                            <span className="text-red-400 animate-shake">{error}</span>
                        ) : loading ? (
                            <span className="text-brand-400 animate-pulse">Verificando...</span>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    )
}
