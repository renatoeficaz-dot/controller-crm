import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { saveMediaBase64 } from "@/lib/mediaStorage";
import { normalizeBrPhone } from "@/lib/evolution";
import { lerCorpo, texto, ehNaoEncontrado, respostaNaoEncontrado } from "@/lib/corpo";

// Edita uma mensagem pronta
export async function PATCH(req, { params }) {
  try {
    const { id } = await params;
    const body = await lerCorpo(req);
    const data = {};
    if ("title" in body) data.title = texto(body.title);
    if ("body" in body) data.body = texto(body.body);
    if ("mediaType" in body) data.mediaType = body.mediaType || null;
    if ("mediaBase64" in body) {
      // O formulário reenvia o valor atual do campo mesmo sem trocar o arquivo —
      // se já é um caminho salvo (/uploads/...), mantém; só grava em disco de
      // novo quando vier base64 de verdade (upload novo).
      const v = body.mediaBase64;
      if (v && v.startsWith("/uploads/")) {
        data.mediaUrl = v;
      } else if (v) {
        try {
          data.mediaUrl = await saveMediaBase64(v, body.mediaMimetype, body.mediaFileName);
        } catch (e) {
          return NextResponse.json({ error: e.message }, { status: 400 });
        }
      } else {
        data.mediaUrl = null;
      }
    }
    if ("mediaMimetype" in body) data.mediaMimetype = body.mediaMimetype || null;
    if ("mediaFileName" in body) data.mediaFileName = body.mediaFileName || null;
    if ("contactName" in body) data.contactName = texto(body.contactName) || null;
  
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
        data.contactPhone = texto(body.contactPhone) || null;
      }
    } else if (effectiveMediaType === "contact" && existing.contactPhone) {
      // Blinda contra registros antigos com telefone em formato não normalizado.
      const normalized = normalizeBrPhone(existing.contactPhone);
      if (normalized && normalized !== existing.contactPhone) data.contactPhone = normalized;
    }
  
    const tpl = await prisma.messageTemplate.update({ where: { id }, data });
    return NextResponse.json(tpl);
  } catch (err) {
    // Registro do `where` não existe (link velho, dois cliques, id
    // chutado): é "não achei", não erro de servidor.
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}

// Remove uma mensagem pronta
export async function DELETE(_req, { params }) {
  try {
    const { id } = await params;
    await prisma.messageTemplate.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Registro do `where` não existe (link velho, dois cliques, id
    // chutado): é "não achei", não erro de servidor.
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}
