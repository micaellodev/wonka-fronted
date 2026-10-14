// ============================================================
//  Mock APISPeru (facturacion + consultas) — SOLO dev/test.
//  bun scripts/mock-apisperu.ts   → http://localhost:3999/api/v1
//
//  Modo global: env MOCK_APISPERU_MODE o POST /__mode {"mode": "..."}
//    ok | reject | error | timeout
//  Override por documento: si el JSON enviado contiene MOCK_RECHAZO,
//  MOCK_ERROR o MOCK_TIMEOUT (p.ej. en el nombre del cliente o el motivo),
//  ese envío usa ese modo. Así se prueba desde la UI sin reiniciar nada.
//  Reenviar un documento ya aceptado responde SUNAT 1033 (registrado previamente).
//  GET /__log → últimos envíos; POST /__reset → limpia log y aceptados.
// ============================================================

type Mode = "ok" | "reject" | "error" | "timeout";

const PORT = Number(process.env["MOCK_APISPERU_PORT"] ?? 3999);
const TIMEOUT_MS = Number(process.env["MOCK_TIMEOUT_MS"] ?? 20000);
let globalMode: Mode = (process.env["MOCK_APISPERU_MODE"] as Mode) ?? "ok";
const accepted = new Set<string>();
const log: Array<{ at: string; path: string; mode: Mode; key?: string; status: number; body: unknown }> = [];

function modeFor(raw: string): Mode {
    if (raw.includes("MOCK_RECHAZO")) return "reject";
    if (raw.includes("MOCK_ERROR")) return "error";
    if (raw.includes("MOCK_TIMEOUT")) return "timeout";
    return globalMode;
}

const json = (body: unknown, status = 200) => Response.json(body, { status });

async function sendDocument(path: string, raw: string): Promise<Response> {
    let doc: Record<string, any>;
    try {
        doc = JSON.parse(raw);
    } catch {
        return json({ message: "JSON inválido" }, 400);
    }
    const mode = modeFor(raw);
    const id = `${doc["serie"]}-${Number(doc["correlativo"])}`;
    const key = `${doc["company"]?.ruc}|${doc["tipoDoc"]}|${id}`;
    const entry = { at: new Date().toISOString(), path, mode, key, status: 200, body: doc };
    log.push(entry);
    if (log.length > 200) log.shift();

    if (!doc["serie"] || !doc["correlativo"] || !doc["tipoDoc"] || !Array.isArray(doc["details"])) {
        entry.status = 400;
        return json([{ field: "serie/correlativo/tipoDoc/details", message: "Campo requerido" }], 400);
    }
    if (mode === "error") {
        entry.status = 500;
        return json({ message: "Mock: error interno del servicio" }, 500);
    }
    if (mode === "timeout") {
        // Peor caso real: el cliente se rinde pero SUNAT sí lo registró.
        await Bun.sleep(TIMEOUT_MS);
        accepted.add(key);
        return json({ message: "respuesta tardía" });
    }

    const base = { xml: `<?xml version="1.0"?><Invoice><ID>${id}</ID></Invoice>`, hash: `mockhash-${id}` };
    if (accepted.has(key)) {
        return json({ ...base, sunatResponse: { success: false, error: { code: "1033", message: `El comprobante ${id} fue registrado previamente con otros datos` } } });
    }
    if (mode === "reject") {
        return json({ ...base, sunatResponse: { success: false, error: { code: "2017", message: `Mock: el comprobante ${id} fue rechazado por SUNAT` } } });
    }
    accepted.add(key);
    return json({
        ...base,
        sunatResponse: {
            success: true,
            cdrZip: Buffer.from(`CDR-${id}`).toString("base64"),
            cdrResponse: { id, code: "0", description: `El comprobante ${id} ha sido aceptado`, notes: [] },
        },
    });
}

const server = Bun.serve({
    port: PORT,
    idleTimeout: 0,
    async fetch(req) {
        const url = new URL(req.url);
        const path = url.pathname.replace(/^\/api\/v1/, "");

        if (path === "/__mode" && req.method === "POST") {
            const { mode } = (await req.json()) as { mode: Mode };
            if (!["ok", "reject", "error", "timeout"].includes(mode)) return json({ message: "modo inválido" }, 400);
            globalMode = mode;
            return json({ mode });
        }
        if (path === "/__log") return json({ mode: globalMode, accepted: [...accepted], log });
        if (path === "/__reset" && req.method === "POST") {
            accepted.clear();
            log.length = 0;
            globalMode = "ok";
            return json({ ok: true });
        }

        if (!req.headers.get("authorization")?.startsWith("Bearer ")) {
            return json({ message: "Unauthorized" }, 401);
        }
        const raw = req.method === "POST" ? await req.text() : "";

        if (req.method === "POST" && (path === "/invoice/send" || path === "/note/send")) {
            return sendDocument(path, raw);
        }
        if (req.method === "POST" && (path === "/invoice/xml" || path === "/note/xml")) {
            return new Response("<?xml version=\"1.0\"?><Mock/>", { headers: { "content-type": "application/xml" } });
        }
        if (req.method === "POST" && path === "/dni") {
            const { dni } = JSON.parse(raw || "{}") as { dni?: string };
            if (!/^\d{8}$/.test(dni ?? "")) return json({ success: false, message: "DNI inválido" }, 422);
            return json({ success: true, data: { numero: dni, nombre_completo: "PEREZ GOMEZ JUAN MOCK", nombres: "JUAN MOCK", apellido_paterno: "PEREZ", apellido_materno: "GOMEZ" } });
        }
        if (req.method === "POST" && path === "/ruc") {
            const { ruc } = JSON.parse(raw || "{}") as { ruc?: string };
            if (!/^\d{11}$/.test(ruc ?? "")) return json({ success: false, message: "RUC inválido" }, 422);
            return json({ success: true, data: { ruc, nombre_o_razon_social: "EMPRESA MOCK SAC", direccion_completa: "AV. MOCK 123, LIMA", ubigeo: ["15", "1501", "150101"], estado: "ACTIVO", condicion: "HABIDO" } });
        }
        return json({ message: `Mock: ruta no soportada ${req.method} ${url.pathname}` }, 404);
    },
});

console.log(`[mock-apisperu] http://localhost:${server.port}/api/v1 (modo ${globalMode})`);
