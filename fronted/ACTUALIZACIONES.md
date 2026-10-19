# Actualizaciones automáticas (Electron)

**Instalación estilo Discord:** el instalador es de un clic (sin asistente, sin pedir administrador, instala por usuario en `%LOCALAPPDATA%` y abre la app al terminar). **Al abrir la app** aparece una pantalla de carga: si hay versión nueva la descarga con barra de progreso (solo la diferencia, gracias al `.blockmap`), la instala y reabre sola. Sin internet o sin respuesta en 10 s, abre normal. Código: `electron/main.cjs` (pantalla de carga) y `updater.cjs` (`startup`). No probado aún con un instalador real: verificar en una caja.

Lo de abajo describe lo que pasa con la app ya abierta.

La app de escritorio se actualiza sola, estilo Discord: al abrir y cada 30 min revisa si hay versión nueva, la descarga en segundo plano y muestra un aviso abajo a la izquierda ("Actualización X lista" → **Reiniciar y actualizar** o **Después**). Si el cajero no reinicia, se instala al cerrar la app. Nunca se reinicia sola: una venta en curso no se interrumpe.

Código: `electron/updater.cjs` (lógica), `electron/preload.cjs` (puente), `src/components/UpdateBanner.tsx` (aviso). Log de diagnóstico en el equipo: `%APPDATA%\wonka-fronted\updater.log`.

## Cómo publicar una versión nueva

1. Sube la versión en `package.json` (`"version"`, p. ej. de `1.0.0` a `1.0.1`). Siempre mayor que la anterior.
2. Compila con la URL pública donde alojarás las actualizaciones (PowerShell, desde `fronted/`):
   ```powershell
   $env:WONKA_UPDATE_URL = 'https://tu-host/wonka-updates'
   bun run electron:release
   ```
3. Sube a esa URL, de `release/`, estos **tres** archivos: `latest.yml`, `Renzo Wonka POS Setup X.Y.Z.exe` y su `.blockmap`. Conserva en el host los `.blockmap` de versiones anteriores: permiten descargar solo la diferencia.
4. Las cajas con la app abierta (o al abrirla) la detectan y descargan. Nada más que hacer.

`bun run electron:build` genera el instalador **sin** auto-actualización (para pruebas locales).

## Dónde alojarlo
Cualquier carpeta estática por HTTPS: Cloudflare R2, S3, un bucket de Supabase Storage (ya lo usa el proyecto), GitHub Releases, etc. No uses el disco de Railway: es efímero y se borra en cada despliegue.

## Primera instalación
Las cajas que ya tienen la versión 1.0.0 instalada antes de este cambio no traen el actualizador: instala una vez a mano la primera versión compilada con `electron:release`; de ahí en adelante todo es automático.

## Seguridad
- El actualizador verifica el hash SHA-512 del instalador contra `latest.yml`, pero ambos salen del mismo host: quien controle esa carpeta puede distribuir un instalador a todas las cajas. Protege el acceso de escritura al host (cuenta con 2FA, token de solo-subida).
- Firmar el instalador con un certificado de firma de código es lo recomendable en producción: evita avisos de SmartScreen y permite validar el editor. Hoy el build va sin firmar (`CSC_IDENTITY_AUTO_DISCOVERY=false`).

## Pruebas hechas
Verificado de punta a punta en local (2026-10-18): app 1.0.0 empaquetada + feed HTTP local con 1.0.1 → el log registra "disponible 1.0.1" y "descargada 1.0.1". No se probó el reinicio-e-instalación real (`quitAndInstall`) ni la descarga diferencial.
