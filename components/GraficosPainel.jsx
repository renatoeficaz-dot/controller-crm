"use client";

import { useEffect, useState } from "react";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (m) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;
const rotuloSemana = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const brl = (n) => "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const brl2 = (n) => "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const curto = (n) => (Math.abs(n) >= 1000 ? `${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : String(Math.round(n)));
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function Card({ titulo, sub, children, notas }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-4">
      <h3 className="text-sm font-semibold text-slate-700">{titulo}</h3>
      {sub && <p className="text-[11px] text-slate-400 mb-3">{sub}</p>}
      {children}
      {notas && <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2 text-[11px] text-slate-500">{notas.map((n, i) => <span key={i}>{n}</span>)}</div>}
    </div>
  );
}

function Vazio() {
  return <p className="text-xs text-slate-400 py-6 text-center">Sem dados no período.</p>;
}

// Colunas agrupadas (uma por série) em SVG; o valor aparece ao passar o mouse e acima da coluna quando cabe.
function Colunas({ rotulos, series, fmt = brl, altura = 190 }) {
  const todos = series.flatMap((s) => s.valores);
  if (!todos.some((v) => v)) return <Vazio />;
  const W = 640, topo = 18, base = altura - 24, max = Math.max(1, ...todos.map((v) => Math.abs(v)));
  const grupo = (W - 16) / rotulos.length;
  const larg = Math.min(34, (grupo - 8) / series.length);
  return (
    <>
      <svg viewBox={`0 0 ${W} ${altura}`} className="w-full" role="img">
        <line x1="8" x2={W - 8} y1={base} y2={base} stroke="#e2e8f0" />
        {rotulos.map((r, i) => {
          const x0 = 8 + i * grupo + (grupo - larg * series.length) / 2;
          return (
            <g key={r}>
              {series.map((s, k) => {
                const v = s.valores[i] || 0;
                const h = (Math.abs(v) / max) * (base - topo);
                const x = x0 + k * larg;
                return (
                  <g key={s.nome}>
                    <rect x={x} y={v >= 0 ? base - h : base} width={larg - 2} height={Math.max(h, v ? 1 : 0)} rx="2" fill={s.cor}><title>{`${s.nome} · ${r}: ${fmt(v)}`}</title></rect>
                    {rotulos.length <= 8 && series.length <= 2 && v !== 0 && <text x={x + (larg - 2) / 2} y={(v >= 0 ? base - h : base + h) - 3} textAnchor="middle" fontSize="10" fill="#64748b">{curto(v)}</text>}
                  </g>
                );
              })}
              <text x={8 + i * grupo + grupo / 2} y={altura - 7} textAnchor="middle" fontSize="10.5" fill="#94a3b8">{r}</text>
            </g>
          );
        })}
      </svg>
      {series.length > 1 && (
        <div className="flex gap-3 text-[11px] text-slate-500 mt-1">{series.map((s) => <span key={s.nome} className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-full inline-block" style={{ background: s.cor }} />{s.nome}</span>)}</div>
      )}
    </>
  );
}

function BarrasH({ itens, fmt = brl, cor = "#10b981" }) {
  if (!itens.length) return <Vazio />;
  const max = Math.max(1, ...itens.map((i) => i.valor));
  return (
    <div className="space-y-2">
      {itens.map((i) => (
        <div key={i.nome} className="flex items-center gap-2.5">
          <span className="w-24 shrink-0 text-xs text-slate-600 truncate" title={i.nome}>{i.nome}</span>
          <div className="flex-1 h-3.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.max(2, (i.valor / max) * 100)}%`, background: cor }} title={`${i.nome}: ${fmt(i.valor)}`} /></div>
          <span className="w-24 shrink-0 text-xs text-slate-500 text-right tabular-nums">{fmt(i.valor)}</span>
        </div>
      ))}
    </div>
  );
}

