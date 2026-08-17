import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { lerCorpo, texto } from "@/lib/corpo";
import { saveMediaBase64 } from "@/lib/mediaStorage";

const TIPOS_MIDIA = new Set(["audio", "image", "document"]);

export async function GET(req) {
  const contactId = new URL(req.url).searchParams.get("contactId");
  const lista = await prisma.mensagemAgendada.findMany({
    where: contactId ? { contactId } : { enviado: false },
    orderBy: { dataHora: "asc" },
    include: { contact: { select: { id: true, name: true, phone: true } }, template: { select: { title: true } } },
    take: 200,
  });
  return NextResponse.json(lista);
}

export async function POST(req) {
  const body = await lerCorpo(req);
  if (!body.contactId || !body.numeroId || !body.dataHora) {
    return NextResponse.json({ error: "Lead, número e data/hora são obrigatórios." }, { status: 400 });
  }
  const temMidiaPropria = !body.templateId && body.midiaBase64 && TIPOS_MIDIA.has(body.midiaTipo);
  if (!body.templateId && !texto(body.corpo) && !temMidiaPropria) {
    return NextResponse.json({ error: "Escolha uma mensagem pronta, escreva o texto, grave um áudio ou escolha uma imagem." }, { status: 400 });
  }
  if (Number.isNaN(new Date(body.dataHora).getTime())) {
    return NextResponse.json({ error: "Data e hora inválidas." }, { status: 400 });
  }
  // Lead ou número inexistente estourava a chave estrangeira no Prisma e
  // voltava como erro 500, sem dizer o que estava errado.
  const [contatoOk, numeroOk] = await Promise.all([
    prisma.contact.count({ where: { id: body.contactId } }),
    prisma.whatsappNumber.count({ where: { id: body.numeroId } }),
  ]);
  if (!contatoOk) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });
  if (!numeroOk) return NextResponse.json({ error: "Número de WhatsApp não encontrado." }, { status: 404 });

  let midiaUrl = null;
  if (temMidiaPropria) {
    try {
      midiaUrl = await saveMediaBase64(body.midiaBase64, texto(body.midiaMimetype), texto(body.midiaFileName));
    } catch (e) {
      return NextResponse.json({ error: e.message || "Erro ao salvar o arquivo." }, { status: 400 });
    }
  }

  const criado = await prisma.mensagemAgendada.create({
    data: {
      contactId: body.contactId,
      numeroId: body.numeroId,
      templateId: body.templateId || null,
      corpo: body.templateId ? null : texto(body.corpo) || null,
      midiaUrl,
      midiaMimetype: midiaUrl ? texto(body.midiaMimetype) || null : null,
      midiaFileName: midiaUrl ? texto(body.midiaFileName) || null : null,
      midiaTipo: midiaUrl ? body.midiaTipo : null,
      ordemMidia: body.ordemMidia === "antes" ? "antes" : "depois",
      dataHora: new Date(body.dataHora),
    },
  });
  return NextResponse.json(criado);
}
