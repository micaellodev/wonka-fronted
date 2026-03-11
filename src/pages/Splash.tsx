import { useEffect, useState } from 'react'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { invoke } from '@tauri-apps/api/core'
import { Loader2 } from 'lucide-react'

export function SplashScreen() {
  const [status, setStatus] = useState('Buscando actualizaciones...')
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    async function checkForUpdates() {
      try {
        const update = await check()
        if (update) {
          setStatus(`Actualizando a la versión ${update.version}...`)
          let downloaded = 0
          let contentLength = 0
          
          await update.downloadAndInstall((event) => {
            switch (event.event) {
              case 'Started':
                contentLength = event.data.contentLength || 0
                setStatus(`Descargando actualización (0%)...`)
                break
              case 'Progress':
                downloaded += event.data.chunkLength
                if (contentLength > 0) {
                  const percent = Math.round((downloaded / contentLength) * 100)
                  setProgress(percent)
                  setStatus(`Descargando actualización (${percent}%)...`)
                } else {
                  // Fallback si el servidor no da Content-Length
                  setStatus(`Descargando actualización (${(downloaded / 1024 / 1024).toFixed(2)} MB)...`)
                }
                break
              case 'Finished':
                setStatus('Instalación terminada. Reiniciando...')
                break
            }
          })

          setStatus('Reiniciando aplicación...')
          await relaunch()
        } else {
          // No hay update, cerrar splash y abrir main
          setStatus('Todo listo. Abriendo Wonka...')
          setTimeout(async () => {
            const currentWindow = getCurrentWindow()
            // Asumiendo que podemos invocar algo para mostrar la app principal, o:
            // Obtenemos todas las ventanas y mostramos la principal. 
            // En tauri v2 podemos hacerlo desde Rust o pasando un comando.
            await invoke('show_main_window')
            await currentWindow.close()
          }, 1500)
        }
      } catch (error) {
        console.error('Error verificando actualizaciones:', error)
        setStatus('Error al actualizar. Abriendo Wonka...')
        setTimeout(async () => {
          const currentWindow = getCurrentWindow()
          await invoke('show_main_window')
          await currentWindow.close()
        }, 1500)
      }
    }

    // Pequeño delay de grácia para que la UI cargue
    const timer = setTimeout(() => {
      checkForUpdates()
    }, 500)

    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="flex bg-neutral-900 border border-neutral-700/50 rounded-xl overflow-hidden w-full h-[400px] flex-col items-center justify-center p-8 text-white relative">
      {/* Glow effect */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500" />
      
      <div className="animate-pulse mb-8">
        <div className="w-24 h-24 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-xl border border-white/20 shadow-2xl">
          <img src="/vite.svg" alt="Wonka Logo" className="w-12 h-12" />
        </div>
      </div>
      
      <h1 className="text-2xl font-bold bg-gradient-to-br from-white to-white/70 bg-clip-text text-transparent mb-2">
        Wonka POS
      </h1>
      
      <div className="flex items-center gap-3 text-white/70 text-sm mb-6 mt-4">
        <Loader2 className="w-4 h-4 animate-spin" />
        <p>{status}</p>
      </div>

      {progress > 0 && (
        <div className="w-full max-w-[240px] mt-4">
          <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
