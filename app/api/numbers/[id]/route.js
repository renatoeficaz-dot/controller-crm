import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Edita um número (ex.: reatribuir usuário, mudar instância)
export async function PATCH(req, { params }) {
  const { id } = await params;
  const body = await req.json();
  const data = {};
  for (const f of ["label", "number", "instance"]) {
    if (f in body) data[f] = (body[f] || "").trim();
  }
  if ("userId" in body) data.userId = body.userId || null;
  if ("agentId" in body) data.agentId = body.agentId || null;
  if ("provider" in body) data.provider = body.provider === "waha" ? "waha" : "evolution";
  if ("estadosCobranca" in body) data.estadosCobranca = (body.estadosCobranca || "").trim() || null;
  if ("mensagemCobranca" in body) data.mensagemCobranca = (body.mensagemCobranca || "").trim() || null;

  // Só um número pode ser "padrão" por vez — desmarca os outros antes.
  if (body.padrao === true) {
    await prisma.whatsappNumber.updateMany({ where: { padrao: true }, data: { padrao: false } });
    data.padrao = true;
  } else if (body.padrao === false) {
    data.padrao = false;
  }

  const updated = await prisma.whatsappNumber.update({
    where: { id },
    data,
    include: {
      user: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(updated);
}

// Remove um número
export async function DELETE(_req, { params }) {
  const { id } = await params;
  await prisma.whatsappNumber.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
