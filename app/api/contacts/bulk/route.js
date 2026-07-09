import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Data local de hoje como UTC-midnight (evita drift de fuso nas parcelas)
function hojeUTC() {
  const hoje = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD local
  return new Date(hoje + "T00:00:00.000Z");
}

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

    // "Recebimento" tem efeitos colaterais por contato (aviso fixo pro cliente
    // pelo número de Vendas, gerar parcelas, lançar a liberação de capital) —
    // não dá pra fazer com um updateMany só. Processa um a um, igual ao PATCH
    // de mover individual (senão o bulk pulava tudo isso, como já aconteceu:
    // lead ia pra Recebimento sem avisar o cliente).
    if (stage.name === "Recebimento") {
      const { regenerarParcelas, lancarLiberacaoCapital } = await import("@/lib/cobranca");
      const { sendRecebimentoNotice } = await import("@/lib/ia");
      const hoje = hojeUTC();
      let moved = 0;
      for (const id of alvo) {
        const contact = await prisma.contact.findUnique({ where: { id }, include: { parcelas: true } });
        if (!contact || contact.stageId === value) continue;

        const last = await prisma.contact.findFirst({ where: { stageId: value }, orderBy: { order: "desc" } });
        const data = { stageId: value, order: (last?.order ?? -1) + 1 };
        const aindaSemPlano = contact.parcelas.length === 0;
        if (contact.valorCapital && aindaSemPlano && !contact.pagamentoCapital) {
          data.pagamentoCapital = hoje;
        }

        const updated = await prisma.contact.update({ where: { id }, data });
        if (updated.valorCapital && updated.pagamentoCapital && aindaSemPlano) {
          await regenerarParcelas(id);
        }
        await sendRecebimentoNotice(updated).catch(() => {});
        await lancarLiberacaoCapital(updated).catch(() => {});
        moved++;
      }
      return NextResponse.json({ ok: true, moved, skipped });
    }

    const r = await prisma.contact.updateMany({ where: { id: { in: alvo } }, data: { stageId: value } });
    return NextResponse.json({ ok: true, moved: r.count, skipped });
  }

  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
}
