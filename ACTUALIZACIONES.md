# Guía de Despliegue de Actualizaciones (Wonka)

Ya que utilizas **Railway** para tu backend en lugar de GitHub Actions, el proceso de actualización lo harás tú mismo desde tu máquina, compilando y subiendo los archivos.

## 1. Configurar tus Variables de Entorno (antes de compilar)
Para que Tauri firme criptográficamente la app y nadie más pueda subir actualizaciones falsas, necesitas indicarle en tu terminal dónde está la llave que creaste. 

Abre una terminal (`cmd`) como Administrador en Windows y escribe:
```cmd
setx TAURI_PRIVATE_KEY "C:\Users\Usuario\.tauri\wonka.key"
setx TAURI_KEY_PASSWORD "emiliano150123"
```
*(Cierra la consola y vuelve a abrirla para que tomen efecto).*

## 2. Compilar la App (Nueva versión)
Cuando tengas cambios listos, sube la versión en tu `package.json` y `tauri.conf.json` (Ejemplo: de `0.1.4` a `0.2.0`). Luego ejecuta:
```bash
bunx tauri build
```
Esto generará los instaladores (`.exe` y `.zip`) y un archivo `.sig` dentro de la carpeta `src-tauri/target/release/bundle/`.

---

## 3. Alojar la actualización en Railway (Backend)
Para que el Splash Screen de tu `.exe` pueda "descargar" la actualización, necesita conectarse a una URL (`endpoint`) que devuelva la información de la nueva versión.

1. **Sube tus instaladores** (`.zip` o `.exe`) a algún proveedor de almacenamiento web estático (Amazon S3, Cloudflare R2, o directamente en una ruta de archivos públicos estáticos servida por tu backend de Elysia en Railway).
2. **Crea un archivo JSON o una Ruta en Elyshia** que devuelva el siguiente formato:

```json
{
  "version": "0.2.0",
  "notes": "Mejoras en el POS y corrección de bugs",
  "pub_date": "2026-03-11T12:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "CONTENIDO_DEL_ARCHIVO_SIG",
      "url": "https://wonka-backend-production.up.railway.app/public/descargas/Wonka_0.2.0_x64_es-US.msi.zip"
    }
  }
}
```
*(Nota: debes sustituir `CONTENIDO_DEL_ARCHIVO_SIG` abriendo el archivo `.sig` que se generó al compilar y pegando su contenido ahí. La `url` debe ser el link directo de descarga del archivo .zip o .exe)*.

## 4. Conectar la App al Backend
Ve a tu archivo `tauri.conf.json` y bajo `plugins > updater > endpoints` ya dejé colocada la URL oficial de tu Railway donde devolverás ese JSON que te mencioné:
```json
"endpoints": [
  "https://wonka-backend-production.up.railway.app/public/updater/latest.json"
]
```

**Resultado:** 
Cuando el usuario abra tu `Wonka.exe`, el Splash Screen irá silenciosamente a la URL de Railway. Si la ruta le devuelve la versión "0.2.0", comenzará a descargar el Zip provisto, lo verificará con la contraseña criptográfica usando el Signature, y se actualizará idéntico a Discord.
