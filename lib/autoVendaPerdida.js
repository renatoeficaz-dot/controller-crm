import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/auditoria";

// Lead que fica 30h sem andar em Novo, Em conversa ou Documentação provavelmente
// sumiu — em vez de envelhecer pra sempre na coluna, cai sozinho pra "Venda
// perdida" com o motivo "Não respondeu". Conta como "parado" quando entrou na
// etapa há mais de 30h E o cliente também não escreveu nada nas últimas 30h
// (cliente que está mandando documento não é "não respondeu").
const PRAZOS_HORAS = {
  "Novo": 30,
  "Em conversa": 30,
  "Documentação": 30,
};
const MOTIVO = "Não respondeu";

export async function checarLeadsParados() {
  const pausa = await prisma.config.findUnique({ where: { id: "singleton" }, select: { iaGlobalPausada: true } }).catch(() => null);
  if (pausa?.iaGlobalPausada) return 0;
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

    // Quem escreveu nas últimas `horas` ainda está respondendo — fica.
    const recentes = await prisma.message.findMany({
      where: { contactId: { in: contatos.map((c) => c.id) }, fromMe: false, createdAt: { gt: limite } },
      select: { contactId: true },
      distinct: ["contactId"],
    });
    const ativos = new Set(recentes.map((m) => m.contactId));
    contatos.splice(0, contatos.length, ...contatos.filter((c) => !ativos.has(c.id)));
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
