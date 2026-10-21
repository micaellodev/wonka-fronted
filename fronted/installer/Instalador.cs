// Instalador propio de Wonka Park (estilo Discord): ventana pequeña y redondeada con barra real, descarga el paquete de la
// URL de actualizaciones, lo verifica (SHA-512) y ejecuta el instalador de Electron en modo invisible
// (Setup /S --package-file=...), contando los archivos que van apareciendo. Al terminar abre la app.
// C# 5 (csc.exe de .NET Framework 4, ya presente en Windows): sin $"", ?. ni nameof.
// Opciones de prueba: --url=<base> --prueba (no ejecuta el instalador) --captura=<png> (guarda la ventana).
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.Globalization;
using System.IO;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        bool primera;
        Mutex unico = new Mutex(true, "Local\\WonkaParkInstalador", out primera);
        if (!primera) return;
        ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072; // TLS 1.2 (no es el valor por defecto en .NET 4.0)
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        string url = Config.Url, captura = null;
        bool prueba = false;
        foreach (string a in args)
        {
            if (a.StartsWith("--url=")) url = a.Substring(6);
            else if (a.StartsWith("--captura=")) captura = a.Substring(10);
            else if (a == "--prueba") prueba = true;
        }
        Application.Run(new InstaladorForm(url.TrimEnd('/'), prueba, captura));
        GC.KeepAlive(unico);
    }
}

class InstaladorForm : Form
{
    // Paleta de la marca (rojo Wonka sobre tarjeta clara)
    static readonly Color Tarjeta = Color.White, Borde = Color.FromArgb(240, 226, 226), Pista = Color.FromArgb(244, 234, 234);
    static readonly Color Rojo1 = Color.FromArgb(244, 51, 63), Rojo2 = Color.FromArgb(255, 122, 122);
    static readonly Color Tinta = Color.FromArgb(31, 31, 36), Gris = Color.FromArgb(139, 139, 150);
    const int Ancho = 500, Alto = 300;
    static readonly Rectangle Caja = new Rectangle(14, 10, Ancho - 28, Alto - 36);

    [StructLayout(LayoutKind.Sequential)] struct PUNTO { public int x, y; }
    [StructLayout(LayoutKind.Sequential)] struct TAM { public int cx, cy; }
    [StructLayout(LayoutKind.Sequential)] struct MEZCLA { public byte Op, Flags, Alfa, Formato; }
    [DllImport("user32.dll")] static extern bool UpdateLayeredWindow(IntPtr h, IntPtr dst, ref PUNTO pd, ref TAM ps, IntPtr src, ref PUNTO pp, int clave, ref MEZCLA mz, int flags);
    [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr h);
    [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr h, IntPtr dc);
    [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr dc);
    [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr dc);
    [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr dc, IntPtr o);
    [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr o);

    readonly string url, captura;
    readonly bool prueba;
    readonly object cerrojo = new object();
    string estado = "Preparando…", modulo = "", detalle = "", fallo = null;
    double objetivo = 0, mostrado = 0;
    Rectangle rReintentar, rCerrar;
    Point arrastre;
    Image logo;
    Icon icono;
    Thread trabajo;
    Bitmap lienzo = new Bitmap(Ancho, Alto, PixelFormat.Format32bppPArgb);
    bool fotoHecha;
    DateTime inicio = DateTime.UtcNow;

    protected override CreateParams CreateParams
    {
        get { CreateParams cp = base.CreateParams; cp.ExStyle |= 0x00080000; return cp; } // WS_EX_LAYERED: transparencia por píxel
    }

    public InstaladorForm(string url, bool prueba, string captura)
    {
        this.url = url; this.prueba = prueba; this.captura = captura;
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(Ancho, Alto);
        ShowInTaskbar = true;
        Text = "Wonka Park";
        try { icono = Icon.ExtractAssociatedIcon(Application.ExecutablePath); Icon = icono; } catch { }
        try { logo = Image.FromStream(Assembly.GetExecutingAssembly().GetManifestResourceStream("logo.png")); } catch { }

        System.Windows.Forms.Timer reloj = new System.Windows.Forms.Timer { Interval = 33 };
        reloj.Tick += delegate
        {
            double meta; lock (cerrojo) { meta = objetivo; }
            mostrado += (meta - mostrado) * 0.18; // la barra avanza suave aunque lleguen datos a saltos
            if (Math.Abs(meta - mostrado) < 0.0005) mostrado = meta;
            Dibujar();
        };
        reloj.Start();
        Shown += delegate { Iniciar(); };
    }

