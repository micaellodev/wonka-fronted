import { toast } from '@/components/ui/toast'

/** Imprime un HTML. En la app de escritorio sale directo a la impresora elegida (Impresora → configuración); en el navegador abre el diálogo de impresión. */
export async function printHtml(html: string): Promise<boolean> {
  const api = window.electronAPI
  if (api?.printSilent) {
    const r = await api.printSilent(html).catch((e: unknown) => ({ ok: false, error: String(e) }))
    if (!r.ok) toast.error(r.error ?? 'No se pudo imprimir.')
    return r.ok
  }
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:none'
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument
  if (!doc) { iframe.remove(); return false }
  doc.open()
  doc.write(html)
  doc.close()
  iframe.contentWindow?.focus()
  iframe.contentWindow?.print()
  setTimeout(() => iframe.remove(), 1000)
  return true
}

export type VoucherRow = { label: string; value: string; bold?: boolean } | 'line'

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** Comprobante interno de texto (cierres de caja/turno): cabecera centrada y filas etiqueta/valor, para papel de rollo o de hoja. */
export function printVoucher(head: string[], rows: VoucherRow[]): Promise<boolean> {
  const body = rows.map((r) =>
    r === 'line'
      ? '<div class="line"></div>'
      : `<div class="row${r.bold ? ' b' : ''}"><span>${esc(r.label)}</span><span>${esc(r.value)}</span></div>`).join('')
  return printHtml(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><style>
    *{box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:11px;color:#000;margin:0;padding:10px;width:80mm}
    .c{text-align:center;text-transform:uppercase}.c p{margin:2px 0}.c p:first-child{font-size:13px;font-weight:bold}
    .row{display:flex;justify-content:space-between;gap:8px;padding:2px 0}.b{font-weight:bold}.line{border-bottom:1px dashed #000;margin:6px 0}
  </style></head><body><div class="c">${head.map((h) => `<p>${esc(h)}</p>`).join('')}</div><div class="line"></div>${body}</body></html>`)
}
