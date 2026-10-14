// Voz en off del promo con voces neurales de Microsoft (paquete de Python "edge-tts").
// Son mucho más naturales y expresivas que el TTS local. Requiere internet al generar.
//
//   npm run voz                 crea solo los archivos que falten
//   npm run voz:rehacer         vuelve a generar las 5 frases
//   npm run voz:muestras        crea muestras de varias voces en assets/audio/muestras/ para elegir
//   npm run voz:rehacer -- --voz=es-MX-DaliaNeural    regenera con otra voz
//
// Para usar una locución grabada, guarda tus archivos como assets/audio/voz-01.wav … voz-05.wav
// y este script no los tocará (salvo con voz:rehacer).
//
// Instala edge-tts en un entorno aislado .venv-voz/ dentro de esta carpeta: tu Python global no se toca.
// Necesita FFmpeg (el mismo que usa Hyperframes) para limpiar silencios y nivelar volumen.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ------------------------------------------------------------------ ajustes de voz
// Voz por defecto: Camila (español de Perú), femenina, cálida y cercana.
const DEFAULT_VOICE = "es-PE-CamilaNeural";
// Un poco más rápida y un poco más aguda = tono más alegre y fresco, sin sonar artificial.
const RATE = "+8%";
const PITCH = "+6Hz";

// [archivo, texto, segundos disponibles en la escena]
const LINES = [
  ["voz-01.wav", "¡En Renzo Wonka, la diversión comienza desde que llegas!", 3.9],
  ["voz-02.wav", "¡Ven a jugar, reír y disfrutar a tu ritmo!", 6.8],
  ["voz-03.wav", "¡Y acompaña la aventura con dulces, canchita y muchas chucherías!", 6.2],
  ["voz-04.wav", "¿Se acerca un cumpleaños? ¡Celebra con nosotros y reserva tu fecha!", 7.8],
  ["voz-05.wav", "¡Renzo Wonka! ¡Ven a jugar y reserva tu cumpleaños!", 5.8],
];

// Voces para comparar con "npm run voz:muestras"
const SAMPLE_VOICES = [
  "es-PE-CamilaNeural", // Perú, femenina
  "es-PE-AlexNeural", // Perú, masculina
  "es-MX-DaliaNeural", // México, femenina
  "es-CO-SalomeNeural", // Colombia, femenina
  "es-MX-JorgeNeural", // México, masculina
];

// ------------------------------------------------------------------
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const force = args.includes("--force");
const samples = args.includes("--muestras");
const voiceArg = args.find((a) => a.startsWith("--voz="));
const VOICE = voiceArg ? voiceArg.slice(6) : DEFAULT_VOICE;
const isWin = process.platform === "win32";
const audioDir = resolve(root, "assets/audio");

const q = (cmd, a, opts = {}) => spawnSync(cmd, a, { encoding: "utf8", windowsHide: true, ...opts });
const ok = (r) => r && r.status === 0 && !r.error;

const pending = samples ? [] : LINES.filter(([f]) => force || !existsSync(join(audioDir, f)));
if (!samples && pending.length === 0) {
  console.log('✓ Voz en off ya generada (usa "npm run voz:rehacer" para regenerarla).');
  process.exit(0);
}

// ------------------------------------------------------------------ FFmpeg
if (!ok(q("ffmpeg", ["-version"]))) {
  console.error("✗ No encontré FFmpeg en el PATH. Instálalo (winget install -e --id Gyan.FFmpeg), reabre la terminal y vuelve a intentar.");
  process.exit(1);
}

// ------------------------------------------------------------------ Python + edge-tts
const venvDir = join(root, ".venv-voz");
const venvPy = isWin ? join(venvDir, "Scripts", "python.exe") : join(venvDir, "bin", "python");
const hasEdge = (exe) => ok(q(exe, ["-c", "import edge_tts"]));
// edge-tts depende de aiohttp; estas variables permiten instalarlo en versiones nuevas de Python
// (como 3.15) aunque todavía no existan paquetes precompilados para ellas.
const pureEnv = {
  ...process.env,
  AIOHTTP_NO_EXTENSIONS: "1",
  MULTIDICT_NO_EXTENSIONS: "1",
  YARL_NO_EXTENSIONS: "1",
  FROZENLIST_NO_EXTENSIONS: "1",
  PROPCACHE_NO_EXTENSIONS: "1",
};

