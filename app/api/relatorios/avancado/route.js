import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";
import {
  melhorHorarioParaCobrar, curvaRecuperacaoPorFaixa, concentracaoDeRisco,
  diaDoMesQueMaisPaga, efeitoDescontoQuitacao, inadimplenciaPorPerfil,
  possiveisIdentidadesCompartilhadas, provavelAtrasoAmanha, resumoSemanalCarteira,
  quitadosNoMes, pertoDeQuitar, evolucaoValorPorCiclo,
} from "@/lib/analiseAvancada";

// Itens 213, 214, 215, 217, 218, 220, 287, 288, 289, 292, 297, 298, 300 — só admin.
export async function GET(req) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const anoMes = sp.get("mes") || undefined;

  const [
    melhorHorario, curvaRecuperacao, concentracao, diaDoMes, efeitoDesconto,
    inadimplencia, identidadesCompartilhadas, atrasoAmanha, resumoSemanal,
    quitados, pertoQuitar, evolucaoCiclo,
  ] = await Promise.all([
    melhorHorarioParaCobrar(),
    curvaRecuperacaoPorFaixa(),
    concentracaoDeRisco(),
    diaDoMesQueMaisPaga(),
    efeitoDescontoQuitacao(),
    inadimplenciaPorPerfil(),
    possiveisIdentidadesCompartilhadas(),
    provavelAtrasoAmanha(),
    resumoSemanalCarteira(),
    quitadosNoMes(anoMes),
    pertoDeQuitar(),
    evolucaoValorPorCiclo(),
  ]);

  return NextResponse.json({
    melhorHorario, curvaRecuperacao, concentracao, diaDoMes, efeitoDesconto,
    inadimplencia, identidadesCompartilhadas, atrasoAmanha, resumoSemanal,
    quitados, pertoQuitar, evolucaoCiclo,
  });
}
