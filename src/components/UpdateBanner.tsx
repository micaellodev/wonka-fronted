import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

type Status = { state: 'downloading' | 'ready'; version?: string; percent?: number }

/** Aviso de auto-actualización (solo en la app de escritorio). Nunca reinicia solo: el cajero elige cuándo. */
export function UpdateBanner() {
  const [status, setStatus] = useState<Status | null>(null)
  useEffect(() => window.electronAPI?.onUpdateStatus((s) => setStatus((prev) => ({ ...prev, ...s }))), [])

  if (!status) return null
  return (
    <div role="status" className="fixed bottom-4 left-4 z-[60] flex items-center gap-3 rounded-md border border-border bg-card px-4 py-2 text-sm shadow-lg">
      {status.state === 'ready' ? (
        <>
          <span>Actualización {status.version} lista.</span>
          <Button size="sm" onClick={() => window.electronAPI?.installUpdate()}>Reiniciar y actualizar</Button>
          <Button size="sm" variant="ghost" onClick={() => setStatus(null)}>Después</Button>
        </>
      ) : (
        <span>Descargando actualización{status.percent != null ? ` ${status.percent}%` : ''}…</span>
      )}
    </div>
  )
}
