const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export function formatSpanishDate(isoDate: string | null): string {
  const d = isoDate ? new Date(isoDate) : new Date()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${hh}:${mm}`
}

export interface CashCloseRecord {
  id: string
  openingBalance: number
  totalSales: number
  expectedEfectivo: number
  expectedYape: number
  expectedTarjeta: number
  expectedUnknown: number
  totalExpected: number
  countedCash: number
  difference: number
  status: string
  closedDate: string
}
