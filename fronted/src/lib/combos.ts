// Combos / promociones: "2 galletas a S/3", "1 hora + 1 galleta a S/X". Aquí solo se calcula para MOSTRAR el
// descuento en el carrito; el backend repite el cálculo al cobrar (es la fuente de verdad) con el mismo algoritmo.
import type { CartItem } from '@/types'
import type { PlayzoneChargeLine } from '@/store/playzoneTicketStore'

export interface ComboItem { productId?: string; minutes?: number; qty: number }
export interface Combo { id: string; name: string; price: number; isActive: boolean; items: ComboItem[] }

export interface ComboResult {
  /** [{ comboId, times }] para mandar al cobrar */
  requests: Array<{ comboId: string; times: number }>
  applied: Array<{ comboId: string; name: string; times: number; discount: number }>
  productDiscount: Map<string, number>
  timeDiscount: Map<string, number>
  total: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

function split(weights: number[], total: number): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  const out = weights.map((w) => (sum > 0 ? round2((total * w) / sum) : 0))
  const diff = round2(total - out.reduce((a, b) => a + b, 0))
  if (out.length) out[out.length - 1] = round2(out[out.length - 1]! + diff)
  return out
}

/** Aplica, en orden de mayor ahorro, todos los combos activos que la venta permita. */
export function computeCombos(combos: Combo[], cart: CartItem[], charges: PlayzoneChargeLine[]): ComboResult {
  const remaining = new Map(cart.filter((i) => !i.product.id.startsWith('free-sale-')).map((i) => [i.product.id, i.quantity]))
  const price = new Map(cart.map((i) => [i.product.id, i.product.price]))
  const ally = new Set(charges.filter((c) => c.kind === 'disc').map((c) => c.sessionId))
  const pool = charges
    .filter((c) => c.kind === 'base' && c.minutes && c.total > 0 && !ally.has(c.sessionId))
    .map((c) => ({ sku: c.id, minutes: c.minutes!, amount: c.total }))

  const productDiscount = new Map<string, number>()
  const timeDiscount = new Map<string, number>()
  const requests: ComboResult['requests'] = []
  const applied: ComboResult['applied'] = []

  // Ahorro por uso con precios de hoy, para aplicar primero los que más ahorran
  const regularOf = (c: Combo) => c.items.reduce((s, it) => s + (it.productId ? (price.get(it.productId) ?? 0) * it.qty : 0), 0)
  const ordered = combos.filter((c) => c.isActive).sort((a, b) => regularOf(b) - b.price - (regularOf(a) - a.price))

  for (const combo of ordered) {
    let times = 0
    let total = 0
    for (;;) {
      // ¿alcanza lo que queda para un uso más del combo?
      const tryRem = new Map(remaining)
      const tryPool = [...pool]
      const picks: Array<{ kind: 'p' | 't'; key: string; amount: number }> = []
      let ok = true
      for (const comp of combo.items) {
        if (comp.productId) {
          const have = tryRem.get(comp.productId) ?? 0
          if (have < comp.qty) { ok = false; break }
          tryRem.set(comp.productId, have - comp.qty)
          picks.push({ kind: 'p', key: comp.productId, amount: round2((price.get(comp.productId) ?? 0) * comp.qty) })
        } else {
          for (let q = 0; q < comp.qty && ok; q++) {
            const idx = tryPool.findIndex((t) => t.minutes === comp.minutes)
            if (idx < 0) { ok = false; break }
            const [t] = tryPool.splice(idx, 1)
            picks.push({ kind: 't', key: t!.sku, amount: t!.amount })
          }
        }
        if (!ok) break
      }
      if (!ok) break
      const regular = round2(picks.reduce((s, p) => s + p.amount, 0))
      const disc = round2(regular - combo.price)
      if (disc <= 0) break
      // consumir
      tryRem.forEach((v, k) => remaining.set(k, v))
      pool.length = 0; pool.push(...tryPool)
      split(picks.map((p) => p.amount), disc).forEach((share, i) => {
        const m = picks[i]!.kind === 'p' ? productDiscount : timeDiscount
        m.set(picks[i]!.key, round2((m.get(picks[i]!.key) ?? 0) + share))
      })
      times += 1
      total += disc
    }
    if (times > 0) {
      requests.push({ comboId: combo.id, times })
      applied.push({ comboId: combo.id, name: combo.name, times, discount: round2(total) })
    }
  }
  return { requests, applied, productDiscount, timeDiscount, total: round2(applied.reduce((s, a) => s + a.discount, 0)) }
}
