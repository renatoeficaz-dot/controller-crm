import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { atualizarScoreDoContato } from "@/lib/atualizarScoreComportamental";
import { registrarAuditoria } from "@/lib/auditoria";
import { podeExecutar } from "@/lib/permissoes";
import { negarSeNaoPodeVerContato } from "@/lib/contatoAcesso";
import { lerCorpo, texto } from "@/lib/corpo";
import { criarTarefaConferirPagamento } from "@/lib/tarefaConferirPagamento";

// Marca uma parcela como paga / pendente.
// body.amountPago (opcional): valor realmente cobrado — permite ao cobrador
// dar baixa SEM o juro de atraso (aliviando o cliente) mesmo com a parcela
// vencida. Se não vier, usa o valor base da parcela (sem juro).
// body.motivo: obrigatório quando a parcela JÁ estava paga antes (mudar o
// valor de uma baixa existente, ou desmarcar como paga) — fica registrado
// em AlteracaoBaixa, visível em Configurações > Alterações.
export async function PATCH(req, { params }) {
  const { id } = await params;
  // Aqui a chave é o id da PARCELA, não do contato — sem essa checagem dava
  // pra mexer no dinheiro (dar baixa, mudar vencimento, pedir desconto) de um
  // lead de outra pessoa só trocando o id na URL.
  const _p = await prisma.parcela.findUnique({ where: { id }, select: { contactId: true } });
  if (!_p) return NextResponse.json({ error: "Parcela não encontrada." }, { status: 404 });
  const negado = await negarSeNaoPodeVerContato(_p.contactId);
  if (negado) return negado;
  const body = await lerCorpo(req);
  const paid = !!body.paid;
  const parcelaAtual = await prisma.parcela.findUnique({
    where: { id },
    include: { contact: { select: { name: true } } },
  });
  if (!parcelaAtual) return NextResponse.json({ error: "Parcela não encontrada." }, { status: 404 });
  // Parcela renegociada foi substituída por um acordo — o valor dela já virou
  // as novas parcelas do acordo, então baixá-la de novo duplicaria a cobrança
  // (gerou um lançamento fantasma quando isso aconteceu por engano).
  if (paid && parcelaAtual.renegociada) {
    return NextResponse.json(
      { error: "Essa parcela foi substituída por um acordo — o valor dela já está nas parcelas do acordo. Dê baixa lá, não aqui." },
      { status: 400 }
    );
  }

  const user = await getCurrentUser().catch(() => null);

  const amountPago = paid
    ? (body.amountPago != null && body.amountPago !== "" ? Number(body.amountPago) : parcelaAtual.amount)
    : null;

  // É uma ALTERAÇÃO (não a baixa original) quando a parcela já estava paga e
  // o valor está mudando, ou quando está sendo desmarcada como paga.
  const ehAlteracao = parcelaAtual.paid && (!paid || amountPago !== parcelaAtual.amountPago);
  if (ehAlteracao) {
    // Ação sensível (item 43): estornar exige "estornar_baixa"; mudar valor de
    // baixa já feita exige "editar_valor_baixa" — admin sempre pode as duas.
    const acaoNecessaria = paid ? "editar_valor_baixa" : "estornar_baixa";
    if (!podeExecutar(user, acaoNecessaria)) {
      return NextResponse.json({ error: "Sem permissão para essa alteração." }, { status: 403 });
    }
    const motivo = texto(body.motivo);
    if (!motivo) {
      return NextResponse.json({ error: "Informe o motivo da alteração." }, { status: 400 });
    }
    await prisma.alteracaoBaixa.create({
      data: {
        parcelaId: id,
        contactNome: parcelaAtual.contact?.name || "",
        parcelaNumero: parcelaAtual.number,
        valorAntigo: parcelaAtual.amountPago,
        valorNovo: amountPago,
        motivo,
        usuarioNome: user?.name || null,
      },
    });
  }

  const dadosUpdate = {
    paid,
    paidAt: paid ? (parcelaAtual.paidAt || new Date()) : null,
    amountPago,
    // Quem deu a baixa — base da comissão e do comparativo entre cobradores.
    // Preserva o autor original numa alteração de valor: quem recuperou foi
    // quem cobrou, não quem corrigiu o valor depois.
    baixadoPor: paid ? (parcelaAtual.baixadoPor || user?.name || null) : null,
    formaPagamento: paid ? (body.formaPagamento || parcelaAtual.formaPagamento || null) : null,
  };

  let parcela;
  if (paid && !parcelaAtual.paid) {
    // Item 152: dois cobradores podem abrir a mesma ficha e dar baixa quase
    // junto. O `where: { paid: false }` só deixa UM update valer — quem
    // chegar depois recebe 409 em vez de sobrescrever a baixa do outro.
    const claim = await prisma.parcela.updateMany({ where: { id, paid: false }, data: dadosUpdate });
    if (claim.count === 0) {
      return NextResponse.json({ error: "Essa parcela já foi baixada por outra pessoa — atualize a tela." }, { status: 409 });
    }
    parcela = await prisma.parcela.findUnique({ where: { id }, include: { contact: { select: { id: true, name: true } } } });
    await criarTarefaConferirPagamento(parcela.contactId).catch(() => {});
  } else {
    parcela = await prisma.parcela.update({
      where: { id },
      data: dadosUpdate,
      include: { contact: { select: { id: true, name: true } } },
    });
  }

  // Controle de espécie (item 32): baixa em DINHEIRO fica em mãos do cobrador
  // até ele depositar — nasce/morre junto com a baixa, nunca solto.
  if (paid && parcela.formaPagamento === "dinheiro" && !parcelaAtual.paid) {
    await prisma.especieMovimento.create({
      data: { usuario: parcela.baixadoPor || "— sem responsável —", tipo: "recebido", valor: amountPago, parcelaId: id },
    }).catch(() => {});
  }
  if (!paid) {
    await prisma.especieMovimento.deleteMany({ where: { parcelaId: id, tipo: "recebido" } }).catch(() => {});
  }
  // Baixar a parcela conclui a tarefa de cobrança vinculada
  await prisma.task.updateMany({ where: { parcelaId: id }, data: { done: paid } });

  // Gera/remove/atualiza o lançamento financeiro automático.
  //
  // BUG REAL (achado em 10/09, reportado pelo kbrito — caso do Reinan):
  // uma parcela pode já ter lançamento(s) de "baixa parcial" (cada baixa
  // parcial gera o SEU PRÓPRIO lançamento, em lib/parcelas/[id]/baixa-
  // parcial/route.js). Dar baixa AQUI direto (botão normal, não parcial)
  // numa parcela que já tinha parcial:
  //   - achava (findFirst, sem filtro nenhum) UM lançamento qualquer —
  //     podia ser um dos parciais — e SOBRESCREVIA o valor dele pro total
  //     cheio, inflando um lançamento pequeno e legítimo;
  //   - ao estornar essa baixa, apagava TODOS os lançamentos da parcela
  //     (deleteMany sem filtro de descrição) — inclusive os parciais que
  //     não tinham nada a ver com a baixa estornada.
  // Resultado: R$ 15,50 de baixas parciais reais do Reinan (3 lançamentos
  // de dias diferentes) sumiram do caixa quando uma baixa cheia feita por
  // engano foi estornada 10s depois — a parcela continuou "lembrando" do
  // valor (valorPago), mas o caixa perdeu o rastro de onde veio.
  //
  // Fix: essa rota só mexe nos lançamentos QUE ELA MESMA cria (descrição
  // "Parcela Nª — nome", sem o prefixo "Baixa parcial —"/"Pagamento
  // adiantado —" que só a rota de baixa parcial usa) — nunca toca nem
  // apaga lançamento de baixa parcial alheio. Completando uma parcela que
  // já tinha parcial, lança só a DIFERENÇA que falta pro total, em vez de
  // reescrever um lançamento existente.
  const novaCompletagem = paid && !parcelaAtual.paid;
  const descricaoPropria = `Parcela ${parcela.number}ª — ${parcela.contact?.name || ""}`.trim();
  if (paid) {
    const existente = await prisma.lancamento.findFirst({
      where: { parcelaId: parcela.id, description: { startsWith: `Parcela ${parcela.number}ª` } },
    });
    if (novaCompletagem) {
      // Nova conclusão: nunca reescreve lançamento alheio (parcial). Só
      // lança a diferença entre o total e o que outros lançamentos dessa
      // parcela (parciais inclusive) já somam — evita cobrar/registrar o
      // mesmo dinheiro duas vezes.
      const todos = await prisma.lancamento.findMany({ where: { parcelaId: parcela.id }, select: { amount: true } });
      const jaLancado = todos.reduce((s, l) => s + l.amount, 0);
      const diferenca = Math.round((amountPago - jaLancado) * 100) / 100;
      if (diferenca > 0.01) {
        const cfg = await prisma.config.findUnique({ where: { id: "singleton" } });
        await prisma.lancamento.create({
          data: {
            type: "entrada",
            amount: diferenca,
            description: descricaoPropria,
            contactId: parcela.contactId,
            parcelaId: parcela.id,
            bancoId: cfg?.contaRecebimentoId || null,
          },
        });
      }
    } else if (existente) {
      // Correção de valor de uma baixa já feita (editar_valor_baixa) — só
      // ajusta o lançamento que essa rota mesma criou antes.
      await prisma.lancamento.update({ where: { id: existente.id }, data: { amount: amountPago } });
    } else {
      const cfg = await prisma.config.findUnique({ where: { id: "singleton" } });
      await prisma.lancamento.create({
        data: {
          type: "entrada",
          amount: amountPago,
          description: descricaoPropria,
          contactId: parcela.contactId,
          parcelaId: parcela.id,
          bancoId: cfg?.contaRecebimentoId || null,
        },
      });
    }
  } else {
    await prisma.lancamento.deleteMany({
      where: { parcelaId: parcela.id, description: { startsWith: `Parcela ${parcela.number}ª` } },
    });
  }

  // O score comportamental depende do histórico de pagamento — recalcula aqui
  // pra refletir a baixa na hora, sem esperar a varredura diária.
  await atualizarScoreDoContato(parcela.contactId).catch(() => {});

  registrarAuditoria({
    usuario: user?.name,
    acao: paid ? "dar_baixa" : "estornar_baixa",
    entidade: "Parcela",
    entidadeId: id,
    detalhe: `${parcela.contact?.name || ""} — parcela ${parcela.number}ª${paid ? ` baixada em R$ ${amountPago}` : " desmarcada"}`,
  });

  return NextResponse.json(parcela);
}
