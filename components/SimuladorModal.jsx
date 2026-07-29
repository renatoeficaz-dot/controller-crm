"use client";

import { useEffect, useMemo, useState } from "react";
import { resumoCobranca, NUM_PARCELAS } from "@/lib/finance";

const money = (n) =>
  "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function SimuladorModal({ onClose }) {
  const [capital, setCapital] = useState("300");
  const [cfg, setCfg] = useState(null);

  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then(setCfg).catch(() => {});
  }, []);

  const honorariosPct = cfg?.honorariosPct ?? 30;
  const r = useMemo(() => resumoCobranca(Number(capital) || 0, honorariosPct), [capital, honorariosPct]);

  // Parcela em que o capital emprestado retorna ao caixa — antes dela, o
  // cliente que para de pagar dá prejuízo.
  const parcelaEquilibrio = Math.ceil(NUM_PARCELAS / (1 + honorariosPct / 100));

  // Quanto sobra (ou falta) se o cliente parar em cada parcela. É o que faz
  // entender por que sumir na 3ª é muito pior que sumir na 8ª.
  const porParcela = useMemo(
    () =>
      Array.from({ length: NUM_PARCELAS }, (_, i) => {
        const n = i + 1;
        const recebido = r.valorParcela * n;
        return { n, recebido, resultado: recebido - r.capital };
      }),
    [r]
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto thin-scroll"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
          <h3 className="font-semibold text-slate-800">Simulador de empréstimo</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          <label className="block">
            <span className="text-xs text-slate-400">Valor do capital</span>
            <input
              type="number"
              value={capital}
              onChange={(e) => setCapital(e.target.value)}
              className="mt-1 w-full text-lg font-semibold border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400"
            />
            <span className="text-[11px] text-slate-400 mt-1 block">
              Honorários de {honorariosPct}% · {NUM_PARCELAS} parcelas diárias (configurável em Honorários / Multa)
            </span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-400">Total a receber</p>
              <p className="text-xl font-semibold mt-1 text-emerald-600">{money(r.total)}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-400">Cada parcela</p>
              <p className="text-xl font-semibold mt-1 text-sky-600">{money(r.valorParcela)}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-400">Lucro se pagar tudo</p>
              <p className="text-xl font-semibold mt-1 text-emerald-600">{money(r.honorarios)}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-400">Capital volta na</p>
              <p className="text-xl font-semibold mt-1 text-amber-600">{parcelaEquilibrio}ª parcela</p>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 mb-1.5">
              Se o cliente parar de pagar na parcela…
            </p>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                    <th className="py-2 px-3 font-medium">Parou na</th>
                    <th className="py-2 px-3 font-medium text-right">Recebido</th>
                    <th className="py-2 px-3 font-medium text-right">Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {porParcela.map((p) => (
                    <tr key={p.n} className="border-b border-slate-50 last:border-0">
                      <td className="py-1.5 px-3 text-slate-600">{p.n}ª</td>
                      <td className="py-1.5 px-3 text-right tabular-nums text-slate-600">{money(p.recebido)}</td>
                      <td
                        className={`py-1.5 px-3 text-right tabular-nums font-medium ${
                          p.resultado >= 0 ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {p.resultado >= 0 ? "+" : ""}
                        {money(p.resultado)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Valores considerando as parcelas sem multa por atraso.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
