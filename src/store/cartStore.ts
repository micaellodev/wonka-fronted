// ============================================================
//  Cart Store — Zustand
//  Manages the active POS session cart items, quantities,
//  and derived totals. All operations are tenant/session-local.
// ============================================================

import { create } from 'zustand'
import type { Product, CartItem } from '@/types'

interface CartState {
    /** Items currently in the cart */
    items: CartItem[]

    // ── Derived ────────────────────────────────────────────────
    /** Sum of (price × quantity) for every cart item */
    total: number

    // ── Actions ────────────────────────────────────────────────
    /** Add one unit of a product. Respects stock limits. */
    addItem: (product: Product) => void
    /** Remove one unit. If quantity reaches 0, removes the entry. */
    decrementItem: (productId: string) => void
    /** Remove the product line entirely regardless of quantity. */
    removeItem: (productId: string) => void
    /** Set exact quantity for a product (clamped 1–stock). */
    setQuantity: (productId: string, quantity: number) => void
    /** Wipe the whole cart (after a successful sale or cancel). */
    clearCart: () => void
}

const calcTotal = (items: CartItem[]): number =>
    items.reduce((sum, i) => sum + i.product.price * i.quantity, 0)

export const useCartStore = create<CartState>((set, get) => ({
    items: [],
    total: 0,

    addItem: (product) => {
        const existing = get().items.find((i) => i.product.id === product.id)

        let next: CartItem[]
        if (existing) {
            // Respect stock ceiling
            if (existing.quantity >= product.stock) return
            next = get().items.map((i) =>
                i.product.id === product.id
                    ? { ...i, quantity: i.quantity + 1 }
                    : i,
            )
        } else {
            if (product.stock === 0) return
            next = [...get().items, { product, quantity: 1 }]
        }

        set({ items: next, total: calcTotal(next) })
    },

    decrementItem: (productId) => {
        const next = get()
            .items.map((i) =>
                i.product.id === productId
                    ? { ...i, quantity: i.quantity - 1 }
                    : i,
            )
            .filter((i) => i.quantity > 0)

        set({ items: next, total: calcTotal(next) })
    },

    removeItem: (productId) => {
        const next = get().items.filter((i) => i.product.id !== productId)
        set({ items: next, total: calcTotal(next) })
    },

    setQuantity: (productId, quantity) => {
        const item = get().items.find((i) => i.product.id === productId)
        if (!item) return

        const clamped = Math.max(1, Math.min(quantity, item.product.stock))
        const next = get().items.map((i) =>
            i.product.id === productId ? { ...i, quantity: clamped } : i,
        )
        set({ items: next, total: calcTotal(next) })
    },

    clearCart: () => set({ items: [], total: 0 }),
}))
