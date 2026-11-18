import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { recebidosNoPeriodo } from "@/lib/metas";

// Recebimentos por hora do dia (Brasília): quantidade de pagamentos e valor recebido.
// Conta os lançamentos de entrada gerados por baixa de parcela (parcelaId), pela hora em que o pagamento foi registrado.
const diaValido = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const ini = searchParams.get("ini");
  const fim = searchParams.get("fim");
  if (!diaValido(ini) || !diaValido(fim)) return NextResponse.json({ error: "Informe ini e fim (AAAA-MM-DD)." }, { status: 400 });
  const de = new Date(`${ini}T00:00:00-03:00`);
  const ate = new Date(new Date(`${fim}T00:00:00-03:00`).getTime() + 86400e3);
  if (isNaN(de) || isNaN(ate) || ate <= de) return NextResponse.json({ error: "Período inválido." }, { status: 400 });

  // Mesma fonte das Metas: lançamento de baixa repetido (clique duplo, tela desatualizada) não infla o valor. Um pagamento que quitou
  // duas parcelas no mesmo minuto conta como UM pagamento (antes contava um por parcela).
  const { itens } = await recebidosNoPeriodo(ini, fim);
  const horas = Array.from({ length: 24 }, (_, h) => ({ hora: h, qtd: 0, valor: 0 }));
  const pagamentos = new Set();
  for (const it of itens) {
    for (const pt of it.partes || []) {
      const t = new Date(pt.hora).getTime();
      const h = new Date(t - 3 * 3600e3).getUTCHours();
      horas[h].valor += pt.valor || 0;
      const chave = it.contactId + "|" + Math.floor(t / 60000);
      if (!pagamentos.has(chave)) { pagamentos.add(chave); horas[h].qtd++; }
    }
  }
  for (const x of horas) x.valor = Math.round(x.valor * 100) / 100;
  return NextResponse.json({ horas, total: { qtd: pagamentos.size, valor: Math.round(horas.reduce((s, x) => s + x.valor, 0) * 100) / 100 } });
}
