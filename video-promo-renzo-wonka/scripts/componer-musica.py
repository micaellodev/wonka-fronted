"""
Música original para el promo de Renzo Wonka (35 s, 120 BPM, Do mayor).

Todo se sintetiza desde cero con numpy: marimba, bajo, campanitas, palmas,
shaker y bombo suave, más acentos sonoros (whoosh, pop, destellos) alineados
con las transiciones de la composición. No usa muestras ni melodías ajenas.

Uso:  python scripts/componer-musica.py
Salida: assets/audio/musica-renzo-wonka.wav  (estéreo, 44.1 kHz, 16 bit)
Requiere: numpy, scipy
"""
import os
import numpy as np
from scipy.signal import butter, sosfilt
from scipy.io import wavfile

SR = 44100
DUR = 35.0
BPM = 120
BEAT = 60 / BPM            # 0.5 s
BAR = BEAT * 4             # 2 s
N = int(SR * DUR)
rng = np.random.default_rng(20261013)   # semilla fija: resultado idéntico siempre

L = np.zeros(N)
R = np.zeros(N)


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def place(sig, t, pan=0.0, gain=1.0):
    i = int(t * SR)
    if i >= N:
        return
    sig = sig[: N - i] * gain
    lg = np.cos((pan + 1) * np.pi / 4)
    rg = np.sin((pan + 1) * np.pi / 4)
    L[i:i + len(sig)] += sig * lg
    R[i:i + len(sig)] += sig * rg


def tt(d):
    return np.arange(int(d * SR)) / SR


def env(t, a=0.004, d=0.3):
    e = np.exp(-t / d)
    att = np.clip(t / a, 0, 1)
    return e * att


# ---------- instrumentos ----------
def marimba(n, d=0.45):
    t = tt(d); f = midi(n)
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 3.93 * t) * np.exp(-t / 0.05)
    return s * env(t, 0.002, 0.22)


def bell(n, d=1.2):
    t = tt(d); f = midi(n)
    s = np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * f * 2.76 * t) + 0.2 * np.sin(2 * np.pi * f * 5.4 * t)
    return s * env(t, 0.002, 0.5)


def bass(n, d=0.42):
    t = tt(d); f = midi(n)
    s = sum(np.sin(2 * np.pi * f * k * t) / k ** 1.6 for k in (1, 2, 3, 4))
    return s * env(t, 0.006, 0.22)


def lead(n, d=0.3):
    t = tt(d); f = midi(n)
    vib = 1 + 0.004 * np.sin(2 * np.pi * 6 * t)
    s = np.sin(2 * np.pi * f * vib * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t) + 0.12 * np.sin(2 * np.pi * 3 * f * t)
    return s * env(t, 0.01, 0.18)


def pad(notes, d):
    t = tt(d)
    s = np.zeros_like(t)
    for n in notes:
        f = midi(n)
        for det in (-0.12, 0.0, 0.12):
            s += np.sin(2 * np.pi * f * (1 + det / 100) * t)
    a = np.clip(t / 0.8, 0, 1)
    r = np.clip((d - t) / 1.2, 0, 1)
    return s / (3 * len(notes)) * a * r


def bp(x, lo, hi):
    sos = butter(2, [lo, hi], btype="band", fs=SR, output="sos")
    return sosfilt(sos, x)


def hp(x, f):
    sos = butter(2, f, btype="high", fs=SR, output="sos")
    return sosfilt(sos, x)


def kick():
    t = tt(0.35)
    f = 45 + 75 * np.exp(-t / 0.04)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * env(t, 0.001, 0.14)


def clap():
    t = tt(0.25)
    nz = rng.standard_normal(len(t))
    e = np.zeros_like(t)
    for o in (0.0, 0.011, 0.022):
        e += np.where(t >= o, np.exp(-(t - o) / 0.012), 0) * 0.5
    e += np.exp(-t / 0.08) * 0.6
    return bp(nz, 900, 3200) * e


def shaker():
    t = tt(0.09)
    return hp(rng.standard_normal(len(t)), 6500) * env(t, 0.004, 0.025)


def whoosh(d=0.7, up=True):
    t = tt(d)
    nz = rng.standard_normal(len(t))
    out = np.zeros_like(t)
    seg = 12
    for k in range(seg):
        a, b = k * len(t) // seg, (k + 1) * len(t) // seg
        p = k / (seg - 1) if up else 1 - k / (seg - 1)
        c = 500 + 5000 * p
        out[a:b] = bp(nz, c * 0.7, min(c * 1.4, 20000))[a:b]
    shape = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 1.5
    return out * shape


def pop(n=84):
    t = tt(0.18)
    f = midi(n) * (0.6 + 0.4 * (1 - np.exp(-t / 0.02)))
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * env(t, 0.001, 0.05)


def sparkle(t0, base=84, count=6, step=0.06, pan=0.3, g=0.18):
    scale = [0, 4, 7, 12, 16, 19, 24]
    for i in range(count):
        place(bell(base + scale[i % len(scale)], 0.9), t0 + i * step, pan * (1 if i % 2 else -1), g)


# ---------- armonía ----------
# Do – Sol – Lam – Fa  (I–V–vi–IV), un acorde por compás (2 s)
CHORDS = [(48, [60, 64, 67]), (43, [59, 62, 67]), (45, [60, 64, 69]), (41, [60, 65, 69])]
ARP = [0, 1, 2, 1, 2, 0, 1, 2]           # patrón de corcheas
# Melodía original (pentatónica de Do), 8 corcheas por compás, None = silencio
MELODY = [
    [72, None, 76, 79, 76, None, 74, 72],
    [74, None, 79, None, 77, 76, 74, None],
    [76, None, 72, 76, 81, None, 79, 76],
    [77, 76, 74, None, 72, None, 74, None],
]


