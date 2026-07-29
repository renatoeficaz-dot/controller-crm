import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";

export async function GET(_req, { params }) {
  const { id } = await params;
  const tentativas = await prisma.tentativaContato.findMany({
    where: { contactId: id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return NextResponse.json(tentativas);
}

export async function POST(req, { params }) {
  const { id } = await params;
  const body = await req.json();
  if (!body.tipo || !body.resultado) {
    return NextResponse.json({ error: "Informe o tipo e o resultado da tentativa." }, { status: 400 });
  }
  // Quem registrou vem da sessão, não do cliente — senão dá pra forjar o autor.
  const user = await getCurrentUser();
  const tentativa = await prisma.tentativaContato.create({
    data: {
      contactId: id,
      tipo: body.tipo,
      resultado: body.resultado,
      notas: (body.notas || "").trim() || null,
      usuario: user?.name || null,
    },
  });
  return NextResponse.json(tentativa);
}
