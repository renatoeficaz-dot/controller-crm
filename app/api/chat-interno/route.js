import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { lerCorpo, texto } from "@/lib/corpo";

// Título que ESTE usuário vê: grupo usa o nome cadastrado; conversa direta
// mostra o nome do outro participante (cada lado vê um título diferente).
function tituloPara(conversa, meuId) {
  if (conversa.grupo) return conversa.nome || "Grupo sem nome";
  const outro = conversa.membros.find((m) => m.userId !== meuId);
  return outro?.user?.name || "Conversa";
}

// Lista as conversas internas do usuário logado, com a última mensagem, o
// número de não lidas e quantos pedidos de resolução ainda estão em aberto
// pra ele.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const conversas = await prisma.conversaInterna.findMany({
    where: { membros: { some: { userId: user.id } } },
    include: {
      membros: { include: { user: { select: { id: true, name: true, role: true } } } },
      mensagens: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { autor: { select: { id: true, name: true } } },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const result = await Promise.all(
    conversas.map(async (c) => {
      const meu = c.membros.find((m) => m.userId === user.id);
      // Só conta como não lida a mensagem dos OUTROS — a própria nunca conta.
      const naoLidas = await prisma.mensagemInterna.count({
        where: {
          conversaId: c.id,
          autorId: { not: user.id },
          ...(meu?.lidoAte ? { createdAt: { gt: meu.lidoAte } } : {}),
        },
      });
      const pendentes = await prisma.mensagemInterna.count({
        where: { conversaId: c.id, atribuidoAId: user.id, resolvido: false },
      });
      return {
        id: c.id,
        titulo: tituloPara(c, user.id),
        grupo: c.grupo,
        membros: c.membros.map((m) => ({ id: m.user.id, name: m.user.name })),
        ultimaMensagem: c.mensagens[0]
          ? {
              body: c.mensagens[0].body,
              autor: c.mensagens[0].autor?.name,
              createdAt: c.mensagens[0].createdAt,
            }
          : null,
        naoLidas,
        pendentes,
        updatedAt: c.updatedAt,
      };
    })
  );

  return NextResponse.json(result);
}

// Cria uma conversa. Direta: { userIds: [outro] } — se já existir uma entre os
// dois, devolve a mesma em vez de criar outra. Grupo: { userIds: [...], nome }.
export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await lerCorpo(req);
  const grupo = !!body.grupo;
  const nome = texto(body.nome) || null;
  const outros = (Array.isArray(body.userIds) ? body.userIds : []).filter(
    (id) => typeof id === "string" && id && id !== user.id
  );
  if (!outros.length) {
    return NextResponse.json({ error: "Escolha pelo menos uma pessoa." }, { status: 400 });
  }
  if (grupo && !nome) {
    return NextResponse.json({ error: "Dê um nome ao grupo." }, { status: 400 });
  }

  // Só deixa incluir quem existe de verdade.
  const validos = await prisma.user.findMany({ where: { id: { in: outros } }, select: { id: true } });
  if (!validos.length) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 400 });

  if (!grupo) {
    if (validos.length > 1) {
      return NextResponse.json({ error: "Conversa direta é só com uma pessoa — use grupo." }, { status: 400 });
    }
    // Reaproveita a conversa direta que já existir entre os dois, senão cada
    // clique em "conversar" criaria um card novo com o mesmo par.
    const jaExiste = await prisma.conversaInterna.findFirst({
      where: {
        grupo: false,
        AND: [
          { membros: { some: { userId: user.id } } },
          { membros: { some: { userId: validos[0].id } } },
        ],
      },
    });
    if (jaExiste) return NextResponse.json({ id: jaExiste.id, reaproveitada: true });
  }

  const criada = await prisma.conversaInterna.create({
    data: {
      nome: grupo ? nome : null,
      grupo,
      criadaPor: user.name,
      membros: {
        create: [
          { userId: user.id, lidoAte: new Date() },
          ...validos.map((v) => ({ userId: v.id })),
        ],
      },
    },
  });
  return NextResponse.json({ id: criada.id });
}
