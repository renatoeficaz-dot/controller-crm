"use client";

import { useEffect, useState, useCallback } from "react";

const NIVEL_COR = { abaixo: "text-red-600", minima: "text-amber-600", media: "text-sky-600", meta: "text-emerald-600" };

function nivelDe(atual, minima, media, meta) {
  if (atual >= meta) return "meta";
  if (atual >= media) return "media";
  if (atual >= minima) return "minima";
  return "abaixo";
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

  const vendasPct = Math.min(100, Math.round((resumo.vendasHoje / Math.max(resumo.metaVendasDia, resumo.vendasHoje, 1)) * 100));
  const vendasNivel = nivelDe(resumo.vendasHoje, resumo.metaVendasMinima, resumo.metaVendasMedia, resumo.metaVendasDia);
  const recebimentosPct = Math.min(
    100,
    Math.round((resumo.recebimentosHoje / Math.max(resumo.metaRecebimentosHoje, resumo.recebimentosHoje, 1)) * 100)
  );
  const recebimentosNivel = nivelDe(resumo.recebimentosHoje, resumo.metaRecebimentosMinima, resumo.metaRecebimentosMedia, resumo.metaRecebimentosHoje);

  return (
    <a
      href="/metas"
      className="flex items-center gap-2.5 text-xs border border-slate-200 rounded-full px-3 py-1.5 bg-white hover:border-slate-300 transition-colors shrink-0"
      title="Ver metas do dia"
    >
      <span className="text-slate-400">
        Vendas <strong className={NIVEL_COR[vendasNivel]}>{vendasPct}%</strong>
      </span>
      <span className="w-px h-3 bg-slate-200" />
      <span className="text-slate-400">
        Recebimentos <strong className={NIVEL_COR[recebimentosNivel]}>{recebimentosPct}%</strong>
      </span>
    </a>
  );
}
