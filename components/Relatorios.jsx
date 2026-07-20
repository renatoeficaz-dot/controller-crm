"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { aReceber, totalRecebido, inadimplenciaCravo, fimSemanaStr, fimMesStr } from "@/lib/relatorios";
import { hojeStr, parcelaAtrasada, NUM_PARCELAS } from "@/lib/finance";
import ContactModal from "@/components/ContactModal";

const money = (n) =>
  "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// "YYYY-MM-DD" do 1º dia do mês corrente
function inicioMesStr() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString("en-CA");
}
// "YYYY-MM-DD" da segunda-feira desta semana
function inicioSemanaStr() {
  const d = new Date();
  const dowSegBase = (d.getDay() + 6) % 7; // 0 = segunda
  d.setDate(d.getDate() - dowSegBase);
  return d.toLocaleDateString("en-CA");
}

const PRESETS = [
  { key: "hoje", label: "Hoje", range: () => [hojeStr(), hojeStr()] },
  { key: "semana", label: "Esta semana", range: () => [inicioSemanaStr(), fimSemanaStr()] },
  { key: "mes", label: "Este mês", range: () => [inicioMesStr(), fimMesStr()] },
  { key: "tudo", label: "Todo período", range: () => ["2000-01-01", hojeStr()] },
];

