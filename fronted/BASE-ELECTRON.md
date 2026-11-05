# Reutilizar la base de Electron de Wonka en otro proyecto

Qué cubre: **instalador propio**, **actualizador automático** y **alojar las actualizaciones en Cloudflare R2**. Nada más.

Estado: el instalador y el actualizador funcionan en Wonka. El paso de R2 de este documento **no está implementado ni probado en Wonka**: el proyecto solo exige una carpeta pública HTTPS (`WONKA_UPDATE_URL`) y la subida a R2 está descrita aquí como receta, sin script propio.

Solo Windows (x64). El instalador se compila con el `csc.exe` que trae Windows.

---

## 1. Qué copiar

Desde `fronted/` al proyecto nuevo (mismas rutas relativas):

| Archivo | Para qué sirve |
|---|---|
| `electron/updater.cjs` | Actualizador: revisa cada 60 s, descarga en segundo plano, instala al arrancar o con el botón. |
| `electron/main.cjs` | Ventana principal + pantalla de progreso (`openSplash`) + arranque (`updater.startup`). Copia solo las partes de actualización si ya tienes tu `main`. |
| `electron/preload.cjs` | Puente `window.electronAPI` (`getVersion`, `onUpdateStatus`, `getUpdateStatus`, `installUpdate`). |
| `electron/splash.html`, `electron/icon.png` | Ventana de progreso de descarga/instalación. |
| `installer/Instalador.cs`, `installer/app.manifest`, `installer/logo.png` | Instalador de un clic (`Instalar <App>.exe`). |
| `scripts/release.mjs` | Compila la app, la empaqueta y genera todo lo que se sube. |
| `scripts/build-installer.mjs` | Genera `instalador.json` y compila el instalador propio. |
| `scripts/after-pack.cjs` | Pone el ícono al `.exe` (evita el modo `signAndEditExecutable`, que falla sin permiso de enlaces simbólicos). |
| `scripts/bump.mjs` | Opcional: sube la versión según el tamaño de los cambios y escribe `release-notes.txt`. |
| `icon.ico` | Ícono del `.exe` y del instalador. |

También el tipo `UpdateStatus` y `ElectronAPI` de `src/env.d.ts`, y si quieres el botón "Actualización pendiente", la parte de actualización de `src/components/TitleBar.tsx`.

## 2. Dependencias y `package.json`

```
dependencies:    electron-updater
devDependencies: electron, electron-builder, cross-env, vite   (tu bundler; release.mjs usa `bunx vite build`)
```

Campos necesarios:

```json
{
  "name": "mi-app",
  "version": "1.0.0",
  "main": "electron/main.cjs",
  "scripts": {
    "electron:release": "node scripts/release.mjs",
    "version:bump": "node scripts/bump.mjs"
  },
  "build": {
    "appId": "com.miempresa.miapp",
    "productName": "Mi App",
    "directories": { "output": "release" },
    "files": ["dist/**/*", "electron/**/*"],
    "win": { "target": "nsis-web", "icon": "icon.ico", "signAndEditExecutable": false },
    "afterPack": "scripts/after-pack.cjs",
    "forceCodeSigning": false,
    "nsis": { "oneClick": true, "perMachine": false, "runAfterFinish": true, "installerIcon": "icon.ico", "uninstallerIcon": "icon.ico" }
  }
}
```

El target tiene que ser **`nsis-web`**: genera el paquete `.nsis.7z` que descargan tanto el actualizador como el instalador propio.

Si tu proyecto no usa Vite o `dist/index.html`, ajusta en `release.mjs` la línea `run('bunx', ['vite', 'build'])` y en `main.cjs` la ruta de `loadFile`.

## 3. Cambiar los nombres de Wonka

Busca y reemplaza estos textos (no cambian el funcionamiento, pero dejarían la marca de Wonka):

- `scripts/release.mjs`, `scripts/build-installer.mjs`: variable `WONKA_UPDATE_URL` (puedes dejarla o renombrarla en ambos) y el nombre `Instalar Wonka Park.exe`.
- `installer/Instalador.cs`: `"Wonka Park"` (título y textos), el mutex `Local\\WonkaParkInstalador`, el user agent `WonkaPark-Instalador`, la carpeta temporal `wonka-instalador`, y los colores de la paleta.
- `installer/logo.png`, `icon.ico`, `electron/icon.png`: tu logo.
- `electron/splash.html`: el texto `Wonka Park` y los colores.
- `package.json`: `name`, `build.appId`, `build.productName`.

Importante: **`appId` y `name` no se pueden cambiar después de repartir la app**. El instalador usa `name` como carpeta de instalación (`%LOCALAPPDATA%\Programs\<name>`) y el actualizador reconoce la app por esos datos.

## 4. Cómo funciona el flujo

1. `electron:release` compila el front, empaqueta con electron-builder y deja en `release/nsis-web/`:
   - `latest.yml` (versión, hash y tamaño; lo lee el actualizador)
   - `<name>-X.Y.Z-x64.nsis.7z` (el paquete completo)
   - `<Producto> Web Setup X.Y.Z.exe` (lo usa el actualizador para instalar)
   - `instalador.json` (versión, hashes y número de archivos; lo lee el instalador propio)
   - `Instalar <Producto>.exe` (el que repartes la primera vez)
