// ============================================================
//  LoginScreen — Minimalist dark redesign
// ============================================================

import { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogIn, Clock } from 'lucide-react'
import { PinPad } from '@/components/PinPad'
import { CashOpeningModal } from '@/components/CashOpeningModal'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { useCashDrawerStore } from '@/store/cashDrawerStore'
import type { AttendanceResult } from '@/types'

type Mode = 'idle' | 'attendance' | 'unlock'
type PostUnlockMode = 'none' | 'cash-opening'

interface ToastState {
    type: 'success' | 'error' | 'info'
    message: string
}

export function LoginScreen() {
    const { tenantId, setWorker } = useAuthStore()
    const { setOpening } = useCashDrawerStore()
    const navigate = useNavigate()

    const [mode, setMode] = useState<Mode>('idle')
    const [postUnlockMode, setPostUnlockMode] = useState<PostUnlockMode>('none')
    const [loading, setLoading] = useState(false)
    const [hasError, setHasError] = useState(false)
    const [toast, setToast] = useState<ToastState | null>(null)
    const [nextWorker, setNextWorker] = useState<any | null>(null)
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const showToast = useCallback((t: ToastState) => {
        if (toastTimer.current) clearTimeout(toastTimer.current)
        setToast(t)
        toastTimer.current = setTimeout(() => setToast(null), 3500)
    }, [])

    const triggerError = useCallback(() => {
        setHasError(true)
        setTimeout(() => setHasError(false), 600)
    }, [])

    const handlePinComplete = useCallback(
        async (pin: string) => {
            if (loading) return
            setLoading(true)
            try {
                if (mode === 'attendance') {
                    const { data, error } = await api.hr.attendance.post({ tenantId, pin })
                    if (error) {
                        triggerError()
                        showToast({ type: 'error', message: (error.value as any)?.message ?? 'PIN inválido.' })
                        return
                    }
                    const result = data as unknown as { data: AttendanceResult; meta: { message: string } }
                    showToast({ type: 'success', message: result.meta.message })
                    setMode('idle')
                } else if (mode === 'unlock') {
                    const { data, error } = await api.hr['verify-pin'].post({ tenantId, pin })
                    if (error) {
                        triggerError()
                        showToast({ type: 'error', message: (error.value as any)?.message ?? 'PIN inválido.' })
                        return
                    }
                    const worker = (data as any).data
                    setWorker(worker)
                    showToast({ type: 'success', message: `Bienvenido, ${worker.name}!` })
                    const isCashier = worker.role.name === 'CAJERO' || worker.role.name === 'CASHIER'
                    if (isCashier) {
                        setNextWorker(worker)
                        setPostUnlockMode('cash-opening')
                    } else {
                        setTimeout(() => navigate('/pos'), 800)
                    }
                }
            } catch {
                triggerError()
                showToast({ type: 'error', message: 'Error de conexión. Verifica el servidor.' })
            } finally {
                setLoading(false)
            }
        },
        [loading, mode, tenantId, setWorker, setNextWorker, triggerError, showToast, navigate],
    )

    const selectMode = (next: Mode) => {
        setMode(mode === next ? 'idle' : next)
        setHasError(false)
    }

    const subtitle =
        mode === 'attendance'
            ? 'Ingresa tu PIN para registrar asistencia'
            : mode === 'unlock'
                ? 'Ingresa tu PIN para abrir el POS'
                : 'Selecciona una opción para continuar'

    return (
        <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-zinc-950 px-4">
            {/* Cash Opening Modal */}
            {postUnlockMode === 'cash-opening' && (
                <CashOpeningModal
                    onConfirm={(amount: number) => {
                        if (tenantId && nextWorker) {
                            setOpening(tenantId, nextWorker.id, amount)
                            setPostUnlockMode('none')
                            setTimeout(() => navigate('/pos'), 1000)
                        }
                    }}
                    isLoading={loading}
                />
            )}

            {/* Subtle dot pattern background */}
            <div
                className="pointer-events-none absolute inset-0 opacity-[0.03]"
                style={{
                    backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
                    backgroundSize: '24px 24px',
                }}
            />

            {/* Glow accents */}
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[200px] bg-brand-500/5 blur-3xl rounded-full" />
            </div>

            {/* Card */}
            <div className="relative z-10 w-full max-w-sm">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 backdrop-blur-md shadow-2xl">
                    <div className="flex flex-col items-center gap-7 px-7 py-10">

                        {/* Logo */}
                        <div className="flex flex-col items-center gap-2 text-center">
                            <div className="mb-1 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-800 border border-zinc-700 ring-1 ring-white/5">
                                <span className="text-2xl" role="img" aria-label="Wonka">🍫</span>
                            </div>
                            <h1 className="text-2xl font-extrabold tracking-tight text-white">Wonka</h1>
                            <p className="text-xs font-medium text-zinc-500 uppercase tracking-widest">Sistema de Punto de Venta</p>
                        </div>

                        {/* Subtitle */}
                        <p className="min-h-4 text-center text-sm text-zinc-500 transition-all duration-200">
                            {subtitle}
                        </p>

                        {/* PinPad */}
                        {mode !== 'idle' && (
                            <div className="w-full animate-fade-in">
                                <PinPad onComplete={handlePinComplete} disabled={loading} hasError={hasError} />
                            </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex flex-col gap-2.5 w-full">
                            <Button
                                onClick={() => selectMode('attendance')}
                                disabled={loading}
                                variant={mode === 'attendance' ? 'default' : 'secondary'}
                                size="xl"
                                className="w-full"
                            >
                                <Clock className="w-4 h-4" />
                                {mode === 'attendance' && loading ? 'Registrando...' : 'Registrar Asistencia'}
                            </Button>

                            <Button
                                onClick={() => selectMode('unlock')}
                                disabled={loading}
                                variant={mode === 'unlock' ? 'default' : 'outline'}
                                size="xl"
                                className="w-full"
                            >
                                <LogIn className="w-4 h-4" />
                                {mode === 'unlock' && loading ? 'Verificando...' : 'Desbloquear POS'}
                            </Button>
                        </div>

                        {/* Tenant badge */}
                        <span className="font-mono text-[10px] tracking-widest text-zinc-600 px-3 py-1 rounded-full border border-zinc-800">
                            {tenantId}
                        </span>
                    </div>
                </div>
            </div>

            {/* Toast */}
            {toast && (
                <div
                    role="alert"
                    aria-live="polite"
                    className={`
                        fixed bottom-8 left-1/2 -translate-x-1/2
                        flex items-center gap-2 px-4 py-3
                        rounded-xl text-sm font-medium shadow-xl
                        border backdrop-blur-md animate-fade-in
                        ${toast.type === 'success'
                            ? 'bg-emerald-950/80 border-emerald-800/60 text-emerald-300'
                            : toast.type === 'error'
                                ? 'bg-red-950/80 border-red-800/60 text-red-300'
                                : 'bg-zinc-900 border-zinc-800 text-zinc-300'
                        }
                    `}
                >
                    {toast.message}
                </div>
            )}
        </div>
    )
}
