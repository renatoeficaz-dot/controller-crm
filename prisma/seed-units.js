// Semeia só as unidades/empresas (idempotente).
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  if ((await prisma.unit.count()) > 0) {
    console.log("Unidades já existem, pulando.");
    return;
  }
  const units = [
    { number: 1, name: "Credenciais de Elite", status: "open", caixa: 217, caixaDate: new Date("2026-06-23"), caixaInicial: 58685, caixaFinal: 59535, progresso: 50, ultimaSync: new Date("2026-06-23T15:50:12"), pin: "457A8828", appVersion: "6.4.0.3" },
    { number: 2, name: "Império Cred", status: "closed", caixa: 214, caixaDate: new Date("2026-06-22"), caixaInicial: 46383, caixaFinal: 45926, progresso: 100, ultimaSync: new Date("2026-06-22T23:41:11"), pin: "2D00E0E2", appVersion: "6.4.0.3" },
    { number: 3, name: "Crédito Monetário", status: "open", caixa: 216, caixaDate: new Date("2026-06-23"), caixaInicial: 12901, caixaFinal: 13085, progresso: 26, ultimaSync: new Date("2026-06-23T15:49:38"), pin: "6AB6294E", appVersion: "6.4.0.3" },
    { number: 4, name: "Crédito de Capital", status: "open", caixa: 199, caixaDate: new Date("2026-06-16"), caixaInicial: 20000, caixaFinal: 20000, progresso: 0, ultimaSync: null, pin: "1D6E32FC", appVersion: "6.4.0.3" },
  ];
  for (const u of units) await prisma.unit.create({ data: u });
  console.log("Unidades semeadas.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
