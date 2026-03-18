import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type LedgerPaymentMethod = 'efectivo' | 'yape' | 'tarjeta'

export interface PaymentLedgerEntry {
    id: string
    tenantId: string
    workerId: string
    method: LedgerPaymentMethod
    amount: number
    createdAt: string
}

interface PaymentLedgerState {
    entries: PaymentLedgerEntry[]
    recordPayment: (input: {
        tenantId: string
        workerId: string
        method: LedgerPaymentMethod
        amount: number
    }) => void
    clearTodayEntries: (tenantId: string, methods?: LedgerPaymentMethod[]) => void
    clearAllEntries: () => void
}

export const usePaymentLedgerStore = create<PaymentLedgerState>()(
    persist(
        (set, get) => ({
            entries: [],
            recordPayment: ({ tenantId, workerId, method, amount }) => {
                if (amount <= 0) return
                const entry: PaymentLedgerEntry = {
                    id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    tenantId,
                    workerId,
                    method,
                    amount,
                    createdAt: new Date().toISOString(),
                }
                const next = [...get().entries, entry].slice(-5000)
                set({ entries: next })
            },
            clearTodayEntries: (tenantId: string, methods?: LedgerPaymentMethod[]) => {
                const today = new Date().toDateString()
                const next = get().entries.filter((entry) => {
                    if (entry.tenantId !== tenantId) return true
                    if (new Date(entry.createdAt).toDateString() !== today) return true
                    if (!methods || methods.length === 0) return false
                    return !methods.includes(entry.method)
                })
                set({ entries: next })
            },
            clearAllEntries: () => {
                set({ entries: [] })
            },
        }),
        { name: 'wonka-payment-ledger' }
    )
)
