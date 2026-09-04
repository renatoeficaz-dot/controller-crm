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

// Quanto o SQLite espera educadamente por um lock de escrita antes de
// devolver erro, em vez de falhar na hora. O padrão é 5s — curto demais pra
// um pico real de tráfego (webhook de mensagem + IA respondendo + alguém
// movendo lead ao mesmo tempo). Fica abaixo do timeout de 20s que as
// transações mais longas já usam (lib/cobranca.js), pra SQLite desistir
// antes do Prisma e a mensagem de erro continuar clara.
prisma.$executeRawUnsafe("PRAGMA busy_timeout=15000;").catch((err) =>
  console.error("[prisma] não foi possível ajustar busy_timeout:", err.message)
);

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
