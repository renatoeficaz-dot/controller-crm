import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { serieDeDias } from "@/lib/metas";

const r2 = (n) => Math.round((n || 0) * 100) / 100;

function agregado(serie) {
  const somar = (campo) => serie.reduce((s, d) => s + (d[campo] || 0), 0);
  const comMeta = serie.filter((d) => d.temMeta && d.diaUtil);
  const metaVendas = comMeta.reduce((s, d) => s + (d.metaVendasDia || 0), 0);
  const metaReceb = comMeta.reduce((s, d) => s + (d.metaRecebimentosDia || 0), 0);
  return {
    dias: serie.length,
    vendas: somar("vendas"),
    valorVendido: r2(somar("valorVendido")),
    baixas: somar("baixas"),
    recebimentos: somar("recebimentos"),
    valorRecebido: r2(somar("valorRecebido")),
    valorRecuperado: r2(somar("valorRecuperado")),
    metaVendas,
    metaRecebimentos: metaReceb,
    pctVendas: metaVendas > 0 ? Math.round((somar("vendas") / metaVendas) * 100) : null,
  };
}

// Item 119: compara dois intervalos de data lado a lado.
// ?de1&ate1&de2&ate2  (YYYY-MM-DD) — ?usuario= opcional, admin escolhe outra pessoa
export async function GET(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const de1 = sp.get("de1"), ate1 = sp.get("ate1"), de2 = sp.get("de2"), ate2 = sp.get("ate2");
  if (![de1, ate1, de2, ate2].every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d || ""))) {
    return NextResponse.json({ error: "Informe de1, ate1, de2 e ate2 (YYYY-MM-DD)." }, { status: 400 });
  }

  const pedido = sp.get("usuario");
  let usuario = null;
  if (isAdmin(user)) {
    usuario = pedido || null;
  } else {
    if (pedido && pedido !== user.name) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    usuario = user.name;
  }

  const [serie1, serie2] = await Promise.all([
    serieDeDias(de1, ate1, usuario),
    serieDeDias(de2, ate2, usuario),
  ]);

  return NextResponse.json({
    periodo1: { de: de1, ate: ate1, ...agregado(serie1) },
    periodo2: { de: de2, ate: ate2, ...agregado(serie2) },
  });
}
