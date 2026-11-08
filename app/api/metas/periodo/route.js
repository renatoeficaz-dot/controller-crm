import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { serieDeDias, hojeStr } from "@/lib/metas";

const r2 = (n) => Math.round((n || 0) * 100) / 100;

// Metas por PERÍODO (de/até): soma os dias do intervalo, com o mesmo recorte do resumo diário.
//   ?de=YYYY-MM-DD&ate=YYYY-MM-DD  ?usuario=Nome | ?equipe=id (só admin)
export async function GET(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const de = sp.get("de");
  const ateInformado = sp.get("ate");
  if (![de, ateInformado].every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d || "")) || de > ateInformado) {
    return NextResponse.json({ error: "Informe de e ate (YYYY-MM-DD), de <= ate." }, { status: 400 });
  }
  // Dia futuro não tem resultado: sem travar em hoje, a meta dos dias que ainda não aconteceram entrava no total e a % saía menor.
  const hoje = hojeStr();
  if (de > hoje) return NextResponse.json({ error: "O período começa depois de hoje." }, { status: 400 });
  const ate = ateInformado > hoje ? hoje : ateInformado;
  const dias = Math.round((new Date(ate + "T00:00:00Z") - new Date(de + "T00:00:00Z")) / 86400000) + 1;
  if (dias > 366) return NextResponse.json({ error: "Período máximo de 366 dias." }, { status: 400 });

  const pedido = sp.get("usuario");
  const equipeId = sp.get("equipe");
  let usuario = null;
  let equipeMeta = null;
  if (isAdmin(user)) {
    if (equipeId) {
      const equipe = await prisma.equipe.findUnique({ where: { id: equipeId }, include: { membros: { select: { name: true } } } });
      if (!equipe) return NextResponse.json({ error: "Equipe não encontrada." }, { status: 404 });
      usuario = equipe.membros.map((m) => m.name);
      equipeMeta = equipe;
    } else {
      usuario = pedido || null;
    }
  } else {
    if (pedido && pedido !== user.name) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    usuario = user.name;
  }

  const serie = await serieDeDias(de, ate, usuario, equipeMeta);
  const somar = (campo) => serie.reduce((s, d) => s + (d[campo] || 0), 0);
  const comMeta = serie.filter((d) => d.temMeta && d.diaUtil);
  const metaVendas = comMeta.reduce((s, d) => s + (d.metaVendasDia || 0), 0);
  const metaReceb = comMeta.reduce((s, d) => s + (d.metaRecebimentosDia || 0), 0);
  const uteis = serie.filter((d) => d.diaUtil);
  const metaLib = uteis.reduce((s, d) => s + (d.metaLiberacaoDia || 0), 0);
  // A % compara o realizado com a meta dos MESMOS dias (domingo e dia sem retrato ficam fora dos dois lados); somar o realizado de
  // todos os dias contra a meta de alguns inflava a %.
  const liberadoUteis = uteis.reduce((s, d) => s + (d.liberado || 0), 0);
  const recebidoComMeta = comMeta.reduce((s, d) => s + (d.recebimentos || 0), 0);
  return NextResponse.json({
    de, ate, dias: serie.length,
    vendas: somar("vendas"),
    valorVendido: r2(somar("valorVendido")),
    baixas: somar("baixas"),
    recebimentos: somar("recebimentos"),
    valorRecebido: r2(somar("valorRecebido")),
    valorRecuperado: r2(somar("valorRecuperado")),
    metaVendas,
    liberado: r2(somar("liberado")),
    metaLiberacao: r2(metaLib),
    pctLiberacao: metaLib > 0 ? Math.round((liberadoUteis / metaLib) * 100) : null,
    metaRecebimentos: r2(metaReceb),
    pctVendas: metaVendas > 0 ? Math.round((somar("vendas") / metaVendas) * 100) : null,
    pctRecebimentos: metaReceb > 0 ? Math.round((recebidoComMeta / metaReceb) * 100) : null,
    serie: serie.map((d) => ({ dia: d.dia, vendas: d.vendas || 0, valorVendido: r2(d.valorVendido), baixas: d.baixas || 0, valorRecebido: r2(d.valorRecebido), valorRecuperado: r2(d.valorRecuperado), recebimentos: r2(d.recebimentos), liberado: r2(d.liberado) })),
  });
}
