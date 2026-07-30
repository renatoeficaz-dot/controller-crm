import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { regenerarParcelas, lancarLiberacaoCapital } from "@/lib/cobranca";
import { sendRecebimentoNotice } from "@/lib/ia";
import { dentroDoHorarioComercial } from "@/lib/horarioComercial";
import { limiteEscalonado } from "@/lib/escalonamento";
import { contatoComCaloteMesmoCpf } from "@/lib/cpfBloqueio";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSession } from "@/lib/session";

// Data local de hoje como UTC-midnight (evita drift de fuso nas parcelas)
function hojeUTC() {
  const hoje = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD local
  return new Date(hoje + "T00:00:00.000Z");
}

// Move o contato para outra coluna (drag and drop do Kanban)
export async function PATCH(req, { params }) {
  const { id } = await params;
  const { stageId, forcar: forcarPedido } = await req.json();
  const session = await getSession();
  // Só admin pode forçar (ignorar bloqueio de CPF / limite de escalonamento).
  const forcar = !!forcarPedido && session?.role === "admin";

  const [contact, stage, config] = await Promise.all([
    prisma.contact.findUnique({ where: { id }, include: { parcelas: true } }),
    prisma.stage.findUnique({ where: { id: stageId } }),
    prisma.config.findUnique({ where: { id: "singleton" } }),
  ]);
  if (!contact || !stage) {
    return NextResponse.json({ error: "Contato ou coluna não encontrados." }, { status: 404 });
  }

  // Regra: só pode ir para "Liberação pagamento" com o Valor do capital preenchido
  if (stage.name === "Liberação pagamento" && !contact.valorCapital) {
    return NextResponse.json(
      { error: "Preencha o Valor do capital antes de mover para Liberação pagamento." },
      { status: 422 }
    );
  }

  const indoParaAnaliseOuAlem = ["Análise", "Liberação pagamento", "Recebimento"].includes(stage.name);
  const trocandoDeEtapa = contact.stageId !== stageId;

  // Bloqueio de CPF reincidente: esse CPF já deu calote noutro cadastro.
  // Admin pode forçar (força de vontade > sistema); vendedor/cobrador não.
  if (config?.bloqueioCpfAtivo !== false && indoParaAnaliseOuAlem && trocandoDeEtapa && contact.cpf && !forcar) {
    const calote = await contatoComCaloteMesmoCpf(contact.cpf, contact.id);
    if (calote) {
      return NextResponse.json(
        {
          error: `Esse CPF já deu calote no cadastro "${calote.name}" (${calote.phone || "sem telefone"}).`,
          bloqueioCpf: true,
          calote,
        },
        { status: 422 }
      );
    }
  }

  // Capital escalonado: acima do limite do ciclo atual, só admin libera (com forçar=true).
  if (
    config?.escalonamentoAtivo &&
    stage.name === "Liberação pagamento" &&
    trocandoDeEtapa &&
    contact.valorCapital &&
    !forcar
  ) {
    const limite = limiteEscalonado(contact.cicloAtual, config);
    if (contact.valorCapital > limite) {
      return NextResponse.json(
        {
          error: `Valor do capital (R$ ${contact.valorCapital}) acima do limite do ciclo ${contact.cicloAtual || 1} (R$ ${limite}). Só um administrador pode liberar acima do limite.`,
          escalonamentoExcedido: true,
          limite,
        },
        { status: 422 }
      );
    }
  }

  const last = await prisma.contact.findFirst({
    where: { stageId },
    orderBy: { order: "desc" },
  });

  const data = { stageId, order: (last?.order ?? -1) + 1 };

  // Automação: se a etapa de destino tem um responsável automático configurado,
  // atribui o lead a ele (só ao trocar de etapa de fato, e só dentro do
  // horário comercial configurado — fora dele, fica sem responsável até
  // alguém pegar manualmente).
  let autoAtribuiu = false;
  if (stage.autoResponsavel && contact.stageId !== stageId && (await dentroDoHorarioComercial())) {
    data.responsavel = stage.autoResponsavel;
    autoAtribuiu = true;
  }

  // Ao entrar em "Cravo" (perda/inadimplência), a IA para automaticamente —
  // esse lead passa a ser tratado manualmente. deuCalote fica marcado pra
  // sempre, mesmo que ele saia de Cravo depois — alimenta o bloqueio de CPF
  // reincidente noutro cadastro.
  if (stage.name === "Cravo" && contact.stageId !== stageId) {
    data.iaPausada = true;
    data.deuCalote = true;
  }

  // Ao ENTRAR em Recebimento: define o pagamento de capital como hoje
  // (data em que passou para cá) e gera parcelas/tarefas automaticamente.
  const entrandoRecebimento = stage.name === "Recebimento" && contact.stageId !== stageId;
  const aindaSemPlano = contact.parcelas.length === 0;
  if (entrandoRecebimento && contact.valorCapital && aindaSemPlano && !contact.pagamentoCapital) {
    data.pagamentoCapital = hojeUTC();
  }
  // Timestamp de venda concluída — independente da lógica acima (que só roda
  // em certas condições), pra "vendas do dia" na aba Metas nunca ficar de fora.
  if (entrandoRecebimento && !contact.entrouRecebimentoEm) {
    data.entrouRecebimentoEm = new Date();
  }

  const updated = await prisma.contact.update({ where: { id }, data });

  if (trocandoDeEtapa) {
    registrarAuditoria({
      usuario: session?.name,
      acao: "mover_etapa",
      entidade: "Contact",
      entidadeId: id,
      detalhe: `${updated.name}: mudou para "${stage.name}"${forcar ? " (forçado, ignorando bloqueio)" : ""}`,
    });
  }

  if (autoAtribuiu) {
    await prisma.atribuicaoLog.create({
      data: { contactId: id, contactName: updated.name, stageName: stage.name, responsavel: data.responsavel },
    }).catch(() => {});
  }

  if (entrandoRecebimento && updated.valorCapital && updated.pagamentoCapital && aindaSemPlano) {
    await regenerarParcelas(id);
  }

  if (entrandoRecebimento) {
    await sendRecebimentoNotice(updated).catch(() => {});
    await lancarLiberacaoCapital(updated).catch(() => {});
  }

  return NextResponse.json(updated);
}
