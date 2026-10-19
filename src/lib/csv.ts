// Exporta filas a CSV (UTF-8 con BOM para que Excel respete tildes) y lo descarga.
// Las celdas de texto que empiezan con = + - @ se prefijan con ' para que Excel no las ejecute como fórmula.
const cell = (v: string | number | null | undefined) => {
  let s = v == null ? '' : String(v)
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return rows.map((r) => r.map(cell).join(',')).join('\r\n')
}

export function downloadCsv(filename: string, rows: Array<Array<string | number | null | undefined>>) {
  const url = URL.createObjectURL(new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
