"use client";

import { useEffect, useState } from "react";
import Icone from "@/components/Icones";

const money = (n) => "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyCurto = (n) => {
  const v = Number(n || 0);
  const sinal = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  if (abs >= 1000) return sinal + "R$ " + (abs / 1000).toFixed(1).replace(".", ",") + "k";
  return sinal + "R$ " + abs.toFixed(0);
};

/* ---------------- 31. Fluxo de caixa projetado ---------------- */
function FluxoCaixa() {
  const [dados, setDados] = useState(null);
  const [dias, setDias] = useState(30);

  useEffect(() => {
    fetch(`/api/fluxo-caixa?dias=${dias}`).then((r) => r.json()).then(setDados).catch(() => {});
  }, [dias]);

  if (!dados) return <p className="text-sm text-slate-400">Carregando…</p>;

  const max = Math.max(...dados.serie.map((d) => Math.abs(d.saldoOtimista)), Math.abs(dados.saldoAtual), 1);
  const min = Math.min(...dados.serie.map((d) => d.saldoRealista), 0);
  const faixa = max - min || 1;
  const y = (v) => 100 - ((v - min) / faixa) * 100;

  const pathOtimista = dados.serie.map((d, i) => `${i === 0 ? "M" : "L"} ${(i / (dados.serie.length - 1)) * 100} ${y(d.saldoOtimista)}`).join(" ");
  const pathRealista = dados.serie.map((d, i) => `${i === 0 ? "M" : "L"} ${(i / (dados.serie.length - 1)) * 100} ${y(d.saldoRealista)}`).join(" ");

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5"><Icone nome="grafico" className="w-4 h-4" /> Fluxo de caixa projetado</h3>
          <p className="text-[11px] text-slate-400">Otimista = tudo que vence é pago no dia. Realista = aplica sua taxa histórica de {dados.taxaRealista}% pago em dia.</p>
        </div>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
          {[15, 30, 60].map((d) => (
            <button key={d} onClick={() => setDias(d)} className={`text-[11px] px-2.5 py-1 rounded-md ${dias === d ? "bg-white shadow-sm font-medium text-slate-700" : "text-slate-500"}`}>{d}d</button>
          ))}
        </div>
      </div>
      {dados.diaFicaNegativo && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 mt-2 flex items-center gap-1.5">
          <Icone nome="alerta" className="w-3.5 h-3.5 shrink-0" /> No cenário realista, o caixa fica negativo a partir de {new Date(dados.diaFicaNegativo + "T00:00:00Z").toLocaleDateString("pt-BR", { timeZone: "UTC" })}.
        </p>
      )}
      <div className="relative h-40 mt-3">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
          {min < 0 && <line x1="0" y1={y(0)} x2="100" y2={y(0)} stroke="#e2e8f0" strokeWidth="0.5" />}
          <path d={pathOtimista} fill="none" stroke="#a78bfa" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <path d={pathRealista} fill="none" stroke="#10b981" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-500">
        <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-violet-400 inline-block" /> Otimista</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-emerald-500 inline-block" /> Realista</span>
        <span className="ml-auto">Saldo atual: <strong className="text-slate-700">{money(dados.saldoAtual)}</strong></span>
      </div>
    </div>
  );
}

/* ---------------- 35. ROI do capital ---------------- */
function RoiCapital() {
  const [dados, setDados] = useState(null);
  useEffect(() => {
    fetch("/api/roi").then((r) => (r.ok ? r.json() : null)).then(setDados).catch(() => {});
  }, []);
  if (!dados) return null;
  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5 mb-1"><Icone nome="trofeu" className="w-4 h-4" /> ROI do capital</h3>
      <p className="text-[11px] text-slate-400 mb-3">Retorno sobre o capital médio emprestado nos últimos 90 dias, anualizado. É uma aproximação — carteira em crescimento rápido tende a mostrar número mais baixo do que a rentabilidade real, porque conta capital recém-liberado que ainda não teve tempo de voltar.</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[11px] text-slate-400">No período</p>
          <p className="text-xl font-bold text-emerald-600">{dados.roiPeriodoPct}%</p>
        </div>
        <div>
          <p className="text-[11px] text-slate-400">Anualizado</p>
          <p className="text-xl font-bold text-emerald-600">{dados.roiAnualizadoPct}%</p>
        </div>
      </div>
      <p className="text-[11px] text-slate-400 mt-2">Capital médio empatado: {moneyCurto(dados.capitalMedio)} · Lucro do período: {moneyCurto(dados.lucroPeriodo)}</p>
    </div>
  );
}

/* ---------------- 41. Ranking da equipe por período ---------------- */
function RankingEquipe() {
  const [periodo, setPeriodo] = useState("mes");
  const [dados, setDados] = useState(null);

  useEffect(() => {
    fetch(`/api/ranking?periodo=${periodo}`).then((r) => r.json()).then(setDados).catch(() => {});
  }, [periodo]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 p-5 pb-3">
        <h3 className="text-sm font-semibold text-slate-800">Ranking da equipe</h3>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
          {[["semana", "7 dias"], ["mes", "Este mês"], ["3meses", "3 meses"], ["tudo", "Tudo"]].map(([v, l]) => (
            <button key={v} onClick={() => setPeriodo(v)} className={`text-[11px] px-2.5 py-1 rounded-md ${periodo === v ? "bg-white shadow-sm font-medium text-slate-700" : "text-slate-500"}`}>{l}</button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400 border-y border-slate-100">
              <th className="text-left font-medium px-5 py-2">#</th>
              <th className="text-left font-medium px-3 py-2">Pessoa</th>
              <th className="text-right font-medium px-3 py-2">Vendas</th>
              <th className="text-right font-medium px-3 py-2">Recebido</th>
              <th className="text-right font-medium px-5 py-2">Recuperado</th>
            </tr>
          </thead>
          <tbody>
            {(dados?.ranking || []).map((r, i) => (
              <tr key={r.nome} className="border-b border-slate-50 last:border-0">
                <td className="px-5 py-2.5 text-slate-400">{i + 1}º</td>
                <td className="px-3 py-2.5 text-slate-700">{r.nome}</td>
                <td className="px-3 py-2.5 text-right text-slate-500">{r.vendas}</td>
                <td className="px-3 py-2.5 text-right font-medium text-emerald-600">{money(r.valorRecebido)}</td>
                <td className="px-5 py-2.5 text-right text-amber-600">{money(r.valorRecuperado)}</td>
              </tr>
            ))}
            {dados && dados.ranking.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-4 text-center text-slate-400 text-xs">Nenhum movimento nesse período.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function RelatoriosOperacao() {
  return (
    <div className="space-y-4 md:space-y-6">
      <div className="grid lg:grid-cols-2 gap-4 md:gap-6 items-start">
        <FluxoCaixa />
        <RoiCapital />
      </div>
      <RankingEquipe />
    </div>
  );
}
