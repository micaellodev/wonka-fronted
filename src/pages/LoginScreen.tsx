// ============================================================
// LoginScreen — Minimalist dark redesign
// ============================================================

import { useState, useCallback, useRef } from 'react'
import { Logo } from '@/components/Logo'
import { PinPad } from '@/components/PinPad'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import type { Worker } from '@/types'

interface ToastState {
 type: 'success' | 'error' | 'info'
 message: string
}

export function LoginScreen() {
 const { tenantId, setSession } = useAuthStore()

 const [loading, setLoading] = useState(false)
 const [hasError, setHasError] = useState(false)
 const [toast, setToast] = useState<ToastState | null>(null)
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
 const { data, error } = await api.hr['verify-pin'].post({ tenantId, pin })
 if (error) {
 triggerError()
 showToast({ type: 'error', message: (error.value as { message?: string })?.message ?? 'PIN inválido.' })
 return
 }
 const { data: worker, token, permissions } = data as { data: Worker; token: string; permissions?: string[] }
 setSession(worker, token, permissions)
 showToast({ type: 'success', message: `Bienvenido, ${worker.name}!` })
 } catch {
 triggerError()
 showToast({ type: 'error', message: 'Error de conexión. Verifica el servidor.' })
 } finally {
 setLoading(false)
 }
 },
 [loading, tenantId, setSession, triggerError, showToast],
 )

 return (
 <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-muted px-4">
 <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-muted via-background to-muted" />

 <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-background shadow-2xl">
 <div className="flex flex-col items-center gap-7 px-7 py-10">
 <div className="flex flex-col items-center gap-3 text-center">
 <Logo variant="full" className="h-16 w-auto" />
 <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">Sistema de Punto de Venta</p>
 </div>

 <p className="min-h-4 text-center text-sm text-muted-foreground transition-all duration-200">
 Ingresa tu PIN para entrar al sistema
 </p>

 <div className="w-full animate-fade-in">
 <PinPad onComplete={handlePinComplete} disabled={loading} hasError={hasError} />
 </div>

 <span className="rounded-full border border-border px-3 py-1 font-mono text-[11px] tracking-widest text-muted-foreground">
 {tenantId}
 </span>
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
 border animate-fade-in
 ${toast.type === 'success'
 ? 'bg-secondary-50 border-secondary-200 text-secondary-600'
 : toast.type === 'error'
 ? 'bg-brand-50 border-brand-200 text-brand-600'
 : 'bg-background border-border text-muted-foreground'
 }
 `}
 >
 {toast.message}
 </div>
 )}
 </div>
 )
}