2. Todo eso se sube a **una sola carpeta pública HTTPS**. Esa URL se graba dentro de la app (`resources/app-update.yml`) y del instalador.
3. **Instalador propio:** baja `instalador.json`, descarga el Setup y el paquete verificando SHA-512, ejecuta el Setup en silencio (`/S --package-file=...`) y abre la app.
4. **Actualizador** (`updater.cjs`):
   - solo actúa en la app instalada y empaquetada con URL de actualizaciones;
   - al arrancar muestra la pantalla de progreso: busca, descarga solo los bloques que cambiaron, instala y reabre (si no hay red o responde tarde, a los 10 s abre normal);
   - con la app en uso revisa cada 60 s, descarga en segundo plano y muestra el botón "Actualización pendiente";
   - nunca reinicia solo en medio del trabajo; si no se pulsa, instala al cerrar.
   - el registro de diagnóstico queda en `%APPDATA%\<name>\updater.log`.
5. Las novedades de `release-notes.txt` (si usas `bump.mjs`) se copian a `latest.yml` y se muestran en la pantalla de actualización.

## 5. Alojar las actualizaciones en Cloudflare R2

R2 sirve archivos estáticos sin cobrar descargas, por eso el actualizador puede revisar cada minuto.

### 5.1 Crear el bucket y la URL pública

1. Cloudflare → R2 → **Create bucket** (por ejemplo `mi-app-updates`).
2. Dale una URL pública HTTPS. Para producción usa **Custom Domain** (Bucket → Settings → Custom Domains, por ejemplo `https://updates.midominio.com`). El dominio `r2.dev` es solo para pruebas y tiene límites.
3. Si quieres separar apps, usa una carpeta por app: la URL final queda `https://updates.midominio.com/mi-app`.

No necesitas configurar CORS: el actualizador y el instalador descargan desde procesos nativos, no desde un navegador.

### 5.2 Credenciales para subir

R2 → **Manage API tokens** → crear token con permiso *Object Read & Write* solo para ese bucket. Guarda `Account ID`, `Access Key ID` y `Secret Access Key`. Quien tenga ese token puede distribuir un instalador a todas las cajas: no lo subas al repositorio ni lo uses en máquinas compartidas.

### 5.3 Publicar una versión

Desde PowerShell, en la carpeta del proyecto:

```powershell
$env:WONKA_UPDATE_URL = 'https://updates.midominio.com/mi-app'
$env:VITE_API_URL     = 'https://tu-backend'   # no puede ser localhost: queda grabada en el instalador
bun run electron:release
```

Luego sube **todo el contenido** de `release/nsis-web/` a la carpeta `mi-app/` del bucket. Con wrangler:

```powershell
$bucket = 'mi-app-updates'
Get-ChildItem release/nsis-web -File | ForEach-Object {
  $cache = if ($_.Name -in 'latest.yml','instalador.json') { 'no-cache' } else { 'public, max-age=31536000, immutable' }
  npx wrangler r2 object put "$bucket/mi-app/$($_.Name)" --file $_.FullName --cache-control $cache --remote
}
```

Lo mismo con cualquier cliente compatible con S3 (rclone, `aws s3 cp --endpoint-url https://<ACCOUNT_ID>.r2.cloudflarestorage.com`).

Puntos que importan:
- **`latest.yml` e `instalador.json` con `no-cache`:** son los que cambian en cada versión y los que se consultan cada minuto. El resto de archivos lleva el número de versión en el nombre y puede cachearse.
- **Sube `latest.yml` al final.** Si lo subes antes que el paquete, las cajas verían una versión que aún no se puede descargar.
- **No borres versiones antiguas** del bucket mientras haya cajas que dependan de ellas para la descarga por diferencias.
- No uses discos temporales (Railway, etc.) para alojar los archivos: se borran en cada despliegue.

### 5.4 Comprobar que quedó bien

```powershell
curl https://updates.midominio.com/mi-app/latest.yml
curl https://updates.midominio.com/mi-app/instalador.json
```

Deben responder la versión nueva. Después, en una caja con la versión anterior, abre la app: debe mostrar la pantalla de actualización. Si no aparece, revisa `%APPDATA%\<name>\updater.log`.

## 6. Primera instalación y requisitos

- La primera instalación se hace con `Instalar <Producto>.exe`. Las versiones que ya estén instaladas sin actualizador no se actualizan solas: hay que instalar a mano una vez.
- El actualizador no actúa con `electron:dev` ni con `electron:build` (no llevan URL de actualizaciones).
- Cada versión nueva tiene que tener un `version` **mayor** que la anterior en `package.json`.
- Sin firma de código, Windows SmartScreen puede mostrar un aviso. El build va con `forceCodeSigning: false` y `CSC_IDENTITY_AUTO_DISCOVERY=false`. Para producción seria conviene firmar.
- Seguridad: el actualizador verifica el hash SHA-512 contra `latest.yml`, pero ambos salen del mismo bucket. Protege el acceso de escritura al bucket.

## 7. Lista rápida para el proyecto nuevo

1. Copiar los archivos de la sección 1 e instalar las dependencias de la sección 2.
2. Cambiar nombres, `appId` y logos (sección 3).
3. Crear el bucket de R2, el dominio público y el token (sección 5.1 y 5.2).
4. `bun run electron:release` con `WONKA_UPDATE_URL` y `VITE_API_URL` definidas.
5. Subir `release/nsis-web/` al bucket (con `latest.yml` al final).
6. Instalar la primera vez con `Instalar <Producto>.exe`; las siguientes versiones llegan solas.
