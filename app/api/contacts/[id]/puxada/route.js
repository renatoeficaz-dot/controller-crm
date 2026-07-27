import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { saveMediaBase64 } from "@/lib/mediaStorage";

// Anexa (ou substitui) o PDF da puxada (consulta de crédito) do lead.
export async function POST(req, { params }) {
  const { id } = await params;
  const { base64, fileName, mimetype } = await req.json();
  if (!base64) return NextResponse.json({ error: "Arquivo vazio." }, { status: 400 });
  if (mimetype !== "application/pdf") return NextResponse.json({ error: "Só é permitido anexar PDF." }, { status: 400 });

  const url = await saveMediaBase64(base64, mimetype, fileName);
  const contact = await prisma.contact.update({
    where: { id },
    data: { puxadaUrl: url, puxadaFileName: fileName || "puxada.pdf", puxadaEm: new Date() },
  });
  return NextResponse.json({ puxadaUrl: contact.puxadaUrl, puxadaFileName: contact.puxadaFileName, puxadaEm: contact.puxadaEm });
}

// Remove o anexo do lead (mantém o arquivo em disco, só desvincula).
export async function DELETE(_req, { params }) {
  const { id } = await params;
  await prisma.contact.update({ where: { id }, data: { puxadaUrl: null, puxadaFileName: null, puxadaEm: null } });
  return NextResponse.json({ ok: true });
}
