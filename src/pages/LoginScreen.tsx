// ============================================================
//  LoginScreen — PIN Pad / Attendance entry screen
// ============================================================

import { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogIn, Clock } from 'lucide-react'
import { PinPad } from '@/components/PinPad'
import { CashOpeningModal } from '@/components/CashOpeningModal'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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

                    // Check if this is a cashier role and if they need to open the cash drawer
                    const isCashier = worker.role.name === 'CAJERO' || worker.role.name === 'CASHIER'
                    
                    if (isCashier) {
                        // Store the worker and show cash opening modal
                        setNextWorker(worker)
                        setPostUnlockMode('cash-opening')
                    } else {
                        // Non-cashier goes directly to POS
                        setTimeout(() => {
                            navigate('/pos')
                        }, 800)
                    }
                }
            } catch {
                triggerError()
                showToast({ type: 'error', message: 'Error de conexión. Verifica el servidor.' })
            } finally {
                setLoading(false)
            }
        },
        [loading, mode, tenantId, setWorker, setNextWorker, triggerError, showToast],
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
        <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4">
            {/* ── Cash Opening Modal ── */}
            {postUnlockMode === 'cash-opening' && (
                <CashOpeningModal
                    onConfirm={(amount: number) => {
                        if (tenantId && nextWorker) {
                            setOpening(tenantId, nextWorker.id, amount)
                            setPostUnlockMode('none')
                            setTimeout(() => {
                                navigate('/pos')
                            }, 1000)
                        }
                    }}
                    isLoading={loading}
                />
            )}

            {/* ── Background glow ── */}
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(99,102,241,0.1),transparent_38%),radial-gradient(circle_at_85%_85%,rgba(56,189,248,0.08),transparent_40%)]" />
            </div>

            {/* ── Card ── */}
            <Card className="relative z-10 w-full max-w-sm border-white/10 bg-card/90 backdrop-blur">
                <CardContent className="flex flex-col items-center gap-8 px-6 py-10">

                {/* Logo / title */}
                <div className="flex flex-col items-center gap-2 text-center">
                    <div className="mb-1 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/20 text-primary ring-1 ring-primary/30">
                        <span className="text-3xl" role="img" aria-label="Wonka">❤</span>
                    </div>
                    <h1 className="text-3xl font-extrabold tracking-tight">Wonka</h1>
                    <p className="text-sm font-medium text-muted-foreground">Sistema de Punto de Venta</p>
                </div>

                {/* Subtitle / instruction */}
                <p className="min-h-5 text-center text-sm text-muted-foreground transition-all duration-200">
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
                    <Button
                        onClick={() => selectMode('attendance')}
                        disabled={loading}
                        variant={mode === 'attendance' ? 'default' : 'secondary'}
                        className={`
              flex items-center justify-center gap-3
              h-14 rounded-xl text-base
              transition-all duration-200
            `}
                    >
                        <Clock className="w-5 h-5 flex-shrink-0" />
                        {mode === 'attendance' && loading ? 'Registrando...' : 'Registrar Asistencia'}
                    </Button>

                    <Button
                        onClick={() => selectMode('unlock')}
                        disabled={loading}
                        variant={mode === 'unlock' ? 'default' : 'secondary'}
                        className={`
              flex items-center justify-center gap-3
              h-14 rounded-xl text-base
              transition-all duration-200
            `}
                    >
                        <LogIn className="w-5 h-5 flex-shrink-0" />
                        {mode === 'unlock' && loading ? 'Verificando...' : 'Desbloquear POS'}
                    </Button>
                </div>

                {/* Tenant badge */}
                <Badge variant="outline" className="font-mono text-[10px] tracking-wide">{tenantId}</Badge>
                </CardContent>
            </Card>

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
                            ? 'bg-emerald-900/70 border-emerald-500/30 text-emerald-100'
                            : toast.type === 'error'
                                ? 'bg-red-900/70 border-red-500/30 text-red-100'
                                : 'bg-muted border-border text-foreground'
                        }
          `}
                >
                    {toast.message}
                </div>
            )}
        </div>
    )
}
