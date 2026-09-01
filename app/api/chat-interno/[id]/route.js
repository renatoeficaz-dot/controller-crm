import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { lerCorpo, texto } from "@/lib/corpo";

// Só quem é membro enxerga/escreve na conversa — sem isso bastava trocar o id
// na URL pra ler a conversa dos outros.
async function membroOuNulo(conversaId, userId) {
  return prisma.conversaInternaMembro.findUnique({
    where: { conversaId_userId: { conversaId, userId } },
  });
}

// Mensagens da conversa (e marca como lida até agora).
export async function GET(_req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const membro = await membroOuNulo(id, user.id);
  if (!membro) return NextResponse.json({ error: "Sem acesso a essa conversa." }, { status: 403 });

  const [conversa, mensagens] = await Promise.all([
    prisma.conversaInterna.findUnique({
      where: { id },
      include: { membros: { include: { user: { select: { id: true, name: true } } } } },
    }),
    prisma.mensagemInterna.findMany({
      where: { conversaId: id },
      orderBy: { createdAt: "asc" },
      take: 300,
      include: {
        autor: { select: { id: true, name: true } },
        atribuidoA: { select: { id: true, name: true } },
      },
    }),
  ]);

  await prisma.conversaInternaMembro.update({
    where: { id: membro.id },
    data: { lidoAte: new Date() },
  }).catch(() => {});

  return NextResponse.json({
    id: conversa.id,
    nome: conversa.nome,
    grupo: conversa.grupo,
    membros: conversa.membros.map((m) => ({ id: m.user.id, name: m.user.name })),
    mensagens,
  });
}

// Envia mensagem. `atribuidoAId` transforma a mensagem num pedido de
// resolução pra essa pessoa (fica pendente até alguém ticar).
export async function POST(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const membro = await membroOuNulo(id, user.id);
  if (!membro) return NextResponse.json({ error: "Sem acesso a essa conversa." }, { status: 403 });

  const body = await lerCorpo(req);
  const corpo = texto(body.body);
  if (!corpo) return NextResponse.json({ error: "Escreva uma mensagem." }, { status: 400 });
  if (corpo.length > 5000) return NextResponse.json({ error: "Mensagem muito longa." }, { status: 400 });

  // Só dá pra cobrar quem participa da conversa.
  let atribuidoAId = texto(body.atribuidoAId) || null;
  if (atribuidoAId) {
    const alvo = await membroOuNulo(id, atribuidoAId);
    if (!alvo) return NextResponse.json({ error: "Essa pessoa não está na conversa." }, { status: 400 });
  }

  const msg = await prisma.mensagemInterna.create({
    data: { conversaId: id, autorId: user.id, body: corpo, atribuidoAId },
    include: {
      autor: { select: { id: true, name: true } },
      atribuidoA: { select: { id: true, name: true } },
    },
  });
  // updatedAt da conversa é o que ordena a lista por "mais recente".
  await prisma.conversaInterna.update({ where: { id }, data: { updatedAt: new Date() } }).catch(() => {});
  await prisma.conversaInternaMembro.update({
    where: { id: membro.id }, data: { lidoAte: new Date() },
  }).catch(() => {});

  return NextResponse.json(msg);
}
