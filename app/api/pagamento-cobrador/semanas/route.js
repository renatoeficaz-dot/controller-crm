import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { lerCorpo, texto } from "@/lib/corpo";
import { gerarRelatoriosPagamentoSabado } from "@/lib/relatorioPagamentoSabado";

// Acertos já fechados (o que a rotina de sábado gravou).
export async function GET(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const userId = new URL(req.url).searchParams.get("userId");
  const where = isAdmin(user) ? (userId ? { userId } : {}) : { userId: user.id };
  const semanas = await prisma.pagamentoCobradorSemana.findMany({
    where,
    orderBy: { inicio: "desc" },
    take: 30,
  });
  return NextResponse.json(
    semanas.map((s) => ({ ...s, detalhe: JSON.parse(s.detalhe || "[]") }))
  );
}

// Marca um acerto como pago.
export async function PATCH(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "Só admin." }, { status: 403 });
  const body = await lerCorpo(req);
  const id = texto(body.id);
  if (!id) return NextResponse.json({ error: "Acerto não informado." }, { status: 400 });
  const pago = body.pago !== false;
  const s = await prisma.pagamentoCobradorSemana.update({
    where: { id },
    data: { pago, pagoEm: pago ? new Date() : null },
  });
  return NextResponse.json(s);
}

// Fecha e entrega os acertos AGORA, sem esperar o sábado. Serve pra conferir o
// número antes da hora e pra refazer se a rotina não rodou (servidor reiniciado
// na hora errada, por exemplo). É idempotente: refazer no mesmo sábado atualiza
// o acerto em vez de duplicar, e não repete a mensagem no chat.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "Só admin." }, { status: 403 });
  const gerados = await gerarRelatoriosPagamentoSabado();
  return NextResponse.json({ gerados });
}
