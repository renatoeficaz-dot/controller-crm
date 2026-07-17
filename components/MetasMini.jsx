"use client";

import { useEffect, useState, useCallback } from "react";

// Dois mini-medidores (vendas e recebimento) mostrando o quanto falta pra
// bater a meta do dia — mesmos números da aba Metas, só que compactos, pra
// caber ao lado do título do Funil de contatos.
export default function MetasMini() {
  const [resumo, setResumo] = useState(null);

  const load = useCallback(async () => {
    const data = await fetch("/api/metas/resumo").then((r) => r.json()).catch(() => null);
    setResumo(data);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  if (!resumo) return null;

  const faltaVendas = Math.max(0, resumo.metaVendasDia - resumo.vendasHoje);
  const pctVendas = resumo.metaVendasDia > 0 ? Math.min(100, Math.round((resumo.vendasHoje / resumo.metaVendasDia) * 100)) : 100;

  const faltaReceb = Math.max(0, resumo.metaRecebimentosHoje - resumo.recebimentosHoje);
  const pctReceb = resumo.metaRecebimentosHoje > 0 ? Math.min(100, Math.round((resumo.recebimentosHoje / resumo.metaRecebimentosHoje) * 100)) : 100;

  return (
    <div className="hidden md:flex items-center gap-2.5">
      <Meter label="Vendas hoje" pct={pctVendas} falta={faltaVendas} unidade="venda" cor="violet" />
      <Meter label="Recebimentos hoje" pct={pctReceb} falta={faltaReceb} unidade="baixa" unidadePlural="baixas" cor="sky" />
    </div>
  );
}

const FILL = { violet: "bg-violet-500", sky: "bg-sky-500" };

function Meter({ label, pct, falta, unidade, unidadePlural, cor }) {
  const batida = falta === 0;
  return (
    <a
      href="/metas"
      className="w-40 shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 hover:border-slate-300 transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-400 truncate">{label}</span>
        <span className={`text-[11px] font-semibold shrink-0 ${batida ? "text-emerald-600" : "text-slate-600"}`}>{pct}%</span>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1.5">
        <div
          className={`h-1.5 rounded-full transition-all ${batida ? "bg-emerald-500" : FILL[cor]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className={`text-[11px] mt-1.5 ${batida ? "text-emerald-600 font-medium" : "text-slate-500"}`}>
        {batida ? "Meta batida! 🎉" : `Faltam ${falta} ${falta === 1 ? unidade : unidadePlural || `${unidade}s`}`}
      </p>
    </a>
  );
}
