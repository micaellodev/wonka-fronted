import { useCallback, useEffect, useState } from 'react'
import { Printer, RefreshCw, Loader2, CheckCircle2, WifiOff, AlertTriangle } from 'lucide-react'
import { TerminalShell } from '@/components/TerminalShell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

const PAPERS: Array<{ value: PrintConfig['paper']; label: string; hint: string }> = [
  { value: 'A4', label: 'A4', hint: 'Hoja completa' },
  { value: 'A5', label: 'A5', hint: 'Media hoja' },
  { value: '80mm', label: '80 mm', hint: 'Ticket térmico' },
  { value: '58mm', label: '58 mm', hint: 'Ticket angosto' },
]

export function PrinterSettingsScreen() {
  const api = window.electronAPI
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [config, setConfig] = useState<PrintConfig>({ printer: '', paper: '80mm', mode: 'image' })
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)

  const refresh = useCallback(async () => {
    if (!api) return
    setLoading(true)
    setPrinters(await api.listPrinters())
    setLoading(false)
  }, [api])

  useEffect(() => {
    if (!api) { setLoading(false); return }
    void api.getPrintConfig().then(setConfig)
    void refresh()
  }, [api, refresh])

  // Se guarda al elegir: no hay botón "Guardar" que olvidar
  const update = async (patch: Partial<PrintConfig>) => {
    if (!api) return
    setConfig(await api.setPrintConfig({ ...config, ...patch }))
  }

  const test = async () => {
    if (!api) return
    setTesting(true)
    const r = await api.printTest()
    setTesting(false)
    if (r.ok) toast.success('Impresión de prueba enviada.')
    else toast.error(r.error ?? 'No se pudo imprimir.')
  }

  const selected = printers.find((p) => p.name === config.printer)
  const stored = config.printer && !selected && !loading

  return (
    <TerminalShell>
      <div className="mx-auto flex max-w-3xl flex-col gap-6 text-foreground">
        <h1 className="text-2xl font-bold tracking-tight">Impresora</h1>

        {!api ? (
          <Card className="p-6 text-sm text-muted-foreground">La configuración de impresora solo está disponible en la app de escritorio.</Card>
        ) : (
          <>
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold">Impresora</h2>
                <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="mr-2 h-4 w-4" aria-hidden />}
                  Actualizar
                </Button>
              </div>
              <div role="radiogroup" aria-label="Impresora" className="space-y-2">
                <PrinterRow
                  selected={!config.printer}
                  onSelect={() => void update({ printer: '' })}
                  title="Predeterminada de Windows"
                  detail={printers.find((p) => p.isDefault)?.displayName}
                />
                {printers.map((p) => (
                  <PrinterRow key={p.name} selected={config.printer === p.name} onSelect={() => void update({ printer: p.name })} title={p.displayName} printer={p} />
                ))}
                {!loading && printers.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Windows no tiene impresoras instaladas.</p>}
              </div>
              {stored && <p className="mt-3 text-xs text-destructive">La impresora guardada ("{config.printer}") ya no está instalada en este equipo.</p>}
            </Card>

            <Card className="p-5">
              <h2 className="mb-3 text-sm font-bold">Tamaño de papel</h2>
              <div role="radiogroup" aria-label="Tamaño de papel" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {PAPERS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    role="radio"
                    aria-checked={config.paper === p.value}
                    onClick={() => void update({ paper: p.value })}
                    className={cn(
                      'rounded-lg border px-3 py-3 text-left transition-colors',
                      config.paper === p.value ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted',
                    )}
                  >
                    <span className="block text-sm font-bold">{p.label}</span>
                    <span className="block text-xs text-muted-foreground">{p.hint}</span>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Los tickets, boletas y facturas se ajustan solos al papel elegido. Se guarda en este equipo.</p>
              {(config.paper === '80mm' || config.paper === '58mm') && (
                <div className="mt-4">
                  <h3 className="mb-2 text-xs font-bold">Modo de impresión (ticket)</h3>
                  <div role="radiogroup" aria-label="Modo de impresión" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {([
                      ['image', 'Imagen', 'Recomendado: sale bien en casi todas las térmicas.'],
                      ['text', 'Texto', 'Más nítido si el driver lo soporta; si sale en blanco, usa Imagen.'],
                    ] as const).map(([value, label, hint]) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={config.mode === value}
                        onClick={() => void update({ mode: value })}
                        className={cn('rounded-lg border px-3 py-3 text-left transition-colors', config.mode === value ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted')}
                      >
                        <span className="block text-sm font-bold">{label}</span>
                        <span className="block text-xs text-muted-foreground">{hint}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div>
                <h2 className="text-sm font-bold">Impresión de prueba</h2>
                <p className="text-xs text-muted-foreground">Imprime un ticket corto con la impresora y el papel elegidos.</p>
              </div>
              <Button onClick={() => void test()} disabled={testing}>
                {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Printer className="mr-2 h-4 w-4" aria-hidden />}
                Imprimir prueba
              </Button>
            </Card>
          </>
        )}
      </div>
    </TerminalShell>
  )
}

function PrinterRow({ selected, onSelect, title, detail, printer }: { selected: boolean; onSelect: () => void; title: string; detail?: string; printer?: PrinterInfo }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn('flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition-colors', selected ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted')}
    >
      <span className="flex min-w-0 items-center gap-3">
        <Printer className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{title}{printer?.isDefault ? ' · predeterminada' : ''}</span>
          {detail && <span className="block truncate text-xs text-muted-foreground">{detail}</span>}
        </span>
      </span>
      {printer && <Status printer={printer} />}
    </button>
  )
}

function Status({ printer }: { printer: PrinterInfo }) {
  if (!printer.online) return <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-destructive"><WifiOff className="h-4 w-4" aria-hidden /> Sin conexión</span>
  if (printer.problem) return <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-warning"><AlertTriangle className="h-4 w-4" aria-hidden /> {printer.problem}</span>
  return <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-success"><CheckCircle2 className="h-4 w-4" aria-hidden /> Conectada</span>
}
