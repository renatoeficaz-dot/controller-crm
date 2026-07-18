import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { ufFromPhone } from "@/lib/ddd";
import { getIaConfig, detectarGeneroPorNome } from "@/lib/ia";

// Cria um novo contato (cai na coluna informada, ou na primeira)
export async function POST(req) {
  const body = await req.json();

  // Evita duplicar lead: se já existe um contato com o mesmo telefone (últimos
  // 8 dígitos, tolerando formatação/DDI diferentes — mesma regra do webhook do
  // WhatsApp), reaproveita o card existente em vez de criar um novo.
  const phoneDigits = (body.phone || "").replace(/\D/g, "");
  if (phoneDigits) {
    const tail = phoneDigits.slice(-8);
    const existing = await prisma.contact.findFirst({ where: { phone: { endsWith: tail } } });
    if (existing) {
      return NextResponse.json({ existing: true, contact: existing });
    }
  }

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
      estado: body.estado || ufFromPhone(body.phone),
      genero: body.genero || null,
      stageId,
      order: (last?.order ?? -1) + 1,
    },
  });

  // Gênero pelo nome (IA, uma vez só) — não bloqueia a criação do lead.
  if (!body.genero && body.name) {
    getIaConfig()
      .then((cfg) => detectarGeneroPorNome(body.name, cfg?.deepinfraApiKey))
      .then((genero) => {
        if (genero) return prisma.contact.update({ where: { id: contact.id }, data: { genero } });
      })
      .catch(() => {});
  }

  return NextResponse.json(contact);
}
