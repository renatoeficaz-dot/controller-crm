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

  await seedUnits();

  console.log("Seed concluído.");
}

// Unidades/empresas de exemplo (espelham a tela do TryController)
async function seedUnits() {
  if ((await prisma.unit.count()) > 0) return;

  const units = [
    {
      number: 1, name: "Credenciais de Elite", status: "open", caixa: 217,
      caixaDate: new Date("2026-06-23"), caixaInicial: 58685, caixaFinal: 59535,
      progresso: 50, ultimaSync: new Date("2026-06-23T15:50:12"),
      pin: "457A8828", appVersion: "6.4.0.3",
    },
    {
      number: 2, name: "Império Cred", status: "closed", caixa: 214,
      caixaDate: new Date("2026-06-22"), caixaInicial: 46383, caixaFinal: 45926,
      progresso: 100, ultimaSync: new Date("2026-06-22T23:41:11"),
      pin: "2D00E0E2", appVersion: "6.4.0.3",
    },
    {
      number: 3, name: "Crédito Monetário", status: "open", caixa: 216,
      caixaDate: new Date("2026-06-23"), caixaInicial: 12901, caixaFinal: 13085,
      progresso: 26, ultimaSync: new Date("2026-06-23T15:49:38"),
      pin: "6AB6294E", appVersion: "6.4.0.3",
    },
    {
      number: 4, name: "Crédito de Capital", status: "open", caixa: 199,
      caixaDate: new Date("2026-06-16"), caixaInicial: 20000, caixaFinal: 20000,
      progresso: 0, ultimaSync: null,
      pin: "1D6E32FC", appVersion: "6.4.0.3",
    },
  ];

  for (const u of units) await prisma.unit.create({ data: u });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
