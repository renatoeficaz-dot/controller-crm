import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { saveMediaBase64 } from "@/lib/mediaStorage";
import { normalizeBrPhone } from "@/lib/evolution";

// Edita uma mensagem pronta
export async function PATCH(req, { params }) {
  const { id } = await params;
  const body = await req.json();
  const data = {};
  if ("title" in body) data.title = (body.title || "").trim();
  if ("body" in body) data.body = (body.body || "").trim();
  if ("mediaType" in body) data.mediaType = body.mediaType || null;
  if ("mediaBase64" in body) {
    // O formulário reenvia o valor atual do campo mesmo sem trocar o arquivo —
    // se já é um caminho salvo (/uploads/...), mantém; só grava em disco de
    // novo quando vier base64 de verdade (upload novo).
    const v = body.mediaBase64;
    data.mediaUrl = v ? (v.startsWith("/uploads/") ? v : await saveMediaBase64(v, body.mediaMimetype, body.mediaFileName)) : null;
  }
  if ("mediaMimetype" in body) data.mediaMimetype = body.mediaMimetype || null;
  if ("mediaFileName" in body) data.mediaFileName = body.mediaFileName || null;
  if ("contactName" in body) data.contactName = (body.contactName || "").trim() || null;

  const existing = await prisma.messageTemplate.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  const effectiveMediaType = "mediaType" in body ? data.mediaType : existing.mediaType;

  if ("contactPhone" in body) {
    if (effectiveMediaType === "contact") {
      const normalized = normalizeBrPhone(body.contactPhone);
      if (!normalized) {
        return NextResponse.json(
          { error: "Telefone do contato inválido — use DDD + número (ex.: 11948528114 ou 5511948528114)." },
          { status: 400 }
        );
      }
      data.contactPhone = normalized;
    } else {
      data.contactPhone = (body.contactPhone || "").trim() || null;
    }
  } else if (effectiveMediaType === "contact" && existing.contactPhone) {
    // Blinda contra registros antigos com telefone em formato não normalizado.
    const normalized = normalizeBrPhone(existing.contactPhone);
    if (normalized && normalized !== existing.contactPhone) data.contactPhone = normalized;
  }

  const tpl = await prisma.messageTemplate.update({ where: { id }, data });
  return NextResponse.json(tpl);
}

// Remove uma mensagem pronta
export async function DELETE(_req, { params }) {
  const { id } = await params;
  await prisma.messageTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
