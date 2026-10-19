import { Download, FileSpreadsheet } from 'lucide-react'
import { downloadCsv, downloadXlsx, type ExportRow } from '@/lib/export'
import { toast } from '@/components/ui/toast'

/** Botones "CSV" y "Excel" que exportan lo que muestra la pantalla. `getRows` se evalúa al hacer clic (primera fila = encabezado). */
export function ExportButtons({ name, getRows, disabled, className = '' }: { name: string; getRows: () => ExportRow[] | Promise<ExportRow[]>; disabled?: boolean; className?: string }) {
  const file = (ext: string) => `${name}-${new Date().toISOString().slice(0, 10)}.${ext}`
  const run = (fn: () => Promise<void>) => fn().catch(() => toast.error('No se pudo generar el archivo.'))
  const btn = 'flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-40'
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button type="button" disabled={disabled} className={btn} onClick={() => { void run(async () => downloadCsv(file('csv'), await getRows())) }}>
        <Download className="h-3.5 w-3.5" aria-hidden /> Exportar CSV
      </button>
      <button type="button" disabled={disabled} className={btn} onClick={() => { void run(async () => downloadXlsx(file('xlsx'), await getRows(), name)) }}>
        <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden /> Exportar Excel
      </button>
    </div>
  )
}
