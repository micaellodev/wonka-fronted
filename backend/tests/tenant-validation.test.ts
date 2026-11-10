import { describe, expect, test } from "bun:test";
import { validateTenantInput } from "../src/modules/dashboard/dashboard.service.ts";

const cur = { lastBoletaNumber: 27 };
const bad = (input: Parameters<typeof validateTenantInput>[0]) => expect(() => validateTenantInput(input, cur)).toThrow();
const ok = (input: Parameters<typeof validateTenantInput>[0]) => expect(() => validateTenantInput(input, cur)).not.toThrow();

describe("validateTenantInput (config fiscal)", () => {
    test("RUC: 11 dígitos con prefijo válido", () => {
        ok({ ruc: "20123456789" });
        bad({ ruc: "2012345678" });
        bad({ ruc: "30123456789" });
    });
    test("ubigeo 6 dígitos", () => { ok({ ubigeo: "150101" }); bad({ ubigeo: "1501" }); });
    test("IGV entre 0 y 100", () => { ok({ igvRate: 18 }); bad({ igvRate: 180 }); });
    test("URL APISPeru solo https", () => { ok({ apisperuUrl: "https://facturacion.apisperu.com/api/v1" }); bad({ apisperuUrl: "http://x.com" }); bad({ apisperuUrl: "nope" }); });
    test("series B/F + 3 alfanuméricos; boleta con B, factura con F", () => {
        ok({ serieBoleta: "B001", serieFactura: "F001" });
        bad({ serieBoleta: "F001" }); bad({ serieFactura: "B001" }); bad({ serieBoleta: "X001" }); bad({ serieNotaCredito: "BC1" });
    });
    test("correlativo no puede bajar", () => { ok({ lastBoletaNumber: 27 }); ok({ lastBoletaNumber: 100 }); bad({ lastBoletaNumber: 5 }); });
});
