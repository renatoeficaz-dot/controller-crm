import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { registrarAuditoria } from "@/lib/auditoria";
import { negarSeNaoPodeVerContato } from "@/lib/contatoAcesso";

// Muda o vencimento de uma parcela (itens 103/104 — alterar data ou "adiar"
// são a mesma operação). Sempre com motivo, registrado em ParcelaAjuste.
export async function PATCH(req, { params }) {
  const { id } = await params;
  // Aqui a chave é o id da PARCELA, não do contato — sem essa checagem dava
  // pra mexer no dinheiro (dar baixa, mudar vencimento, pedir desconto) de um
  // lead de outra pessoa só trocando o id na URL.
  const _p = await prisma.parcela.findUnique({ where: { id }, select: { contactId: true } });
  if (!_p) return NextResponse.json({ error: "Parcela não encontrada." }, { status: 404 });
  const negado = await negarSeNaoPodeVerContato(_p.contactId);
  if (negado) return negado;
  const { novoVencimento, motivo } = await req.json().catch(() => ({}));
  if (!novoVencimento) return NextResponse.json({ error: "Informe a nova data." }, { status: 400 });
  if (!motivo?.trim()) return NextResponse.json({ error: "Informe o motivo." }, { status: 400 });

  const parcela = await prisma.parcela.findUnique({ where: { id }, include: { contact: { select: { name: true } }, task: true } });
  if (!parcela) return NextResponse.json({ error: "Parcela não encontrada." }, { status: 404 });
  if (parcela.paid) return NextResponse.json({ error: "Parcela já paga não pode ter o vencimento alterado." }, { status: 400 });

  const user = await getCurrentUser().catch(() => null);
  const vencimentoDepois = new Date(novoVencimento + "T00:00:00.000Z");
  // Data que o JS não entende virava `Invalid Date` e só estourava lá no
  // Prisma, devolvendo erro 500 sem explicar nada pra quem digitou.
  if (Number.isNaN(vencimentoDepois.getTime())) {
    return NextResponse.json({ error: "Data inválida." }, { status: 400 });
  }
  // Janela sensata: vencimento anos no passado inflaria a multa por atraso e
  // distorceria o aging e a curva de recuperação; anos no futuro esconderia a
  // dívida da cobrança. Um ano pra cada lado cobre adiamento e correção real.
  const umAnoMs = 365 * 24 * 60 * 60 * 1000;
  const agora = Date.now();
  if (vencimentoDepois.getTime() < agora - umAnoMs || vencimentoDepois.getTime() > agora + umAnoMs) {
    return NextResponse.json(
      { error: "A nova data precisa estar dentro de um ano (pra frente ou pra trás)." },
      { status: 400 }
    );
  }

  await prisma.parcelaAjuste.create({
    data: {
      parcelaId: id,
      vencimentoAntes: parcela.dueDate,
      vencimentoDepois,
      motivo: motivo.trim(),
      usuario: user?.name || null,
    },
  });

  const atualizada = await prisma.parcela.update({ where: { id }, data: { dueDate: vencimentoDepois } });

  // A tarefa de cobrança (uma por parcela) segue junto — senão o lembrete
  // continua aparecendo na data antiga.
  if (parcela.task) {
    await prisma.task.update({ where: { id: parcela.task.id }, data: { dueDate: vencimentoDepois } }).catch(() => {});
  }

  registrarAuditoria({
    usuario: user?.name,
    acao: "alterar_vencimento_parcela",
    entidade: "Parcela",
    entidadeId: id,
    detalhe: `${parcela.contact?.name || ""} — parcela ${parcela.number}ª: ${parcela.dueDate.toISOString().slice(0,10)} -> ${novoVencimento} (${motivo.trim()})`,
  });

  return NextResponse.json(atualizada);
}
