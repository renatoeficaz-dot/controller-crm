import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { saveMediaBuffer } from "@/lib/mediaStorage";

export async function GET(_req, { params }) {
  const { id } = await params;
  const lista = await prisma.documento.findMany({ where: { contactId: id }, orderBy: { createdAt: "desc" } });
  return NextResponse.json(lista);
}

// Upload direto de um documento (item 68) — separado da mídia trocada no chat.
export async function POST(req, { params }) {
  const { id } = await params;
  const form = await req.formData();
  const file = form.get("file");
  const tipo = form.get("tipo") || "outro";
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";
  const fileName = file.name || "documento";
  const url = await saveMediaBuffer(bytes, mimeType, fileName);

  const documento = await prisma.documento.create({
    data: { contactId: id, tipo, url, fileName, mimeType },
  });
  return NextResponse.json(documento);
}
