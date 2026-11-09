import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { orgPrisma?: PrismaClient };
export const prisma = globalForPrisma.orgPrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.orgPrisma = prisma;