function pyInfo(cmd, pre = []) {
  const r = q(cmd, [...pre, "-c", "import sys;print(sys.executable);print(sys.version_info[0]*100+sys.version_info[1])"]);
  if (!ok(r)) return null;
  const [exe, v] = r.stdout.trim().split(/\r?\n/);
  return exe && v ? { exe: exe.trim(), v: +v } : null;
}

function resolvePython() {
  if (existsSync(venvPy) && hasEdge(venvPy)) return venvPy;
  const cands = [];
  for (const v of ["3.12", "3.13", "3.11", "3.14", "3.15", "3.10"]) {
    if (isWin) cands.push(["py", [`-${v}`]]);
    cands.push([`python${v}`, []]);
  }
  if (isWin) cands.push(["py", ["-3"]]);
  cands.push(["python3", []], ["python", []]);

  const seen = new Set();
  for (const [cmd, pre] of cands) {
    const info = pyInfo(cmd, pre);
    if (!info || info.v < 309 || seen.has(info.exe.toLowerCase())) continue;
    seen.add(info.exe.toLowerCase());
    console.log(`→ Preparando entorno de voz con ${info.exe} en .venv-voz/ (solo la primera vez)…`);
    if (!ok(spawnSync(info.exe, ["-m", "venv", "--clear", venvDir], { stdio: "inherit" }))) continue;
    const inst = spawnSync(venvPy, ["-m", "pip", "install", "--disable-pip-version-check", "edge-tts"], { stdio: "inherit", env: pureEnv });
    if (ok(inst) && hasEdge(venvPy)) return venvPy;
    console.log("· No se pudo instalar edge-tts con ese Python; probando otro…");
  }
  return null;
}

const python = resolvePython();
if (!python) {
  console.error(`
✗ No pude preparar Python para la voz.
  Instala Python 3.12 (convive con tu versión actual):  winget install -e --id Python.Python.3.12
  Reabre la terminal y vuelve a ejecutar:  npm run render
  Alternativa: graba tú la locución y guárdala como assets/audio/voz-01.wav … voz-05.wav.`);
  process.exit(1);
}

// ------------------------------------------------------------------ síntesis
function synth(text, voice, outWav) {
  const tmp = outWav.replace(/\.wav$/, ".tmp.mp3");
  const r = spawnSync(
    python,
    ["-m", "edge_tts", "--voice", voice, `--rate=${RATE}`, `--pitch=${PITCH}`, "--text", text, "--write-media", tmp],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
  if (!ok(r) || !existsSync(tmp)) return false;
  // quita el silencio inicial, nivela a -16 LUFS (estándar para redes) y entrega WAV 44.1 kHz
  const f = q("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error", "-i", tmp,
    "-af", "silenceremove=start_periods=1:start_threshold=-50dB,loudnorm=I=-16:TP=-1.5:LRA=11",
    "-ar", "44100", "-ac", "1", outWav,
  ]);
  rmSync(tmp, { force: true });
  return ok(f) && existsSync(outWav);
}
const duration = (file) => parseFloat(q("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).stdout);

if (samples) {
  const dir = join(audioDir, "muestras");
  mkdirSync(dir, { recursive: true });
  for (const v of SAMPLE_VOICES) {
    const out = join(dir, `${v}.wav`);
    console.log(`→ muestra ${v}`);
    if (!synth(LINES[0][1] + " " + LINES[3][1], v, out)) console.warn(`  ✗ no se pudo generar ${v}`);
  }
  console.log(`✓ Muestras en assets/audio/muestras/. Para usar otra voz:  npm run voz:rehacer -- --voz=NOMBRE`);
  process.exit(0);
}

mkdirSync(audioDir, { recursive: true });
console.log(`✓ Voz: ${VOICE}  (velocidad ${RATE}, tono ${PITCH})`);
for (const [file, text, slot] of pending) {
  const out = join(audioDir, file);
  console.log(`→ ${file}: ${text}`);
  if (!synth(text, VOICE, out)) {
    console.error(`✗ No se pudo generar ${file}. Revisa tu conexión a internet y el mensaje de arriba.`);
    process.exit(1);
  }
  const d = duration(out);
  if (d > slot) console.warn(`⚠ ${file} dura ${d.toFixed(2)} s y la escena deja ${slot} s: sube RATE en este script y usa "npm run voz:rehacer".`);
}
console.log("✓ Voz lista.");
