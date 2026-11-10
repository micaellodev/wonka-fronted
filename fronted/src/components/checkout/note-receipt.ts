// Comprobante impreso de una nota de crédito / débito (80 mm), con el mismo estilo del recibo de venta.
import qrcode from 'qrcode-generator'
import { api } from '@/lib/api'
import { printHtml } from '@/lib/print'
import { toLima } from '@/lib/format'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/components/ui/toast'
import { RECEIPT_LOGO } from '@/components/receipt-logo'
import { escapeHtml } from './receipt'
import { numberToWords, type TenantFiscalConfig } from './fiscal'

/** Lo que devuelve el backend al emitir una nota (fila BillingNote). */
export interface PrintableNote {
  type: 'CREDIT_NOTE' | 'DEBIT_NOTE' | string
  serie: string
  correlative: string
  modifiedDocumentSerie?: string
  modifiedDocumentCorrelative?: string
  reasonCode?: string
  reasonDescription?: string
  clientDocType?: string
  clientDocNumber?: string
  clientName?: string
  totalAmount?: number | string
  sunatStatus?: string | null
  createdAt?: string
}

const pad = (n: number) => String(n).padStart(2, '0')

/** QR de SUNAT de la nota: RUC|07 (crédito) u 08 (débito)|serie|número|IGV|total|fecha|tipo doc cliente|doc cliente| */
function noteQrSvg(n: PrintableNote, config: TenantFiscalConfig, total: number, igv: number, d: Date): string | null {
  if (!config.ruc || !n.serie || !n.correlative) return null
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  const doc = (n.clientDocNumber || '').trim()
  const docType = n.clientDocType && n.clientDocType !== '-' && doc !== '0' ? n.clientDocType : '-'
  const text = [config.ruc, n.type === 'DEBIT_NOTE' ? '08' : '07', n.serie, n.correlative.replace(/^0+(?=\d)/, ''), igv.toFixed(2), total.toFixed(2), date, docType, docType === '-' ? '-' : doc].join('|') + '|'
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  return qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true }).replace('<svg ', '<svg width="120" height="120" shape-rendering="crispEdges" ')
}

export function renderNoteReceipt(n: PrintableNote, config: TenantFiscalConfig): string {
  const isDebit = n.type === 'DEBIT_NOTE'
  const title = isDebit ? 'NOTA DE DÉBITO ELECTRÓNICA' : 'NOTA DE CRÉDITO ELECTRÓNICA'
  const total = Number(n.totalAmount ?? 0)
  const rate = Number(config.igvRate ?? 18) / 100
  const gravado = config.defaultIgvRegime === 'GRAVADO' || config.defaultIgvRegime === 'GRAVADO_10_5' || config.defaultIgvRegime === 'ICBPER'
  // shortcut: el IGV de la nota se estima con el régimen por defecto de la empresa (la nota va como una línea); revisar si se mezclan regímenes.
  const igv = gravado ? total - total / (1 + rate) : 0
  const d = toLima(n.createdAt ? new Date(n.createdAt) : new Date())
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  const ubicacion = [config.distrito, config.provincia, config.departamento].filter(Boolean).join(' - ')
  const doc = (n.clientDocNumber || '').trim()
  const docLabel = n.clientDocType === '6' ? 'RUC' : n.clientDocType === '1' ? 'DNI' : ''
  const qr = noteQrSvg(n, config, total, igv, d)
  const status = n.sunatStatus === 'ACEPTADA' ? 'ACEPTADA POR SUNAT' : n.sunatStatus === 'RECHAZADA' ? 'RECHAZADA POR SUNAT' : 'PENDIENTE DE ENVÍO A SUNAT'

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><style>
  * { box-sizing: border-box; }
  body { width: 80mm; margin: 0 auto; padding: 10px; font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #000; line-height: 1.2; text-transform: uppercase; }
  p { margin: 2px 0; }
  .c { text-align: center; }
  .line { border-bottom: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0; }
  td { vertical-align: top; padding: 2px 0; }
  .r { text-align: right; }
  @media print { body { width: 100%; padding: 0; margin: 0; } @page { margin: 0; } }
</style></head>
<body>
 <div class="c" style="margin-bottom:8px"><img src="${RECEIPT_LOGO}" alt="Logo" style="max-width:60mm;height:auto"></div>
 <div class="c">
  <p>${escapeHtml(config.razonSocial || config.name || '')}</p>
  <p>${escapeHtml(config.direccion || '')}</p>
  ${ubicacion ? `<p>${escapeHtml(ubicacion)}</p>` : ''}
  <p>RUC: ${escapeHtml(config.ruc || '')}</p>
 </div>
 <div class="line"></div>
 <p><b>${title}</b></p>
 <p>${escapeHtml(n.serie)}-${escapeHtml(n.correlative)}</p>
 <p>Fecha: ${date} Hora: ${time}</p>
 <div class="line"></div>
 <p>Documento que modifica: ${escapeHtml(n.modifiedDocumentSerie ?? '')}-${escapeHtml(n.modifiedDocumentCorrelative ?? '')}</p>
 <p>Motivo: ${escapeHtml(n.reasonCode ?? '')} ${n.reasonDescription ? '- ' + escapeHtml(n.reasonDescription) : ''}</p>
 <p>Cliente: ${escapeHtml(n.clientName || 'CLIENTE VARIOS')}</p>
 ${docLabel && doc && doc !== '0' ? `<p>${docLabel}: ${escapeHtml(doc)}</p>` : ''}
 <div class="line"></div>
 <table>
  <tr><td>I.G.V</td><td class="r">S/${igv.toFixed(2)}</td></tr>
  <tr><td>IMPORTE TOTAL</td><td class="r">S/${total.toFixed(2)}</td></tr>
 </table>
 <p>SON: ${numberToWords(total)} SOLES</p>
 <p>Estado: ${status}</p>
 ${qr ? `<div class="c" style="margin:12px 0 6px">${qr}</div>` : ''}
 <div style="margin-top:40px;text-align:center"><p style="border-top:1px solid #000;width:60%;margin:0 auto;padding-top:20px">Firma y DNI</p></div>
</body></html>`
}

/** Imprime la nota apenas el administrador la verifica. Trae los datos de la empresa y manda a la impresora. */
export async function printBillingNote(note: PrintableNote) {
  const tenantId = useAuthStore.getState().tenantId
  try {
    const { data, error } = await api.dashboard.settings.get({ query: { tenantId } })
    if (error) throw error
    const t = data?.data as TenantFiscalConfig
    const config: TenantFiscalConfig = { ...t, igvRate: Number(t.igvRate ?? 18), defaultIgvRegime: t.defaultIgvRegime ?? 'EXONERADO', pricesIncludeIgv: t.pricesIncludeIgv ?? false }
    await printHtml(renderNoteReceipt(note, config))
  } catch {
    toast.error('La nota se emitió, pero no se pudo imprimir. Reimprímela desde el historial de notas.')
  }
}
