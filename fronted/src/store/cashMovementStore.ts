import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface ManualCashMovement {
  id: string
  tenantId: string
  workerId: string
  workerName: string
  type: 'IN' | 'OUT'
  amount: number
  currency: 'PEN' | 'USD'
  reason: string
  createdAt: string
}

interface CashMovementState {
  movements: ManualCashMovement[]
  addMovement: (movement: Omit<ManualCashMovement, 'id' | 'createdAt'>) => void
  clearTodayMovements: (tenantId: string) => void
  clearAllMovements: () => void
}

export const useCashMovementStore = create<CashMovementState>()(
  persist(
    (set, get) => ({
      movements: [],
      addMovement: (movement) => {
        const item: ManualCashMovement = {
          ...movement,
          id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          createdAt: new Date().toISOString(),
        }
        set({ movements: [item, ...get().movements].slice(0, 5000) })
      },
      clearTodayMovements: (tenantId: string) => {
        const todayStr = new Date().toDateString()
        const next = get().movements.filter(
          (m) =>
            m.tenantId !== tenantId ||
            new Date(m.createdAt).toDateString() !== todayStr
        )
        set({ movements: next })
      },
      clearAllMovements: () => set({ movements: [] }),
    }),
    {
      name: 'wonka-cash-movements',
    }
  )
)
