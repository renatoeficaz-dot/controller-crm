import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { saveMediaBuffer } from "@/lib/mediaStorage";
import { negarSeNaoPodeVerContato } from "@/lib/contatoAcesso";

export async function GET(_req, { params }) {
  const { id } = await params;
  const negado = await negarSeNaoPodeVerContato(id);
  if (negado) return negado;
  const lista = await prisma.documento.findMany({ where: { contactId: id }, orderBy: { createdAt: "desc" } });
  return NextResponse.json(lista);
}

// Upload direto de um documento (item 68) — separado da mídia trocada no chat.
export async function POST(req, { params }) {
  const { id } = await params;
  const negado = await negarSeNaoPodeVerContato(id);
  if (negado) return negado;
  const form = await req.formData();
  const file = form.get("file");
  const tipo = form.get("tipo") || "outro";
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";
  const fileName = file.name || "documento";
  let url;
  try {
    url = await saveMediaBuffer(bytes, mimeType, fileName);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }

  const documento = await prisma.documento.create({
    data: { contactId: id, tipo, url, fileName, mimeType },
  });
  return NextResponse.json(documento);
}
