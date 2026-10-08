import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/auditoria";

// Lead que fica 30h sem andar em Novo, Em conversa ou Documentação provavelmente
// sumiu — em vez de envelhecer pra sempre na coluna, cai sozinho pra "Venda
// perdida" com o motivo "Não respondeu". Conta como "parado" quando entrou na
// etapa há mais de 30h E o cliente também não escreveu nada nas últimas 30h
// (cliente que está mandando documento não é "não respondeu").
const PRAZOS_HORAS = {
  "Novo": 30,
  // Em conversa / Documentação: desligado por enquanto (pedido do Renato — ele analisa esses atendimentos).
};
const MOTIVO = "Não respondeu";

// Fim da sequência de follow-up ("?" → "Vai querer dar segmento?" → "...capital de giro?"): se a última mensagem
// do lead é essa terceira e o cliente não respondeu em mais de 3 horas, vai para "Venda perdida" (Não respondeu).
const TRES_HORAS = 3 * 60 * 60 * 1000;
async function perderAposFollowUpFinal() {
  const { FOLLOW_3 } = await import("@/lib/followUp");
  const etapas = await prisma.stage.findMany({ where: { name: { in: ["Novo", "Em conversa", "Documentação", "Venda perdida"] } } });
  const vp = etapas.find((e) => e.name === "Venda perdida");
  if (!vp) return 0;
  const ativas = etapas.filter((e) => e.name !== "Venda perdida");
  const limite = new Date(Date.now() - TRES_HORAS);
  const leads = await prisma.contact.findMany({
    where: { excluidoEm: null, stageId: { in: ativas.map((e) => e.id) } },
    select: { id: true, name: true, stageId: true },
  });
  let movidos = 0;
  for (const c of leads) {
    const ultima = await prisma.message.findFirst({ where: { contactId: c.id }, orderBy: { createdAt: "desc" }, select: { fromMe: true, body: true, createdAt: true } });
    if (!ultima || !ultima.fromMe || ultima.body !== FOLLOW_3 || ultima.createdAt > limite) continue;
    const ultimo = await prisma.contact.findFirst({ where: { stageId: vp.id }, orderBy: { order: "desc" } });
    const de = ativas.find((e) => e.id === c.stageId);
    await prisma.motivoPerda.upsert({ where: { nome: MOTIVO }, update: {}, create: { nome: MOTIVO } }).catch(() => {});
    await prisma.contact.update({
      where: { id: c.id },
      data: { stageId: vp.id, order: (ultimo?.order ?? -1) + 1, entrouEtapaEm: new Date(), motivoPerda: MOTIVO, perdidoEm: new Date(), iaPausada: true },
    });
    await prisma.etapaLog.create({ data: { contactId: c.id, deEtapa: de?.name || null, paraEtapa: "Venda perdida", usuario: null, motivo: MOTIVO } }).catch(() => {});
    registrarAuditoria({
      acao: "auto_venda_perdida_followup_final",
      entidade: "Contact",
      entidadeId: c.id,
      detalhe: `${c.name}: sem resposta mais de 3h depois da última mensagem de follow-up — movido para "Venda perdida" (${MOTIVO})`,
    });
    movidos++;
  }
  return movidos;
}

export async function checarLeadsParados() {
  const pausa = await prisma.config.findUnique({ where: { id: "singleton" }, select: { iaGlobalPausada: true } }).catch(() => null);
  if (pausa?.iaGlobalPausada) return 0;
  await perderAposFollowUpFinal().catch((err) => console.error("[perderAposFollowUpFinal]", err.message));
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

    // Só perde quem a gente JÁ atendeu e que sumiu: se a última mensagem é do cliente (ou nunca respondemos), a falha é nossa — fica.
    const semDivida = [];
    for (const c of contatos) {
      const ultima = await prisma.message.findFirst({ where: { contactId: c.id }, orderBy: { createdAt: "desc" }, select: { fromMe: true } });
      if (ultima?.fromMe) semDivida.push(c);
    }
    contatos.splice(0, contatos.length, ...semDivida);
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
        data: { contactId: c.id, deEtapa: nomeEtapa, paraEtapa: "Venda perdida", usuario: null, motivo: MOTIVO },
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
