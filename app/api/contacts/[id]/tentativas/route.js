import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { negarSeNaoPodeVerContato } from "@/lib/contatoAcesso";
import { lerCorpo } from "@/lib/corpo";

export async function GET(_req, { params }) {
  const { id } = await params;
  const negado = await negarSeNaoPodeVerContato(id);
  if (negado) return negado;
  const tentativas = await prisma.tentativaContato.findMany({
    where: { contactId: id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return NextResponse.json(tentativas);
}

export async function POST(req, { params }) {
  const { id } = await params;
  const negado = await negarSeNaoPodeVerContato(id);
  if (negado) return negado;
  const body = await lerCorpo(req);
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
      // Só grava a promessa quando o resultado é "prometeu" — nos outros casos
      // a data que vem do cliente é ignorada.
      dataPromessa:
        body.resultado === "prometeu" && body.dataPromessa
          ? new Date(String(body.dataPromessa).slice(0, 10) + "T00:00:00.000Z")
          : null,
      notas: (body.notas || "").trim() || null,
      usuario: user?.name || null,
    },
  });
  return NextResponse.json(tentativa);
}
