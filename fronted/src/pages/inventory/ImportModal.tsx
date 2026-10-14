import { useState } from 'react'
import { Upload, Download } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ErrorBox, Modal } from './shared'
import { apiMsg } from './utils'

const COLS = ['sku', 'nombre', 'categoria', 'precio', 'stock', 'stock_minimo', 'controla_stock', 'activo'] as const
const API_KEY: Record<(typeof COLS)[number], string> = {
 sku: 'sku', nombre: 'name', categoria: 'category', precio: 'price', stock: 'stock', stock_minimo: 'minStock',
 controla_stock: 'trackStock', activo: 'isActive',
}
const norm = (h: unknown) => String(h ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_')

async function downloadTemplate(categoryNames: string[]) {
 const XLSX = await import('xlsx')
 const cat = categoryNames[0] ?? 'Bebidas'
 const ws = XLSX.utils.aoa_to_sheet([
  [...COLS],
  ['AGUA-500', 'Agua mineral 500ml', cat, 2.5, 40, 10, 'SI', 'SI'],
  ['GALL-01', 'Galletas de vainilla', cat, 1.5, 100, 20, 'SI', 'SI'],
 ])
 ws['!cols'] = COLS.map(() => ({ wch: 18 }))
 const info = XLSX.utils.aoa_to_sheet([
  ['Columna', 'Obligatoria', 'Formato / valores permitidos'],
  ['sku', 'SI', 'Código único sin espacios (máx. 40). Se convierte a MAYÚSCULAS. Si ya existe en el negocio, el producto se ACTUALIZA; si no, se CREA.'],
  ['nombre', 'SI', 'Texto, máx. 120 caracteres.'],
  ['categoria', 'SI', 'Nombre de la categoría (sin distinguir mayúsculas). Si no existe, se CREA automáticamente.'],
  ['precio', 'SI', 'Número >= 0 (ej. 2.50). Precio de venta.'],
  ['stock', 'NO', 'Entero >= 0. Vacío = 0 al crear. En productos que ya existen el stock NO se modifica (se conserva el real); solo se pisa si marcas "Reemplazar stock" al importar.'],
  ['stock_minimo', 'NO', 'Entero >= 0. Alerta de stock bajo cuando stock <= este valor. Vacío = 5 al crear, sin cambio al actualizar.'],
  ['controla_stock', 'NO', 'SI o NO. Vacío = SI al crear, sin cambio al actualizar.'],
  ['activo', 'NO', 'SI o NO. Vacío = SI al crear, sin cambio al actualizar.'],
  [],
  ['Los productos nuevos se crean con IGV EXONERADO.'],
  ['Máximo 2000 filas por archivo. Las filas con error se omiten y se informan; las válidas se importan.'],
  [],
  ['Categorías existentes'],
  ...categoryNames.map((n) => [n]),
 ])
 info['!cols'] = [{ wch: 18 }, { wch: 12 }, { wch: 110 }]
 const wb = XLSX.utils.book_new()
 XLSX.utils.book_append_sheet(wb, ws, 'Productos')
 XLSX.utils.book_append_sheet(wb, info, 'Instrucciones')
 XLSX.writeFile(wb, 'plantilla-inventario.xlsx')
}

type PreviewRow = { row: number; data: Record<string, unknown>; error?: string }

function clientCheck(d: Record<string, unknown>): string | undefined {
 const s = (k: string) => String(d[k] ?? '').trim()
 if (!s('sku') || /\s/.test(s('sku'))) return 'SKU obligatorio, sin espacios.'
 if (!s('name')) return 'Nombre obligatorio.'
 if (!s('category')) return 'Categoría obligatoria.'
 const n = (k: string) => Number(s(k).replace(',', '.'))
 if (!s('price') || !(n('price') >= 0)) return 'Precio obligatorio (número ≥ 0).'
 if (s('stock') && !(Number.isInteger(n('stock')) && n('stock') >= 0)) return 'Stock debe ser entero ≥ 0.'
 if (s('minStock') && !(Number.isInteger(n('minStock')) && n('minStock') >= 0)) return 'Stock mínimo debe ser entero ≥ 0.'
 return undefined
}

async function parseFile(file: File): Promise<PreviewRow[]> {
 const XLSX = await import('xlsx')
 const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
 const sheet = wb.Sheets['Productos'] ?? wb.Sheets[wb.SheetNames[0]!]
 if (!sheet) return []
 const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true })
 const head = (raw[0] ?? []).map(norm)
 const out: PreviewRow[] = []
 raw.slice(1).forEach((cells, i) => {
  if (cells.every((c) => String(c).trim() === '')) return
  const data: Record<string, unknown> = {}
  for (const col of COLS) {
   const idx = head.indexOf(col)
   if (idx >= 0) data[API_KEY[col]] = cells[idx]
  }
  const error = clientCheck(data)
  out.push({ row: i + 2, data, ...(error ? { error } : {}) })
 })
 return out
}

