// Impresión directa a térmicas ESC/POS (modo "Directo"): evita el driver de Windows, que en algunas impresoras
// (p. ej. POS-E802L) pierde el hilo de los datos y deja filas de caracteres raros entre la imagen.
const { execFile } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

/**
 * Convierte un bitmap BGRA (NativeImage.toBitmap) a comandos ESC/POS de raster (GS v 0) en tiras pequeñas,
 * en blanco y negro puro, más avance de papel y corte.
 */
function toEscPos(bgra, width, height, { threshold = 170, strip = 96, feed = 4, cut = true } = {}) {
  const wBytes = Math.ceil(width / 8)
  const parts = [Buffer.from([0x1b, 0x40])] // ESC @: reinicia la impresora
  for (let y0 = 0; y0 < height; y0 += strip) {
    const rows = Math.min(strip, height - y0)
    const data = Buffer.alloc(wBytes * rows)
    for (let r = 0; r < rows; r++) {
      for (let x = 0; x < width; x++) {
        const i = ((y0 + r) * width + x) * 4
        const lum = bgra[i + 3] === 0 ? 255 : 0.114 * bgra[i] + 0.587 * bgra[i + 1] + 0.299 * bgra[i + 2]
        if (lum < threshold) data[r * wBytes + (x >> 3)] |= 0x80 >> (x & 7)
      }
    }
    parts.push(Buffer.from([0x1d, 0x76, 0x30, 0x00, wBytes & 255, wBytes >> 8, rows & 255, rows >> 8]), data) // GS v 0 m xL xH yL yH d...
  }
  parts.push(Buffer.from([0x1b, 0x64, feed])) // ESC d n: avanza n líneas
  if (cut) parts.push(Buffer.from([0x1d, 0x56, 0x42, 0x00])) // GS V 66 0: corte con avance
  return Buffer.concat(parts)
}

const PS_SCRIPT = `
$src = @'
using System;
using System.Runtime.InteropServices;
public class WonkaRaw {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct DOCINFO { [MarshalAs(UnmanagedType.LPWStr)] public string pDocName; [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile; [MarshalAs(UnmanagedType.LPWStr)] public string pDataType; }
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool OpenPrinter(string name, out IntPtr h, IntPtr pd);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] static extern int StartDocPrinter(IntPtr h, int level, ref DOCINFO di);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool WritePrinter(IntPtr h, byte[] buf, int len, out int written);
  public static string Send(string printer, byte[] data) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) return "OpenPrinter " + Marshal.GetLastWin32Error();
    try {
      DOCINFO di = new DOCINFO(); di.pDocName = "Wonka ticket"; di.pOutputFile = null; di.pDataType = "RAW";
      if (StartDocPrinter(h, 1, ref di) == 0) return "StartDocPrinter " + Marshal.GetLastWin32Error();
      try {
        if (!StartPagePrinter(h)) return "StartPagePrinter " + Marshal.GetLastWin32Error();
        int off = 0;
        while (off < data.Length) {
          int n = Math.Min(2048, data.Length - off);
          byte[] chunk = new byte[n]; Array.Copy(data, off, chunk, 0, n);
          int w;
          if (!WritePrinter(h, chunk, n, out w)) return "WritePrinter " + Marshal.GetLastWin32Error();
          off += n;
        }
        EndPagePrinter(h);
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
    return "OK";
  }
}
'@
Add-Type -TypeDefinition $src
Write-Output ([WonkaRaw]::Send($env:WONKA_PRINTER, [IO.File]::ReadAllBytes($env:WONKA_FILE)))
`

/** Manda los bytes tal cual a la cola de la impresora (datatype RAW). Devuelve { ok, error }. */
function rawSend(printerName, bytes) {
  return new Promise((resolve) => {
    const file = path.join(os.tmpdir(), `wonka-raw-${Date.now()}.bin`)
    try { fs.writeFileSync(file, bytes) } catch (e) { return resolve({ ok: false, error: `No se pudo preparar el ticket: ${e.message}` }) }
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', PS_SCRIPT],
      { timeout: 30000, windowsHide: true, env: { ...process.env, WONKA_PRINTER: printerName, WONKA_FILE: file } },
      (err, out) => {
        fs.unlink(file, () => {})
        const res = String(out || '').trim().split(/\r?\n/).pop()
        if (err || res !== 'OK') resolve({ ok: false, error: `Impresión directa falló (${res || err?.message || 'sin respuesta'}).` })
        else resolve({ ok: true })
      },
    )
  })
}

/**
 * Prueba de diagnóstico: cada sección usa un comando distinto, con su letrero en texto simple, para ver cuál entiende la impresora.
 * Se lee el papel: la sección que sale como dibujo (barras) y no como símbolos es la que sirve.
 */
function diagnosticBytes() {
  const text = (s) => Buffer.from(s + '\n', 'latin1')
  const parts = [Buffer.from([0x1b, 0x40]), text('=== DIAGNOSTICO WONKA ==='), text('A) Texto simple: ABC abc 123')]
  // Imagen de 64x24 puntos: barras verticales anchas
  const w = 64, h = 24, wBytes = w / 8
  const rows = Buffer.alloc(wBytes * h)
  for (let r = 0; r < h; r++) for (let b = 0; b < wBytes; b++) rows[r * wBytes + b] = b % 2 === 0 ? 0xff : 0x00
  parts.push(text('B) Imagen GS v 0 (raster):'), Buffer.from([0x1d, 0x76, 0x30, 0x00, wBytes, 0, h, 0]), rows)
  // ESC * 33: imagen en columnas de 24 puntos
  const cols = 64, colBuf = Buffer.alloc(cols * 3)
  for (let c = 0; c < cols; c++) if (Math.floor(c / 8) % 2 === 0) colBuf.fill(0xff, c * 3, c * 3 + 3)
  parts.push(text('C) Imagen ESC * (24 puntos):'), Buffer.from([0x1b, 0x2a, 33, cols & 255, cols >> 8]), colBuf, Buffer.from('\n'))
  // QR nativo: GS ( k
  const qr = Buffer.from('WONKA', 'latin1')
  const pl = qr.length + 3
  parts.push(
    text('D) QR nativo:'),
    Buffer.from([0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]),
    Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06]),
    Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31]),
    Buffer.from([0x1d, 0x28, 0x6b, pl & 255, pl >> 8, 0x31, 0x50, 0x30]), qr,
    Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]),
    Buffer.from('\n'),
    text('=== FIN ==='), Buffer.from([0x1b, 0x64, 4]), Buffer.from([0x1d, 0x56, 0x42, 0x00]),
  )
  return Buffer.concat(parts)
}

module.exports = { toEscPos, rawSend, diagnosticBytes }
