import { useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getTheme, setTheme, type Theme } from '@/lib/theme'

export function ThemeToggle() {
  const [theme, set] = useState<Theme>(getTheme)
  const next: Theme = theme === 'dark' ? 'light' : 'dark'
  return (
    <Button variant="outline" size="icon" aria-label={next === 'dark' ? 'Modo oscuro' : 'Modo claro'} title={next === 'dark' ? 'Modo oscuro' : 'Modo claro'}
      onClick={() => { setTheme(next); set(next) }}>
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  )
}
