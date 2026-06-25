// Preenche os detalhes da Unidade 1 (Credenciais de Elite) com os valores do print.
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const u = await prisma.unit.findFirst({ where: { number: 1 } });
  if (!u) {
    console.log("Unidade 1 não encontrada.");
    return;
  }
  await prisma.unit.update({
    where: { id: u.id },
    data: {
      colecao: 850,
      pastaInicial: 12393,
      alegadamente: 1734,
      clientesParaColetar: 32,
      trabalhador: "Bruno Oliveira Santos",
      dataAbertura: new Date("2026-06-23T15:28:38"),
      dataDispositivo: new Date("2026-06-23T15:28:54"),
      credParaAumentar: 32,
      credAtivos: 32,
      movPagamentos: 16,
      movSincronizado: 16,
    },
  });
  console.log("Detalhe da Unidade 1 atualizado.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
