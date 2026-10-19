import type { Product } from '@/types'

export type PaymentMethod = 'efectivo' | 'yape' | 'tarjeta'
export type InvoiceType = 'TICKET' | 'BOLETA' | 'FACTURA'
export type IgvRegime = 'GRAVADO' | 'EXONERADO' | 'INAFECTO' | 'ICBPER' | 'GRAVADO_10_5'

export interface TenantFiscalConfig {
 igvRate: number
 defaultIgvRegime: IgvRegime
 pricesIncludeIgv: boolean
 ruc?: string | null
 razonSocial?: string | null
 nombreComercial?: string | null
 direccion?: string | null
 receiptFooter?: string | null
 name?: string | null
}

export interface CheckoutLine {
 product: Product
 qty: number
 mtoValorVenta: number
 mtoIGV: number
 mtoImpItem: number
 regime: IgvRegime
}

export function numberToWords(n: number): string {
 const ones = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIUN', 'VEINTIDOS', 'VEINTITRES', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISEIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE']
 const tens = ['', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
 const hundreds = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS']

 if (n === 0) return 'CERO'
 if (n === 100) return 'CIEN'

 let result = ''
 const intPart = Math.floor(n)
 const cents = Math.round((n - intPart) * 100)

 if (intPart >= 1000) {
  const thousands = Math.floor(intPart / 1000)
  result += thousands === 1 ? 'MIL' : `${hundreds[thousands] || ''} MIL`.trim()
  const remainder = intPart % 1000
  if (remainder > 0) result += ' '
  if (remainder <= 30) {
   result += ones[remainder]
  } else {
   const t = Math.floor(remainder / 10)
   const o = remainder % 10
   result += tens[t]
   if (o > 0) result += ` Y ${ones[o]}`
  }
 } else if (intPart > 100) {
  const h = Math.floor(intPart / 100)
  result += hundreds[h]
  const remainder = intPart % 100
  if (remainder > 0) {
   result += ' '
   if (remainder <= 30) result += ones[remainder]
   else {
    const t = Math.floor(remainder / 10)
    const o = remainder % 10
    result += tens[t]
    if (o > 0) result += ` Y ${ones[o]}`
   }
  }
 } else if (intPart > 30) {
  const t = Math.floor(intPart / 10)
  const o = intPart % 10
  result += tens[t]
  if (o > 0) result += ` Y ${ones[o]}`
 } else {
  result += ones[intPart]
 }

 result += ' CON '
 if (cents === 0) result += '00'
 else if (cents <= 30) result += ones[cents].padStart(2, '0')
 else {
  const t = Math.floor(cents / 10)
  const o = cents % 10
  result += tens[t]
  if (o > 0) result += ` Y ${ones[o]}`
 }
 result += '/100'
 return result
}

export interface SaleResultItem { productName: string; qty: number; unitPrice: string; lineTotal: string }

export function resolveRegime(productRegime: string | null | undefined, tenantDefault: IgvRegime): IgvRegime {
 const r = (productRegime ?? tenantDefault).toUpperCase()
 if (r === 'GRAVADO') return 'GRAVADO'
 if (r === 'INAFECTO') return 'INAFECTO'
 if (r === 'ICBPER') return 'ICBPER'
 if (r === 'GRAVADO_10_5') return 'GRAVADO_10_5'
 return 'EXONERADO'
}

export function calculateLine(product: Product, qty: number, config: TenantFiscalConfig): CheckoutLine {
 const regime = resolveRegime(product.igvRegime, config.defaultIgvRegime)
 const unitPrice = product.price

 if (regime === 'EXONERADO' || regime === 'INAFECTO') {
 const mtoValorVenta = unitPrice * qty
 return { product, qty, mtoValorVenta, mtoIGV: 0, mtoImpItem: mtoValorVenta, regime }
 }

 const rate = regime === 'GRAVADO_10_5' ? 10.5 / 100 : (regime === 'ICBPER' ? config.igvRate / 100 : config.igvRate / 100)
 const mtoValorUnitario = config.pricesIncludeIgv ? unitPrice / (1 + rate) : unitPrice
 const mtoValorVenta = mtoValorUnitario * qty
 const mtoIGV = mtoValorVenta * rate
 const mtoImpItem = mtoValorVenta + mtoIGV

 return {
 product,
 qty,
 mtoValorVenta: Number(mtoValorVenta.toFixed(2)),
 mtoIGV: Number(mtoIGV.toFixed(2)),
 mtoImpItem: Number(mtoImpItem.toFixed(2)),
 regime,
 }
}