export default function Relatorios() {
  const [stages, setStages] = useState([]);
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState("mes");
  const [ini, setIni] = useState(inicioMesStr());
  const [fim, setFim] = useState(hojeStr());
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [openContactId, setOpenContactId] = useState(null);

  const load = useCallback(async () => {
    const data = await fetch("/api/stages").then((r) => r.json()).catch(() => []);
    setStages(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then(setCfg).catch(() => {});
  }, []);

  // Parâmetros de multa por atraso (vindos da config) para o cálculo "a receber".
  const multaOpts = useMemo(
    () => ({ multaPct: cfg?.multaPct, horaLimite: cfg?.pagamentoHoraLimite }),
    [cfg]
  );
  const multaPct = cfg?.multaPct ?? 50;

  // Filtro por estado (UF): quando escolhido, todas as métricas abaixo passam
  // a considerar só os leads daquele estado — reaproveita a mesma lógica que
  // já existe pra cada indicador, sem precisar duplicar nada.
  const stagesFiltrados = useMemo(() => {
    if (!estadoFiltro) return stages;
    return stages.map((s) => ({ ...s, contacts: (s.contacts || []).filter((c) => c.estado === estadoFiltro) }));
  }, [stages, estadoFiltro]);

  // Leads do estado filtrado, pra listar embaixo da tabela de resumo —
  // clicar num deles abre o mesmo modal de contato usado no Kanban/Chat.
  const leadsDoEstadoFiltro = useMemo(() => {
    if (!estadoFiltro) return [];
    const hoje = hojeStr();
    const out = [];
    for (const s of stagesFiltrados) {
      for (const c of s.contacts || []) {
        let situacao = "sem-cobranca";
        if (c.parcelas && c.parcelas.length > 0) {
          situacao = c.parcelas.some((p) => parcelaAtrasada(p, hoje)) ? "inadimplente" : "adimplente";
        }
        out.push({ id: c.id, name: c.name, phone: c.phone, stageName: s.name, situacao });
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [stagesFiltrados, estadoFiltro]);

  // Adimplência agrupada por um campo do contato (gênero ou tipo de cliente) —
  // reaproveitado pros dois gráficos abaixo, um donut por valor do grupo.
  function agruparAdimplencia(campo, rotulos) {
    const hoje = hojeStr();
    const map = new Map();
    for (const s of stages) {
      for (const c of s.contacts || []) {
        if (!c.parcelas || c.parcelas.length === 0) continue; // só quem tem empréstimo ativo
        const chave = c[campo] || "outros";
        if (!map.has(chave)) map.set(chave, { chave, adimplentes: 0, inadimplentes: 0 });
        const row = map.get(chave);
        const temAtrasada = c.parcelas.some((p) => parcelaAtrasada(p, hoje));
        if (temAtrasada) row.inadimplentes++; else row.adimplentes++;
      }
    }
    return Array.from(map.values())
      .map((r) => ({ ...r, label: rotulos[r.chave] || r.chave }))
      .sort((a, b) => (b.adimplentes + b.inadimplentes) - (a.adimplentes + a.inadimplentes));
  }

  const GENERO_LABEL = { masculino: "Masculino", feminino: "Feminino", outros: "Não identificado" };
  const TIPO_CLIENTE_LABEL = { motoboy: "Motoboy", uber: "Uber", comerciante: "Comerciante", outros: "Não identificado" };

  const adimplenciaPorGenero = useMemo(() => agruparAdimplencia("genero", GENERO_LABEL), [stages]);
  const adimplenciaPorTipoCliente = useMemo(() => agruparAdimplencia("tipoCliente", TIPO_CLIENTE_LABEL), [stages]);

  // Lista de UFs presentes na base, pro seletor (só mostra o que existe).
  const ufsDisponiveis = useMemo(() => {
    const set = new Set();
    for (const s of stages) for (const c of s.contacts || []) if (c.estado) set.add(c.estado);
    return Array.from(set).sort();
  }, [stages]);

  // Resumo por estado — sempre com TODOS os leads (ignora o filtro acima),
  // pra comparar os estados lado a lado numa tabela só.
  const porEstado = useMemo(() => {
    const hoje = hojeStr();
    const map = new Map();
    for (const s of stages) {
      for (const c of s.contacts || []) {
        const uf = c.estado || "Não identificado";
        if (!map.has(uf)) map.set(uf, { uf, leads: 0, emRecebimento: 0, adimplentes: 0, inadimplentes: 0 });
        const row = map.get(uf);
        row.leads++;
        if (s.name === "Recebimento") row.emRecebimento++;
        if (c.parcelas && c.parcelas.length > 0) {
          const temAtrasada = c.parcelas.some((p) => parcelaAtrasada(p, hoje));
          if (temAtrasada) row.inadimplentes++; else row.adimplentes++;
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.leads - a.leads);
  }, [stages]);

  function aplicarPreset(p) {
    setPreset(p.key);
    const [a, b] = p.range();
    setIni(a);
    setFim(b);
  }

  const receber = useMemo(() => aReceber(stagesFiltrados, multaOpts), [stagesFiltrados, multaOpts]);
  const recebido = useMemo(() => totalRecebido(stagesFiltrados, ini, fim), [stagesFiltrados, ini, fim]);
  const inad = useMemo(() => inadimplenciaCravo(stagesFiltrados), [stagesFiltrados]);

  // Funil: quantos leads em cada etapa do Kanban (usa a cor já configurada na coluna).
  const funilData = useMemo(
    () => stagesFiltrados.map((s) => ({ label: s.name, value: (s.contacts || []).length, color: s.color || "#64748b" })),
    [stagesFiltrados]
  );

  // Adimplência: entre os clientes com empréstimo ativo (têm parcelas), quantos
  // têm alguma parcela vencida e não paga agora (inadimplente) vs nenhuma (adimplente).
  const { adimplentes, inadimplentes } = useMemo(() => {
    const hoje = hojeStr();
    let ad = 0, inad = 0;
    for (const s of stagesFiltrados) {
      for (const c of s.contacts || []) {
        if (!c.parcelas || c.parcelas.length === 0) continue;
        const temAtrasada = c.parcelas.some((p) => parcelaAtrasada(p, hoje));
        if (temAtrasada) inad++; else ad++;
      }
    }
    return { adimplentes: ad, inadimplentes: inad };
  }, [stagesFiltrados]);

  // Em qual parcela o cliente parou de pagar: menor número de parcela vencida
  // e não paga (a partir dela ele deixou de honrar as cobranças em sequência).
  // Só considera quem está com atraso ativo agora.
  const paradaData = useMemo(() => {
    const hoje = hojeStr();
    const counts = Array.from({ length: NUM_PARCELAS }, () => 0);
    for (const s of stagesFiltrados) {
      for (const c of s.contacts || []) {
        const atrasadas = (c.parcelas || []).filter((p) => parcelaAtrasada(p, hoje));
        if (atrasadas.length === 0) continue;
        const stopAt = Math.min(...atrasadas.map((p) => p.number));
        if (stopAt >= 1 && stopAt <= NUM_PARCELAS) counts[stopAt - 1]++;
      }
    }
    return counts.map((v, i) => ({ label: `${i + 1}ª`, value: v }));
  }, [stagesFiltrados]);

  // A receber por parcela: quantas parcelas em aberto (não pagas, de qualquer
  // vencimento) existem de cada número — 1ª, 2ª, 3ª... — e a soma de cada uma.
  const receberPorParcelaData = useMemo(() => {
    const counts = Array.from({ length: NUM_PARCELAS }, () => 0);
    const valores = Array.from({ length: NUM_PARCELAS }, () => 0);
    for (const s of stagesFiltrados) {
      for (const c of s.contacts || []) {
        for (const p of c.parcelas || []) {
          if (p.paid) continue;
          if (p.number < 1 || p.number > NUM_PARCELAS) continue;
          counts[p.number - 1]++;
          valores[p.number - 1] += p.amount;
        }
      }
    }
    return counts.map((v, i) => ({ label: `${i + 1}ª`, value: v, valor: valores[i] }));
  }, [stagesFiltrados]);

  // Payback por cliente: quanto foi liberado (capital), quanto já voltou
  // (soma das parcelas pagas) e em quantos dias o capital foi recuperado
  // (data em que a soma acumulada dos pagamentos atingiu o capital enviado,
  // contando a partir da liberação). Considera todas as parcelas de todos os
  // ciclos — se o cliente renovou, o "voltou" já inclui os ciclos seguintes.
  const paybackData = useMemo(() => {
    const out = [];
    for (const s of stagesFiltrados) {
      for (const c of s.contacts || []) {
        if (!c.valorCapital || !c.pagamentoCapital) continue;
        const pagas = (c.parcelas || [])
          .filter((p) => p.paid && p.paidAt)
          .slice()
          .sort((a, b) => new Date(a.paidAt) - new Date(b.paidAt));
        const recuperado = pagas.reduce((sum, p) => sum + (p.amountPago ?? p.amount), 0);
        let diasPayback = null;
        let acumulado = 0;
        const inicio = new Date(c.pagamentoCapital);
        for (const p of pagas) {
          acumulado += p.amountPago ?? p.amount;
          if (acumulado >= c.valorCapital) {
            diasPayback = Math.max(0, Math.round((new Date(p.paidAt) - inicio) / 86400000));
            break;
          }
        }
        out.push({
          id: c.id,
          name: c.name,
          capital: c.valorCapital,
          recuperado,
          pctRecuperado: c.valorCapital > 0 ? Math.min(100, Math.round((recuperado / c.valorCapital) * 100)) : 0,
          diasPayback,
        });
      }
    }
    return out.sort((a, b) => b.capital - a.capital);
  }, [stagesFiltrados]);

  const paybackStats = useMemo(() => {
    const recuperados = paybackData.filter((d) => d.diasPayback != null);
    const mediaDias = recuperados.length
      ? Math.round(recuperados.reduce((s, d) => s + d.diasPayback, 0) / recuperados.length)
      : null;
    const totalCapital = paybackData.reduce((s, d) => s + d.capital, 0);
    const totalRecuperado = paybackData.reduce((s, d) => s + d.recuperado, 0);
    return {
      mediaDias,
      qtdRecuperados: recuperados.length,
      totalClientes: paybackData.length,
      totalCapital,
      totalRecuperado,
    };
  }, [paybackData]);

  // Distribuição do tempo de payback em faixas, pra virar gráfico de colunas.
  const paybackBuckets = useMemo(() => {
    const faixas = [
      { label: "≤5d", test: (d) => d <= 5 },
      { label: "6-10d", test: (d) => d > 5 && d <= 10 },
      { label: "11-20d", test: (d) => d > 10 && d <= 20 },
      { label: ">20d", test: (d) => d > 20 },
    ];
    const counts = faixas.map(() => 0);
    let naoRecuperado = 0;
    for (const d of paybackData) {
      if (d.diasPayback == null) {
        naoRecuperado++;
        continue;
      }
      const idx = faixas.findIndex((f) => f.test(d.diasPayback));
      if (idx >= 0) counts[idx]++;
    }
    return [...faixas.map((f, i) => ({ label: f.label, value: counts[i] })), { label: "Ainda não", value: naoRecuperado }];
  }, [paybackData]);

  // LTV: total já recebido de cada cliente, somando TODAS as parcelas pagas
  // de TODOS os ciclos (empréstimo original + renovações) — o quanto aquele
  // cliente já gerou de receita desde que virou lead.
  const ltvData = useMemo(() => {
    const out = [];
    for (const s of stagesFiltrados) {
      for (const c of s.contacts || []) {
        const total = (c.parcelas || []).filter((p) => p.paid).reduce((sum, p) => sum + (p.amountPago ?? p.amount), 0);
        if (total > 0) out.push({ id: c.id, name: c.name, ltv: total, ciclos: c.cicloAtual || 1 });
      }
    }
    return out.sort((a, b) => b.ltv - a.ltv);
  }, [stagesFiltrados]);

  const ltvStats = useMemo(() => {
    if (!ltvData.length) return { media: 0, total: 0, qtd: 0 };
    const total = ltvData.reduce((s, d) => s + d.ltv, 0);
    return { media: total / ltvData.length, total, qtd: ltvData.length };
  }, [ltvData]);

  const ltvTop10 = useMemo(
    () => ltvData.slice(0, 10).map((d) => ({ label: d.name, value: Math.round(d.ltv * 100) / 100, color: "#7c3aed" })),
    [ltvData]
  );

  // Novos indicadores
  const { novasVendas, renovacoes } = useMemo(() => {
    const all = stagesFiltrados.flatMap((s) => s.contacts || []);
    const nv = all.filter((c) => {
      if (!c.createdAt) return false;
      const d = new Date(c.createdAt).toLocaleDateString("en-CA");
      return d >= ini && d <= fim;
    }).length;
    const ren = all.filter((c) => (c.cicloAtual || 1) > 1).length;
    return { novasVendas: nv, renovacoes: ren };
  }, [stagesFiltrados, ini, fim]);

  if (loading) return <div className="p-6 text-slate-400">Carregando relatórios…</div>;

  return (
    <div className="flex-1 overflow-y-auto thin-scroll p-3 md:p-6 space-y-4 md:space-y-6 max-w-5xl">
      {/* Filtro por estado — afeta todas as métricas abaixo */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-400">Estado:</span>
        <button
          onClick={() => setEstadoFiltro("")}
          className={`text-xs rounded-full px-3 py-1 border transition-colors ${
            estadoFiltro === "" ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
          }`}
        >
          Todos
        </button>
        {ufsDisponiveis.map((uf) => (
          <button
            key={uf}
            onClick={() => setEstadoFiltro(uf)}
            className={`text-xs rounded-full px-3 py-1 border transition-colors ${
              estadoFiltro === uf ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
            }`}
          >
            {uf}
          </button>
        ))}
      </div>

      {/* Indicadores gerais */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Visão geral</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs text-slate-400">Novas vendas (período)</p>
            <p className="text-2xl font-semibold mt-1 text-violet-600">{novasVendas}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs text-slate-400">Renovações (leads com ciclo &gt; 1)</p>
            <p className="text-2xl font-semibold mt-1 text-amber-600">{renovacoes}</p>
          </div>
        </div>
      </section>

      {/* A receber */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">A receber</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <Card titulo="Hoje" valor={receber.dia} cor="emerald" />
          <Card titulo="Esta semana" valor={receber.semana} cor="sky" />
          <Card titulo="Este mês" valor={receber.mes} cor="violet" />
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Parcelas em aberto que vencem de hoje até o fim de cada período (já com multa de {multaPct}% nas vencidas).
        </p>
      </section>

      {/* Total recebido por período */}
      <section>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <h2 className="text-sm font-semibold text-slate-700">Total recebido</h2>
          <div className="flex items-center gap-1.5 flex-wrap">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => aplicarPreset(p)}
                className={`text-xs rounded-full px-3 py-1 border transition-colors ${
                  preset === p.key
                    ? "bg-slate-800 text-white border-slate-800"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                }`}
              >
                {p.label}
              </button>
            ))}
            <input
              type="date"
              value={ini}
              onChange={(e) => { setPreset("custom"); setIni(e.target.value); }}
              className="text-xs border border-slate-200 rounded px-2 py-1 outline-none focus:border-emerald-400"
            />
            <span className="text-xs text-slate-400">até</span>
            <input
              type="date"
              value={fim}
              onChange={(e) => { setPreset("custom"); setFim(e.target.value); }}
              className="text-xs border border-slate-200 rounded px-2 py-1 outline-none focus:border-emerald-400"
            />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-3xl font-semibold text-emerald-600">{money(recebido)}</p>
          <p className="text-xs text-slate-400 mt-1">
            Recebido entre {ini} e {fim} (parcelas baixadas no período).
          </p>
        </div>
      </section>

      {/* Inadimplência (Cravo) */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">
          Inadimplência <span className="text-slate-400 font-normal">— leads em Cravo ({inad.clientes})</span>
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <Card titulo="Pendente em capital" valor={inad.pendenteCapital} cor="red" />
          <Card titulo="Pendente total (com honorários)" valor={inad.pendenteTotal} cor="red" />
        </div>
      </section>

      {/* Resumo por estado — comparação lado a lado, independente do filtro acima */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Resumo por estado</h2>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {porEstado.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 px-5">Nenhum lead cadastrado.</p>
          ) : (
            <>
              {/* Desktop/tablet: tabela completa */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm min-w-[660px]">
                  <thead>
                    <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                      <th className="py-2.5 px-4 font-medium">Estado</th>
                      <th className="py-2.5 px-3 font-medium text-right">Leads</th>
                      <th className="py-2.5 px-3 font-medium text-right">Em Recebimento</th>
                      <th className="py-2.5 px-3 font-medium text-right">% Conversão</th>
                      <th className="py-2.5 px-3 font-medium text-right">Adimplentes</th>
                      <th className="py-2.5 px-3 font-medium text-right">Inadimplentes</th>
                      <th className="py-2.5 px-4 font-medium text-right">% Inadimplência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porEstado.map((r) => {
                      const base = r.adimplentes + r.inadimplentes;
                      const pctInad = base > 0 ? Math.round((r.inadimplentes / base) * 100) : 0;
                      const pctConversao = r.leads > 0 ? Math.round((r.emRecebimento / r.leads) * 100) : 0;
                      return (
                        <tr
                          key={r.uf}
                          className={`border-b border-slate-50 last:border-0 hover:bg-slate-50/60 cursor-pointer ${estadoFiltro === r.uf ? "bg-emerald-50/60" : ""}`}
                          onClick={() => setEstadoFiltro(r.uf === "Não identificado" ? "" : estadoFiltro === r.uf ? "" : r.uf)}
                        >
                          <td className="py-2 px-4 font-medium text-slate-700">{r.uf}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-slate-600">{r.leads}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-slate-600">{r.emRecebimento}</td>
                          <td className="py-2 px-3 text-right tabular-nums font-medium text-violet-600">
                            {r.leads > 0 ? `${pctConversao}%` : "—"}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums text-emerald-600">{r.adimplentes}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-red-500">{r.inadimplentes}</td>
                          <td className={`py-2 px-4 text-right tabular-nums font-medium ${pctInad >= 50 ? "text-red-600" : pctInad >= 25 ? "text-amber-600" : "text-slate-500"}`}>
                            {base > 0 ? `${pctInad}%` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile: cards empilhados (a tabela de 7 colunas não cabe numa tela estreita) */}
              <div className="sm:hidden divide-y divide-slate-50">
                {porEstado.map((r) => {
                  const base = r.adimplentes + r.inadimplentes;
                  const pctInad = base > 0 ? Math.round((r.inadimplentes / base) * 100) : 0;
                  const pctConversao = r.leads > 0 ? Math.round((r.emRecebimento / r.leads) * 100) : 0;
                  return (
                    <button
                      key={r.uf}
                      type="button"
                      onClick={() => setEstadoFiltro(r.uf === "Não identificado" ? "" : estadoFiltro === r.uf ? "" : r.uf)}
                      className={`w-full text-left px-4 py-3 ${estadoFiltro === r.uf ? "bg-emerald-50/60" : "hover:bg-slate-50/60"}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-700 text-sm">{r.uf}</span>
                        <span className="text-xs text-slate-400">{r.leads} lead{r.leads === 1 ? "" : "s"} · {r.emRecebimento} em Recebimento</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-1.5 text-xs">
                        <div>
                          <span className="text-slate-400 block">Conversão</span>
                          <span className="font-medium text-violet-600">{r.leads > 0 ? `${pctConversao}%` : "—"}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Adimplentes</span>
                          <span className="font-medium text-emerald-600">{r.adimplentes}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Inadimplência</span>
                          <span className={`font-medium ${pctInad >= 50 ? "text-red-600" : pctInad >= 25 ? "text-amber-600" : "text-slate-500"}`}>
                            {r.inadimplentes} {base > 0 ? `(${pctInad}%)` : ""}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <p className="text-[11px] text-slate-400 mt-1">Clique numa linha pra filtrar as métricas acima só por aquele estado.</p>

        {estadoFiltro && (
          <div className="mt-3">
            <h3 className="text-xs font-semibold text-slate-500 mb-1.5">
              Leads em {estadoFiltro} <span className="font-normal text-slate-400">({leadsDoEstadoFiltro.length})</span>
            </h3>
            <div className="bg-white rounded-xl border border-slate-200 max-h-80 overflow-y-auto thin-scroll divide-y divide-slate-50">
              {leadsDoEstadoFiltro.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setOpenContactId(c.id)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50/80 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-700 truncate">{c.name}</p>
                    <p className="text-xs text-slate-400 truncate">{c.phone || "sem telefone"} · {c.stageName}</p>
                  </div>
                  <span
                    className={`text-[10px] font-medium rounded-full px-2 py-0.5 shrink-0 ${
                      c.situacao === "inadimplente"
                        ? "bg-red-50 text-red-600"
                        : c.situacao === "adimplente"
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {c.situacao === "inadimplente" ? "Inadimplente" : c.situacao === "adimplente" ? "Adimplente" : "Sem cobrança"}
                  </span>
                </button>
              ))}
              {leadsDoEstadoFiltro.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-6">Nenhum lead nesse estado.</p>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Funil: leads por etapa */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Funil — leads por etapa</h2>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          {funilData.length === 0 || funilData.every((d) => d.value === 0) ? (
            <p className="text-sm text-slate-400 py-4">Nenhum lead cadastrado.</p>
          ) : (
            <HBarChart data={funilData} />
          )}
        </div>
      </section>

      {/* Adimplência vs inadimplência */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Adimplência</h2>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          {adimplentes + inadimplentes === 0 ? (
            <p className="text-sm text-slate-400 py-4">Nenhum cliente com empréstimo ativo.</p>
          ) : (
            <DonutChart
              data={[
                { label: "Adimplentes", value: adimplentes, color: "#059669" },
                { label: "Inadimplentes", value: inadimplentes, color: "#ef4444" },
              ]}
            />
          )}
        </div>
      </section>

      {/* Adimplência por gênero */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Adimplência por gênero</h2>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          {adimplenciaPorGenero.length === 0 ? (
            <p className="text-sm text-slate-400 py-4">Nenhum cliente com empréstimo ativo.</p>
          ) : (
            <div className="flex flex-wrap gap-6">
              {adimplenciaPorGenero.map((g) => (
                <div key={g.chave}>
                  <p className="text-xs font-medium text-slate-500 mb-2">{g.label}</p>
                  <DonutChart
                    size={110}
                    strokeWidth={18}
                    data={[
                      { label: "Adimplentes", value: g.adimplentes, color: "#059669" },
                      { label: "Inadimplentes", value: g.inadimplentes, color: "#ef4444" },
                    ]}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Adimplência por tipo de cliente */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Adimplência por tipo de cliente</h2>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          {adimplenciaPorTipoCliente.length === 0 ? (
            <p className="text-sm text-slate-400 py-4">Nenhum cliente com empréstimo ativo.</p>
          ) : (
            <div className="flex flex-wrap gap-6">
              {adimplenciaPorTipoCliente.map((g) => (
                <div key={g.chave}>
                  <p className="text-xs font-medium text-slate-500 mb-2">{g.label}</p>
                  <DonutChart
                    size={110}
                    strokeWidth={18}
                    data={[
                      { label: "Adimplentes", value: g.adimplentes, color: "#059669" },
                      { label: "Inadimplentes", value: g.inadimplentes, color: "#ef4444" },
                    ]}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Em qual parcela o cliente parou de pagar */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">
          Parcela em que o cliente parou de pagar <span className="text-slate-400 font-normal">— clientes em atraso agora</span>
        </h2>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          {paradaData.every((d) => d.value === 0) ? (
            <p className="text-sm text-slate-400 py-4">Nenhum cliente em atraso no momento.</p>
          ) : (
            <VBarChart data={paradaData} color="#f59e0b" />
          )}
        </div>
      </section>

      {/* A receber por número de parcela */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">
          A receber por parcela <span className="text-slate-400 font-normal">— quantas parcelas em aberto de cada número</span>
        </h2>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          {receberPorParcelaData.every((d) => d.value === 0) ? (
            <p className="text-sm text-slate-400 py-4">Nenhuma parcela em aberto.</p>
          ) : (
            <VBarChart
              data={receberPorParcelaData}
              color="#0284c7"
              tooltip={(d) => `${d.label} parcela: ${d.value} em aberto — ${money(d.valor)}`}
            />
          )}
        </div>
      </section>

      {/* Payback: quanto foi liberado, quanto voltou e em quantos dias */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">
          Payback dos clientes <span className="text-slate-400 font-normal">— o que foi liberado, quanto voltou e em quanto tempo</span>
        </h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <Card titulo="Capital enviado" valor={paybackStats.totalCapital} cor="violet" />
          <Card titulo="Capital recuperado" valor={paybackStats.totalRecuperado} cor="emerald" />
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs text-slate-400">Payback médio</p>
            <p className="text-2xl font-semibold mt-1 text-sky-600">
              {paybackStats.mediaDias != null ? `${paybackStats.mediaDias} dia${paybackStats.mediaDias === 1 ? "" : "s"}` : "—"}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              {paybackStats.qtdRecuperados} de {paybackStats.totalClientes} clientes já recuperaram o capital
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 mt-4">
          {paybackData.length === 0 ? (
            <p className="text-sm text-slate-400 py-4">Nenhum cliente com capital liberado ainda.</p>
          ) : (
            <VBarChart
              data={paybackBuckets}
              color="#0ea5e9"
              tooltip={(d) => `${d.label}: ${d.value} cliente${d.value === 1 ? "" : "s"}`}
            />
          )}
        </div>

        {paybackData.length > 0 && (
          <div className="mt-3">
            <h3 className="text-xs font-semibold text-slate-500 mb-1.5">Por cliente</h3>
            <div className="bg-white rounded-xl border border-slate-200 max-h-80 overflow-y-auto thin-scroll divide-y divide-slate-50">
              {paybackData.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setOpenContactId(d.id)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50/80 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-700 truncate">{d.name}</p>
                    <p className="text-xs text-slate-400 truncate">
                      Enviou {money(d.capital)} · Voltou {money(d.recuperado)} ({d.pctRecuperado}%)
                    </p>
                  </div>
                  <span
                    className={`text-[10px] font-medium rounded-full px-2 py-0.5 shrink-0 ${
                      d.diasPayback != null ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                    }`}
                  >
                    {d.diasPayback != null ? `${d.diasPayback}d` : "Em aberto"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* LTV: valor total já gerado por cada cliente (todos os ciclos) */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">
          LTV dos clientes <span className="text-slate-400 font-normal">— total já recebido de cada um, somando todos os ciclos</span>
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <Card titulo="LTV médio por cliente" valor={ltvStats.media} cor="violet" />
          <Card titulo="Total já recebido" valor={ltvStats.total} cor="emerald" />
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 mt-4">
          {ltvTop10.length === 0 ? (
            <p className="text-sm text-slate-400 py-4">Nenhum recebimento registrado ainda.</p>
          ) : (
            <>
              <p className="text-xs text-slate-400 mb-2">Top 10 clientes por LTV</p>
              <HBarChart data={ltvTop10} valueFmt={money} />
            </>
          )}
        </div>
      </section>

      {openContactId && (
        <ContactModal
          contactId={openContactId}
          onClose={() => setOpenContactId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

const CORES = {
  emerald: "text-emerald-600",
  sky: "text-sky-600",
  violet: "text-violet-600",
  red: "text-red-500",
};

function Card({ titulo, valor, cor }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <p className="text-xs text-slate-400">{titulo}</p>
      <p className={`text-2xl font-semibold mt-1 ${CORES[cor] || "text-slate-700"}`}>{money(valor)}</p>
    </div>
  );
}

/* ---------------- Gráficos (SVG/CSS leves, sem lib externa) ---------------- */

// Barras horizontais — boa pra rótulos longos (nomes de etapa do funil).
function HBarChart({ data, valueFmt }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const fmt = valueFmt || ((v) => v);
  return (
    <div className="space-y-2.5">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="w-20 sm:w-28 shrink-0 text-xs text-slate-600 truncate" title={d.label}>
            {d.label}
          </span>
          <div className="flex-1 h-4 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{ width: `${Math.max(d.value > 0 ? 3 : 0, (d.value / max) * 100)}%`, background: d.color }}
              title={`${d.label}: ${fmt(d.value)}`}
            />
          </div>
          <span className="w-20 shrink-0 text-xs text-slate-500 text-right tabular-nums">{fmt(d.value)}</span>
        </div>
      ))}
    </div>
  );
}

// Colunas verticais — pra sequência ordinal (1ª, 2ª, 3ª parcela...).
function VBarChart({ data, color = "#7c3aed", height = 160, tooltip }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const [hover, setHover] = useState(null);
  const tooltipFor = tooltip || ((d) => `${d.label} parcela: ${d.value} cliente${d.value === 1 ? "" : "s"}`);
  return (
    <div className="flex items-end gap-1.5 sm:gap-2.5" style={{ height: height + 34 }}>
      {data.map((d, i) => {
        const h = d.value > 0 ? Math.max(6, Math.round((d.value / max) * height)) : 0;
        return (
          <div
            key={i}
            className="flex-1 flex flex-col items-center justify-end h-full relative min-w-0"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            {hover === i && (
              <div className="absolute -top-1 -translate-y-full bg-slate-800 text-white text-[11px] rounded px-1.5 py-0.5 whitespace-nowrap z-10">
                {tooltipFor(d)}
              </div>
            )}
            <span className="text-[11px] text-slate-500 tabular-nums mb-1 h-4">{d.value > 0 ? d.value : ""}</span>
            <div
              className="w-full rounded-t-[4px]"
              style={{ height: h, background: color, maxWidth: 28, opacity: hover === null || hover === i ? 1 : 0.55, transition: "opacity .15s" }}
            />
            <span className="text-[10px] text-slate-400 mt-1.5 text-center truncate w-full">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// Donut de 2 (ou mais) categorias, com legenda + rótulo direto de valor/%.
function DonutChart({ data, size = 150, strokeWidth = 26 }) {
  const total = data.reduce((acc, d) => acc + d.value, 0) || 1;
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const [hover, setHover] = useState(null);
  let offset = 0;
  return (
    <div className="flex items-center gap-6 flex-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={strokeWidth} />
          {data
            .filter((d) => d.value > 0)
            .map((d, i) => {
              const frac = d.value / total;
              const dash = frac * c;
              const el = (
                <circle
                  key={i}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={d.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${Math.max(dash - 2, 0)} ${c - dash + 2}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="round"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  style={{ cursor: "pointer", opacity: hover === null || hover === i ? 1 : 0.45, transition: "opacity .15s" }}
                />
              );
              offset += dash;
              return el;
            })}
        </g>
        <text x="50%" y="47%" textAnchor="middle" className="fill-slate-700" style={{ fontSize: 22, fontWeight: 600 }}>
          {total}
        </text>
        <text x="50%" y="63%" textAnchor="middle" className="fill-slate-400" style={{ fontSize: 10 }}>
          cliente{total === 1 ? "" : "s"}
        </text>
      </svg>
      <ul className="space-y-2 text-xs">
        {data.map((d, i) => (
          <li
            key={i}
            className="flex items-center gap-2"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            style={{ opacity: hover === null || hover === i ? 1 : 0.55, transition: "opacity .15s" }}
          >
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
            <span className="text-slate-600">{d.label}</span>
            <span className="text-slate-400 tabular-nums">
              {d.value} ({Math.round((d.value / total) * 100)}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
