import { formatPEN } from '@/lib/format'
import { printVoucher, type VoucherRow } from '@/lib/print'
import type { CashSummary } from '@/store/cashStatusStore'
import { getCorrelativo, type Sale } from '../sales-history/helpers'

export interface CashCloseReportInput {
  companyTitle: string
  companyLegal: string
  openingTime: string
  closingTime: string
  cashier: string
  summary: CashSummary
  /** Ventas del día; se filtran a las del turno (desde la apertura). */
  sales: Sale[]
  counted: { efectivo: number; yape: number; tarjeta: number }
  expectedEfectivo: number
}

const METHOD_CODE: Record<string, string> = { efectivo: 'EF', yape: 'YP', plin: 'YP', qr: 'YP', tarjeta: 'TJ' }
const lima = { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false } as const

/** Reporte completo de cierre de caja: resumen por medio de pago, movimientos, cuadre y detalle de cada venta del turno. */
export function printCashCloseReport(i: CashCloseReportInput) {
  const { summary: s } = i
  const shift = s.shift
  const since = s.opening ? new Date(s.opening.at).getTime() : 0
  const sales = i.sales
    .filter((x) => new Date(x.createdAt).getTime() >= since)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  const active = sales.filter((x) => x.status !== 'CANCELLED')
  const countOf = (m: string) => active.filter((x) => (METHOD_CODE[(x.paymentMethod || '').toLowerCase()] ?? 'EF') === m).length
  const diff = (counted: number, expected: number) => formatPEN(counted - expected)
  const by = shift.sales.byMethod

  const rows: VoucherRow[] = [
    { section: 'Resumen de ventas' },
    { label: `Efectivo (${countOf('EF')})`, value: formatPEN(by.efectivo) },
    { label: `Yape (${countOf('YP')})`, value: formatPEN(by.yape) },
    { label: `Tarjeta (${countOf('TJ')})`, value: formatPEN(by.tarjeta) },
    ...(by.other > 0 ? [{ label: 'Otros', value: formatPEN(by.other) }] : []),
    'line',
    { label: `TOTAL VENTAS (${shift.sales.count})`, value: formatPEN(shift.sales.total), bold: true },
    { label: `Anuladas (${shift.voided.count})`, value: formatPEN(shift.voided.total) },
    { section: 'Por tipo' },
    { label: 'Productos', value: formatPEN(shift.sales.byKind.productos) },
    { label: 'Zona de juegos', value: formatPEN(shift.sales.byKind.zonaJuegos) },
    { label: 'Venta libre', value: formatPEN(shift.sales.byKind.ventaLibre) },
    { section: 'Movimientos de caja' },
    { label: `Entradas (${shift.movements.inCount})`, value: formatPEN(shift.movements.in) },
    { label: `Salidas (${shift.movements.outCount})`, value: formatPEN(shift.movements.out) },
    ...(shift.movements.inUSD || shift.movements.outUSD
      ? [{ label: 'Dólares ent./sal.', value: `${shift.movements.inUSD.toFixed(2)} / ${shift.movements.outUSD.toFixed(2)}` }]
      : []),
    { section: 'Cuadre' },
    { label: 'Apertura inicial', value: formatPEN(s.opening?.amount ?? 0) },
    'line',
    { label: 'EFECTIVO', value: '', bold: true },
    { label: ' Esperado', value: formatPEN(i.expectedEfectivo) },
    { label: ' Contado', value: formatPEN(i.counted.efectivo) },
    { label: ' Diferencia', value: diff(i.counted.efectivo, i.expectedEfectivo) },
    { label: 'YAPE', value: '', bold: true },
    { label: ' Esperado', value: formatPEN(by.yape) },
    { label: ' Contado', value: formatPEN(i.counted.yape) },
    { label: ' Diferencia', value: diff(i.counted.yape, by.yape) },
    { label: 'TARJETA', value: '', bold: true },
    { label: ' Esperado', value: formatPEN(by.tarjeta) },
    { label: ' Contado', value: formatPEN(i.counted.tarjeta) },
    { label: ' Diferencia', value: diff(i.counted.tarjeta, by.tarjeta) },
    'line',
    { label: 'TOTAL CONTADO', value: formatPEN(i.counted.efectivo + i.counted.yape + i.counted.tarjeta), bold: true },
    {
      label: 'DIFERENCIA TOTAL',
      value: formatPEN(i.counted.efectivo - i.expectedEfectivo + (i.counted.yape - by.yape) + (i.counted.tarjeta - by.tarjeta)),
      bold: true,
    },
    { section: `Detalle de ventas (${sales.length})` },
    ...(sales.length === 0 ? [{ label: 'Sin ventas en el turno', value: '' }] : []),
    ...sales.map((x): VoucherRow => {
      const cancelled = x.status === 'CANCELLED'
      const time = new Date(x.createdAt).toLocaleTimeString('es-PE', lima)
      const code = METHOD_CODE[(x.paymentMethod || '').toLowerCase()] ?? 'EF'
      return {
        label: `${time} ${getCorrelativo(x)} ${code}${cancelled ? ' ANUL' : ''}`,
        value: cancelled ? `(${Number(x.total).toFixed(2)})` : Number(x.total).toFixed(2),
        small: true,
      }
    }),
    'line',
    { label: '', value: '' },
    { label: '________________', value: '________________' },
    { label: 'Cajero', value: i.cashier },
  ]

  return printVoucher(
    [i.companyTitle || 'Caja', i.companyLegal, 'CIERRE DE CAJA', `Apertura: ${i.openingTime}`, `Cierre: ${i.closingTime}`, `Cajero: ${i.cashier}`].filter(Boolean),
    rows,
  )
}
