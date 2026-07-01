import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

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
  } else {
    if (!data.mediaBase64) {
      return NextResponse.json({ error: "Anexe um arquivo." }, { status: 400 });
    }
  }

  const last = await prisma.messageTemplate.findFirst({ orderBy: { order: "desc" } });
  const tpl = await prisma.messageTemplate.create({
    data: {
      title,
      body: (data.body || "").trim(),
      mediaType: mediaType || null,
      mediaBase64: data.mediaBase64 || null,
      mediaMimetype: data.mediaMimetype || null,
      mediaFileName: data.mediaFileName || null,
      contactName: (data.contactName || "").trim() || null,
      contactPhone: (data.contactPhone || "").trim() || null,
      order: (last?.order ?? -1) + 1,
    },
  });
  return NextResponse.json(tpl);
}
