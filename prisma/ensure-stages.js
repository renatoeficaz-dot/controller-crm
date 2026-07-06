// Garante as colunas padrão do Kanban quando o banco está vazio.
// Roda no start do container (ver Dockerfile). É idempotente: se já existir
// QUALQUER coluna, não faz nada — nunca apaga nem duplica o que você criar depois.
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const DEFAULT_STAGES = [
  { name: "Novo", color: "#3b82f6" },
  { name: "Em conversa", color: "#f59e0b" },
  { name: "Análise", color: "#8b5cf6" },
  { name: "Liberação pagamento", color: "#0ea5e9" },
  { name: "Recebimento", color: "#10b981" },
  { name: "Pago", color: "#22c55e" },
  { name: "Cravo", color: "#ef4444" },
  { name: "Aguardando Cobrador", color: "#64748b" },
];

async function main() {
  const count = await prisma.stage.count();
  if (count > 0) {
    console.log(`[ensure-stages] ${count} coluna(s) já existem — nada a fazer.`);
    return;
  }
  for (let i = 0; i < DEFAULT_STAGES.length; i++) {
    await prisma.stage.create({ data: { ...DEFAULT_STAGES[i], order: i } });
  }
  console.log(
    "[ensure-stages] Colunas padrão criadas:",
    DEFAULT_STAGES.map((s) => s.name).join(" → ")
  );
}

main()
  // Nunca derruba o boot do app por causa do seed: registra o aviso e segue.
  .catch((e) => console.error("[ensure-stages] aviso:", e.message))
  .finally(() => prisma.$disconnect());
