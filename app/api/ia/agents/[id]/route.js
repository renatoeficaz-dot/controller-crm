import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { normalizeBrPhone } from "@/lib/evolution";
import { lerCorpo, texto, ehNaoEncontrado, respostaNaoEncontrado } from "@/lib/corpo";

export async function GET(_req, { params }) {
  const { id } = await params;
  const agent = await prisma.iaAgent.findUnique({ where: { id } });
  if (!agent) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json(agent);
}

// Edita um agente (nome, prompt, modelos, modo de resposta)
export async function PATCH(req, { params }) {
  try {
    const { id } = await params;
    const body = await lerCorpo(req);
    const data = {};
    if ("name" in body) data.name = texto(body.name);
    if ("prompt" in body) data.prompt = texto(body.prompt) || null;
    if ("textModel" in body) data.textModel = texto(body.textModel) || null;
    if ("ttsProvider" in body) data.ttsProvider = body.ttsProvider || "deepinfra";
    if ("ttsModel" in body) data.ttsModel = texto(body.ttsModel) || null;
    if ("ttsVoice" in body) data.ttsVoice = texto(body.ttsVoice) || null;
    if ("modoResposta" in body) data.modoResposta = body.modoResposta || "espelho";
    if ("toolSendContact" in body) data.toolSendContact = !!body.toolSendContact;
    if ("toolContactName" in body) data.toolContactName = texto(body.toolContactName) || null;
  
    const existing = await prisma.iaAgent.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    const willSendContact = "toolSendContact" in body ? !!body.toolSendContact : existing.toolSendContact;
  
    if ("toolContactPhone" in body) {
      const trimmed = texto(body.toolContactPhone);
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
  } catch (err) {
    // Registro do `where` não existe (link velho, dois cliques, id
    // chutado): é "não achei", não erro de servidor.
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}

// Remove um agente (números que o usavam ficam sem IA — onDelete: SetNull)
export async function DELETE(_req, { params }) {
  try {
    const { id } = await params;
    await prisma.iaAgent.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Registro do `where` não existe (link velho, dois cliques, id
    // chutado): é "não achei", não erro de servidor.
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}
