import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(_req, { params }) {
  const { id } = await params;
  const flow = await prisma.chatbotFlow.findUnique({ where: { id } });
  if (!flow) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json(flow);
}

// Atualiza nome, ativo, gatilho, nós e arestas (o construtor visual salva nodesJson/edgesJson aqui)
export async function PATCH(req, { params }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data = {};
  if ("name" in body) data.name = (body.name || "").trim();
  if ("triggerKeyword" in body) data.triggerKeyword = (body.triggerKeyword || "").trim() || null;
  if ("nodes" in body) data.nodesJson = JSON.stringify(body.nodes);
  if ("edges" in body) data.edgesJson = JSON.stringify(body.edges);

  // Só um fluxo ativo por vez — ativar este desativa os demais
  if ("active" in body) {
    if (body.active) {
      await prisma.chatbotFlow.updateMany({ where: { active: true }, data: { active: false } });
    }
    data.active = !!body.active;
  }

  const flow = await prisma.chatbotFlow.update({ where: { id }, data });
  return NextResponse.json(flow);
}

export async function DELETE(_req, { params }) {
  const { id } = await params;
  await prisma.chatbotFlow.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
