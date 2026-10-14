import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

// ============================================================
//  Prisma Client Singleton
//  Ensures only one instance is created across the app.
// ============================================================
const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

// Prisma 7 requires a driver adapter for the "client" engine
const connectionString = process.env["DATABASE_URL"];
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

export const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
        adapter,
        log:
            process.env["NODE_ENV"] === "development"
                ? ["query", "error", "warn"]
                : ["error"],
    });

if (process.env["NODE_ENV"] !== "production") {
    globalForPrisma.prisma = prisma;
}
