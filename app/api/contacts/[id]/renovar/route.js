import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { gerarParcelas } from "@/lib/finance";
import { limiteEscalonado } from "@/lib/escalonamento";
import { getCurrentUser } from "@/lib/session";
import { negarSeNaoPodeVerContato } from "@/lib/contatoAcesso";
import { lerCorpo } from "@/lib/corpo";
import { criarTarefaLiberarPagamento } from "@/lib/tarefaLiberarPagamento";

// Renova o empréstimo: incrementa o ciclo, gera novas parcelas com os dados fornecidos.
// Exige que TODAS as parcelas do ciclo atual estejam pagas.
export async function POST(req, { params }) {
  const { id } = await params;
  const negado = await negarSeNaoPodeVerContato(id);
  if (negado) return negado;
  const body = await lerCorpo(req);

  const contact = await prisma.contact.findUnique({
    where: { id },
    include: { parcelas: true },
  });
  if (!contact) return NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });

  // Parcela renegociada foi SUBSTITUÍDA por um acordo (o valor dela virou as
  // novas parcelas) — nunca é marcada "paid" ela mesma, então contava como
  // "em aberto" pra sempre e travava a renovação mesmo com o ciclo já
  // quitado de verdade. A ficha (ContactModal) já exclui renegociada nesse
  // mesmo cálculo; aqui não excluía, e por isso os dois lados divergiam:
  // a tela mostrava tudo pago, mas clicar em "Renovar" dava esse erro.
  const parcelasAtuais = contact.parcelas.filter((p) => p.ciclo === contact.cicloAtual && !p.renegociada);
  if (parcelasAtuais.length === 0) {
    return NextResponse.json({ error: "Gere as parcelas do ciclo atual primeiro." }, { status: 400 });
  }
  const naoPagas = parcelasAtuais.filter((p) => !p.paid);
  if (naoPagas.length > 0) {
    return NextResponse.json({ error: `Ainda há ${naoPagas.length} parcela(s) em aberto no ciclo atual.` }, { status: 400 });
  }

  const valorCapital = Number(body.valorCapital);
  const pagamentoCapital = body.pagamentoCapital;
  if (!valorCapital || !pagamentoCapital) {
    return NextResponse.json({ error: "Informe o Valor do capital e a Data de pagamento da renovação." }, { status: 400 });
  }

  const novoCiclo = contact.cicloAtual + 1;
  const config = await prisma.config.findUnique({ where: { id: "singleton" } });
  const pct = config?.honorariosPct ?? 30;

  if (config?.escalonamentoAtivo && !body.forcar) {
    // Busca o cargo direto no banco, não do cookie de sessão: o cookie
    // grava o cargo de quando a pessoa LOGOU (dura até 30 dias) — alguém
    // promovido a admin depois de logado continuava barrado aqui até
    // deslogar e logar de novo. Foi exatamente o que aconteceu com o
    // kbrito: já era admin no banco, mas a sessão antiga ainda dizia que
    // não era, e "R$ 400 não vira" numa renovação continuava bloqueando.
    const usuario = await getCurrentUser();
    const limite = limiteEscalonado(novoCiclo, config);
    if (valorCapital > limite && usuario?.role !== "admin") {
      return NextResponse.json(
        { error: `Valor acima do limite do ciclo ${novoCiclo} (R$ ${limite}). Só um administrador pode liberar acima do limite.`, escalonamentoExcedido: true, limite },
        { status: 422 }
      );
    }
  }
  const novasParcelas = gerarParcelas(valorCapital, pct, pagamentoCapital);

  // Renovação nunca movia o lead de etapa — ele ficava parado onde já estava
  // (normalmente "Recebimento" ou "Pago", já que renovar exige o ciclo atual
  // quitado). Isso fazia o Pix do novo capital passar batido: a tarefa
  // automática "Liberar pagamento do cliente" só é criada quando o lead ENTRA
  // em "Liberação pagamento" (ver app/api/contacts/[id]/move), e uma
  // renovação nunca entrava lá — quem renovava não gerava nenhum aviso pro
  // Kabrito liberar o novo valor. Agora a renovação manda o lead de volta pra
  // "Liberação pagamento" e recria a tarefa, igual a um empréstimo novo.
  const stageLiberacao = await prisma.stage.findFirst({ where: { name: "Liberação pagamento" } });

  // Atualiza o contato (novo ciclo + novos valores de capital)
  await prisma.contact.update({
    where: { id },
    data: {
      cicloAtual: novoCiclo,
      valorCapital,
      pagamentoCapital: new Date(pagamentoCapital),
      ...(stageLiberacao ? { stageId: stageLiberacao.id } : {}),
    },
  });
  if (stageLiberacao) await criarTarefaLiberarPagamento(id).catch(() => {});

  // Limpa tarefas do ciclo anterior (mantém as parcelas como histórico)
  await prisma.task.deleteMany({ where: { contactId: id, parcela: { ciclo: { lt: novoCiclo } } } });

  // Cria as novas parcelas do novo ciclo — tarefa de cobrança não nasce mais
  // sozinha, quem cobra decide manualmente quando criar (Tarefas → + Tarefa).
  for (const p of novasParcelas) {
    await prisma.parcela.create({
      data: { ...p, contactId: id, ciclo: novoCiclo },
    });
  }

  const parcelas = await prisma.parcela.findMany({
    where: { contactId: id },
    orderBy: [{ ciclo: "asc" }, { number: "asc" }],
  });
  return NextResponse.json({ cicloAtual: novoCiclo, parcelas });
}
