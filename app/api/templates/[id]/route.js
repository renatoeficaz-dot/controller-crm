import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Edita uma mensagem pronta
export async function PATCH(req, { params }) {
  const { id } = await params;
  const body = await req.json();
  const data = {};
  if ("title" in body) data.title = (body.title || "").trim();
  if ("body" in body) data.body = (body.body || "").trim();
  if ("mediaType" in body) data.mediaType = body.mediaType || null;
  if ("mediaBase64" in body) data.mediaBase64 = body.mediaBase64 || null;
  if ("mediaMimetype" in body) data.mediaMimetype = body.mediaMimetype || null;
  if ("mediaFileName" in body) data.mediaFileName = body.mediaFileName || null;
  if ("contactName" in body) data.contactName = (body.contactName || "").trim() || null;
  if ("contactPhone" in body) data.contactPhone = (body.contactPhone || "").trim() || null;
  const tpl = await prisma.messageTemplate.update({ where: { id }, data });
  return NextResponse.json(tpl);
}

// Remove uma mensagem pronta
export async function DELETE(_req, { params }) {
  const { id } = await params;
  await prisma.messageTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
