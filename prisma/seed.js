// Popula o banco com colunas padrão e alguns contatos de exemplo.
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const count = await prisma.stage.count();
  if (count > 0) {
    console.log("Banco já tem dados, pulando seed.");
    return;
  }

  const stages = [
    { name: "Novo Lead", color: "#3b82f6", order: 0 },
    { name: "Em Conversa", color: "#f59e0b", order: 1 },
    { name: "Negociando", color: "#8b5cf6", order: 2 },
    { name: "Fechado", color: "#10b981", order: 3 },
    { name: "Perdido", color: "#ef4444", order: 4 },
  ];

  const created = {};
  for (const s of stages) {
    const stage = await prisma.stage.create({ data: s });
    created[s.name] = stage.id;
  }

  const contacts = [
    { name: "Maria Silva", phone: "5511988887777", email: "maria@email.com", company: "Padaria Pão Quente", stage: "Novo Lead", order: 0 },
    { name: "João Souza", phone: "5511977776666", email: "joao@email.com", company: "Auto Peças JS", stage: "Em Conversa", order: 0 },
    { name: "Ana Pereira", phone: "5521966665555", company: "Studio Ana Beauty", stage: "Negociando", order: 0 },
    { name: "Carlos Lima", phone: "5531955554444", email: "carlos@email.com", company: "Lima Advocacia", stage: "Fechado", order: 0 },
  ];

  for (const c of contacts) {
    const { stage, ...rest } = c;
    await prisma.contact.create({ data: { ...rest, stageId: created[stage] } });
  }

  console.log("Seed concluído.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
