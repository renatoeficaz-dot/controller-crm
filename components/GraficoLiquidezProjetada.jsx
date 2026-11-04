"use client";

import { useEffect, useMemo, useState } from "react";

const money = (n) => "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const curto = (n) => {
  const v = Math.abs(n);
  const s = v >= 1000 ? (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "k" : String(Math.round(v));
  return (n < 0 ? "-" : "") + s;
};
const fmtDia = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const r2 = (n) => Math.round(n * 100) / 100;
const CHAVE = "liquidez-projetada-premissas";
const PADRAO = { comissaoPct: 6, cac: 40, operacional: 2000, operacionalModo: "mes", perdaPct: 15 };

const LINHAS = [
  { chave: "projetadoLiq", nome: "Retorno projetado (após perda)", cor: "#94a3b8", tracejada: true },
  { chave: "custos", nome: "Custos (comissão + CAC + operacional)", cor: "#ef4444" },
  { chave: "liquidez", nome: "Liquidez projetada do dia", cor: "#6366f1" },
  { chave: "acumulada", nome: "Liquidez acumulada", cor: "#10b981" },
];

// Liquidez projetada: do que foi SOLTO, quanto deve voltar (com os juros) já descontada a perda média, menos o que foi solto e menos
// os custos — comissão sobre o que ENTROU, CAC por cliente que entrou em Recebimento e custo operacional.
//   liquidez = soltou × (1 + juros) × (1 − perda) − soltou − comissão% × entrou − CAC × clientes − operacional
// (equivale a: saldo de caixa entrou − soltou, mais o que ainda falta voltar da projeção, menos os custos). Números de entrou/soltou/clientes
// vêm do mesmo lugar das Metas.
export default function GraficoLiquidezProjetada({ ini, fim, honorariosPct = 30 }) {
  const [serie, setSerie] = useState(null);
  const [hover, setHover] = useState(null);
  const [p, setP] = useState(PADRAO);

  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem(CHAVE) || "null"); if (s) setP({ ...PADRAO, ...s }); } catch {}
  }, []);
  function mudar(campo, valor) {
    const novo = { ...p, [campo]: valor };
    setP(novo);
    try { localStorage.setItem(CHAVE, JSON.stringify(novo)); } catch {}
  }

  useEffect(() => {
    let vivo = true;
    setSerie(null);
    fetch(`/api/metas/periodo?de=${ini}&ate=${fim}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (vivo) setSerie(d?.serie || []); })
      .catch(() => { if (vivo) setSerie([]); });
    return () => { vivo = false; };
  }, [ini, fim]);

  const { dias, total } = useMemo(() => {
    const k = 1 + (Number(honorariosPct) || 0) / 100;
    const num = (v) => Number(String(v).replace(",", ".")) || 0;
    const base = serie || [];
    const opDia = (dia) => {
      const v = num(p.operacional);
      if (p.operacionalModo === "dia") return v;
      if (p.operacionalModo === "periodo") return base.length ? v / base.length : 0;
      const [a, m] = dia.split("-").map(Number);
      return v / new Date(a, m, 0).getDate(); // custo mensal rateado pelos dias do mês
    };
    let acc = 0;
    const dias = base.map((d) => {
      const entrou = d.recebimentos || 0, soltou = d.liberado || 0, clientes = d.vendas || 0;
      const projetadoLiq = soltou * k * (1 - num(p.perdaPct) / 100);
      const comissao = (entrou * num(p.comissaoPct)) / 100;
      const cac = clientes * num(p.cac);
      const oper = opDia(d.dia);
      const custos = comissao + cac + oper;
      const liquidez = projetadoLiq - soltou - custos;
      acc += liquidez;
      return { dia: d.dia, entrou: r2(entrou), soltou: r2(soltou), clientes, projetadoLiq: r2(projetadoLiq), comissao: r2(comissao), cac: r2(cac), oper: r2(oper), custos: r2(custos), liquidez: r2(liquidez), acumulada: r2(acc) };
    });
    const soma = (f) => r2(dias.reduce((t, d) => t + d[f], 0));
    return {
      dias,
      total: { entrou: soma("entrou"), soltou: soma("soltou"), clientes: soma("clientes"), projetadoLiq: soma("projetadoLiq"), comissao: soma("comissao"), cac: soma("cac"), oper: soma("oper"), custos: soma("custos"), liquidez: soma("liquidez") },
    };
  }, [serie, honorariosPct, p]);

  const W = 720, H = 260, ml = 52, mr = 12, mt = 12, mb = 28;
  const valores = dias.flatMap((d) => LINHAS.map((l) => d[l.chave]));
  const max = Math.max(1, ...valores);
  const min = Math.min(0, ...valores);
  const x = (i) => ml + (dias.length <= 1 ? (W - ml - mr) / 2 : (i * (W - ml - mr)) / (dias.length - 1));
  const y = (v) => mt + ((max - v) * (H - mt - mb)) / (max - min || 1);
  const ticks = [max, (max + min) / 2, min, 0].filter((v, i, a) => a.indexOf(v) === i);
  const passoRotulo = Math.max(1, Math.ceil(dias.length / 10));

  const cartoes = [
    { nome: "Soltou", v: total.soltou, cor: "text-amber-600" },
    { nome: `Retorno projetado (+${honorariosPct}%, −${p.perdaPct}% de perda)`, v: total.projetadoLiq, cor: "text-slate-700" },
    { nome: `Comissão ${p.comissaoPct}% do que entrou (${money(total.entrou)})`, v: total.comissao, cor: "text-red-600" },
    { nome: `CAC: ${total.clientes} cliente${total.clientes === 1 ? "" : "s"} × ${money(Number(String(p.cac).replace(",", ".")) || 0)}`, v: total.cac, cor: "text-red-600" },
    { nome: "Custo operacional", v: total.oper, cor: "text-red-600" },
    { nome: "Liquidez projetada", v: total.liquidez, cor: total.liquidez >= 0 ? "text-emerald-600" : "text-red-600" },
  ];
  const campo = "w-16 text-xs border border-slate-200 rounded px-1.5 py-1 bg-white";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-3 text-[11px] text-slate-500">
        <label className="flex items-center gap-1">Comissão % <input value={p.comissaoPct} onChange={(e) => mudar("comissaoPct", e.target.value)} inputMode="decimal" className={campo} /></label>
        <label className="flex items-center gap-1">CAC R$ <input value={p.cac} onChange={(e) => mudar("cac", e.target.value)} inputMode="decimal" className={campo} /></label>
        <label className="flex items-center gap-1">Operacional R$ <input value={p.operacional} onChange={(e) => mudar("operacional", e.target.value)} inputMode="decimal" className="w-20 text-xs border border-slate-200 rounded px-1.5 py-1 bg-white" />
          <select value={p.operacionalModo} onChange={(e) => mudar("operacionalModo", e.target.value)} className="text-xs border border-slate-200 rounded px-1 py-1 bg-white">
            <option value="mes">por mês (rateado por dia)</option>
            <option value="dia">por dia</option>
            <option value="periodo">no período todo</option>
          </select>
        </label>
        <label className="flex items-center gap-1">Perda % <input value={p.perdaPct} onChange={(e) => mudar("perdaPct", e.target.value)} inputMode="decimal" className={campo} /></label>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
        {cartoes.map((c) => (
          <div key={c.nome} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
            <p className="text-[11px] text-slate-400 leading-tight">{c.nome}</p>
            <p className={`text-sm font-semibold mt-0.5 ${c.cor}`}>{money(c.v)}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
        {LINHAS.map((l) => (
          <span key={l.chave} className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="inline-block w-4 border-t-2" style={{ borderColor: l.cor, borderStyle: l.tracejada ? "dashed" : "solid" }} />
            {l.nome}
          </span>
        ))}
      </div>

      {serie === null ? (
        <p className="text-xs text-slate-400">Carregando…</p>
      ) : dias.length === 0 ? (
        <p className="text-xs text-slate-400">Sem dados no período.</p>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" onMouseLeave={() => setHover(null)}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={ml} x2={W - mr} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#cbd5e1" : "#f1f5f9"} strokeWidth="1" />
                <text x={ml - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="#94a3b8">{curto(t)}</text>
              </g>
            ))}
            {dias.map((d, i) => (i % passoRotulo === 0 ? <text key={d.dia} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="#94a3b8">{fmtDia(d.dia)}</text> : null))}
            {LINHAS.map((l) => (
              <polyline key={l.chave} fill="none" stroke={l.cor} strokeWidth="2" strokeDasharray={l.tracejada ? "5 4" : undefined} strokeLinejoin="round" points={dias.map((d, i) => `${x(i)},${y(d[l.chave])}`).join(" ")} />
            ))}
            {dias.map((d, i) => (
              <rect key={d.dia} x={x(i) - (W - ml - mr) / Math.max(1, dias.length - 1) / 2} y={mt} width={(W - ml - mr) / Math.max(1, dias.length - 1)} height={H - mt - mb} fill="transparent" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
            ))}
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={mt} y2={H - mb} stroke="#cbd5e1" strokeDasharray="3 3" />}
            {hover !== null && LINHAS.map((l) => <circle key={l.chave} cx={x(hover)} cy={y(dias[hover][l.chave])} r="3.5" fill={l.cor} />)}
          </svg>
          {hover !== null && (
            <div className="absolute top-1 right-1 rounded-lg bg-slate-800 text-white text-[11px] px-2.5 py-1.5 shadow-lg pointer-events-none">
              <p className="font-semibold">{fmtDia(dias[hover].dia)}</p>
              <p>Soltou: {money(dias[hover].soltou)} · Entrou: {money(dias[hover].entrou)}</p>
              <p>Retorno proj. (após perda): {money(dias[hover].projetadoLiq)}</p>
              <p>Comissão: {money(dias[hover].comissao)}</p>
              <p>CAC ({dias[hover].clientes}): {money(dias[hover].cac)}</p>
              <p>Operacional: {money(dias[hover].oper)}</p>
              <p className="font-semibold">Liquidez: {money(dias[hover].liquidez)}</p>
            </div>
          )}
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-400">
        Liquidez = soltou × (1 + juros) × (1 − perda) − soltou − comissão sobre o que entrou − CAC × clientes que entraram em Recebimento − custo operacional.
      </p>
    </div>
  );
}
