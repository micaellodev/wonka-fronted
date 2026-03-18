import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type PlayzoneChargeKind = 'base' | 'extra'

export interface PlayzoneChargeLine {
    id: string
    sessionId: string
    kind: PlayzoneChargeKind
    code: string
    childName: string
    label: string
    qty: number
    unitPrice: number
    total: number
}

interface PlayzoneTicketState {
    charges: PlayzoneChargeLine[]
    total: number
    upsertBaseCharge: (input: {
        sessionId: string
        code: string
        childName: string
        durationLabel: string
        amount: number
    }) => void
    upsertExtraCharge: (input: {
        sessionId: string
        code: string
        childName: string
        extraMinutes: number
        extraRate: number
        amount: number
    }) => void
    clearAllCharges: () => void
}

const calcTotal = (charges: PlayzoneChargeLine[]) =>
    charges.reduce((sum, c) => sum + c.total, 0)

export const usePlayzoneTicketStore = create<PlayzoneTicketState>()(
    persist(
        (set, get) => ({
            charges: [],
            total: 0,

            upsertBaseCharge: ({ sessionId, code, childName, durationLabel, amount }) => {
                if (amount <= 0) return
                const id = `pz-base-${sessionId}`
                const nextLine: PlayzoneChargeLine = {
                    id,
                    sessionId,
                    kind: 'base',
                    code,
                    childName,
                    label: `JUEGOS ${durationLabel} [${code}] ${childName}`,
                    qty: 1,
                    unitPrice: amount,
                    total: amount,
                }
                const exists = get().charges.some((c) => c.id === id)
                const next = exists
                    ? get().charges.map((c) => (c.id === id ? nextLine : c))
                    : [...get().charges, nextLine]
                set({ charges: next, total: calcTotal(next) })
            },

            upsertExtraCharge: ({ sessionId, code, childName, extraMinutes, extraRate, amount }) => {
                const id = `pz-extra-${sessionId}`
                const hasLine = get().charges.some((c) => c.id === id)

                if (amount <= 0 || extraMinutes <= 0) {
                    if (!hasLine) return
                    const next = get().charges.filter((c) => c.id !== id)
                    set({ charges: next, total: calcTotal(next) })
                    return
                }

                const nextLine: PlayzoneChargeLine = {
                    id,
                    sessionId,
                    kind: 'extra',
                    code,
                    childName,
                    label: `EXTRA JUEGOS ${extraMinutes} MIN [${code}] ${childName}`,
                    qty: extraMinutes,
                    unitPrice: extraRate,
                    total: amount,
                }
                const next = hasLine
                    ? get().charges.map((c) => (c.id === id ? nextLine : c))
                    : [...get().charges, nextLine]
                set({ charges: next, total: calcTotal(next) })
            },

            clearAllCharges: () => set({ charges: [], total: 0 }),
        }),
        {
            name: 'wonka-playzone-ticket',
        }
    )
)
