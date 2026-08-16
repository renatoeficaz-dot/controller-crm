import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { registrarAuditoria } from "@/lib/auditoria";
import { lerCorpo, ehNaoEncontrado, respostaNaoEncontrado } from "@/lib/corpo";

// Aprova ou recusa um pedido de desconto pontual (item 165). Aprovar reduz o
// valor da parcela de verdade — fica registrado em ParcelaAjuste-like (aqui
// na própria SolicitacaoDesconto) pra continuar auditável.
export async function PATCH(req, { params }) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user || !isAdmin(user)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  
    const body = await lerCorpo(req);
    const status = body.status === "aprovado" ? "aprovado" : body.status === "recusado" ? "recusado" : null;
    if (!status) return NextResponse.json({ error: "Status inválido." }, { status: 400 });
  
    const solicitacao = await prisma.solicitacaoDesconto.findUnique({ where: { id } });
    if (!solicitacao) return NextResponse.json({ error: "Não encontrada." }, { status: 404 });
    if (solicitacao.status !== "pendente") return NextResponse.json({ error: "Esse pedido já foi respondido." }, { status: 400 });
  
    if (status === "aprovado") {
      const parcela = await prisma.parcela.findUnique({ where: { id: solicitacao.parcelaId } });
      if (!parcela) return NextResponse.json({ error: "Parcela não existe mais." }, { status: 404 });
      if (parcela.paid) return NextResponse.json({ error: "Essa parcela já foi paga — não dá mais pra aplicar o desconto." }, { status: 400 });
      await prisma.parcela.update({ where: { id: parcela.id }, data: { amount: solicitacao.valorPedido } });
    }
  
    const atualizada = await prisma.solicitacaoDesconto.update({
      where: { id },
      data: { status, respondidoPor: user.name, respondidoEm: new Date() },
    });
  
    registrarAuditoria({
      usuario: user.name,
      acao: status === "aprovado" ? "aprovar_desconto" : "recusar_desconto",
      entidade: "Parcela",
      entidadeId: solicitacao.parcelaId,
      detalhe: `${solicitacao.contactNome} — parcela ${solicitacao.parcelaNumero}ª: R$ ${solicitacao.valorOriginal} → R$ ${solicitacao.valorPedido} (pedido por ${solicitacao.solicitadoPor || "—"})`,
    });
  
    return NextResponse.json(atualizada);
  } catch (err) {
    // Registro do `where` não existe (link velho, dois cliques, id
    // chutado): é "não achei", não erro de servidor.
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}
