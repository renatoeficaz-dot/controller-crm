import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, getSession, mensagensWhere } from "@/lib/session";
import { registrarAuditoria } from "@/lib/auditoria";
import { contatoComCaloteMesmoCpf } from "@/lib/cpfBloqueio";
import { valorEmAberto } from "@/lib/finance";
import { negarSeNaoPodeVerContato } from "@/lib/contatoAcesso";

// Busca um contato com suas mensagens (conforme permissão de WhatsApp) e parcelas.
// mediaUrl (base64) fica de fora — mídia é carregada sob demanda via /api/messages/[id]/media.
export async function GET(_req, { params }) {
  const { id } = await params;
  const negado = await negarSeNaoPodeVerContato(id);
  if (negado) return negado;
  const user = await getCurrentUser();
  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      messages: {
        where: mensagensWhere(user),
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          contactId: true,
          body: true,
          kind: true,
          mimeType: true,
          fileName: true,
          fromMe: true,
          status: true,
          instance: true,
          readAt: true,
          apagada: true,
          createdAt: true,
        },
      },
      stage: true,
      parcelas: { orderBy: [{ ciclo: "asc" }, { number: "asc" }] },
      tags: { select: { id: true, name: true, color: true } },
      referencias: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!contact) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  // Marca as mensagens recebidas como lidas ao abrir o contato
  await prisma.message.updateMany({
    where: { contactId: id, fromMe: false, readAt: null },
    data: { readAt: new Date() },
  });
  return NextResponse.json(contact);
}

// Atualiza dados do contato
export async function PATCH(req, { params }) {
  const { id } = await params;
  const negado = await negarSeNaoPodeVerContato(id);
  if (negado) return negado;
  const body = await req.json().catch(() => ({}));
  const data = {};
  for (const f of [
    "name", "phone", "notes", "responsavel", "estado", "genero", "tipoCliente", "cpf",
  ]) {
    if (f in body) data[f] = body[f] || null;
  }
  if ("chatFixado" in body) data.chatFixado = !!body.chatFixado;
  if ("chatArquivado" in body) data.chatArquivado = !!body.chatArquivado;
  if ("naoPerturbarAte" in body) data.naoPerturbarAte = body.naoPerturbarAte ? new Date(body.naoPerturbarAte) : null;
  if ("valorCapital" in body) {
    data.valorCapital = body.valorCapital === "" || body.valorCapital == null ? null : Number(body.valorCapital);
  }
  if ("pagamentoCapital" in body) {
    data.pagamentoCapital = body.pagamentoCapital ? new Date(body.pagamentoCapital) : null;
  }
  if ("iaPausada" in body) data.iaPausada = !!body.iaPausada;
  if ("camposCustom" in body) data.camposCustom = body.camposCustom ? JSON.stringify(body.camposCustom) : null;
  if ("fixado" in body) data.fixado = !!body.fixado;
  if ("corCard" in body) data.corCard = body.corCard || null;

  // Item 191: guarda quem era o responsável antes de trocar — sem isso a
  // troca fica muda, ninguém consegue ver depois quem cuidava do lead antes.
  let responsavelAntes = null;
  if ("responsavel" in body) {
    responsavelAntes = await prisma.contact.findUnique({ where: { id }, select: { responsavel: true } });
  }

  const contact = await prisma.contact.update({ where: { id }, data });

  if ("responsavel" in body && responsavelAntes && responsavelAntes.responsavel !== contact.responsavel) {
    const session = await getSession().catch(() => null);
    await prisma.responsavelLog.create({
      data: { contactId: id, de: responsavelAntes.responsavel, para: contact.responsavel, usuario: session?.name || null },
    }).catch(() => {});
  }

  // Não bloqueia salvar o CPF em si (só bloqueia avançar no funil, no
  // /move) — mas já avisa na hora se bate com outro cadastro que deu calote.
  let caloteAviso = null;
  if ("cpf" in body && contact.cpf) {
    caloteAviso = await contatoComCaloteMesmoCpf(contact.cpf, id);
  }

  return NextResponse.json({ ...contact, caloteAviso });
}

// Remove o contato
// Exclusão reversível: só marca excluidoEm e some das listas — não apaga de
// verdade. Dá pra desfazer em até 24h (POST .../restaurar); depois disso um
// job diário (lib/purgaExcluidos.js) apaga definitivamente. Sem isso, um
// "excluir" errado por engano é irreversível na hora.
export async function DELETE(req, { params }) {
  const { id } = await params;
  const negado = await negarSeNaoPodeVerContato(id);
  if (negado) return negado;
  const force = new URL(req.url).searchParams.get("force") === "1";
  const [session, contact] = await Promise.all([
    getSession(),
    prisma.contact.findUnique({ where: { id }, select: { name: true } }),
  ]);

  // Item 153: excluir um lead que ainda deve esconde a dívida (mesmo sendo
  // reversível em 24h). Sem `force=1`, avisa quanto tem em aberto antes.
  if (!force) {
    // renegociada: false — quem fechou acordo e pagou tudo não deve mais
    // nada, mas as parcelas antigas seguem com paid=false e travavam a
    // exclusão pra sempre, cobrando uma dívida que já foi quitada.
    const abertas = await prisma.parcela.findMany({ where: { contactId: id, paid: false, renegociada: false }, select: { amount: true } });
    if (abertas.length > 0) {
      const total = abertas.reduce((s, p) => s + valorEmAberto(p), 0);
      return NextResponse.json(
        { error: `Este lead tem ${abertas.length} parcela(s) em aberto, somando R$ ${total.toFixed(2)}.`, temParcelasAbertas: true, qtdParcelasAbertas: abertas.length, valorAberto: total },
        { status: 409 }
      );
    }
  }

  await prisma.contact.update({ where: { id }, data: { excluidoEm: new Date() } });
  registrarAuditoria({
    usuario: session?.name,
    acao: "excluir_contato",
    entidade: "Contact",
    entidadeId: id,
    detalhe: contact?.name,
  });
  return NextResponse.json({ ok: true });
}
