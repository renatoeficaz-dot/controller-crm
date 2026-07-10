import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { regenerarParcelas, lancarLiberacaoCapital } from "@/lib/cobranca";
import { sendRecebimentoNotice } from "@/lib/ia";

// Data local de hoje como UTC-midnight (evita drift de fuso nas parcelas)
function hojeUTC() {
  const hoje = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD local
  return new Date(hoje + "T00:00:00.000Z");
}

// Move o contato para outra coluna (drag and drop do Kanban)
export async function PATCH(req, { params }) {
  const { id } = await params;
  const { stageId } = await req.json();

  const [contact, stage] = await Promise.all([
    prisma.contact.findUnique({ where: { id }, include: { parcelas: true } }),
    prisma.stage.findUnique({ where: { id: stageId } }),
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

  const last = await prisma.contact.findFirst({
    where: { stageId },
    orderBy: { order: "desc" },
  });

  const data = { stageId, order: (last?.order ?? -1) + 1 };

  // Automação: se a etapa de destino tem um responsável automático configurado,
  // atribui o lead a ele (só ao trocar de etapa de fato)
  if (stage.autoResponsavel && contact.stageId !== stageId) {
    data.responsavel = stage.autoResponsavel;
  }

  // Ao entrar em "Cravo" (perda/inadimplência), a IA para automaticamente —
  // esse lead passa a ser tratado manualmente.
  if (stage.name === "Cravo" && contact.stageId !== stageId) {
    data.iaPausada = true;
  }

  // Ao ENTRAR em Recebimento: define o pagamento de capital como hoje
  // (data em que passou para cá) e gera parcelas/tarefas automaticamente.
  const entrandoRecebimento = stage.name === "Recebimento" && contact.stageId !== stageId;
  const aindaSemPlano = contact.parcelas.length === 0;
  if (entrandoRecebimento && contact.valorCapital && aindaSemPlano && !contact.pagamentoCapital) {
    data.pagamentoCapital = hojeUTC();
  }

  const updated = await prisma.contact.update({ where: { id }, data });

  if (entrandoRecebimento && updated.valorCapital && updated.pagamentoCapital && aindaSemPlano) {
    await regenerarParcelas(id);
  }

  if (entrandoRecebimento) {
    await sendRecebimentoNotice(updated).catch(() => {});
    await lancarLiberacaoCapital(updated).catch(() => {});
  }

  return NextResponse.json(updated);
}
