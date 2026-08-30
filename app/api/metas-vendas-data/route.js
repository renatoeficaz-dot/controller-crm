import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { lerCorpo } from "@/lib/corpo";

// Meta de vendas de dias específicos do calendário (não dia da semana) — pra
// planejar uma curva de campanha (ex.: 3 meses com meta crescente dia a dia).
// GET ?de=YYYY-MM-DD&ate=YYYY-MM-DD — sem parâmetros, lista tudo.
export async function GET(req) {
  const sp = new URL(req.url).searchParams;
  const de = sp.get("de");
  const ate = sp.get("ate");
  const where = {};
  if (de || ate) {
    where.data = {};
    if (de) where.data.gte = new Date(de + "T00:00:00.000Z");
    if (ate) where.data.lte = new Date(ate + "T00:00:00.000Z");
  }
  const rows = await prisma.metaVendasData.findMany({ where, orderBy: { data: "asc" } });
  return NextResponse.json(rows);
}

// Body: { rows: [{ data: "YYYY-MM-DD", metaVendasDia: number }, ...] }
// (aceita um único objeto direto no lugar de `rows` também, pra edição
// individual não precisar montar um array de 1 item.)
export async function POST(req) {
  const body = await lerCorpo(req);
  const lista = Array.isArray(body.rows) ? body.rows : [body];

  if (lista.length === 0) {
    return NextResponse.json({ error: "Nenhum dia enviado." }, { status: 400 });
  }
  if (lista.length > 400) {
    return NextResponse.json({ error: "Muitos dias de uma vez (máx. 400)." }, { status: 400 });
  }

  const salvos = [];
  for (const item of lista) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.data || "")) {
      return NextResponse.json({ error: `Data inválida: "${item.data}".` }, { status: 400 });
    }
    // Mesmo teto de segurança usado em /api/metas-dia-semana — evita gravar
    // um Int fora do range e corromper a linha (bug já visto no projeto).
    const meta = Math.round(Number(item.metaVendasDia));
    if (!Number.isFinite(meta) || meta < 0 || meta > 100000) {
      return NextResponse.json({ error: `Meta inválida em ${item.data}.` }, { status: 400 });
    }
    const data = new Date(item.data + "T00:00:00.000Z");
    const row = await prisma.metaVendasData.upsert({
      where: { data },
      update: { metaVendasDia: meta },
      create: { data, metaVendasDia: meta },
    });
    salvos.push(row);
  }
  return NextResponse.json({ ok: true, salvos: salvos.length, rows: salvos });
}
