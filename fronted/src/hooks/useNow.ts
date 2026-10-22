import { useEffect, useState } from 'react'

/** Hora actual que se renueva cada `ms` (1 s por defecto): para contadores en vivo. */
export function useNow(ms = 1000) {
 const [now, setNow] = useState(() => Date.now())
 useEffect(() => {
 const id = setInterval(() => setNow(Date.now()), ms)
 return () => clearInterval(id)
 }, [ms])
 return now
}
