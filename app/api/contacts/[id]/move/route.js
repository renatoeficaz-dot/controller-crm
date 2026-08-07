import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { regenerarParcelas, lancarLiberacaoCapital } from "@/lib/cobranca";
import { sendRecebimentoNotice } from "@/lib/ia";
import { dentroDoHorarioComercial } from "@/lib/horarioComercial";
import { limiteEscalonado } from "@/lib/escalonamento";
import { contatoComCaloteMesmoCpf } from "@/lib/cpfBloqueio";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSession } from "@/lib/session";
import { escolherPorCarga } from "@/lib/distribuicao";
import { negarSeNaoPodeVerContato } from "@/lib/contatoAcesso";

// Data local de hoje como UTC-midnight (evita drift de fuso nas parcelas)
function hojeUTC() {
  const hoje = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD local
  return new Date(hoje + "T00:00:00.000Z");
}

// Move o contato para outra coluna (drag and drop do Kanban)
export async function PATCH(req, { params }) {
  const { id } = await params;
  const negado = await negarSeNaoPodeVerContato(id);
  if (negado) return negado;
  const { stageId, forcar: forcarPedido, motivoPerda } = await req.json();
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

  // Motivo estruturado de perda: exige um motivo (do catálogo em Configurações)
  // antes de deixar mover pra "Venda perdida" — sem isso a coluna vira só um
  // buraco onde os leads desaparecem sem deixar informação nenhuma.
  if (stage.name === "Venda perdida" && trocandoDeEtapa && !motivoPerda) {
    return NextResponse.json(
      { error: "Escolha o motivo antes de mover para Venda perdida.", precisaMotivoPerda: true },
      { status: 422 }
    );
  }

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

  // Zera o cronômetro da etapa só quando a coluna muda de fato — reordenar o
  // card dentro da mesma coluna não deveria "rejuvenescer" o lead.
  if (trocandoDeEtapa) data.entrouEtapaEm = new Date();

  // Automação: se a etapa de destino tem um responsável automático configurado,
  // atribui o lead a ele (só ao trocar de etapa de fato, e só dentro do
  // horário comercial configurado — fora dele, fica sem responsável até
  // alguém pegar manualmente). Sem responsável fixo mas com um POOL definido,
  // distribui por carga: quem tem menos leads ativos agora fica com esse.
  let autoAtribuiu = false;
  if (trocandoDeEtapa && (await dentroDoHorarioComercial())) {
    if (stage.autoResponsavel) {
      data.responsavel = stage.autoResponsavel;
      autoAtribuiu = true;
    } else if (stage.distribuicaoPool) {
      const escolhido = await escolherPorCarga(stage.distribuicaoPool);
      if (escolhido) {
        data.responsavel = escolhido;
        autoAtribuiu = true;
      }
    }
  }

  if (stage.name === "Venda perdida" && trocandoDeEtapa) {
    data.motivoPerda = motivoPerda;
    data.perdidoEm = new Date();
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

  const stageAnterior = trocandoDeEtapa
    ? await prisma.stage.findUnique({ where: { id: contact.stageId }, select: { name: true } })
    : null;

  const updated = await prisma.contact.update({ where: { id }, data });

  if (trocandoDeEtapa) {
    await prisma.etapaLog.create({
      data: {
        contactId: id,
        deEtapa: stageAnterior?.name || null,
        paraEtapa: stage.name,
        usuario: session?.name || null,
      },
    }).catch(() => {});

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
