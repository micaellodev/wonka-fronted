import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Cargos de zona de juegos pendientes de cobro en caja. El monto y la
// etiqueta vienen del backend (tarifas del tenant); al vender, el backend
// los recalcula desde la sesión y rechaza un cargo ya cobrado.

export type PlayzoneChargeKind = 'base' | 'extra' | 'free'

/** Shape returned by the backend (`charge` on session start/complete). */
export interface PlayzoneCharge {
 sku: string
 kind: PlayzoneChargeKind
 sessionId: string
 label: string
 amount: number
}

export interface PlayzoneChargeLine {
 /** virtualSku: pz-base-<id> | pz-extra-<id> | pz-free-<id> — sent as productId */
 id: string
 sessionId: string
 kind: PlayzoneChargeKind
 label: string
 qty: number
 unitPrice: number
 total: number
}

interface PlayzoneTicketState {
 charges: PlayzoneChargeLine[]
 total: number
 addCharge: (charge: PlayzoneCharge) => void
 removeCharge: (id: string) => void
 clearAllCharges: () => void
}

const calcTotal = (charges: PlayzoneChargeLine[]) =>
 charges.reduce((sum, c) => sum + c.total, 0)

export const usePlayzoneTicketStore = create<PlayzoneTicketState>()(
 persist(
 (set, get) => ({
 charges: [],
 total: 0,

 addCharge: (charge) => {
 if (charge.amount <= 0) return
 const line: PlayzoneChargeLine = {
 id: charge.sku,
 sessionId: charge.sessionId,
 kind: charge.kind,
 label: charge.label,
 qty: 1,
 unitPrice: charge.amount,
 total: charge.amount,
 }
 // Same sku replaces (never duplicates) the line
 const next = [...get().charges.filter((c) => c.id !== line.id), line]
 set({ charges: next, total: calcTotal(next) })
 },

 removeCharge: (id) => {
 const next = get().charges.filter((c) => c.id !== id)
 set({ charges: next, total: calcTotal(next) })
 },

 clearAllCharges: () => set({ charges: [], total: 0 }),
 }),
 {
 // Lines persisted by the old store share this shape; the backend re-prices them on sale
 name: 'wonka-playzone-ticket',
 }
 )
)
