import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(_req, { params }) {
  const { id } = await params;
  const agent = await prisma.iaAgent.findUnique({ where: { id } });
  if (!agent) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json(agent);
}

// Edita um agente (nome, prompt, modelos, modo de resposta)
export async function PATCH(req, { params }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data = {};
  if ("name" in body) data.name = (body.name || "").trim();
  if ("prompt" in body) data.prompt = (body.prompt || "").trim() || null;
  if ("textModel" in body) data.textModel = (body.textModel || "").trim() || null;
  if ("ttsModel" in body) data.ttsModel = (body.ttsModel || "").trim() || null;
  if ("modoResposta" in body) data.modoResposta = body.modoResposta || "espelho";
  const agent = await prisma.iaAgent.update({ where: { id }, data });
  return NextResponse.json(agent);
}

// Remove um agente (números que o usavam ficam sem IA — onDelete: SetNull)
export async function DELETE(_req, { params }) {
  const { id } = await params;
  await prisma.iaAgent.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
