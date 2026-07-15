"use client";

import { useEffect, useState, useCallback } from "react";

const money = (n) =>
  "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Card({ titulo, valor, sub, cor = "slate" }) {
  const cores = {
    emerald: "text-emerald-600",
    sky: "text-sky-600",
    violet: "text-violet-600",
    red: "text-red-600",
    slate: "text-slate-700",
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5">
      <p className="text-xs text-slate-400">{titulo}</p>
      <p className={`text-2xl font-bold mt-1 ${cores[cor] || cores.slate}`}>{valor}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function MetasView() {
  const [resumo, setResumo] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await fetch("/api/metas/resumo").then((r) => r.json()).catch(() => null);
    setResumo(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  if (loading) return <div className="p-6 text-slate-400">Carregando metas…</div>;
  if (!resumo) return <div className="p-6 text-slate-400">Não foi possível carregar as metas.</div>;

  const falta = Math.max(0, resumo.metaRecebimentosHoje - resumo.recebimentosHoje);
  const pctBarra = resumo.metaRecebimentosHoje > 0
    ? Math.min(100, Math.round((resumo.recebimentosHoje / resumo.metaRecebimentosHoje) * 100))
    : 100;

  return (
    <div className="flex-1 overflow-y-auto thin-scroll p-3 md:p-6 max-w-4xl space-y-4 md:space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Metas</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Meta de recebimento do dia. Regra atual: <strong>{resumo.metaPctRecebimento}%</strong> de todos os
          leads que estão na etapa Recebimento precisam pagar hoje.
          <a href="/configuracoes?tab=metas" className="text-emerald-600 hover:underline ml-1">Configurar</a>
        </p>
      </div>

      <Card titulo="Leads atualmente em Recebimento" valor={resumo.totalEmRecebimento} sub="Base do cálculo da meta de hoje" cor="violet" />

      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-slate-700">Meta de recebimentos hoje ({resumo.metaPctRecebimento}%)</p>
          <p className="text-sm text-slate-500">
            {resumo.recebimentosHoje} / {resumo.metaRecebimentosHoje}
          </p>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all ${pctBarra >= 100 ? "bg-emerald-500" : "bg-sky-500"}`}
            style={{ width: `${pctBarra}%` }}
          />
        </div>
        <p className="text-xs text-slate-400 mt-2">
          {falta > 0 ? `Faltam ${falta} baixa(s) pra bater a meta de hoje.` : "Meta de hoje batida! 🎉"}
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Card titulo="Baixas de recebimento hoje" valor={resumo.recebimentosHoje} cor="emerald" />
        <Card titulo="Valor recebido hoje" valor={money(resumo.valorRecebidoHoje)} cor="emerald" />
      </div>
    </div>
  );
}
