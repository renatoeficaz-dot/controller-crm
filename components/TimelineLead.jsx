"use client";

import { useEffect, useState } from "react";
import Icone from "@/components/Icones";

const money = (n) => "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ICONE_TIPO = { etapa: "seta", baixa: "check", tentativa: "cobranca", negociacao: "documento", documento: "clipe" };
const COR_TIPO = { etapa: "text-slate-500 bg-slate-100", baixa: "text-emerald-600 bg-emerald-50", tentativa: "text-sky-600 bg-sky-50", negociacao: "text-amber-600 bg-amber-50", documento: "text-violet-600 bg-violet-50" };

function fmt(d) {
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// Linha do tempo unificada (item 66): mudanças de etapa, baixas, tentativas de
// contato e negociações intercaladas por data — os eventos de NEGÓCIO do
// lead. As mensagens do chat continuam só no Chat, não duplicadas aqui.
export default function TimelineLead({ contactId }) {
  const [eventos, setEventos] = useState(null);

  useEffect(() => {
    fetch(`/api/contacts/${contactId}/timeline`).then((r) => r.json()).then(setEventos).catch(() => setEventos([]));
  }, [contactId]);

  if (eventos === null) return <p className="text-xs text-slate-400 py-4 text-center">Carregando…</p>;
  if (eventos.length === 0) return <p className="text-xs text-slate-400 py-4 text-center">Nenhum evento registrado ainda.</p>;

  return (
    <ol className="space-y-3">
      {eventos.map((e, i) => (
        <li key={i} className="flex gap-2.5">
          <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${COR_TIPO[e.tipo] || "text-slate-500 bg-slate-100"}`}>
            <Icone nome={ICONE_TIPO[e.tipo] || "check"} className="w-3 h-3" />
          </span>
          <div className="min-w-0 flex-1 pb-1">
            <p className="text-xs text-slate-700">{e.titulo}</p>
            <p className="text-[10px] text-slate-400">
              {fmt(e.data)}{e.usuario ? ` · ${e.usuario}` : ""}{e.valor != null ? ` · ${money(e.valor)}` : ""}
            </p>
            {e.notas && <p className="text-[11px] text-slate-500 mt-0.5">{e.notas}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
