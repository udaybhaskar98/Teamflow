import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { projectPrisma?: PrismaClient };
export const prisma = globalForPrisma.projectPrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.projectPrisma = prisma;
