import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { lerCorpo, texto } from "@/lib/corpo";

// Chamada some sozinha se ninguém atender — sem isso um "chamando" esquecido
// ficaria tocando pra sempre pro outro lado.
const EXPIRA_MS = 60 * 1000;

const SELECT = {
  id: true, deId: true, paraId: true, video: true, status: true, criadaEm: true,
  de: { select: { id: true, name: true } },
  para: { select: { id: true, name: true } },
};

// A chamada que interessa AGORA pra este usuário: uma que ele recebeu e ainda
// está tocando, ou uma que já foi aceita (de qualquer lado) e segue em curso.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // Expira as que ninguém atendeu antes de responder, senão a tela mostraria
  // uma chamada de 10 minutos atrás como se estivesse tocando.
  await prisma.chamadaInterna.updateMany({
    where: { status: "chamando", criadaEm: { lt: new Date(Date.now() - EXPIRA_MS) } },
    data: { status: "encerrada", encerradaEm: new Date() },
  });

  const chamada = await prisma.chamadaInterna.findFirst({
    where: {
      OR: [
        // recebendo (toca) e TAMBÉM a que eu mesmo fiz e ainda está chamando:
        // sem esta segunda, quem liga não recebia nada de volta e a tela
        // ficava igual — parecia que o botão não tinha funcionado.
        { paraId: user.id, status: "chamando" },
        { deId: user.id, status: "chamando" },
        { status: "aceita", OR: [{ paraId: user.id }, { deId: user.id }] },
      ],
    },
    orderBy: { criadaEm: "desc" },
    select: SELECT,
  });
  return NextResponse.json(chamada || null);
}

// Inicia a chamada.
export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await lerCorpo(req);
  const paraId = texto(body.paraId);
  if (!paraId || paraId === user.id) {
    return NextResponse.json({ error: "Escolha para quem ligar." }, { status: 400 });
  }
  const alvo = await prisma.user.findUnique({ where: { id: paraId }, select: { id: true, name: true } });
  if (!alvo) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

  // Não deixa abrir duas chamadas ao mesmo tempo com a mesma pessoa: os dois
  // lados ficariam negociando WebRTC em sessões diferentes e nenhuma
  // conectaria.
  const emCurso = await prisma.chamadaInterna.findFirst({
    where: {
      status: { in: ["chamando", "aceita"] },
      criadaEm: { gte: new Date(Date.now() - EXPIRA_MS) },
      OR: [
        { deId: user.id, paraId },
        { deId: paraId, paraId: user.id },
      ],
    },
    select: SELECT,
  });
  if (emCurso) return NextResponse.json(emCurso);

  const chamada = await prisma.chamadaInterna.create({
    data: { deId: user.id, paraId, video: body.video !== false },
    select: SELECT,
  });
  return NextResponse.json(chamada);
}
