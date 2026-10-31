// Organización del catálogo SIN cambiar la base de datos:
//  - Subcategoría: el nombre de la categoría guarda la ruta, "Bebidas › Gaseosas".
//  - Variante: cada variante es un producto real (con su stock y precio), nombrado "Helado con toppings · Yogurt griego".
//  - SKU: se genera solo, "<3 letras de la categoría>-<número correlativo>".
export const CAT_SEP = ' › '
export const VAR_SEP = ' · '

export interface CategoryLike { id: string; name: string }

export function splitCategory(name: string): { parent: string | null; leaf: string } {
 const i = name.indexOf(CAT_SEP)
 return i < 0 ? { parent: null, leaf: name } : { parent: name.slice(0, i), leaf: name.slice(i + CAT_SEP.length) }
}
export const joinCategory = (parent: string, leaf: string) => `${parent.trim()}${CAT_SEP}${leaf.trim()}`
/** Categoría principal a la que pertenece (ella misma si no es subcategoría). */
export const topCategory = (name: string) => splitCategory(name).parent ?? name

export function splitVariant(name: string): { base: string; variant: string | null } {
 const i = name.indexOf(VAR_SEP)
 return i < 0 ? { base: name, variant: null } : { base: name.slice(0, i), variant: name.slice(i + VAR_SEP.length) }
}
export const joinVariant = (base: string, variant: string) => `${base.trim()}${VAR_SEP}${variant.trim()}`

/** Principales primero (A-Z), cada una seguida de sus subcategorías (A-Z). */
export function sortCategories<T extends CategoryLike>(cats: T[]): T[] {
 const key = (c: T) => { const s = splitCategory(c.name); return [(s.parent ?? s.leaf).toLowerCase(), s.parent ? 1 : 0, s.leaf.toLowerCase()] as const }
 return [...cats].sort((a, b) => { const x = key(a), y = key(b); return x[0].localeCompare(y[0], 'es') || x[1] - y[1] || x[2].localeCompare(y[2], 'es') })
}

/** Opciones para un <select>: una principal con sus hijas va en un grupo. */
export function categoryGroups<T extends CategoryLike>(cats: T[]): Array<{ label: string; items: Array<{ id: string; label: string }> }> {
 const groups = new Map<string, Array<{ id: string; label: string }>>()
 for (const c of sortCategories(cats)) {
  const { parent, leaf } = splitCategory(c.name)
  const g = groups.get(parent ?? leaf) ?? []
  g.push({ id: c.id, label: parent ? leaf : (cats.some((o) => splitCategory(o.name).parent === leaf) ? `${leaf} (general)` : leaf) })
  groups.set(parent ?? leaf, g)
 }
 return [...groups].map(([label, items]) => ({ label, items }))
}

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '')

/** "Bebidas › Gaseosas" → "GAS"; "Helados y postres" → "HEL". Sin letras usables → "PRO". */
export function skuPrefix(categoryName: string): string {
 const p = strip(splitCategory(categoryName).leaf).slice(0, 3)
 return p ? p.padEnd(3, 'X') : 'PRO'
}

/** Siguientes SKU libres para el prefijo, mirando los que ya existen (ignora mayúsculas). */
export function nextSkus(prefix: string, existing: string[], count = 1): string[] {
 let max = 0
 const re = new RegExp(`^${prefix}-(\\d+)$`, 'i')
 for (const s of existing) { const m = re.exec(s.trim()); if (m) max = Math.max(max, Number(m[1])) }
 return Array.from({ length: count }, (_, i) => `${prefix}-${String(max + 1 + i).padStart(4, '0')}`)
}

type Grouped<P> = { type: 'group'; base: string; variants: P[] } | { type: 'single'; product: P }

/** Agrupa productos con la misma base y categoría (2 o más variantes); el resto queda suelto. */
export function groupVariants<P extends { id: string; name: string; category: { id: string } }>(products: P[]): Array<Grouped<P>> {
 const keyOf = (p: P) => `${p.category.id}::${splitVariant(p.name).base.toLowerCase()}`
 const groups = new Map<string, P[]>()
 for (const p of products) {
  if (splitVariant(p.name).variant === null) continue
  groups.set(keyOf(p), [...(groups.get(keyOf(p)) ?? []), p])
 }
 const seen = new Set<string>()
 const result: Array<Grouped<P>> = []
 for (const p of products) {
  const g = splitVariant(p.name).variant === null ? undefined : groups.get(keyOf(p))
  if (g && g.length >= 2) {
   if (!seen.has(keyOf(p))) { seen.add(keyOf(p)); result.push({ type: 'group', base: splitVariant(p.name).base, variants: g }) }
  } else result.push({ type: 'single', product: p })
 }
 return result
}
