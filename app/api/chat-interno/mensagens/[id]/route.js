import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { lerCorpo } from "@/lib/corpo";

// Tica (ou destica) um pedido de resolução. Pode resolver: quem foi marcado,
// quem escreveu o pedido, ou um admin — os outros membros não.
export async function PATCH(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const msg = await prisma.mensagemInterna.findUnique({ where: { id } });
  if (!msg) return NextResponse.json({ error: "Mensagem não encontrada." }, { status: 404 });
  if (!msg.atribuidoAId) {
    return NextResponse.json({ error: "Essa mensagem não é um pedido de resolução." }, { status: 400 });
  }
  const membro = await prisma.conversaInternaMembro.findUnique({
    where: { conversaId_userId: { conversaId: msg.conversaId, userId: user.id } },
  });
  if (!membro) return NextResponse.json({ error: "Sem acesso a essa conversa." }, { status: 403 });

  const podeResolver = msg.atribuidoAId === user.id || msg.autorId === user.id || isAdmin(user);
  if (!podeResolver) {
    return NextResponse.json({ error: "Só quem foi marcado (ou quem pediu) pode resolver." }, { status: 403 });
  }

  const body = await lerCorpo(req);
  const resolvido = !!body.resolvido;
  const atualizada = await prisma.mensagemInterna.update({
    where: { id },
    data: {
      resolvido,
      resolvidoEm: resolvido ? new Date() : null,
      resolvidoPor: resolvido ? user.name : null,
    },
    include: {
      autor: { select: { id: true, name: true } },
      atribuidoA: { select: { id: true, name: true } },
      mencionados: { select: { id: true, name: true } },
      contact: {
        select: { id: true, name: true, phone: true, valorCapital: true, stage: { select: { name: true } } },
      },
      respondeA: {
        select: { id: true, body: true, mediaKind: true, autor: { select: { id: true, name: true } } },
      },
    },
  });
  return NextResponse.json(atualizada);
}

// Apaga a mensagem (soft): o balão passa a mostrar "Mensagem apagada".
// Pode apagar quem escreveu ou um admin — ninguém apaga mensagem de outro.
export async function DELETE(_req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const msg = await prisma.mensagemInterna.findUnique({ where: { id } });
  if (!msg) return NextResponse.json({ error: "Mensagem não encontrada." }, { status: 404 });

  const membro = await prisma.conversaInternaMembro.findUnique({
    where: { conversaId_userId: { conversaId: msg.conversaId, userId: user.id } },
  });
  if (!membro) return NextResponse.json({ error: "Sem acesso a essa conversa." }, { status: 403 });
  if (msg.autorId !== user.id && !isAdmin(user)) {
    return NextResponse.json({ error: "Só quem escreveu (ou um admin) pode apagar." }, { status: 403 });
  }

  // Zera o conteúdo junto: sem isso o texto/anexo continuava no banco e
  // voltaria pra tela em qualquer consulta que não filtrasse `apagada`.
  await prisma.mensagemInterna.update({
    where: { id },
    data: {
      apagada: true,
      apagadaEm: new Date(),
      apagadaPor: user.name,
      body: "",
      mediaUrl: null,
      mediaKind: null,
      mediaMime: null,
      mediaNome: null,
    },
  });
  return NextResponse.json({ ok: true });
}
