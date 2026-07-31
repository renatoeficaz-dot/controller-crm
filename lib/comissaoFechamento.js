import { prisma } from "@/lib/prisma";
import { resumoComissao, inicioDaSemanaTrabalho } from "@/lib/comissao";

// Fecha a semana anterior (seg-sáb) pra cada cobrador que teve baixa nela —
// cristaliza resumoComissao() num registro que não muda mais sozinho, e que
// precisa ser aprovado antes de virar "pago" de verdade.
export async function fecharSemanaAnterior() {
  // No domingo, inicioDaSemanaTrabalho já aponta pra semana que acabou de
  // fechar (ver lib/comissao.js) — é exatamente essa que queremos fechar.
  const inicio = inicioDaSemanaTrabalho(new Date());

  const nomes = await prisma.parcela
    .findMany({
      where: { paid: true, baixadoPor: { not: null } },
      distinct: ["baixadoPor"],
      select: { baixadoPor: true },
    })
    .then((r) => r.map((x) => x.baixadoPor).filter(Boolean));

  let criados = 0;
  for (const nome of nomes) {
    const r = await resumoComissao(nome, inicio);
    if (r.totalSemana <= 0) continue; // nada recuperado na semana, não gera fechamento vazio

    const existe = await prisma.comissaoFechamento.findUnique({
      where: { usuario_semanaInicio: { usuario: nome, semanaInicio: new Date(r.semanaInicio + "T00:00:00.000Z") } },
    });
    if (existe) continue;

    await prisma.comissaoFechamento.create({
      data: {
        usuario: nome,
        semanaInicio: new Date(r.semanaInicio + "T00:00:00.000Z"),
        semanaFim: new Date(r.semanaFim + "T00:00:00.000Z"),
        valorRecuperado: r.totalSemana,
        diasBatidos: r.diasBatidos,
        bonusDiarioTotal: r.bonusDiarios,
        bateuSemanal: r.bateuSemanal,
        bonusSemanal: r.bonusSemanal,
        valorTotal: r.totalAReceber,
      },
    });
    criados++;
  }
  return criados;
}