def section(t):
    if t < 4: return "intro"
    if t < 12: return "juego"
    if t < 19: return "antojos"
    if t < 28: return "cumple"
    return "cierre"


bars = int(np.ceil(DUR / BAR))
for b in range(bars):
    t0 = b * BAR
    root, tri = CHORDS[b % 4]
    sec = section(t0 + 0.01)
    if t0 >= 33.0:
        break
    for e in range(8):                      # corcheas
        te = t0 + e * BEAT / 2
        if te >= 32.0:
            break
        s = section(te)
        # marimba arpegiada
        if s != "cierre" or te < 30:
            note = tri[ARP[e]] + (12 if s in ("antojos", "cumple") and e % 4 == 3 else 0)
            place(marimba(note), te, -0.25 + 0.5 * (e % 2), 0.20 if s != "intro" else 0.16)
        # shaker
        if s != "intro" or e % 2 == 1:
            place(shaker(), te, 0.45, 0.07 if e % 2 else 0.045)
            if s in ("juego", "cumple"):
                place(shaker(), te + BEAT / 4, 0.45, 0.03)
        # melodía
        if s in ("antojos", "cumple"):
            m = MELODY[b % 4][e]
            if m is not None:
                if s == "antojos":
                    place(bell(m + 12, 0.8), te, 0.2, 0.09)
                else:
                    place(lead(m), te, -0.1, 0.12)
                    place(bell(m + 12, 0.6), te, 0.3, 0.04)
    for q in range(4):                      # negras
        tq = t0 + q * BEAT
        if tq >= 32.0:
            break
        s = section(tq)
        if s == "intro":
            if q == 0:
                place(kick(), tq, 0, 0.35)
        elif s != "cierre" or tq < 30:
            if q in (0, 2):
                place(kick(), tq, 0, 0.55)
            if q in (1, 3):
                place(clap(), tq, -0.05, 0.22 if s != "cumple" else 0.3)
            if s == "cumple" and q in (0, 2):
                place(clap(), tq + BEAT / 2, 0.2, 0.12)
        # bajo
        if s != "intro" and (s != "cierre" or tq < 30):
            place(bass(root + (12 if q == 3 else 0)), tq, 0, 0.32)
        elif s == "intro" and q in (0, 2):
            place(bass(root), tq, 0, 0.22)

# colchón suave en la intro y el cierre
place(pad([60, 64, 67, 72], 4.4), 0.0, 0, 0.16)
place(pad([60, 64, 67, 72, 76], 7.0), 28.0, 0, 0.22)
place(bass(36, 3.0) * 0.8, 30.0, 0, 0.35)
place(kick(), 30.0, 0, 0.45)
# acorde final y destello
for i, n in enumerate([60, 64, 67, 72, 76]):
    place(bell(n + 12, 3.0), 30.0 + i * 0.05, -0.4 + i * 0.2, 0.08)

# ---------- acentos sonoros (sincronizados con la composición) ----------
place(whoosh(0.9), 0.05, -0.3, 0.10)            # la línea roja empieza a dibujarse
for i, t in enumerate([0.45, 0.62, 0.79, 0.96, 1.13, 1.30]):   # formas que aparecen
    place(pop(79 + 2 * i), t, -0.6 + 0.24 * i, 0.10)
place(pop(72), 1.05, 0, 0.22); sparkle(1.15, 84, 4)              # logo rebota
place(whoosh(0.75), 3.45, 0.2, 0.22)            # barrido de color a JUEGO
place(pop(91), 4.25, 0.0, 0.10)
place(whoosh(0.7), 11.45, -0.2, 0.22)           # barrido a ANTOJITOS
for i, t in enumerate(np.arange(12.55, 13.8, 0.14)):           # dulces rebotando
    place(pop(84 + (i % 4) * 3), float(t), -0.5 + (i % 5) * 0.25, 0.09)
place(whoosh(0.6), 18.75, 0.1, 0.18)            # confeti
place(hp(rng.standard_normal(int(0.5 * SR)), 3000) * env(tt(0.5), 0.002, 0.12), 19.05, 0, 0.10)
sparkle(19.1, 88, 7, 0.05, 0.4, 0.14)
place(whoosh(0.9, up=False), 27.4, 0.0, 0.18)   # todo converge al logo
sparkle(28.25, 84, 6, 0.06, 0.3, 0.16)
place(pop(72), 28.3, 0, 0.2)

# ---------- master ----------
mix = np.stack([L, R], axis=1)
fade_in = np.clip(np.arange(N) / (0.05 * SR), 0, 1)
fade_out = np.clip((N - np.arange(N)) / (2.2 * SR), 0, 1)
mix *= (fade_in * fade_out)[:, None]
# compresión suave tipo tanh y normalización a -1 dBFS
mix = np.tanh(mix * 1.6) / np.tanh(1.6)
mix /= np.max(np.abs(mix)) / 10 ** (-1 / 20)

out = os.path.join(os.path.dirname(__file__), "..", "assets", "audio", "musica-renzo-wonka.wav")
wavfile.write(os.path.abspath(out), SR, (mix * 32767).astype(np.int16))
print("ok", os.path.abspath(out), f"{DUR:.1f}s")
