"""Mezcla el video grabado con la narración y una música suave de fondo (sintetizada aquí, sin derechos de autor).
Uso:  pip install numpy   y luego   python demo/mezclar.py <ruta-ffmpeg>
Entradas: demo/salida/demo-wonka.webm + timeline.json (los escribe record-demo.mjs) + demo/audio/*.mp3 (generar-voz.py)
Salida:   demo/salida/demo-wonka.mp4 (H.264 + AAC), demo/salida/musica.wav
La música baja sola cuando habla la voz (sidechain)."""
import json, os, subprocess, sys, wave
import numpy as np

here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, "salida")
ffmpeg = sys.argv[1] if len(sys.argv) > 1 else "ffmpeg"
OFFSET_MS = 400          # el video empieza un instante después de t=0 de la grabación
MUSIC_DB = -14           # volumen base de la música antes del ducking (la voz va a 0 dB)

tl = json.load(open(os.path.join(out, "timeline.json")))
seconds = tl["duracionMs"] / 1000 + 3
SR = 44100


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def synth(total):
    """Pad cálido + notas tipo kalimba, con eco, en 72 bpm. Progresión Cmaj9 – Am9 – Fmaj9 – G6/9."""
    n = int(total * SR)
    L = np.zeros(n); R = np.zeros(n)
    beat = 60 / 72
    chords = [[48, 55, 64, 71, 74], [45, 52, 60, 67, 71], [41, 48, 57, 64, 67], [43, 50, 59, 64, 69]]
    chord_len = 8 * beat
    rng = np.random.default_rng(7)

    def add(buf, start, sig):
        i = int(start * SR)
        if i >= n:
            return
        j = min(n, i + len(sig))
        buf[i:j] += sig[: j - i]

    k = 0
    t = 0.0
    while t < total:
        notes = chords[k % 4]
        dur = chord_len + 2.5          # solapa con el acorde siguiente
        tt = np.arange(int(dur * SR)) / SR
        env = np.minimum(tt / 1.6, 1) * np.minimum((dur - tt) / 2.4, 1)
        env = np.clip(env, 0, 1) ** 1.5
        for nn in notes:
            f = midi(nn)
            tone = np.sin(2 * np.pi * f * tt) + 0.25 * np.sin(2 * np.pi * 2 * f * tt) + 0.15 * np.sin(2 * np.pi * f * 1.004 * tt)
            amp = 0.035 * (1.0 if nn < 60 else 0.7)
            add(L, t, amp * tone * env); add(R, t, amp * np.roll(tone, 37) * env)
        # arpegio suave (kalimba): corcheas con huecos
        scale = [x + 12 for x in notes[1:]] + [notes[0] + 24]
        pattern = [0, 2, 1, 3, 2, 4, 3, 1]
        flags = [1, 0, 1, 1, 0, 1, 0, 1] * 2
        for s in range(16):
            if not flags[s] or rng.random() < 0.12:
                continue
            f = midi(scale[pattern[s % 8] % len(scale)])
            pt = np.arange(int(1.6 * SR)) / SR
            pl = (np.sin(2 * np.pi * f * pt) + 0.35 * np.sin(2 * np.pi * 2 * f * pt) * np.exp(-pt / 0.15)) * np.exp(-pt / 0.5)
            pl *= np.minimum(pt / 0.006, 1) * 0.085
            st = t + s * beat / 2
            add(L, st, pl); add(R, st + 0.012, pl)
            for d, g, side in ((0.5, 0.32, R), (0.94, 0.16, L), (1.4, 0.08, R)):   # eco
                add(side, st + d, pl * g)
        t += chord_len
        k += 1
    sig = np.stack([L, R], axis=1)
    sig /= np.max(np.abs(sig)) / 0.6
    fade_in, fade_out = int(2.5 * SR), int(3.5 * SR)
    sig[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
    sig[-fade_out:] *= np.linspace(1, 0, fade_out)[:, None]
    return (sig * 32767).astype(np.int16)


music = os.path.join(out, "musica.wav")
with wave.open(music, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(synth(seconds).tobytes())
print("música:", round(seconds, 1), "s")

# ── ffmpeg: video + voces con retardo + música con ducking ──────────
video = os.path.join(out, "demo-wonka.webm")
args = [ffmpeg, "-y", "-loglevel", "error", "-i", video]
for v in tl["voz"]:
    args += ["-i", os.path.join(here, "audio", v["id"] + ".mp3")]
args += ["-i", music]
nv = len(tl["voz"])
parts = []
for i, v in enumerate(tl["voz"], start=1):
    ms = int(v["at"] + OFFSET_MS)
    parts.append(f"[{i}:a]aresample=44100,aformat=channel_layouts=stereo,adelay={ms}|{ms}[v{i}]")
parts.append("".join(f"[v{i}]" for i in range(1, nv + 1)) + f"amix=inputs={nv}:normalize=0:dropout_transition=0[voz]")
parts.append("[voz]asplit=2[vs][vm]")
parts.append(f"[{nv + 1}:a]volume={MUSIC_DB}dB[mus]")
parts.append("[mus][vs]sidechaincompress=threshold=0.015:ratio=5:attack=30:release=800:makeup=1[md]")
parts.append("[md][vm]amix=inputs=2:normalize=0:duration=longest[mix]")
parts.append("[mix]loudnorm=I=-16:TP=-1.5:LRA=11[a]")   # volumen de video para celular (≈ -16 LUFS)
dest = os.path.join(out, "demo-wonka.mp4")
args += ["-filter_complex", ";".join(parts), "-map", "0:v", "-map", "[a]",
         "-c:v", "libx264", "-preset", "medium", "-crf", "27", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", dest]
subprocess.run(args, check=True)
print("listo:", dest, round(os.path.getsize(dest) / 1e6, 1), "MB")
