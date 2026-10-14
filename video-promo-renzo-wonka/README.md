# Renzo Wonka · Video promocional (Hyperframes)

Video vertical 9:16 · 1080 × 1920 · 35 s · 30 fps. Proyecto editable de [Hyperframes](https://github.com/heygen-com/hyperframes) (HTML + GSAP).

## Renderizar

Requisitos: Node.js 22+, FFmpeg en el PATH, Python 3 y conexión a internet al generar la voz.

```bash
cd video-promo-renzo-wonka
npm run render        # genera la voz si falta y renderiza renders/renzo-wonka-promo.mp4
npm run render:alta   # misma salida con calidad alta
npm run dev           # abre Hyperframes Studio para revisar y editar en el navegador
npm run check         # lint + validaciones de layout, movimiento y contraste
```

La voz en off usa voces neurales de Microsoft mediante `edge-tts`, con Camila (español de Perú) en un tono alegre (+8 % de velocidad y +6 Hz de tono). La primera vez, `npm run voz` crea un entorno aislado `.venv-voz/`, instala `edge-tts` y genera `assets/audio/voz-01.wav … voz-05.wav`.

- `npm run voz:muestras` crea muestras de cinco voces (Perú, México y Colombia) en `assets/audio/muestras/` para compararlas.
- `npm run voz:rehacer -- --voz=es-MX-DaliaNeural` regenera la locución con otra voz.
- La voz, la velocidad, el tono y las frases se ajustan al inicio de `scripts/generar-voz.mjs`.
Para usar una locución grabada, reemplaza esos cinco archivos manteniendo los nombres.

## Estructura

| Archivo | Qué es |
| --- | --- |
| `index.html` | La composición: 5 escenas, ilustraciones SVG originales y una sola línea de tiempo GSAP |
| `assets/brand/` | Logo e ícono oficiales copiados sin cambios de `fronted/public/` |
| `assets/audio/musica-renzo-wonka.wav` | Música original con acentos en cada transición |
| `assets/audio/voz-0N.wav` | Voz en off (se genera con `npm run voz`) |
| `assets/fonts/Fredoka.ttf` | Tipografía redondeada (licencia SIL OFL, ver `Fredoka-OFL.txt`) |
| `assets/vendor/gsap.min.js` | GSAP local, así el render no depende de internet |
| `scripts/componer-musica.py` | Regenera la música (`npm run musica`, requiere numpy y scipy) |
| `scripts/generar-voz.mjs` | Textos, voz y velocidad de cada frase |

## Guion y tiempos

| Tiempo | Escena | Texto en pantalla | Voz en off |
| --- | --- | --- | --- |
| 0–4 s | Apertura | ¡Un mundo de diversión te espera! | ¡En Renzo Wonka, la diversión comienza desde que llegas! |
| 4–12 s | Juego | Juega, ríe y disfruta · Diversión por tiempo | Ven a jugar, reír y disfrutar a tu ritmo. |
| 12–19 s | Antojitos | Dulces, canchita y tus antojos favoritos | Y acompaña la aventura con dulces, canchita y muchas chucherías. |
| 19–28 s | Cumpleaños | ¡Celebra tu cumpleaños en Wonka! · Consulta y reserva tu fecha | ¿Se acerca un cumpleaños? Celebra con nosotros y reserva tu fecha. |
| 28–35 s | Cierre | Logo · Ven a jugar. Reserva tu cumpleaños. · TikTok: @renzowonkapark | Renzo Wonka. ¡Ven a jugar y reserva tu cumpleaños! |

Logo, texto y CTA quedan totalmente quietos desde 30,1 s hasta el final.

## Dirección de movimiento

Basada en la skill `motion-design` de LottieFiles (`.agents/skills/motion-design`):
personalidad *Playful*, easing firma `back.out` (rebote 10–20 %), duraciones de 0,3 / 0,5 / 0,8 s,
escalonados de menos de 0,5 s, tres capas de movimiento (principal, secundaria y ambiente) y el orden
escena → mensaje → adornos. El logo solo se mueve en posición y escala uniforme: no se deforma ni cambia de color.
