export interface CashCloseRecord {
  id: string
  usd: number
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
  approvedByWorkerId?: string | null
  approvedAt?: string | null
  closedDate: string
  createdAt: string
  worker: { id: string; name: string }
}

export interface ShiftItem {
  id: string
  /** Lima business day (YYYY-MM-DD) used by the date filters */
  dateKey: string
  isEnCurso: boolean
  startTime: string
  endTime?: string
  cajeroApertura: string
  cajeroCierre: string
  montoSoles: number
  montoDolares: number
  rawRecord?: CashCloseRecord
}

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export const formatCurrencyUSD = (v: number) =>
  `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const formatLongDate = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`

/** YYYY-MM-DD of `date` in Lima (business timezone, same as the backend). */
export const formatDateKey = (date: Date) => date.toLocaleDateString('en-CA', { timeZone: 'America/Lima' })

/** Picker value (YYYY-MM-DD) as noon in Lima, so formatDateKey returns the same day anywhere. */
export const fromDateKey = (val: string) => new Date(`${val}T12:00:00-05:00`)

export function formatShiftTimeString(startIso: string, isEnCurso: boolean, endIso?: string) {
  const p = (n: number) => String(n).padStart(2, '0')
  const start = new Date(startIso)
  const head = `${p(start.getDate())}-${p(start.getMonth() + 1)}-${start.getFullYear()} | ${p(start.getHours())}:${p(start.getMinutes())}`
  if (isEnCurso) return `${head} - En Curso`
  if (endIso) {
    const end = new Date(endIso)
    return `${head} - ${p(end.getHours())}:${p(end.getMinutes())}`
  }
  return `${head} - Cerrado`
}
