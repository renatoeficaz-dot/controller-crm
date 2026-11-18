import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { ufFromPhone } from "@/lib/ddd";
import { getIaConfig, detectarGeneroPorNome } from "@/lib/ia";
import { lerCorpo, texto } from "@/lib/corpo";

// Cria um novo contato (cai na coluna informada, ou na primeira)
export async function POST(req) {
  const body = await lerCorpo(req);

  // Sem nome E sem telefone o cadastro não serve pra nada: não dá pra falar com
  // ele nem identificar quem é, mas ele entrava no funil e contava nas métricas.
  if (!texto(body.name) && !texto(body.phone).replace(/\D/g, "")) {
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
  const phoneDigits = texto(body.phone).replace(/\D/g, "");
  if (phoneDigits) {
    const tail = phoneDigits.slice(-8);
    // Só cadastro ativo (o excluído na lixeira não é "o mesmo lead que já existe" — a pessoa não conseguia abrir o card devolvido).
    const existing = await prisma.contact.findFirst({ where: { phone: { endsWith: tail }, excluidoEm: null } });
    if (existing) {
      // Lead de outro vendedor: avisa que existe sem entregar a ficha inteira (nome, CPF, telefone) de quem não pode vê-la.
      const { negarSeNaoPodeVerContato } = await import("@/lib/contatoAcesso");
      if (await negarSeNaoPodeVerContato(existing.id)) return NextResponse.json({ error: "Esse telefone já está cadastrado na carteira de outra pessoa." }, { status: 409 });
      return NextResponse.json({ existing: true, contact: existing });
    }
  }

  let stageId = typeof body.stageId === "string" ? body.stageId : null;
  // Coluna inexistente dava erro de chave (500).
  if (stageId && !(await prisma.stage.findUnique({ where: { id: stageId }, select: { id: true } }))) {
    return NextResponse.json({ error: "Coluna não encontrada." }, { status: 400 });
  }
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
      // Texto sempre (número/objeto derrubava o Prisma) e telefone só com dígitos: gravado com parênteses e traço, a busca de lead
      // repetido (pelos últimos 8 dígitos) e o casamento com o WhatsApp não achavam o cadastro e nascia um lead duplicado.
      name: texto(body.name) || "Sem nome",
      phone: phoneDigits || null,
      notes: texto(body.notes) || null,
      estado: /^[A-Z]{2}$/.test(texto(body.estado).toUpperCase()) ? texto(body.estado).toUpperCase() : ufFromPhone(phoneDigits),
      genero: ["masculino", "feminino"].includes(body.genero) ? body.genero : null,
      tipoCliente: ["motoboy", "uber", "comerciante"].includes(body.tipoCliente) ? body.tipoCliente : null,
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
