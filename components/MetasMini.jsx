"use client";

import { useEffect, useState, useCallback } from "react";

// Dois mini-medidores (vendas e recebimento) mostrando o nível do dia
// (mínima/média/meta) — mesmos números da aba Metas, só que compactos, pra
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

  return (
    <div className="hidden md:flex items-center gap-2.5">
      <Meter
        label="Vendas hoje"
        atual={resumo.vendasHoje}
        minima={resumo.metaVendasMinima}
        media={resumo.metaVendasMedia}
        meta={resumo.metaVendasDia}
        unidade="venda"
      />
      <Meter
        label="Recebimentos hoje"
        atual={resumo.recebimentosHoje}
        minima={resumo.metaRecebimentosMinima}
        media={resumo.metaRecebimentosMedia}
        meta={resumo.metaRecebimentosHoje}
        unidade="baixa"
        unidadePlural="baixas"
      />
    </div>
  );
}

// Nível atingido hoje: abaixo da mínima, na mínima, na média, ou meta cheia.
function nivelDe(atual, minima, media, meta) {
  if (atual >= meta) return "meta";
  if (atual >= media) return "media";
  if (atual >= minima) return "minima";
  return "abaixo";
}

const NIVEL_BARRA = { abaixo: "bg-red-500", minima: "bg-amber-500", media: "bg-sky-500", meta: "bg-emerald-500" };
const NIVEL_TEXTO = { abaixo: "text-red-600", minima: "text-amber-600", media: "text-sky-600", meta: "text-emerald-600" };
const NIVEL_LABEL = { abaixo: "Abaixo da mínima", minima: "Bateu a mínima", media: "Bateu a média", meta: "Meta batida! 🎉" };

// % que ainda falta pra alcançar um limiar (mínima/média), em pontos
// percentuais do próprio limiar — null quando já foi alcançado.
function pctFalta(atual, limiar) {
  if (limiar <= 0 || atual >= limiar) return null;
  return Math.round(((limiar - atual) / limiar) * 100);
}

function Meter({ label, atual, minima, media, meta, unidade, unidadePlural }) {
  const max = Math.max(meta, atual, 1);
  const pct = Math.min(100, Math.round((atual / max) * 100));
  const nivel = nivelDe(atual, minima, media, meta);
  const falta = Math.max(0, meta - atual);
  const plural = unidadePlural || `${unidade}s`;
  const faltaPctMinima = pctFalta(atual, minima);
  const faltaPctMedia = pctFalta(atual, media);

  return (
    <a
      href="/metas"
      className="w-40 shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 hover:border-slate-300 transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-400 truncate">{label}</span>
        <span className={`text-[11px] font-semibold shrink-0 ${NIVEL_TEXTO[nivel]}`}>{pct}%</span>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1.5">
        <div className={`h-1.5 rounded-full transition-all ${NIVEL_BARRA[nivel]}`} style={{ width: `${pct}%` }} />
      </div>
      <p className={`text-[11px] mt-1.5 font-medium ${NIVEL_TEXTO[nivel]}`}>{NIVEL_LABEL[nivel]}</p>
      {faltaPctMinima != null && <p className="text-[11px] text-red-500 mt-0.5">Faltam {faltaPctMinima}% pra mínima</p>}
      {faltaPctMedia != null && <p className="text-[11px] text-amber-500 mt-0.5">Faltam {faltaPctMedia}% pra média</p>}
      {falta > 0 && (
        <p className="text-[11px] text-slate-400 mt-0.5">
          Faltam {falta} {falta === 1 ? unidade : plural}
        </p>
      )}
    </a>
  );
}
