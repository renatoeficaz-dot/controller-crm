"use client";

import { useCallback, useEffect, useState } from "react";
import Icone from "@/components/Icones";

const money = (n) =>
  "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const DIA_CURTO = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function labelDia(iso) {
  const d = new Date(iso + "T00:00:00.000Z");
  return `${DIA_CURTO[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, "0")}`;
}

// Painel do cobrador: quanto recuperou hoje e na semana (seg-sáb) e quanto de
// comissão já garantiu pra receber no fim de semana.
export default function ComissaoPainel() {
  const [r, setR] = useState(null);
  const [aberto, setAberto] = useState(false);

  const load = useCallback(async () => {
    const d = await fetch("/api/comissao").then((res) => (res.ok ? res.json() : null)).catch(() => null);
    setR(d);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  // Sem meta configurada não há comissão pra mostrar — não ocupa espaço à toa.
  if (!r || (!r.config?.metaDiariaValor && !r.config?.metaSemanalValor)) return null;

  const pctSemana = r.config.metaSemanalValor > 0
    ? Math.min(100, Math.round((r.totalSemana / r.config.metaSemanalValor) * 100))
    : 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-4">
      <button type="button" onClick={() => setAberto((v) => !v)} className="w-full flex items-center gap-3 text-left">
        <span className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
          <Icone nome="dinheiro" className="w-4.5 h-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-400">Sua comissão desta semana</p>
          <p className="text-lg font-semibold text-emerald-600">{money(r.totalAReceber)}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[11px] text-slate-400">recuperado</p>
          <p className="text-sm font-medium text-slate-700">{money(r.totalSemana)}</p>
        </div>
        <Icone nome="seta" className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>

      {r.config.metaSemanalValor > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="text-slate-500">Meta da semana ({money(r.config.metaSemanalValor)})</span>
            <span className={r.bateuSemanal ? "text-emerald-600 font-semibold" : "text-slate-500"}>
              {r.bateuSemanal ? `bateu — +${money(r.config.bonusSemanal)}` : `faltam ${money(r.faltaSemanal)}`}
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${r.bateuSemanal ? "bg-emerald-500" : "bg-sky-500"}`}
              style={{ width: `${pctSemana}%` }}
            />
          </div>
        </div>
      )}

      {aberto && (
        <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
          {r.config.metaDiariaValor > 0 && (
            <div>
              <p className="text-[11px] text-slate-500 mb-1.5">
                Dias batidos: <strong>{r.diasBatidos}</strong> de 6 · meta diária {money(r.config.metaDiariaValor)} → +{money(r.config.bonusDiario)} cada
              </p>
              <ul className="space-y-1">
                {r.dias.map((d) => (
                  <li key={d.dia} className="flex items-center gap-2 text-[11px]">
                    <span className="w-12 text-slate-400 shrink-0">{labelDia(d.dia)}</span>
                    <span className={`flex-1 ${d.bateu ? "text-emerald-600 font-medium" : "text-slate-500"}`}>
                      {money(d.valor)}
                    </span>
                    {d.bateu ? (
                      <span className="text-emerald-600 font-medium shrink-0">+{money(d.bonus)}</span>
                    ) : (
                      <span className="text-slate-300 shrink-0">—</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-600 space-y-0.5">
            <div className="flex justify-between">
              <span>Bônus dos dias batidos</span>
              <span className="font-medium">{money(r.bonusDiarios)}</span>
            </div>
            <div className="flex justify-between">
              <span>Bônus da meta semanal</span>
              <span className="font-medium">{money(r.bonusSemanal)}</span>
            </div>
            <div className="flex justify-between pt-1 mt-1 border-t border-slate-200 text-slate-800">
              <span className="font-medium">Total a receber</span>
              <span className="font-semibold text-emerald-600">{money(r.totalAReceber)}</span>
            </div>
          </div>

          <p className="text-[10px] text-slate-400">
            Semana de trabalho: segunda a sábado ({r.semanaInicio.split("-").reverse().join("/")} a{" "}
            {r.semanaFim.split("-").reverse().join("/")}). O acerto é no fim de semana.
          </p>
        </div>
      )}
    </div>
  );
}
