// Redefine as colunas do Kanban para o fluxo de crédito.
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const targets = [
  { name: "Novo", color: "#3b82f6" },
  { name: "Em conversa", color: "#f59e0b" },
  { name: "Análise", color: "#8b5cf6" },
  { name: "Liberação pagamento", color: "#0ea5e9" },
  { name: "Recebimento", color: "#10b981" }, // verde
  { name: "Cravo", color: "#ef4444" },        // vermelho
];

async function main() {
  const existing = await prisma.stage.findMany({ orderBy: { order: "asc" } });

  // Atualiza as colunas existentes / cria as que faltam
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (existing[i]) {
      await prisma.stage.update({
        where: { id: existing[i].id },
        data: { name: t.name, color: t.color, order: i },
      });
    } else {
      await prisma.stage.create({ data: { ...t, order: i } });
    }
  }

  // Se sobrarem colunas antigas, move os contatos pra primeira e remove
  const firstId = (await prisma.stage.findFirst({ orderBy: { order: "asc" } })).id;
  for (const ex of existing.slice(targets.length)) {
    await prisma.contact.updateMany({ where: { stageId: ex.id }, data: { stageId: firstId } });
    await prisma.stage.delete({ where: { id: ex.id } });
  }

  const final = await prisma.stage.findMany({ orderBy: { order: "asc" } });
  console.log("Colunas:", final.map((s) => s.name).join(" → "));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
