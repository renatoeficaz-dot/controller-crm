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

const LINHAS = [
  { chave: "entrou", nome: "Entrou (recebimento)", cor: "#10b981" },
  { chave: "soltou", nome: "Soltou (liberado)", cor: "#f59e0b" },
  { chave: "projetado", nome: "Soltou + juros (projeção)", cor: "#94a3b8", tracejada: true },
  { chave: "diferenca", nome: "Diferença (projeção − entrou)", cor: "#6366f1" },
];

// Gráfico de linha do período, dia a dia, com os MESMOS números do painel de Metas (recebimento e liberação): o que entrou, o que
// foi solto, quanto o solto deveria render com os juros e a diferença (soltou + juros − entrou). Diferença negativa = entrou mais do
// que a projeção; positiva = ficou faltando para chegar na projeção.
export default function GraficoEntrouSoltou({ ini, fim, honorariosPct = 30 }) {
  const [serie, setSerie] = useState(null);
  const [hover, setHover] = useState(null);

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
    const dias = (serie || []).map((d) => {
      const entrou = d.recebimentos || 0, soltou = d.liberado || 0, projetado = soltou * k;
      return { dia: d.dia, entrou: r2(entrou), soltou: r2(soltou), projetado: r2(projetado), diferenca: r2(projetado - entrou) };
    });
    const soma = (f) => r2(dias.reduce((t, d) => t + d[f], 0));
    return { dias, total: { entrou: soma("entrou"), soltou: soma("soltou"), projetado: soma("projetado"), diferenca: soma("diferenca") } };
  }, [serie, honorariosPct]);

  const W = 720, H = 260, ml = 52, mr = 12, mt = 12, mb = 28;
  const valores = dias.flatMap((d) => LINHAS.map((l) => d[l.chave]));
  const max = Math.max(1, ...valores);
  const min = Math.min(0, ...valores);
  const x = (i) => ml + (dias.length <= 1 ? (W - ml - mr) / 2 : (i * (W - ml - mr)) / (dias.length - 1));
  const y = (v) => mt + ((max - v) * (H - mt - mb)) / (max - min || 1);
  const ticks = [max, (max + min) / 2, min, 0].filter((v, i, a) => a.indexOf(v) === i);
  const passoRotulo = Math.max(1, Math.ceil(dias.length / 10));

  const cartoes = [
    { nome: "Entrou", v: total.entrou, cor: "text-emerald-600" },
    { nome: "Soltou", v: total.soltou, cor: "text-amber-600" },
    { nome: `Soltou + juros (+${honorariosPct}%)`, v: total.projetado, cor: "text-slate-700" },
    { nome: "Diferença (soltou + juros − entrou)", v: total.diferenca, cor: total.diferenca <= 0 ? "text-emerald-600" : "text-red-600", nota: total.diferenca <= 0 ? "entrou mais que a projeção" : "faltou para a projeção" },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        {cartoes.map((c) => (
          <div key={c.nome} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
            <p className="text-[11px] text-slate-400 leading-tight">{c.nome}</p>
            <p className={`text-sm font-semibold mt-0.5 ${c.cor}`}>{money(c.v)}</p>
            {c.nota && <p className="text-[10px] text-slate-400">{c.nota}</p>}
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
              <polyline
                key={l.chave}
                fill="none"
                stroke={l.cor}
                strokeWidth="2"
                strokeDasharray={l.tracejada ? "5 4" : undefined}
                strokeLinejoin="round"
                points={dias.map((d, i) => `${x(i)},${y(d[l.chave])}`).join(" ")}
              />
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
              <p>Entrou: {money(dias[hover].entrou)}</p>
              <p>Soltou: {money(dias[hover].soltou)}</p>
              <p>Soltou + juros: {money(dias[hover].projetado)}</p>
              <p>Diferença: {money(dias[hover].diferenca)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
