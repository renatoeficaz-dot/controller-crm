import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Ações em massa sobre um conjunto de leads (os que estão no filtro do funil).
// body: { ids: string[], action: "stage" | "responsavel" | "delete", value?: string }
export async function POST(req) {
  const { ids, action, value } = await req.json().catch(() => ({}));
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "Nenhuma lead selecionada." }, { status: 400 });
  }
  const where = { id: { in: ids } };

  if (action === "responsavel") {
    const r = await prisma.contact.updateMany({ where, data: { responsavel: value || null } });
    return NextResponse.json({ ok: true, updated: r.count });
  }

  if (action === "delete") {
    const r = await prisma.contact.deleteMany({ where });
    return NextResponse.json({ ok: true, deleted: r.count });
  }

  if (action === "stage") {
    if (!value) return NextResponse.json({ error: "Escolha a coluna de destino." }, { status: 400 });
    const stage = await prisma.stage.findUnique({ where: { id: value } });
    if (!stage) return NextResponse.json({ error: "Coluna não encontrada." }, { status: 404 });

    // Regra: só vai para "Liberação pagamento" quem tem Valor do capital preenchido.
    let alvo = ids;
    let skipped = 0;
    if (stage.name === "Liberação pagamento") {
      const validos = await prisma.contact.findMany({
        where: { id: { in: ids }, valorCapital: { not: null } },
        select: { id: true },
      });
      alvo = validos.map((v) => v.id);
      skipped = ids.length - alvo.length;
    }
    const r = await prisma.contact.updateMany({ where: { id: { in: alvo } }, data: { stageId: value } });
    return NextResponse.json({ ok: true, moved: r.count, skipped });
  }

  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
}
