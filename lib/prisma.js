import { PrismaClient } from "@prisma/client";

// Singleton para não criar várias conexões em dev (hot reload)
const globalForPrisma = globalThis;

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

// WAL em vez do modo padrão (rollback journal): no modo padrão toda ESCRITA
// bloqueia TODA LEITURA no SQLite inteiro. Com várias rotas sendo consultadas
// em loop pelo front (chamadas, chat interno, avisos), qualquer escrita
// concorrente — inclusive uma simples geração de parcelas — enfileirava tudo
// atrás dela e o sistema caía com "socket timeout" / transação expirada.
//
// PRAGMA fica gravado no cabeçalho do próprio arquivo .db, então normalmente
// sobrevive a um restart sozinho — mas isso aqui garante o modo certo mesmo
// se o banco for recriado do zero (setup novo, restore de backup).
prisma.$executeRawUnsafe("PRAGMA journal_mode=WAL;").catch((err) =>
  console.error("[prisma] não foi possível ativar WAL:", err.message)
);

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
