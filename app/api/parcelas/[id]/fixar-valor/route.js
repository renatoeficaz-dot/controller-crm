import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { registrarAuditoria } from "@/lib/auditoria";
import { negarSeNaoPodeVerContato } from "@/lib/contatoAcesso";
import { lerCorpo } from "@/lib/corpo";

// Trava o valor ATUAL (já com multa, se estiver atrasada) como o novo valor
// base da parcela — usada junto da troca de horário de recebimento: o
// cliente pediu outro horário pra não ficar "atrasado" por causa disso, mas
// o combinado foi manter o valor que já estava mostrando (com o acréscimo),
// em vez de ele cair de volta pro valor sem multa depois da troca.
export async function POST(req, { params }) {
  const { id } = await params;
  const _p = await prisma.parcela.findUnique({ where: { id }, select: { contactId: true } });
  if (!_p) return NextResponse.json({ error: "Parcela não encontrada." }, { status: 404 });
  const negado = await negarSeNaoPodeVerContato(_p.contactId);
  if (negado) return negado;

  const body = await lerCorpo(req);
  const novoValor = Number(body.novoValor);
  if (!novoValor || novoValor <= 0) return NextResponse.json({ error: "Valor inválido." }, { status: 400 });

  const parcela = await prisma.parcela.findUnique({ where: { id }, include: { contact: { select: { name: true } } } });
  if (!parcela) return NextResponse.json({ error: "Parcela não encontrada." }, { status: 404 });
  if (parcela.paid) return NextResponse.json({ error: "Essa parcela já está paga." }, { status: 400 });

  const user = await getCurrentUser().catch(() => null);
  const atualizada = await prisma.parcela.update({ where: { id }, data: { amount: novoValor, valorFixado: true } });

  registrarAuditoria({
    usuario: user?.name,
    acao: "fixar_valor_parcela",
    entidade: "Parcela",
    entidadeId: id,
    detalhe: `${parcela.contact?.name || ""} — parcela ${parcela.number}ª: valor travado em R$ ${novoValor} (horário de recebimento alterado)`,
  });

  return NextResponse.json(atualizada);
}
