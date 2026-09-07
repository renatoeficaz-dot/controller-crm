import { prisma } from "@/lib/prisma";
import { calcularComissaoPercentualSemana, textoRelatorioComissaoPercentual } from "@/lib/comissaoPercentual";
import { enviarMensagemDireta } from "@/lib/mensagemDireta";

// Todo sábado às 17h fecha e ENTREGA a comissão percentual de cada pessoa
// configurada: grava o resultado (não só recalcula na hora — a carteira muda
// com o tempo, recalcular semanas depois daria outro número) e manda o
// relatório no chat interno pra própria pessoa.
export async function gerarRelatoriosComissaoPercentualSabado(agora = new Date()) {
  const configs = await prisma.comissaoPercentualConfig.findMany({
    where: { ativo: true },
    include: { user: { select: { id: true, name: true } } },
  });
  if (!configs.length) return 0;

  let gerados = 0;
  for (const cfg of configs) {
    const r = await calcularComissaoPercentualSemana(cfg.userId, agora);
    if (!r) continue;

    const inicio = new Date(r.inicio + "T00:00:00.000Z");
    // @@unique([userId, inicio]) faz o upsert ser idempotente: se a rotina
    // rodar duas vezes no mesmo sábado, atualiza em vez de duplicar.
    const jaExistia = await prisma.comissaoPercentualSemana.findUnique({
      where: { userId_inicio: { userId: r.userId, inicio } },
      select: { id: true },
    });
    await prisma.comissaoPercentualSemana.upsert({
      where: { userId_inicio: { userId: r.userId, inicio } },
      create: {
        userId: r.userId, nome: r.nome, inicio,
        fim: new Date(r.fim + "T00:00:00.000Z"),
        valorCapital: r.valorCapital, valorJuros: r.valorJuros,
        comissaoCapital: r.comissaoCapital, comissaoJuros: r.comissaoJuros,
        total: r.total,
      },
      update: {
        valorCapital: r.valorCapital, valorJuros: r.valorJuros,
        comissaoCapital: r.comissaoCapital, comissaoJuros: r.comissaoJuros,
        total: r.total,
      },
    });
    gerados += 1;
    if (jaExistia) continue;
    await enviarMensagemDireta(r.userId, textoRelatorioComissaoPercentual(r));
  }
  return gerados;
}
