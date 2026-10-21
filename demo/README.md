# Demo en video (con voz y música)

`salida/demo-wonka.mp4` (≈3:40, narrada, subtitulada, música suave de fondo): login por PIN, apertura de caja, venta rápida, boleta electrónica, zona de juegos (tiempo → ticket de caja), movimientos de caja, panel admin, inventario, exportar a Excel, estadísticas, roles, modo oscuro, cierre con aprobación y **segundo turno** del mismo día.

## Volver a hacerla (en este orden)
1. **Voz** (una vez, o al cambiar `narracion.json`): `pip install edge-tts` y `python demo/generar-voz.py <ruta-ffmpeg>`.
   Voz neural peruana de Microsoft (`es-PE-CamilaNeural`; alternativa masculina `es-PE-AlexNeural`, se cambia en `narracion.json`). Necesita internet: el texto de `narracion.json` se envía al servicio de voz.
2. **Datos de ejemplo**, desde `backend/`: `set -a; . ./.env.test; set +a; bun scripts/demo-seed.ts` (accesos: admin `246813` · cajero `22222` · gerente `33333`; recrea el tenant `demo_renzo_wonka`).
3. **Servicios**: backend de pruebas en :3043 (`PORT=3043 bun src/index.ts` con `.env.test`), mock `bun scripts/mock-apisperu.ts` (:3999) y frontend en :5183:
   `cd fronted; VITE_API_URL=http://localhost:3043 VITE_TENANT_ID=demo_renzo_wonka bunx vite --port 5183 --strictPort`
4. **Grabar** (una sola vez `cd fronted; bunx playwright install ffmpeg`): `DEMO_SLOW=300 bun demo/record-demo.mjs` → `salida/demo-wonka.webm` y `timeline.json`. Cada escena espera a que termine su línea de voz.
5. **Mezclar**: `pip install numpy` y `python demo/mezclar.py <ruta-ffmpeg>` → `salida/demo-wonka.mp4` (H.264 + AAC, ≈ -16 LUFS). La música se sintetiza ahí mismo (sin derechos de autor) y baja sola mientras habla la voz.

Textos y orden de escenas: `record-demo.mjs`; lo que dice la voz: `narracion.json`; volumen de la música: `MUSIC_DB` en `mezclar.py`.