    void Dibujar()
    {
        if (!IsHandleCreated) return;
        using (Graphics g = Graphics.FromImage(lienzo)) Pintar(g);
        PresentarCapa();
        if (captura != null && !fotoHecha && (DateTime.UtcNow - inicio).TotalMilliseconds > 3500)
        {
            fotoHecha = true;
            using (Bitmap fondo = new Bitmap(Ancho, Alto))
            using (Graphics g = Graphics.FromImage(fondo)) { g.Clear(Color.FromArgb(120, 120, 130)); g.DrawImage(lienzo, 0, 0); fondo.Save(captura); }
        }
    }

    void PresentarCapa()
    {
        IntPtr pantalla = GetDC(IntPtr.Zero), mem = CreateCompatibleDC(pantalla), hbmp = IntPtr.Zero, viejo = IntPtr.Zero;
        try
        {
            hbmp = lienzo.GetHbitmap(Color.FromArgb(0));
            viejo = SelectObject(mem, hbmp);
            TAM tam = new TAM { cx = Ancho, cy = Alto };
            PUNTO origen = new PUNTO(), pos = new PUNTO { x = Left, y = Top };
            MEZCLA mz = new MEZCLA { Op = 0, Flags = 0, Alfa = 255, Formato = 1 };
            UpdateLayeredWindow(Handle, pantalla, ref pos, ref tam, mem, ref origen, 0, ref mz, 2);
        }
        finally
        {
            ReleaseDC(IntPtr.Zero, pantalla);
            if (hbmp != IntPtr.Zero) { SelectObject(mem, viejo); DeleteObject(hbmp); }
            DeleteDC(mem);
        }
    }

    void Iniciar()
    {
        lock (cerrojo) { fallo = null; objetivo = 0; mostrado = 0; }
        trabajo = new Thread(Ejecutar) { IsBackground = true };
        trabajo.Start();
    }

    void Fijar(string e, string m, double p, string d)
    {
        lock (cerrojo) { estado = e; modulo = m; objetivo = Math.Max(0, Math.Min(1, p)); detalle = d; }
    }

    static string MB(double bytes) { return (bytes / 1048576.0).ToString("0.0", CultureInfo.GetCultureInfo("es-PE")); }

    static string Hash(string archivo)
    {
        using (FileStream f = File.OpenRead(archivo)) { return Convert.ToBase64String(SHA512.Create().ComputeHash(f)); }
    }

