import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, mensagensWhere } from "@/lib/session";

// Busca texto DENTRO das conversas. Como a transcrição do áudio recebido já é
// gravada em Message.body (ver lib/ia.js), isso também acha o que o cliente
// falou por áudio — que hoje é impossível de encontrar de outra forma.
export async function GET(req) {
  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (q.length < 3) return NextResponse.json([]);

  const user = await getCurrentUser();
  const visibilidade = mensagensWhere(user); // undefined = vê tudo

  const where = { body: { contains: q } };
  if (visibilidade) Object.assign(where, visibilidade);

  const mensagens = await prisma.message.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      body: true,
      kind: true,
      fromMe: true,
      createdAt: true,
      contactId: true,
      contact: { select: { name: true, phone: true } },
    },
  });

  return NextResponse.json(
    mensagens.map((m) => ({
      id: m.id,
      contactId: m.contactId,
      contactName: m.contact?.name || "",
      contactPhone: m.contact?.phone || "",
      body: m.body,
      kind: m.kind,
      fromMe: m.fromMe,
      createdAt: m.createdAt,
    }))
  );
}
