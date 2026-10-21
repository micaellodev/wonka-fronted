"""Genera la narración (voz neural es-PE de Microsoft Edge, vía edge-tts) y las duraciones de cada línea.
Uso:  pip install edge-tts   y luego   python demo/generar-voz.py [ruta-a-ffmpeg]
Salida: demo/audio/<id>.mp3 y demo/audio/duraciones.json. Requiere internet (el texto de narracion.json se envía al servicio de voz)."""
import asyncio, json, os, re, subprocess, sys
import edge_tts

here = os.path.dirname(os.path.abspath(__file__))
cfg = json.load(open(os.path.join(here, "narracion.json"), encoding="utf-8"))
ffmpeg = sys.argv[1] if len(sys.argv) > 1 else "ffmpeg"
out = os.path.join(here, "audio"); os.makedirs(out, exist_ok=True)

def duration(path):
    r = subprocess.run([ffmpeg, "-i", path], capture_output=True, text=True)
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", r.stderr)
    return int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3])

async def main():
    durs = {}
    for id_, text in cfg["lineas"].items():
        path = os.path.join(out, f"{id_}.mp3")
        await edge_tts.Communicate(text, cfg["voz"], rate=cfg["ritmo"]).save(path)
        durs[id_] = round(duration(path), 2)
        print(f"{id_:12} {durs[id_]:5.1f}s")
    json.dump(durs, open(os.path.join(out, "duraciones.json"), "w"), indent=1)
    print("total voz:", round(sum(durs.values()), 1), "s")

asyncio.run(main())
