import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Cria um novo contato (cai na coluna informada, ou na primeira)
export async function POST(req) {
  const body = await req.json();

  let stageId = body.stageId;
  if (!stageId) {
    const first = await prisma.stage.findFirst({ orderBy: { order: "asc" } });
    if (!first) {
      return NextResponse.json({ error: "Crie uma coluna primeiro." }, { status: 400 });
    }
    stageId = first.id;
  }

  const last = await prisma.contact.findFirst({
    where: { stageId },
    orderBy: { order: "desc" },
  });

  const contact = await prisma.contact.create({
    data: {
      name: body.name || "Sem nome",
      phone: body.phone || null,
      email: body.email || null,
      company: body.company || null,
      notes: body.notes || null,
      stageId,
      order: (last?.order ?? -1) + 1,
    },
  });

  return NextResponse.json(contact);
}
