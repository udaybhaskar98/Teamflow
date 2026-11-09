import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { taskPrisma?: PrismaClient };
export const prisma = globalForPrisma.taskPrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.taskPrisma = prisma;
