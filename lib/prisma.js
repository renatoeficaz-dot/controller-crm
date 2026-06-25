import { PrismaClient } from "@prisma/client";

// Singleton para não criar várias conexões em dev (hot reload)
const globalForPrisma = globalThis;

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
