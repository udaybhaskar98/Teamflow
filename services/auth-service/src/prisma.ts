import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { authPrisma?: PrismaClient };

export const prisma = globalForPrisma.authPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.authPrisma = prisma;
}
