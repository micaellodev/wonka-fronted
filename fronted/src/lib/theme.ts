// Tema claro/oscuro: clase .dark en <html>, preferencia en localStorage. Por defecto: claro.
const KEY = 'wonka-theme'

export type Theme = 'light' | 'dark'

export function getTheme(): Theme {
  try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light' } catch { return 'light' }
}

export function setTheme(t: Theme) {
  document.documentElement.classList.toggle('dark', t === 'dark')
  try { localStorage.setItem(KEY, t) } catch { /* sin almacenamiento: vale solo para esta sesión */ }
}

/** Llamar una vez al arrancar, antes de renderizar. */
export function initTheme() { setTheme(getTheme()) }
