import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { normalizeBrPhone } from "@/lib/evolution";

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
  if ("ttsProvider" in body) data.ttsProvider = body.ttsProvider || "deepinfra";
  if ("ttsModel" in body) data.ttsModel = (body.ttsModel || "").trim() || null;
  if ("ttsVoice" in body) data.ttsVoice = (body.ttsVoice || "").trim() || null;
  if ("modoResposta" in body) data.modoResposta = body.modoResposta || "espelho";
  if ("toolSendContact" in body) data.toolSendContact = !!body.toolSendContact;
  if ("toolContactName" in body) data.toolContactName = (body.toolContactName || "").trim() || null;

  const existing = await prisma.iaAgent.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  const willSendContact = "toolSendContact" in body ? !!body.toolSendContact : existing.toolSendContact;

  if ("toolContactPhone" in body) {
    const trimmed = (body.toolContactPhone || "").trim();
    if (willSendContact && trimmed) {
      const normalized = normalizeBrPhone(trimmed);
      if (!normalized) {
        return NextResponse.json(
          { error: "Telefone do contato inválido — use DDD + número (ex.: 11948528114 ou 5511948528114)." },
          { status: 400 }
        );
      }
      data.toolContactPhone = normalized;
    } else {
      data.toolContactPhone = trimmed || null;
    }
  } else if (willSendContact && existing.toolContactPhone) {
    const normalized = normalizeBrPhone(existing.toolContactPhone);
    if (normalized && normalized !== existing.toolContactPhone) data.toolContactPhone = normalized;
  }

  if ("toolSendTemplate" in body) data.toolSendTemplate = !!body.toolSendTemplate;
  if ("toolMoveStage" in body) data.toolMoveStage = !!body.toolMoveStage;
  if ("stopAtStageId" in body) data.stopAtStageId = body.stopAtStageId || null;
  const agent = await prisma.iaAgent.update({ where: { id }, data });
  return NextResponse.json(agent);
}

// Remove um agente (números que o usavam ficam sem IA — onDelete: SetNull)
export async function DELETE(_req, { params }) {
  const { id } = await params;
  await prisma.iaAgent.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
