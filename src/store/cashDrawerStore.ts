import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CashDrawerState {
  tenantId: string | null;
  workerId: string | null;
  openingBalance: number | null;
  isOpened: boolean;
  openedAt: string | null;
  carryOverBalance: number | null;
  carryOverSetAt: string | null;
  requireManualOpening: boolean;
  setOpening: (tenantId: string, workerId: string, amount: number) => void;
  setCarryOverBalance: (amount: number) => void;
  setRequireManualOpening: (value: boolean) => void;
  clearOpening: () => void;
  reset: () => void;
}

export const useCashDrawerStore = create<CashDrawerState>()(
  persist(
    (set) => ({
      tenantId: null,
      workerId: null,
      openingBalance: null,
      isOpened: false,
      openedAt: null,
      carryOverBalance: null,
      carryOverSetAt: null,
      requireManualOpening: false,

      setOpening: (tenantId: string, workerId: string, amount: number) => {
        set({
          tenantId,
          workerId,
          openingBalance: amount,
          isOpened: true,
          openedAt: new Date().toISOString(),
          // Consume carry-over once the new day is opened
          carryOverBalance: null,
          carryOverSetAt: null,
          requireManualOpening: false,
        });
      },

      setCarryOverBalance: (amount: number) => {
        set({
          carryOverBalance: amount,
          carryOverSetAt: new Date().toISOString(),
        });
      },

      setRequireManualOpening: (value: boolean) => {
        set({ requireManualOpening: value });
      },

      clearOpening: () => {
        set({
          tenantId: null,
          workerId: null,
          openingBalance: null,
          isOpened: false,
          openedAt: null,
          requireManualOpening: true,
        });
      },

      reset: () => {
        set({
          tenantId: null,
          workerId: null,
          openingBalance: null,
          isOpened: false,
          openedAt: null,
          carryOverBalance: null,
          carryOverSetAt: null,
          requireManualOpening: false,
        });
      },
    }),
    {
      name: 'wonka-cash-drawer',
      version: 1,
    }
  )
);
