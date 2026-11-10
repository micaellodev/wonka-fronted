import { create } from 'zustand'
import { api } from '@/lib/api'
import { useCartStore } from '@/store/cartStore'
import { usePlayzoneTicketStore } from '@/store/playzoneTicketStore'
import { computeCombos, type Combo, type ComboResult } from '@/lib/combos'
import { useMemo } from 'react'

interface ComboState {
  combos: Combo[]
  load: (tenantId: string) => Promise<void>
}

/** Combos activos del negocio (se cargan al abrir el punto de venta). */
export const useComboStore = create<ComboState>((set) => ({
  combos: [],
  load: async (tenantId) => {
    try {
      const { data, error } = await api.combos.get({ query: { tenantId, active: 'true' } })
      if (!error) set({ combos: ((data as { data?: Combo[] })?.data ?? []) })
    } catch {
      /* sin combos: el cobro sigue normal */
    }
  },
}))

/** Descuento por combos de lo que hay hoy en el carrito y el ticket de juegos. */
export function useComboDiscount(): ComboResult {
  const combos = useComboStore((s) => s.combos)
  const items = useCartStore((s) => s.items)
  const charges = usePlayzoneTicketStore((s) => s.charges)
  return useMemo(() => computeCombos(combos, items, charges), [combos, items, charges])
}
