"use client";

import { useMemo, useState } from "react";
import { serieEntrouSoltou } from "@/lib/relatorios";

const money = (n) => "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const curto = (n) => {
  const v = Math.abs(n);
  const s = v >= 1000 ? (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "k" : String(Math.round(v));
  return (n < 0 ? "-" : "") + s;
};
const fmtDia = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const LINHAS = [
  { chave: "entrou", nome: "Entrou (recebido)", cor: "#10b981" },
  { chave: "soltou", nome: "Soltou (liberado)", cor: "#f59e0b" },
  { chave: "saldo", nome: "Saldo do dia (entrou − soltou)", cor: "#6366f1" },
  { chave: "projetado", nome: "Retorno projetado do que soltou (com juros)", cor: "#94a3b8", tracejada: true },
];

// Gráfico de linha do período: o que entrou (recebimentos) × o que foi solto (liberação), o saldo por dia (superávit/déficit) e quanto o
// que foi solto deve render com os juros. Os totais do período ficam nos cartões acima do gráfico.
export default function GraficoEntrouSoltou({ stages, ini, fim, honorariosPct = 30 }) {
  const { dias, total } = useMemo(() => serieEntrouSoltou(stages, ini, fim, honorariosPct), [stages, ini, fim, honorariosPct]);
  const [hover, setHover] = useState(null);

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
    { nome: total.saldo >= 0 ? "Superávit (entrou − soltou)" : "Déficit (entrou − soltou)", v: total.saldo, cor: total.saldo >= 0 ? "text-emerald-600" : "text-red-600" },
    { nome: `Retorno projetado do soltou (+${honorariosPct}%)`, v: total.projetado, cor: "text-slate-700" },
    { nome: "Juros projetados sobre o soltou", v: total.juros, cor: "text-indigo-600" },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
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

      {dias.length === 0 ? (
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
              <p>{dias[hover].saldo >= 0 ? "Superávit" : "Déficit"}: {money(dias[hover].saldo)}</p>
              <p>Projetado c/ juros: {money(dias[hover].projetado)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
