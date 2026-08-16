import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { ufFromPhone } from "@/lib/ddd";
import { getIaConfig, detectarGeneroPorNome } from "@/lib/ia";
import { lerCorpo } from "@/lib/corpo";

// Cria um novo contato (cai na coluna informada, ou na primeira)
export async function POST(req) {
  const body = await lerCorpo(req);

  // Sem nome E sem telefone o cadastro não serve pra nada: não dá pra falar com
  // ele nem identificar quem é, mas ele entrava no funil e contava nas métricas.
  if (!(body.name || "").trim() && !(body.phone || "").replace(/\D/g, "")) {
    return NextResponse.json({ error: "Informe ao menos o nome ou o telefone." }, { status: 400 });
  }
  if ((body.name || "").length > 500) {
    return NextResponse.json({ error: "Nome muito longo." }, { status: 400 });
  }
  if ((body.notes || "").length > 20000) {
    return NextResponse.json({ error: "Observação muito longa." }, { status: 400 });
  }

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
      notes: body.notes || null,
      estado: body.estado || ufFromPhone(body.phone),
      genero: body.genero || null,
      tipoCliente: body.tipoCliente || null,
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
