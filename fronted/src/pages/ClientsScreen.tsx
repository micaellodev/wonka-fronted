import { useCallback, useEffect, useState } from 'react'
import { Search, Loader2, ChevronLeft, ChevronRight, Baby, Phone, IdCard } from 'lucide-react'
import { api } from '@/lib/api'
import { apiErrorMessage } from '@/lib/api-error'
import { ExportButtons } from '@/components/ExportButtons'
import { useAuthStore } from '@/store/authStore'
import { TerminalShell } from '@/components/TerminalShell'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { formatTableDateTime } from './sales-history/helpers'
import type { Guardian, Loose } from './playzone/shared'

const PAGE_SIZE = 20
const th = 'px-6 py-4'
const td = 'px-6 py-3 font-normal'

export function ClientsScreen() {
  const tenantId = useAuthStore((s) => s.tenantId)!
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<Guardian[]>([])
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Guardian | null>(null)

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [search])

  const fetchPage = useCallback(async (p: number, limit: number) => {
    const res = await (api.playzone.clients as Loose).get({ query: { tenantId, search: debounced || undefined, page: p, limit } })
    if (res.error) throw res.error
    return res.data as { data: Guardian[]; meta: { total: number; totalPages: number } }
  }, [tenantId, debounced])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchPage(page, PAGE_SIZE)
      .then((r) => { if (!cancelled) { setRows(r.data); setMeta(r.meta); setError(null) } })
      .catch((e) => { if (!cancelled) setError(apiErrorMessage(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [fetchPage, page])

  // Exporta todos los resultados de la búsqueda actual (el backend limita a 100 por página)
  const exportRows = async () => {
    const all: Guardian[] = []
    for (let p = 1, last = 1; p <= last; p++) {
      const r = await fetchPage(p, 100)
      all.push(...r.data)
      last = r.meta.totalPages
    }
    return [
      ['DNI', 'Nombre', 'Celular', 'Niños', 'Registrado'],
      ...all.map((g) => [g.dni, g.fullName, g.phone ?? '', g.children.map((c) => c.fullName).join(', '), formatTableDateTime(g.createdAt)]),
    ]
  }

  return (
    <TerminalShell>
      <div className="flex min-h-full flex-col bg-muted/50 p-4 text-foreground md:p-8">
        <h1 className="mb-6 text-2xl font-bold tracking-tight md:text-3xl">Clientes</h1>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-2.5 shadow-2xs">
          <div className="flex min-w-48 flex-1 items-center gap-2 px-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              type="text"
              aria-label="Buscar cliente"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por DNI, nombre o celular"
              className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none md:text-sm"
            />
          </div>
          <span className="text-xs text-muted-foreground">{meta.total} clientes</span>
          <div className="border-l border-border pl-3">
            <ExportButtons name="clientes" getRows={exportRows} disabled={meta.total === 0} />
          </div>
        </div>

        <Card className="overflow-hidden rounded-xl border border-border bg-card shadow-2xs">
          <div className="flex min-h-[360px] flex-col justify-between overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-card font-semibold text-foreground">
                  <th className={th}>DNI</th>
                  <th className={th}>Nombre</th>
                  <th className={th}>Celular</th>
                  <th className={th}>Niños</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={4} className="py-16 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" aria-label="Cargando" /></td></tr>
                ) : error ? (
                  <tr><td colSpan={4} className="py-16 text-center text-destructive">{error}</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={4} className="py-16 text-center text-muted-foreground">No hay clientes que coincidan.</td></tr>
                ) : rows.map((g) => (
                  <tr key={g.id} onClick={() => setSelected(g)} className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/60">
                    <td className={`${td} font-mono`}>{g.dni}</td>
                    <td className={`${td} font-medium`}>{g.fullName}</td>
                    <td className={td}>{g.phone || '—'}</td>
                    <td className={td}>{g.children.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-2 text-xs text-muted-foreground">
              <button type="button" aria-label="Página anterior" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded p-1 hover:bg-muted disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
              <span>Página {page} de {meta.totalPages || 1}</span>
              <button type="button" aria-label="Página siguiente" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)} className="rounded p-1 hover:bg-muted disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        </Card>
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent size="lg">
          {selected && (
            <>
              <DialogTitle className="text-lg font-bold">{selected.fullName}</DialogTitle>
              <DialogDescription className="sr-only">Información del cliente y sus niños</DialogDescription>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2"><IdCard className="h-4 w-4 text-muted-foreground" aria-hidden /> {selected.dni}</div>
                <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" aria-hidden /> {selected.phone || '—'}</div>
                <p className="col-span-2 text-xs text-muted-foreground">Registrado: {formatTableDateTime(selected.createdAt)}</p>
              </div>
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Baby className="h-4 w-4" aria-hidden /> Niños ({selected.children.length})</h3>
              {selected.children.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin niños registrados.</p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {selected.children.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="font-medium">{c.fullName}</span>
                      <span className="text-xs text-muted-foreground">
                        {[c.age != null ? `${c.age} años` : null, c.gender, c.dni ? `DNI ${c.dni}` : null].filter(Boolean).join(' · ') || '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </TerminalShell>
  )
}
