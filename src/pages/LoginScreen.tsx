// ============================================================
//  LoginScreen — PIN Pad / Attendance entry screen
// ============================================================

import { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogIn, Clock } from 'lucide-react'
import { PinPad } from '@/components/PinPad'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import type { AttendanceResult } from '@/types'

type Mode = 'idle' | 'attendance' | 'unlock'

interface ToastState {
    type: 'success' | 'error' | 'info'
    message: string
}

export function LoginScreen() {
    const { tenantId, setWorker } = useAuthStore()
    const navigate = useNavigate()

    const [mode, setMode] = useState<Mode>('idle')
    const [loading, setLoading] = useState(false)
    const [hasError, setHasError] = useState(false)
    const [toast, setToast] = useState<ToastState | null>(null)
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    // ── helpers ────────────────────────────────────────────────
    const showToast = useCallback((t: ToastState) => {
        if (toastTimer.current) clearTimeout(toastTimer.current)
        setToast(t)
        toastTimer.current = setTimeout(() => setToast(null), 3500)
    }, [])

    const triggerError = useCallback(() => {
        setHasError(true)
        setTimeout(() => setHasError(false), 600)
    }, [])

    // ── PIN submission ─────────────────────────────────────────
    const handlePinComplete = useCallback(
        async (pin: string) => {
            if (loading) return
            setLoading(true)

            try {
                if (mode === 'attendance') {
                    // POST /hr/attendance
                    const { data, error } = await api.hr.attendance.post({
                        tenantId,
                        pin,
                    })

                    if (error) {
                        triggerError()
                        console.error("ATTENDANCE ERROR:", error.status, error.value);
                        showToast({ type: 'error', message: (error.value as any)?.message ?? JSON.stringify(error.value) ?? 'PIN inválido.' })
                        return
                    }

                    const result = data as unknown as { data: AttendanceResult; meta: { message: string } }
                    showToast({ type: 'success', message: result.meta.message })
                    setMode('idle')

                } else if (mode === 'unlock') {
                    // Unlock uses a generic check to grab the worker context for POS
                    const { data, error } = await api.hr['verify-pin'].post({
                        tenantId,
                        pin,
                    })

                    if (error) {
                        triggerError()
                        console.error("UNLOCK ERROR:", error.status, error.value);
                        showToast({ type: 'error', message: (error.value as any)?.message ?? JSON.stringify(error.value) ?? 'PIN inválido. Inténtalo de nuevo.' })
                        return
                    }

                    // data will naturally hold the simple matchedWorker object inside the .data field from Elysia
                    const worker = (data as any).data;
                    setWorker(worker)
                    showToast({ type: 'success', message: `Bienvenido, ${worker.name}!` })

                    setTimeout(() => {
                        if (worker.role.name === 'ADMIN' || worker.role.name === 'ADMINISTRADOR') {
                            navigate('/admin')
                        } else {
                            navigate('/pos')
                        }
                    }, 800)
                }
            } catch {
                triggerError()
                showToast({ type: 'error', message: 'Error de conexión. Verifica el servidor.' })
            } finally {
                setLoading(false)
            }
        },
        [loading, mode, tenantId, setWorker, triggerError, showToast],
    )

    // ── mode selection ─────────────────────────────────────────
    const selectMode = (next: Mode) => {
        if (mode === next) {
            setMode('idle')
        } else {
            setMode(next)
        }
        setHasError(false)
    }

    const subtitle =
        mode === 'attendance'
            ? 'Ingresa tu PIN para registrar asistencia'
            : mode === 'unlock'
                ? 'Ingresa tu PIN para abrir el POS'
                : 'Selecciona una opción para continuar'

    return (
        <div className="relative min-h-screen flex flex-col items-center justify-center bg-surface-900 overflow-hidden">
            {/* ── Background glow ── */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-brand-700/20 blur-[120px]" />
                <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full bg-brand-900/30 blur-[80px]" />
            </div>

            {/* ── Card ── */}
            <div className="relative z-10 flex flex-col items-center gap-8 w-full max-w-sm px-6 py-10 rounded-3xl bg-slate-800/50 border border-white/8 shadow-2xl backdrop-blur-sm">

                {/* Logo / title */}
                <div className="flex flex-col items-center gap-2 text-center">
                    <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-600 shadow-lg shadow-brand-900/50 mb-1">
                        <span className="text-3xl" role="img" aria-label="Wonka">❤</span>
                    </div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-white">Wonka</h1>
                    <p className="text-sm text-slate-400 font-medium">Sistema de Punto de Venta</p>
                </div>

                {/* Subtitle / instruction */}
                <p className="text-sm text-slate-400 text-center min-h-5 transition-all duration-200">
                    {subtitle}
                </p>

                {/* PinPad — only visible once a mode is selected */}
                {mode !== 'idle' && (
                    <div className="w-full animate-fade-in">
                        <PinPad
                            onComplete={handlePinComplete}
                            disabled={loading}
                            hasError={hasError}
                        />
                    </div>
                )}

                {/* Action buttons */}
                <div className="flex flex-col gap-3 w-full">
                    <button
                        onClick={() => selectMode('attendance')}
                        disabled={loading}
                        className={`
              flex items-center justify-center gap-3
              h-14 rounded-2xl font-semibold text-base
              transition-all duration-200 active:scale-[0.98]
              focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400
              disabled:opacity-50 disabled:cursor-not-allowed
              ${mode === 'attendance'
                                ? 'bg-brand-600 text-white shadow-lg shadow-brand-900/50'
                                : 'bg-slate-700/70 text-slate-200 hover:bg-slate-600/80 border border-white/5'
                            }
            `}
                    >
                        <Clock className="w-5 h-5 flex-shrink-0" />
                        {mode === 'attendance' && loading ? 'Registrando...' : 'Registrar Asistencia'}
                    </button>

                    <button
                        onClick={() => selectMode('unlock')}
                        disabled={loading}
                        className={`
              flex items-center justify-center gap-3
              h-14 rounded-2xl font-semibold text-base
              transition-all duration-200 active:scale-[0.98]
              focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400
              disabled:opacity-50 disabled:cursor-not-allowed
              ${mode === 'unlock'
                                ? 'bg-brand-600 text-white shadow-lg shadow-brand-900/50'
                                : 'bg-slate-700/70 text-slate-200 hover:bg-slate-600/80 border border-white/5'
                            }
            `}
                    >
                        <LogIn className="w-5 h-5 flex-shrink-0" />
                        {mode === 'unlock' && loading ? 'Verificando...' : 'Desbloquear POS'}
                    </button>
                </div>

                {/* Tenant badge */}
                <p className="text-xs text-slate-600 font-mono">{tenantId}</p>
            </div>

            {/* ── Toast notification ── */}
            {toast && (
                <div
                    role="alert"
                    aria-live="polite"
                    className={`
            fixed bottom-8 left-1/2 -translate-x-1/2
            flex items-center gap-2 px-5 py-3
            rounded-2xl text-sm font-medium shadow-xl
            border backdrop-blur-md
            transition-all duration-300 animate-fade-in
            ${toast.type === 'success'
                            ? 'bg-green-900/80 border-green-700/50 text-green-200'
                            : toast.type === 'error'
                                ? 'bg-red-900/80 border-red-700/50 text-red-200'
                                : 'bg-slate-700/80 border-slate-600/50 text-slate-200'
                        }
          `}
                >
                    {toast.message}
                </div>
            )}
        </div>
    )
}
