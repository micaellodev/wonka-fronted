// Datos de ejemplo para la demo (BD local .env.test). Recrea el tenant `demo_renzo_wonka`:
//   bun --env-file=.env.test run scripts/demo-seed.ts      → imprime el id del tenant
// Accesos: admin 246813 (6 dígitos; también código de aprobación) · cajero 22222 · gerente 33333
import { prisma, sha256 } from "../tests/helpers.ts";

const tid = "demo_renzo_wonka";
await prisma.tenant.delete({ where: { id: tid } }).catch(() => undefined);
await prisma.tenant.create({
    data: {
        id: tid, name: "Renzo Wonka", slug: tid,
        ruc: "20601234567", razonSocial: "RENZO WONKA ENTRETENIMIENTO S.A.C.", nombreComercial: "Renzo Wonka Kids",
        direccion: "Av. Los Juegos 123, Miraflores, Lima", ubigeo: "150122",
        apisperuToken: "demo-token", apisperuUrl: process.env["APISPERU_URL"] ?? "http://localhost:3999/api/v1",
        electronicInvoicingEnabled: true, defaultIgvRegime: "GRAVADO", pricesIncludeIgv: true,
        playzoneRates: { durations: [{ minutes: 30, price: 15, label: "30 Min" }, { minutes: 60, price: 25, label: "1 Hora" }, { minutes: 120, price: 40, label: "2 Horas" }], extraPerMinute: 0.8, freePerMinute: 0.5 },
    },
});

const role = Object.fromEntries(await Promise.all(["ADMIN", "CAJERO", "GERENTE"].map(async (name) => [name, await prisma.role.create({ data: { tenantId: tid, name } })])));
const worker = (name: string, roleName: string, pin: string, code?: string) =>
    prisma.worker.create({ data: { tenantId: tid, roleId: role[roleName]!.id, name, pinHash: sha256(`${tid}:${pin}`), ...(code ? { approvalCodeHash: sha256(`${tid}:${code}`) } : {}) } });
await worker("Mónica Rojas", "ADMIN", "246813", "246813");
await worker("Luis Paredes", "CAJERO", "22222");
await worker("Carla Vega", "GERENTE", "33333");

const cats: Record<string, string> = {};
for (const name of ["Snacks", "Bebidas", "Dulces", "Comida"]) cats[name] = (await prisma.category.create({ data: { tenantId: tid, name } })).id;
const products: Array<[string, string, string, number, number, number]> = [
    ["Snacks", "Papas fritas", "SN-001", 4.5, 2, 40], ["Snacks", "Pop corn", "SN-002", 5, 1.8, 35], ["Snacks", "Nachos con queso", "SN-003", 8, 3.5, 25],
    ["Bebidas", "Gaseosa personal", "BE-001", 3.5, 1.6, 60], ["Bebidas", "Jugo de naranja", "BE-002", 6, 2.5, 30], ["Bebidas", "Agua mineral", "BE-003", 2.5, 1, 50],
    ["Dulces", "Chocolate Wonka", "DU-001", 3, 1.2, 80], ["Dulces", "Gomitas", "DU-002", 2, 0.8, 70], ["Dulces", "Helado de vainilla", "DU-003", 5.5, 2.2, 8],
    ["Comida", "Hot dog", "CO-001", 7.5, 3, 20], ["Comida", "Mini pizza", "CO-002", 9, 4, 18], ["Comida", "Nuggets (6 un.)", "CO-003", 10, 4.5, 15],
];
for (const [cat, name, sku, price, cost, stock] of products) await prisma.product.create({ data: { tenantId: tid, categoryId: cats[cat]!, name, sku, price, cost, stock, minStock: 10, trackStock: true } });

const g = await prisma.guardian.create({ data: { tenantId: tid, dni: "45871236", fullName: "Rosa Mendoza Quispe", phone: "987654321" } });
await prisma.child.create({ data: { tenantId: tid, guardianId: g.id, fullName: "Mateo Salazar Mendoza", age: 6, gender: "M" } });
await prisma.child.create({ data: { tenantId: tid, guardianId: g.id, fullName: "Valeria Salazar Mendoza", age: 4, gender: "F" } });
console.log(tid);
process.exit(0);
