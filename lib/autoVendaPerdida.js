import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/auditoria";

// Lead que fica tempo demais parado numa etapa provavelmente sumiu — em vez de
// envelhecer pra sempre na coluna, cai sozinho pra "Venda perdida" com o
// motivo "Não respondeu". Cada etapa tem seu próprio prazo (mais curto em "Em
// conversa", que é o primeiro contato; mais longo em "Documentação", que
// exige o cliente reunir e mandar vários documentos).
const PRAZOS_HORAS = {
  "Em conversa": 24,
  "Documentação": 48,
};
const MOTIVO = "Não respondeu";

export async function checarLeadsParados() {
  const stages = await prisma.stage.findMany({
    where: { name: { in: [...Object.keys(PRAZOS_HORAS), "Venda perdida"] } },
  });
  const vendaPerdida = stages.find((s) => s.name === "Venda perdida");
  if (!vendaPerdida) return 0;

  let movidos = 0;
  const agora = Date.now();

  for (const [nomeEtapa, horas] of Object.entries(PRAZOS_HORAS)) {
    const stage = stages.find((s) => s.name === nomeEtapa);
    if (!stage) continue;

    const limite = new Date(agora - horas * 60 * 60 * 1000);
    const contatos = await prisma.contact.findMany({
      where: {
        stageId: stage.id,
        excluidoEm: null,
        // entrouEtapaEm nulo cai pro createdAt — MESMA regra que o Kanban já
        // usa pra mostrar "há X dias nesta etapa". Antes o filtro era só
        // `entrouEtapaEm: { lte: limite }`, e como NULL nunca casa num
        // comparador, a régua pulava em silêncio todo lead movido pela IA
        // (que não gravava esse campo): o card mostrava "6d parado" e nada
        // acontecia, pra sempre.
        OR: [
          { entrouEtapaEm: { lte: limite } },
          { entrouEtapaEm: null, createdAt: { lte: limite } },
        ],
      },
    });
    if (!contatos.length) continue;

    const last = await prisma.contact.findFirst({
      where: { stageId: vendaPerdida.id },
      orderBy: { order: "desc" },
    });
    let ordem = (last?.order ?? -1) + 1;

    for (const c of contatos) {
      await prisma.contact.update({
        where: { id: c.id },
        data: {
          stageId: vendaPerdida.id,
          order: ordem++,
          entrouEtapaEm: new Date(),
          motivoPerda: MOTIVO,
          perdidoEm: new Date(),
        },
      });

      await prisma.etapaLog.create({
        data: { contactId: c.id, deEtapa: nomeEtapa, paraEtapa: "Venda perdida", usuario: null },
      }).catch(() => {});

      registrarAuditoria({
        acao: "auto_venda_perdida",
        entidade: "Contact",
        entidadeId: c.id,
        detalhe: `${c.name}: mais de ${horas}h parado em "${nomeEtapa}" — movido para "Venda perdida" (${MOTIVO})`,
      });

      movidos++;
    }
  }

  return movidos;
}
