"use client";

import { useCallback, useEffect, useState } from "react";
import Icone from "@/components/Icones";

const money = (n) => "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DIA_CURTO = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const labelDia = (iso) => `${DIA_CURTO[new Date(iso + "T00:00:00.000Z").getUTCDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const NOME_FAIXA = { minima: "mínima", media: "média", maxima: "máxima" };

// Quanto a pessoa está ganhando de comissão por metas: hoje (em R$ e em %) e o acumulado da semana (seg–sáb, fecha sábado 18h).
function Cartao({ r }) {
  const [aberto, setAberto] = useState(false);
  const h = r.hoje;
  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-4">
      <button type="button" onClick={() => setAberto((v) => !v)} className="w-full flex items-center gap-3 text-left">
        <span className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
          <Icone nome="dinheiro" className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-400">Comissão de hoje{r.nome ? ` — ${r.nome}` : ""}</p>
          <p className="text-lg font-semibold text-emerald-600">{money(h?.comissao)}</p>
          <p className="text-[11px] text-slate-500">
            {h?.conta === false ? `começa em ${r.desde.split("-").reverse().join("/")}` : `${h?.pctTotal || 0}% de ${money(h?.recebido)} recebidos (máx. ${r.maxPct}%)`}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[11px] text-slate-400">na semana</p>
          <p className="text-sm font-semibold text-slate-700">{money(r.totalSemana)}</p>
        </div>
        <Icone nome="seta" className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>

      {h?.conta !== false && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-lg bg-slate-50 border border-slate-100 px-2.5 py-1.5">
            <p className="text-slate-400">Recebimento</p>
            <p className="font-medium text-slate-700">{h?.faixaRec ? `meta ${NOME_FAIXA[h.faixaRec]} · +${h.pctRec}%` : "meta não batida · 0%"}</p>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-100 px-2.5 py-1.5">
            <p className="text-slate-400">Liberação</p>
            <p className="font-medium text-slate-700">{h?.faixaLib ? `meta ${NOME_FAIXA[h.faixaLib]} · +${h.pctLib}%` : "meta não batida · 0%"}</p>
          </div>
        </div>
      )}

      {aberto && (
        <div className="mt-3 border-t border-slate-100 pt-3 space-y-1">
          <p className="text-[11px] text-slate-400 mb-1">
            Semana {r.inicio.slice(8, 10)}/{r.inicio.slice(5, 7)} a {r.fim.slice(8, 10)}/{r.fim.slice(5, 7)} · fechamento sábado às 18:00 · cada meta rende {r.pcts.minima}% / {r.pcts.media}% / {r.pcts.maxima}% (mínima / média / máxima)
          </p>
          {r.detalhe.map((d) => (
            <div key={d.dia} className="flex items-center justify-between text-xs gap-2">
              <span className="text-slate-500 w-20 shrink-0">{labelDia(d.dia)}</span>
              {d.conta ? (
                <>
                  <span className="text-slate-600 flex-1 truncate">
                    {money(d.recebido)} rec. ({d.faixaRec ? NOME_FAIXA[d.faixaRec] : "—"}) · {money(d.liberado)} lib. ({d.faixaLib ? NOME_FAIXA[d.faixaLib] : "—"})
                  </span>
                  <span className="text-slate-400 shrink-0">{d.pctTotal}%</span>
                  <span className="font-medium text-emerald-600 w-24 text-right shrink-0">{money(d.comissao)}</span>
                </>
              ) : (
                <span className="text-slate-300 flex-1">antes do início</span>
              )}
            </div>
          ))}
          <div className="flex items-center justify-between text-xs border-t border-slate-100 pt-1.5 mt-1">
            <span className="text-slate-500">Total da semana</span>
            <span className="font-semibold text-emerald-600">{money(r.totalSemana)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ComissaoMetasCard() {
  const [lista, setLista] = useState([]);
  const load = useCallback(async () => {
    const d = await fetch("/api/comissao-metas").then((r) => (r.ok ? r.json() : [])).catch(() => []);
    setLista(Array.isArray(d) ? d : []);
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 60000);
    return () => clearInterval(t);
  }, [load]);
  if (!lista.length) return null;
  return <div className="grid gap-3 md:grid-cols-2">{lista.map((r) => <Cartao key={r.userId} r={r} />)}</div>;
}
