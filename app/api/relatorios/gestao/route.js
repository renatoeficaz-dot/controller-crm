import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { hojeStr, dueStr, parcelaAtrasada, valorEmAberto } from "@/lib/finance";

// Faixas de aging usadas pela provisão — a expectativa de perda cresce com o
// tempo de atraso, então cada faixa tem seu próprio percentual configurável.
const FAIXAS = [
  { key: "0a7", label: "1 a 7 dias", min: 1, max: 7, cfg: "provisaoPct0a7" },
  { key: "8a15", label: "8 a 15 dias", min: 8, max: 15, cfg: "provisaoPct8a15" },
  { key: "16a30", label: "16 a 30 dias", min: 16, max: 30, cfg: "provisaoPct16a30" },
  { key: "31mais", label: "+30 dias", min: 31, max: Infinity, cfg: "provisaoPct31mais" },
];

// Relatórios de gestão: comparativo entre cobradores, provisão de perda e
// rentabilidade por cliente. Só admin — são números do negócio inteiro.
export async function GET() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const hoje = hojeStr();
  const [cfg, contatos, baixas, lancamentos] = await Promise.all([
    prisma.config.findUnique({ where: { id: "singleton" } }),
    prisma.contact.findMany({
      where: { excluidoEm: null },
      include: {
        parcelas: true,
        stage: { select: { name: true } },
      },
    }),
    prisma.parcela.findMany({
      where: { paid: true },
      select: { amountPago: true, amount: true, baixadoPor: true, paidAt: true, dueDate: true },
    }),
    prisma.lancamento.findMany({
      where: { contactId: { not: null } },
      select: { contactId: true, type: true, amount: true },
    }),
  ]);

  // ---------- Comparativo entre cobradores ----------
  const porCobrador = new Map();
  const garante = (nome) => {
    if (!porCobrador.has(nome)) {
      porCobrador.set(nome, { nome, recuperado: 0, baixas: 0, emDia: 0, atrasadas: 0, calotes: 0, carteira: 0 });
    }
    return porCobrador.get(nome);
  };

  for (const p of baixas) {
    const nome = p.baixadoPor || "— não registrado —";
    const r = garante(nome);
    r.recuperado += p.amountPago != null ? p.amountPago : p.amount;
    r.baixas += 1;
    // Pagou até o vencimento?
    const pagoEm = p.paidAt ? new Date(p.paidAt).toISOString().slice(0, 10) : null;
    if (pagoEm && pagoEm <= dueStr(p)) r.emDia += 1;
  }

  // Carteira e calotes ficam sob o responsável pelo lead (quem cuida dele),
  // não sob quem deu a última baixa.
  for (const c of contatos) {
    if (!c.responsavel) continue;
    const abertas = (c.parcelas || []).filter((p) => !p.paid && !p.renegociada);
    if (abertas.length === 0 && c.stage?.name !== "Cravo") continue;
    const r = garante(c.responsavel);
    r.carteira += abertas.reduce((s, p) => s + valorEmAberto(p), 0);
    if (c.stage?.name === "Cravo") r.calotes += 1;
    if (abertas.some((p) => parcelaAtrasada(p, hoje))) r.atrasadas += 1;
  }

  const cobradores = [...porCobrador.values()]
    .map((r) => ({
      ...r,
      pctEmDia: r.baixas > 0 ? Math.round((r.emDia / r.baixas) * 100) : null,
    }))
    .sort((a, b) => b.recuperado - a.recuperado);

  // ---------- Provisão de perda ----------
  const provisaoFaixas = FAIXAS.map((f) => ({
    key: f.key,
    label: f.label,
    pct: cfg?.[f.cfg] ?? 0,
    valor: 0,
    clientes: 0,
  }));

  for (const c of contatos) {
    const abertas = (c.parcelas || []).filter((p) => !p.paid && !p.renegociada);
    const atrasadas = abertas.filter((p) => parcelaAtrasada(p, hoje));
    if (!atrasadas.length) continue;
    const maisAntiga = atrasadas.slice().sort((a, b) => dueStr(a).localeCompare(dueStr(b)))[0];
    const dias = Math.round((new Date(hoje) - new Date(dueStr(maisAntiga))) / 86400000);
    const idx = FAIXAS.findIndex((f) => dias >= f.min && dias <= f.max);
    if (idx < 0) continue;
    // Provisiona sobre TODO o saldo aberto do cliente, não só a parcela vencida
    // — se ele parou de pagar, o risco é do plano inteiro.
    provisaoFaixas[idx].valor += abertas.reduce((s, p) => s + valorEmAberto(p), 0);
    provisaoFaixas[idx].clientes += 1;
  }

  const provisao = {
    faixas: provisaoFaixas.map((f) => ({ ...f, provisionado: Math.round(f.valor * (f.pct / 100) * 100) / 100 })),
    totalAtrasado: provisaoFaixas.reduce((s, f) => s + f.valor, 0),
    totalProvisionado:
      Math.round(provisaoFaixas.reduce((s, f) => s + f.valor * (f.pct / 100), 0) * 100) / 100,
  };

  // ---------- Rentabilidade por cliente ----------
  const porCliente = new Map();
  for (const l of lancamentos) {
    if (!porCliente.has(l.contactId)) porCliente.set(l.contactId, { entradas: 0, saidas: 0 });
    const r = porCliente.get(l.contactId);
    if (l.type === "entrada") r.entradas += l.amount;
    else r.saidas += l.amount;
  }

  const rentabilidade = contatos
    .map((c) => {
      const r = porCliente.get(c.id) || { entradas: 0, saidas: 0 };
      const abertas = (c.parcelas || []).filter((p) => !p.paid && !p.renegociada);
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        etapa: c.stage?.name || "",
        ciclos: c.cicloAtual || 1,
        recebido: Math.round(r.entradas * 100) / 100,
        emprestado: Math.round(r.saidas * 100) / 100,
        lucro: Math.round((r.entradas - r.saidas) * 100) / 100,
        emAberto: abertas.reduce((s, p) => s + valorEmAberto(p), 0),
      };
    })
    .filter((c) => c.recebido > 0 || c.emprestado > 0)
    .sort((a, b) => b.lucro - a.lucro);

  return NextResponse.json({
    cobradores,
    provisao,
    rentabilidade,
    totais: {
      lucroTotal: Math.round(rentabilidade.reduce((s, c) => s + c.lucro, 0) * 100) / 100,
      clientesLucrativos: rentabilidade.filter((c) => c.lucro > 0).length,
      clientesPrejuizo: rentabilidade.filter((c) => c.lucro < 0).length,
    },
  });
}
