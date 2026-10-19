import { useEffect, useState } from 'react'

export const money = (v: number) =>
 new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 }).format(v)

/** Readable message from an Eden error: backend messages are Spanish; schema validation ones are not. */
export function apiMsg(error: unknown, fallback: string): string {
 const v = (error as { value?: unknown } | null)?.value as string | { type?: string; message?: string } | undefined
 if (typeof v === 'string') return v.trim() || fallback
 if (v?.type === 'validation') return fallback
 return v?.message ?? fallback
}

export function useDebounced<T>(value: T, ms = 350): T {
 const [v, setV] = useState(value)
 useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
 return v
}

export const selectClass =
 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'

export const MOVEMENT_LABEL: Record<string, string> = {
 INICIAL: 'Inicial', ENTRADA: 'Entrada', SALIDA: 'Salida', CORRECCION: 'Corrección',
 VENTA: 'Venta', ANULACION: 'Anulación', IMPORTACION: 'Importación',
}