export function ImportModal({ tenantId, categoryNames, onClose, onDone }: {
 tenantId: string; categoryNames: string[]; onClose: () => void; onDone: () => void
}) {
 const [rows, setRows] = useState<PreviewRow[]>([])
 const [fileName, setFileName] = useState('')
 const [updateStock, setUpdateStock] = useState(false)
 const [busy, setBusy] = useState(false)
 const [error, setError] = useState('')
 const [result, setResult] = useState<{ created: number; updated: number; errors: { row: number; message: string }[] } | null>(null)

 const valid = rows.filter((r) => !r.error)
 const pick = async (f: File | undefined) => {
  if (!f) return
  setError(''); setResult(null); setFileName(f.name)
  try {
   const parsed = await parseFile(f)
   if (parsed.length === 0) setError('El archivo no tiene filas de productos.')
   else if (parsed.length > 2000) { setError('Máximo 2000 filas por archivo.'); setRows([]); return }
   setRows(parsed)
  } catch { setError('No se pudo leer el archivo. Usa la plantilla (.xlsx, .xls o .csv).'); setRows([]) }
 }

 const send = async () => {
  if (busy || valid.length === 0) return
  setBusy(true); setError('')
  try {
   const res = await api.inventory.products.import.post({ tenantId, updateStock, rows: valid.map((r) => ({ row: r.row, ...r.data })) })
   if (res.error) { setError(apiMsg(res.error, 'No se pudo importar.')); return }
   setResult((res.data as unknown as { data: NonNullable<typeof result> }).data)
   onDone()
  } catch { setError('No se pudo conectar con el servidor.') } finally { setBusy(false) }
 }

 return (
  <Modal title="Importar productos desde Excel" subtitle="Crea o actualiza por SKU. Descarga la plantilla para ver el formato." onClose={onClose} testId="import-modal" wide>
   <div className="flex flex-wrap items-center gap-3">
    <Button variant="secondary" onClick={() => void downloadTemplate(categoryNames)} data-testid="import-template"><Download /> Descargar plantilla</Button>
    <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
     <Upload className="size-4" /> Elegir archivo
     <input type="file" accept=".xlsx,.xls,.csv" className="hidden" data-testid="import-file" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }} />
    </label>
    {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
    <label className="ml-auto flex items-center gap-2 text-sm text-foreground">
     <input type="checkbox" checked={updateStock} onChange={(e) => setUpdateStock(e.target.checked)} data-testid="import-update-stock" />
     Reemplazar stock de productos existentes
    </label>
   </div>

   <ErrorBox message={error} />

   {result ? (
    <div className="flex flex-col gap-2" data-testid="import-result">
     <p className="rounded-md bg-success-soft px-3 py-2 text-sm font-semibold text-success">
      Creados: {result.created} · Actualizados: {result.updated} · Con error: {result.errors.length}
     </p>
     {result.errors.map((e) => <p key={e.row} className="text-sm text-destructive">Fila {e.row}: {e.message}</p>)}
    </div>
   ) : rows.length > 0 && (
    <>
     <p className="text-sm text-muted-foreground" data-testid="import-summary">
      {valid.length} filas válidas · <span className={rows.length > valid.length ? 'font-semibold text-destructive' : ''}>{rows.length - valid.length} con error (se omitirán)</span>
     </p>
     <div className="max-h-[40vh] overflow-auto rounded-md border border-border">
      <Table>
       <TableHeader>
        <TableRow><TableHead>Fila</TableHead>{COLS.slice(0, 6).map((c) => <TableHead key={c}>{c}</TableHead>)}<TableHead>Estado</TableHead></TableRow>
       </TableHeader>
       <TableBody>
        {rows.map((r) => (
         <TableRow key={r.row} data-testid="import-row" className={r.error ? 'bg-danger-soft text-destructive' : ''}>
          <TableCell>{r.row}</TableCell>
          {COLS.slice(0, 6).map((c) => <TableCell key={c}>{String(r.data[API_KEY[c]] ?? '')}</TableCell>)}
          <TableCell>{r.error ?? 'OK'}</TableCell>
         </TableRow>
        ))}
       </TableBody>
      </Table>
     </div>
    </>
   )}

   <div className="flex justify-end gap-3">
    <Button variant="secondary" onClick={onClose} data-testid="import-cancel">{result ? 'Cerrar' : 'Cancelar'}</Button>
    {!result && (
     <Button onClick={send} disabled={busy || valid.length === 0} data-testid="import-confirm">
      {busy ? 'Importando...' : `Confirmar importación (${valid.length})`}
     </Button>
    )}
   </div>
  </Modal>
 )
}
