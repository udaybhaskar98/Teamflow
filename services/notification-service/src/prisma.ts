import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { notificationPrisma?: PrismaClient };
export const prisma = globalForPrisma.notificationPrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.notificationPrisma = prisma;
