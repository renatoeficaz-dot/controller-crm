import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { saveMediaBase64 } from "@/lib/mediaStorage";
import { normalizeBrPhone } from "@/lib/evolution";

// Lista as mensagens prontas (ordenadas)
export async function GET() {
  const templates = await prisma.messageTemplate.findMany({ orderBy: { order: "asc" } });
  return NextResponse.json(templates);
}

// Cria uma mensagem pronta
export async function POST(req) {
  const data = await req.json();
  const title = (data.title || "").trim();
  const mediaType = data.mediaType || null;

  if (!title) {
    return NextResponse.json({ error: "Preencha o título." }, { status: 400 });
  }

  // Validação por tipo
  if (!mediaType || mediaType === "text") {
    if (!(data.body || "").trim()) {
      return NextResponse.json({ error: "Preencha a mensagem." }, { status: 400 });
    }
  } else if (mediaType === "contact") {
    if (!(data.contactName || "").trim() || !(data.contactPhone || "").trim()) {
      return NextResponse.json({ error: "Preencha nome e telefone do contato." }, { status: 400 });
    }
    if (!normalizeBrPhone(data.contactPhone)) {
      return NextResponse.json(
        { error: "Telefone do contato inválido — use DDD + número (ex.: 11948528114 ou 5511948528114)." },
        { status: 400 }
      );
    }
  } else {
    if (!data.mediaBase64) {
      return NextResponse.json({ error: "Anexe um arquivo." }, { status: 400 });
    }
  }

  // Novo template sempre vem de um upload fresco (base64 do navegador) — salva
  // como arquivo em disco, só o caminho vai pro banco.
  const mediaUrl = data.mediaBase64
    ? await saveMediaBase64(data.mediaBase64, data.mediaMimetype, data.mediaFileName)
    : null;

  const last = await prisma.messageTemplate.findFirst({ orderBy: { order: "desc" } });
  const tpl = await prisma.messageTemplate.create({
    data: {
      title,
      body: (data.body || "").trim(),
      mediaType: mediaType || null,
      mediaUrl,
      mediaMimetype: data.mediaMimetype || null,
      mediaFileName: data.mediaFileName || null,
      contactName: (data.contactName || "").trim() || null,
      contactPhone: mediaType === "contact" ? normalizeBrPhone(data.contactPhone) : (data.contactPhone || "").trim() || null,
      order: (last?.order ?? -1) + 1,
    },
  });
  return NextResponse.json(tpl);
}
