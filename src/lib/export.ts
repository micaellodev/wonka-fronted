// Exportación de tablas a CSV o Excel (.xlsx). Las filas son arreglos; la primera es el encabezado.
import { downloadCsv } from './csv'

export type ExportRow = Array<string | number | null | undefined>

/** Excel: SheetJS se carga solo al exportar (pesa ~400 KB). Los textos se guardan como texto: no se interpretan como fórmulas. */
export async function downloadXlsx(filename: string, rows: ExportRow[], sheetName = 'Datos') {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.aoa_to_sheet(rows.map((r) => r.map((c) => c ?? '')))
  ws['!cols'] = (rows[0] ?? []).map((_, i) => ({ wch: Math.min(40, Math.max(10, ...rows.map((r) => String(r[i] ?? '').length))) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
  XLSX.writeFile(wb, filename)
}

export { downloadCsv }