function Calor({ calor }) {
  if (!calor || !calor.max) return <Vazio />;
  const horas = Array.from({ length: 24 }, (_, h) => h);
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[520px]">
        <div className="grid gap-px" style={{ gridTemplateColumns: "34px repeat(24, minmax(0, 1fr))" }}>
          <span />
          {horas.map((h) => <span key={h} className="text-[9px] text-slate-400 text-center">{h % 3 === 0 ? h : ""}</span>)}
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <div key={d} className="contents">
              <span className="text-[10px] text-slate-500 pr-1 text-right leading-5">{DIAS[d]}</span>
              {horas.map((h) => {
                const v = calor.valor[d][h];
                return <span key={h} className="h-5 rounded-[3px]" style={{ background: v ? `rgba(16,185,129,${0.12 + 0.88 * (v / calor.max)})` : "#f1f5f9" }} title={`${DIAS[d]} ${String(h).padStart(2, "0")}h: ${brl(v)} em ${calor.qtd[d][h]} pagamento(s)`} />;
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Promessas({ itens }) {
  if (!itens.length) return <Vazio />;
  return (
    <div className="space-y-2.5">
      {itens.map((p) => {
        const t = Math.max(1, p.cumpridas + p.quebradas + p.pendentes);
        return (
          <div key={p.nome}>
            <div className="flex justify-between text-xs mb-0.5"><span className="text-slate-600">{p.nome}</span><span className="text-slate-400">{p.pctCumprido == null ? "em andamento" : `${p.pctCumprido}% cumpridas`}</span></div>
            <div className="flex h-3 rounded-full overflow-hidden bg-slate-100" title={`${p.cumpridas} cumpridas · ${p.quebradas} quebradas · ${p.pendentes} no prazo`}>
              <div style={{ width: `${(p.cumpridas / t) * 100}%` }} className="bg-emerald-500" />
              <div style={{ width: `${(p.quebradas / t) * 100}%` }} className="bg-red-500" />
              <div style={{ width: `${(p.pendentes / t) * 100}%` }} className="bg-slate-300" />
            </div>
          </div>
        );
      })}
      <div className="flex gap-3 text-[11px] text-slate-500"><span>verde: cumpridas</span><span>vermelho: quebradas</span><span>cinza: no prazo</span></div>
    </div>
  );
}

// 25) Meta do mês: realizado, meta até hoje e projeção de fechamento (linear pelos dias úteis).
function MetaDoMes({ resumo }) {
  const m = resumo?.mes;
  if (!m) return <Vazio />;
  const total = resumo.projecao?.mes?.diasUteisTotais || m.diasUteisCorridos || 1;
  const linhas = [
    { nome: "Recebimentos", real: m.recebimentosComMeta, meta: m.metaRecebimentos, ref: m.diasComMeta },
    { nome: "Liberação", real: m.liberadoUteis, meta: m.metaLiberacao, ref: m.diasUteisCorridos },
  ].filter((l) => l.meta > 0 && l.ref > 0);
  if (!linhas.length) return <Vazio />;
  return (
    <div className="space-y-4">
      {linhas.map((l) => {
        const proj = (l.real / l.ref) * total;
        const metaMes = (l.meta / l.ref) * total;
        const max = Math.max(proj, metaMes, l.real, 1);
        const barra = (v, cor, rot) => (
          <div className="flex items-center gap-2"><span className="w-24 text-[11px] text-slate-500 shrink-0">{rot}</span><div className="flex-1 h-3 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(v / max) * 100}%`, background: cor }} /></div><span className="w-24 text-xs text-slate-600 text-right tabular-nums">{brl(v)}</span></div>
        );
        return (
          <div key={l.nome} className="space-y-1.5">
            <p className="text-xs font-semibold text-slate-700">{l.nome} <span className="font-normal text-slate-400">· {l.real >= l.meta ? `${brl(l.real - l.meta)} acima da meta até hoje` : `faltam ${brl(l.meta - l.real)} para a meta até hoje`}</span></p>
            {barra(l.real, "#10b981", "Realizado")}
            {barra(l.meta, "#94a3b8", "Meta até hoje")}
            {barra(proj, "#0ea5e9", "Projeção do mês")}
            {barra(metaMes, "#cbd5e1", "Meta do mês")}
          </div>
        );
      })}
    </div>
  );
}

export default function GraficosPainel() {
  const [d, setD] = useState(null);
  const [comissao, setComissao] = useState([]);
  const [etapas, setEtapas] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [negado, setNegado] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch("/api/relatorios/graficos").then((r) => { if (r.status === 403) { setNegado(true); return null; } return r.ok ? r.json() : null; }).then((j) => vivo && j && setD(j)).catch(() => {});
    fetch("/api/comissao-metas").then((r) => (r.ok ? r.json() : [])).then((j) => vivo && setComissao(Array.isArray(j) ? j : [])).catch(() => {});
    fetch("/api/relatorios/tempo-etapas").then((r) => (r.ok ? r.json() : [])).then((j) => vivo && setEtapas(Array.isArray(j) ? j : [])).catch(() => {});
    fetch("/api/metas/resumo").then((r) => (r.ok ? r.json() : null)).then((j) => vivo && setResumo(j)).catch(() => {});
    return () => { vivo = false; };
  }, []);

  if (negado) return null;
  if (!d) return <p className="text-xs text-slate-400 py-4">Carregando gráficos…</p>;
  const m = d.meses.map(rotuloMes);
  const pctMedioRec = d.recuperacao.length ? Math.round(d.recuperacao.reduce((s, x) => s + x.pct, 0) / d.recuperacao.length) : 0;
  const ultAtraso = d.atraso[d.atraso.length - 1];

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-slate-700">Gráficos</h2>
        <p className="text-[11px] text-slate-400">Últimos 6 meses e 12 semanas. Passe o mouse nas colunas para ver o valor exato.</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Card titulo="Carteira e atraso no fim de cada mês" sub="Capital em Recebimento (pelo histórico de etapas) e parcelas vencidas ainda em aberto">
          <Colunas rotulos={m} series={[{ nome: "Capital em Recebimento", cor: "#0ea5e9", valores: d.carteira.map((x) => x.carteira) }, { nome: "Vencido em aberto", cor: "#ef4444", valores: d.carteira.map((x) => x.atrasado) }]} />
        </Card>
        <Card titulo="Recuperação por semana" sub="O que entrou de parcelas que já estavam vencidas" notas={[`em média ${pctMedioRec}% do recebido da semana`]}>
          <Colunas rotulos={d.recuperacao.map((x) => rotuloSemana(x.semana))} series={[{ nome: "Recuperado", cor: "#f59e0b", valores: d.recuperacao.map((x) => x.recuperado) }]} />
        </Card>
        <Card titulo="Quando o dinheiro entra" sub="Valor recebido por dia da semana e hora (Brasília), últimos 6 meses"><Calor calor={d.calor} /></Card>
        <Card titulo="Resultado do mês" sub="Juros estimados pela taxa configurada, despesas lançadas e lucro">
          <Colunas rotulos={m} series={[{ nome: "Juros (estimado)", cor: "#10b981", valores: d.resultado.map((x) => x.juros) }, { nome: "Despesas", cor: "#ef4444", valores: d.resultado.map((x) => x.despesas) }, { nome: "Lucro", cor: "#0ea5e9", valores: d.resultado.map((x) => x.lucro) }]} />
        </Card>
        <Card titulo="Recebido por cobrador (mês atual)" sub="Quem deu a baixa"><BarrasH itens={d.rankingCobradores} /></Card>
        <Card titulo="Capital liberado por vendedor (mês atual)" sub="Responsável pelo cliente"><BarrasH itens={d.rankingVendedores} cor="#0ea5e9" /></Card>
        <Card titulo="Comissão por metas na semana" sub="Seg a sáb, fecha sábado às 17h"><BarrasH itens={comissao.map((c) => ({ nome: c.nome || "—", valor: c.totalSemana || 0 })).sort((a, b) => b.valor - a.valor)} fmt={brl2} cor="#8b5cf6" /></Card>
        <Card titulo="Ticket médio de empréstimo" sub="Capital liberado ÷ número de liberações" notas={d.ticket.map((x) => `${rotuloMes(x.mes)}: ${x.qtd} lib.`)}>
          <Colunas rotulos={m} series={[{ nome: "Ticket médio", cor: "#0ea5e9", valores: d.ticket.map((x) => x.ticket) }]} />
        </Card>
        <Card titulo="Clientes por ciclo de empréstimo" sub="Quantos chegaram a cada ciclo e que % renovou" notas={d.ciclos.filter((c) => c.pctRenovou != null && c.clientes > 0).map((c) => `${c.ciclo}º ciclo: ${c.pctRenovou}% renovaram`)}>
          <Colunas rotulos={d.ciclos.map((c) => `${c.ciclo}º`)} series={[{ nome: "Clientes", cor: "#8b5cf6", valores: d.ciclos.map((c) => c.clientes) }]} fmt={(v) => `${v} clientes`} />
        </Card>
        <Card titulo="Atraso médio dos pagamentos" sub="Dias de atraso nas parcelas pagas no mês" notas={ultAtraso ? [`${rotuloMes(ultAtraso.mes)}: ${ultAtraso.pctEmDia}% pagas em dia (${ultAtraso.n} parcelas)`] : []}>
          <Colunas rotulos={m} series={[{ nome: "Dias de atraso", cor: "#f59e0b", valores: d.atraso.map((x) => x.mediaDias) }]} fmt={(v) => `${v} dias`} />
        </Card>
        <Card titulo="Perdas (Cravo) por mês" sub="Capital dos clientes que viraram Cravo" notas={d.perdas.map((x) => `${rotuloMes(x.mes)}: ${x.clientes} cliente(s)`)}>
          <Colunas rotulos={m} series={[{ nome: "Capital perdido", cor: "#ef4444", valores: d.perdas.map((x) => x.valor) }]} />
        </Card>
        <Card titulo="Promessas de pagamento" sub="Cumprida = o cliente pagou até o fim do dia prometido"><Promessas itens={d.promessas} /></Card>
        <Card titulo="Tempo médio em cada etapa" sub="Dias que o cliente fica antes de mudar de coluna"><BarrasH itens={etapas.map((e) => ({ nome: e.etapa, valor: e.diasMedios }))} fmt={(v) => `${v} d`} cor="#64748b" /></Card>
        <Card titulo="Meta do mês" sub="Realizado, meta até hoje e projeção linear de fechamento"><MetaDoMes resumo={resumo} /></Card>
      </div>
    </section>
  );
}