    void Descargar(string nombre, long total, string sha, string destino, long ya, long granTotal)
    {
        if (File.Exists(destino) && new FileInfo(destino).Length == total && Hash(destino) == sha) return; // reintento: ya estaba bajado
        HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url + "/" + Uri.EscapeDataString(nombre) + "?t=" + DateTime.UtcNow.Ticks);
        req.UserAgent = "WonkaPark-Instalador";
        req.Timeout = 20000; req.ReadWriteTimeout = 20000; // sin red: falla en segundos y ofrece Reintentar
        Stopwatch reloj = Stopwatch.StartNew();
        long leido = 0;
        using (WebResponse resp = req.GetResponse())
        using (Stream entrada = resp.GetResponseStream())
        using (FileStream salida = File.Create(destino))
        {
            byte[] buf = new byte[65536];
            int n;
            while ((n = entrada.Read(buf, 0, buf.Length)) > 0)
            {
                salida.Write(buf, 0, n);
                leido += n;
                double vel = leido / Math.Max(0.25, reloj.Elapsed.TotalSeconds);
                Fijar("Descargando actualizaciones…", "Módulo 1 de 3 · Descarga",
                    0.60 * (ya + leido) / (double)granTotal,
                    MB(ya + leido) + " de " + MB(granTotal) + " MB  ·  " + MB(vel) + " MB/s");
            }
        }
        if (leido != total) throw new Exception("La descarga quedó incompleta (" + MB(leido) + " de " + MB(total) + " MB).");
        if (Hash(destino) != sha) { File.Delete(destino); throw new Exception("El archivo descargado está dañado. Reintenta."); }
    }

    static string Texto(string direccion)
    {
        HttpWebRequest r = (HttpWebRequest)WebRequest.Create(direccion);
        r.UserAgent = "WonkaPark-Instalador"; r.Timeout = 15000; r.ReadWriteTimeout = 15000;
        using (WebResponse w = r.GetResponse()) using (StreamReader sr = new StreamReader(w.GetResponseStream(), Encoding.UTF8)) return sr.ReadToEnd();
    }

    static int ContarArchivos(string carpeta)
    {
        try { return Directory.Exists(carpeta) ? Directory.GetFiles(carpeta, "*", SearchOption.AllDirectories).Length : 0; }
        catch { return 0; }
    }

    void Ejecutar()
    {
        try
        {
            Fijar("Buscando la última versión…", "Módulo 1 de 3 · Descarga", 0, "");
            string json = Texto(url + "/instalador.json?t=" + DateTime.UtcNow.Ticks);
            Dictionary<string, object> m = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(json);
            Dictionary<string, object> setup = (Dictionary<string, object>)m["setup"];
            Dictionary<string, object> paquete = (Dictionary<string, object>)m["package"];
            int archivos = Convert.ToInt32(m["files"]);
            long tSetup = Convert.ToInt64(setup["size"]), tPaq = Convert.ToInt64(paquete["size"]);
            string exe = (string)m["exe"];
            string destinoApp = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", (string)m["installDir"]);

            string temp = Path.Combine(Path.GetTempPath(), "wonka-instalador");
            Directory.CreateDirectory(temp);
            string rSetup = Path.Combine(temp, (string)setup["name"]), rPaq = Path.Combine(temp, (string)paquete["name"]);
            long granTotal = tSetup + tPaq;
            Descargar((string)setup["name"], tSetup, (string)setup["sha512"], rSetup, 0, granTotal);
            Descargar((string)paquete["name"], tPaq, (string)paquete["sha512"], rPaq, tSetup, granTotal);

            Fijar("Instalando los archivos…", "Módulo 2 de 3 · Instalación", 0.60, "Archivos instalados: 0 de " + archivos);
            Process p = null;
            if (!prueba)
            {
                ProcessStartInfo psi = new ProcessStartInfo(rSetup, "/S \"--package-file=" + rPaq + "\"");
                psi.UseShellExecute = false; psi.CreateNoWindow = true;
                p = Process.Start(psi);
            }
            int paso = 0;
            while (p == null ? paso < 25 : !p.WaitForExit(250))
            {
                int hay = Math.Min(archivos, ContarArchivos(destinoApp));
                if (p == null) { hay = Math.Min(hay, archivos * paso / 25); paso++; Thread.Sleep(120); } // modo prueba: anima
                Fijar("Instalando los archivos…", "Módulo 2 de 3 · Instalación", 0.60 + 0.38 * hay / (double)archivos, "Archivos instalados: " + hay + " de " + archivos);
            }
            if (p != null && p.ExitCode != 0) throw new Exception("El instalador terminó con el código " + p.ExitCode + ".");

            string ruta = Path.Combine(destinoApp, exe);
            if (!File.Exists(ruta)) throw new Exception("No se encontró " + exe + " después de instalar.");
            Fijar("Abriendo Wonka Park…", "Módulo 3 de 3 · Inicio", 1.0, "Archivos instalados: " + archivos + " de " + archivos);
            Thread.Sleep(900);
            if (!prueba) Process.Start(ruta);
            Thread.Sleep(500);
            BeginInvoke((MethodInvoker)delegate { Close(); });
        }
        catch (Exception ex)
        {
            lock (cerrojo) { fallo = ex.Message; }
        }
    }

    void Pintar(Graphics g)
    {
        g.Clear(Color.Transparent);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
        g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
        string est, mod, det, err;
        lock (cerrojo) { est = estado; mod = modulo; det = detalle; err = fallo; }
        double pr = mostrado;

        // sombra suave + tarjeta muy redondeada
        for (int i = 9; i >= 1; i--)
        {
            Rectangle r = new Rectangle(Caja.X - i, Caja.Y - i + 5, Caja.Width + i * 2, Caja.Height + i * 2);
            using (GraphicsPath gp = Redondo(r, 30 + i)) using (Brush b = new SolidBrush(Color.FromArgb(7, 40, 20, 20))) g.FillPath(b, gp);
        }
        using (GraphicsPath gp = Redondo(Caja, 30))
        {
            using (Brush b = new SolidBrush(Tarjeta)) g.FillPath(b, gp);
            using (Pen p = new Pen(Borde)) g.DrawPath(p, gp);
        }

        int x = Caja.X + 34, y = Caja.Y + 28, w = Caja.Width - 68;
        if (logo != null) g.DrawImage(logo, new Rectangle(x, y - 4, 68, 68));
        using (Font f = new Font("Segoe UI", 20f, FontStyle.Bold)) using (Brush b = new SolidBrush(Tinta)) g.DrawString("Wonka Park", f, b, x + 82, y + 4);
        using (Font f = new Font("Segoe UI", 10f)) using (Brush b = new SolidBrush(Gris)) g.DrawString("Instalador", f, b, x + 84, y + 38);

        if (err != null)
        {
            using (Font f = new Font("Segoe UI", 13f, FontStyle.Bold)) using (Brush b = new SolidBrush(Rojo1)) g.DrawString("Ups, no se pudo completar", f, b, x, y + 90);
            using (Font f = new Font("Segoe UI", 9.5f)) using (Brush b = new SolidBrush(Gris)) g.DrawString(err, f, b, new RectangleF(x, y + 120, w, 56));
            rReintentar = new Rectangle(x, y + 176, 128, 38); rCerrar = new Rectangle(x + 140, y + 176, 100, 38);
            Boton(g, rReintentar, "Reintentar", true); Boton(g, rCerrar, "Cerrar", false);
            return;
        }
        rReintentar = rCerrar = Rectangle.Empty;

        using (Font f = new Font("Segoe UI Semibold", 13f)) using (Brush b = new SolidBrush(Tinta)) g.DrawString(est, f, b, x, y + 88);
        using (Font f = new Font("Segoe UI", 13f, FontStyle.Bold)) using (Brush b = new SolidBrush(Rojo1)) using (StringFormat der = new StringFormat { Alignment = StringAlignment.Far })
            g.DrawString(((int)Math.Round(pr * 100)) + "%", f, b, new RectangleF(x + w - 100, y + 88, 100, 26), der);
        using (Font f = new Font("Segoe UI", 9.5f)) using (Brush b = new SolidBrush(Gris)) g.DrawString(mod, f, b, x, y + 116);

        Rectangle pista = new Rectangle(x, y + 146, w, 14);
        using (GraphicsPath gp = Redondo(pista, 7)) using (Brush b = new SolidBrush(Pista)) g.FillPath(b, gp);
        int rw = (int)Math.Round(pista.Width * pr);
        if (rw >= 14)
        {
            Rectangle relleno = new Rectangle(pista.X, pista.Y, rw, pista.Height);
            using (GraphicsPath gp = Redondo(relleno, 7)) using (LinearGradientBrush b = new LinearGradientBrush(relleno, Rojo1, Rojo2, 0f)) g.FillPath(b, gp);
        }
        using (Font f = new Font("Segoe UI", 9.5f)) using (Brush b = new SolidBrush(Gris))
        {
            g.DrawString(det, f, b, x, y + 170);
            g.DrawString("No cierres esta ventana, será solo un momento.", f, b, x, y + 196);
        }
    }

    static GraphicsPath Redondo(Rectangle r, int radio)
    {
        int d = radio * 2;
        GraphicsPath p = new GraphicsPath();
        p.AddArc(r.X, r.Y, d, d, 180, 90); p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90); p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        p.CloseFigure();
        return p;
    }

    static void Boton(Graphics g, Rectangle r, string texto, bool principal)
    {
        using (GraphicsPath gp = Redondo(r, r.Height / 2)) using (Brush b = new SolidBrush(principal ? Rojo1 : Pista)) g.FillPath(b, gp);
        using (Font f = new Font("Segoe UI Semibold", 10f)) using (Brush t = new SolidBrush(principal ? Color.White : Tinta))
        using (StringFormat c = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center })
            g.DrawString(texto, f, t, r, c);
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        if (rReintentar.Contains(e.Location)) { Iniciar(); return; }
        if (rCerrar.Contains(e.Location)) { Close(); return; }
        arrastre = e.Location;
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        if (e.Button == MouseButtons.Left && !arrastre.IsEmpty)
            Location = new Point(Location.X + e.X - arrastre.X, Location.Y + e.Y - arrastre.Y);
    }

    protected override void OnMouseUp(MouseEventArgs e) { arrastre = Point.Empty; }

    protected override void OnKeyDown(KeyEventArgs e)
    {
        bool conError; lock (cerrojo) { conError = fallo != null; }
        if (e.KeyCode == Keys.Escape && conError) Close();
    }
}
