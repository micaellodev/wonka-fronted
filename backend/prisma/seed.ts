import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { createHash } from 'crypto'

const pool = new Pool({ connectionString: process.env['DATABASE_URL'] })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

function sha256(input: string): string {
    return createHash('sha256').update(input).digest('hex')
}

async function main() {
    console.log('Configurando demo de Wonka...')

    const TID = 'wonka_main_store_001'

    const tenant = await prisma.tenant.upsert({
        where: { id: TID },
        // Never overwrite an existing tenant: re-running the seed must not clobber the
        // company data / APISPeru token configured in Ajustes de Empresa.
        update: {},
        create: {
            id: TID,
            name: 'Wonka - Sede Principal',
            slug: 'wonka-sede-principal',
            ruc: '20131312955',
            razonSocial: 'SUPERINTENDENCIA NACIONAL DE ADUANAS Y DE ADMINISTRACION TRIBUTARIA',
            nombreComercial: 'SUNAT',
            direccion: 'AV. GARCILASO DE LA VEGA NRO. 1472',
            ubigeo: '150101',
            apisperuToken: process.env['APISPERU_TOKEN'] || 'demo_token_reemplazar',
            apisperuUrl: 'https://facturacion.apisperu.com/api/v1',
            igvRate: 18,
            defaultIgvRegime: 'EXONERADO',
            pricesIncludeIgv: false,
            electronicInvoicingEnabled: false,
            serieBoleta: 'B001',
            serieFactura: 'F001',
            serieNotaCredito: 'BC01',
            serieNotaDebito: 'BD01',
        },
    })

    const adminRole = await prisma.role.upsert({
        where: { tenantId_name: { tenantId: TID, name: 'ADMIN' } },
        update: {},
        create: { name: 'ADMIN', tenantId: TID },
    })

    const cashierRole = await prisma.role.upsert({
        where: { tenantId_name: { tenantId: TID, name: 'CAJERO' } },
        update: {},
        create: { name: 'CAJERO', tenantId: TID },
    })

    await prisma.worker.upsert({
        where: { id: 'demo_admin_001' },
        update: {},
        create: {
            id: 'demo_admin_001',
            name: 'Admin Demo',
            pinHash: sha256(`${TID}:12345`),
            isActive: true,
            tenantId: TID,
            roleId: adminRole.id,
        },
    })

    await prisma.worker.upsert({
        where: { id: 'demo_cajero_001' },
        update: {},
        create: {
            id: 'demo_cajero_001',
            name: 'Cajero Demo',
            pinHash: sha256(`${TID}:11111`),
            isActive: true,
            tenantId: TID,
            roleId: cashierRole.id,
        },
    })

    // Review admin: PIN + 6-digit approval code. Production must supply SEED_ADMIN_PIN;
    // the fallback exists only for local development/testing.
    const isProd = process.env['NODE_ENV'] === 'production'
    const reviewPin = process.env['SEED_ADMIN_PIN'] ?? (isProd ? undefined : '060904')
    if (reviewPin) {
        if (!/^\d{6}$/.test(reviewPin)) throw new Error('SEED_ADMIN_PIN must be 6 digits')
        const reviewHash = sha256(`${TID}:${reviewPin}`)
        await prisma.worker.upsert({
            where: { id: 'review_admin_001' },
            update: { pinHash: reviewHash, isActive: true, roleId: adminRole.id },
            create: {
                id: 'review_admin_001',
                name: 'Admin Revisión',
                pinHash: reviewHash,
                isActive: true,
                tenantId: TID,
                roleId: adminRole.id,
            },
        })
    } else {
        console.warn('SEED_ADMIN_PIN not set: review admin skipped (production).')
    }

    const category = await prisma.category.upsert({
        where: { tenantId_name: { tenantId: TID, name: 'Bebidas' } },
        update: {},
        create: { name: 'Bebidas', tenantId: TID },
    })

    const products = [
        { name: 'Kola Real 400ml', sku: 'KOL001', price: 2.50, cost: 1.50, stock: 100 },
        { name: 'Inca Kola 500ml', sku: 'INK001', price: 3.50, cost: 2.00, stock: 80 },
        { name: 'Agua San Luis 625ml', sku: 'AGU001', price: 1.50, cost: 0.80, stock: 150 },
        { name: 'Cerveza Pilsen 330ml', sku: 'CER001', price: 4.50, cost: 2.80, stock: 60 },
        { name: 'Frugosello 400ml', sku: 'FRU001', price: 3.00, cost: 1.80, stock: 70 },
    ]

    for (const p of products) {
        await prisma.product.upsert({
            where: { tenantId_sku: { tenantId: TID, sku: p.sku } },
            update: {},
            create: {
                name: p.name,
                sku: p.sku,
                price: p.price,
                cost: p.cost,
                stock: p.stock,
                tenantId: TID,
                categoryId: category.id,
                igvRegime: 'EXONERADO',
            },
        })
    }

    console.log(`
=== WONKA POS - DEMO CONFIGURADA ===
TENANT ID:   ${TID}
RUC:         ${tenant.ruc}
EMPRESA:     ${tenant.razonSocial}

Usuarios demo:
  Admin  -> PIN: 12345
  Cajero -> PIN: 11111
  Admin Revisión -> PIN de SEED_ADMIN_PIN (dev: valor por defecto documentado en README)

Productos demo: ${products.length} bebidas

Para consultar RUC en caja:
  Token APISPeru: configurable en Ajustes de Empresa
  RUC de prueba:  20131312955 (SUNAT)
  RUC de prueba:  20504533867 (Otro)
`)
}

main()
    .catch((e) => {
        console.error('Error:', e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
        await pool.end()
    })
