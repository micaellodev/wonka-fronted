export function TitleBar() {
  const api = window.electronAPI

  if (!api) return null

  return (
    <div
      className="h-8 flex items-center justify-between bg-background border-b border-border select-none"
      style={{ appRegion: 'drag' } as React.CSSProperties}
    >
      <span className="pl-3 text-xs font-semibold text-muted-foreground tracking-wide">
        Renzo Wonka POS
      </span>

      <div className="flex h-full" style={{ appRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={() => api.minimize()}
          aria-label="Minimizar"
          className="h-full px-3 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        >
          <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
            <rect width="10" height="1" />
          </svg>
        </button>
        <button
          onClick={() => api.maximize()}
          aria-label="Maximizar"
          className="h-full px-3 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="0.5" y="0.5" width="9" height="9" />
          </svg>
        </button>
        <button
          onClick={() => api.close()}
          aria-label="Cerrar ventana"
          className="h-full px-3 hover:bg-destructive transition-colors text-muted-foreground hover:text-destructive-foreground"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
            <line x1="0" y1="0" x2="10" y2="10" />
            <line x1="10" y1="0" x2="0" y2="10" />
          </svg>
        </button>
      </div>
    </div>
  )
}
