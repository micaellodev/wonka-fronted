import { create } from 'zustand'
import { api } from '@/lib/api'

export type CashStatus = 'NO_ABIERTA' | 'ABIERTA' | 'PENDIENTE' | 'CERRADA'

export const CASH_LABEL: Record<CashStatus, string> = {
 NO_ABIERTA: 'No abierta',
 ABIERTA: 'Abierta',
 PENDIENTE: 'Pendiente de aprobación',
 CERRADA: 'Cerrada',
}

/** Shape of GET /cash/summary (backend getDaySummary): the only source of cash figures. */
export interface CashSummary {
 date: string
 cashStatus: CashStatus
 opening: { amount: number; at: string; workerName: string } | null
 close: { id: string; status: string; countedCash: number; difference: number; at: string; workerName: string; totalExpected: number } | null
 sales: { count: number; total: number; byMethod: { efectivo: number; yape: number; tarjeta: number; other: number }; byKind: { productos: number; zonaJuegos: number; ventaLibre: number } }
 voided: { count: number; total: number }
 movements: { in: number; out: number; inUSD: number; outUSD: number; inCount: number; outCount: number; count: number }
 /** Turno actual (= el día completo si hay una sola apertura): lo que se cuadra y se cierra. `sales`/`voided` de arriba son del DÍA. */
 shift: {
  number: number
  sales: CashSummary['sales']
  voided: { count: number; total: number }
  movements: CashSummary['movements']
 }
 expectedCash: number
 cashInflow: number
 expectedTotal: number
 pending: { voids: number; closes: number }
 stock: { lowStock: number; outOfStock: number }
}

interface CashStatusState {
 summary: CashSummary | null
 error: string | null
 /** True until the first response; afterwards stale data stays visible while refreshing. */
 loading: boolean
 refresh: (tenantId: string) => Promise<void>
 reset: () => void
}

let seq = 0

export const useCashStatusStore = create<CashStatusState>()((set) => ({
 summary: null,
 error: null,
 loading: true,
 refresh: async (tenantId) => {
 const mine = ++seq // drop out-of-order responses and ones landing after reset()
 try {
 const { data, error } = await api.cash.summary.get({ query: { tenantId } })
 if (error) throw error
 if (mine !== seq) return
 set({ summary: (data?.data ?? null) as unknown as CashSummary | null, error: null, loading: false })
 } catch {
 if (mine !== seq) return
 // Keep the last real summary; never invent figures.
 set({ error: 'No se pudo consultar el estado de caja.', loading: false })
 }
 },
 reset: () => { seq++; set({ summary: null, error: null, loading: true }) },
}))
