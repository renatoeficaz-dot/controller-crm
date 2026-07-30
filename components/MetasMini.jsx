"use client";

import { useEffect, useState, useCallback } from "react";

const NIVEL_COR = {
  abaixo: "text-red-600",
  minima: "text-amber-600",
  media: "text-sky-600",
  meta: "text-emerald-600",
};

// % de avanço até a meta cheia. Sem meta configurada devolve null, pra mostrar
// "—" em vez de dividir por zero.
function pctDaMeta(atual, meta) {
  if (!meta || meta <= 0) return null;
  return Math.min(100, Math.round((atual / meta) * 100));
}

// Versão compacta e deitada (uma linha só, mesma altura de um botão/pill) dos
// medidores de meta — pra caber ao lado dos filtros sem empurrar o resto pra
// baixo. Clicar leva pra aba Metas (que tem a versão completa, com barras).
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

  // Os níveis vêm prontos da API — recalcular aqui duplicaria a regra, que foi
  // justamente como esta pill já ficou dessincronizada da tela de Metas.
  const niveis = resumo.niveis || {};
  const vendasPct = pctDaMeta(resumo.vendasHoje, resumo.metaVendasDia);
  const recebPct = pctDaMeta(resumo.recebimentosHoje, resumo.metaRecebimentosDia);

  return (
    <a
      href="/metas"
      className="flex items-center gap-2.5 text-xs border border-slate-200 rounded-full px-3 py-1.5 bg-white hover:border-slate-300 transition-colors shrink-0"
      title="Ver metas do dia"
    >
      <span className="text-slate-400">
        Vendas{" "}
        <strong className={NIVEL_COR[niveis.vendas] || "text-slate-400"}>
          {vendasPct == null ? "—" : `${vendasPct}%`}
        </strong>
      </span>
      <span className="w-px h-3 bg-slate-200" />
      <span className="text-slate-400">
        Recebimentos{" "}
        <strong className={NIVEL_COR[niveis.recebimentos] || "text-slate-400"}>
          {recebPct == null ? "—" : `${recebPct}%`}
        </strong>
      </span>
    </a>
  );
}
