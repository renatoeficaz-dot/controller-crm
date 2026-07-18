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

// Nível atingido hoje, dos 3 configurados: abaixo da mínima, na mínima,
// na média, ou meta cheia batida.
function nivelDe(atual, minima, media, meta) {
  if (atual >= meta) return "meta";
  if (atual >= media) return "media";
  if (atual >= minima) return "minima";
  return "abaixo";
}

const NIVEL_BARRA = { abaixo: "bg-red-500", minima: "bg-amber-500", media: "bg-sky-500", meta: "bg-emerald-500" };
const NIVEL_TEXTO = { abaixo: "text-red-600", minima: "text-amber-600", media: "text-sky-600", meta: "text-emerald-600" };
const NIVEL_LABEL = { abaixo: "Abaixo da mínima", minima: "Bateu a mínima", media: "Bateu a média", meta: "Meta cheia batida! 🎉" };

// % que ainda falta pra alcançar um limiar (mínima/média), em pontos
// percentuais do próprio limiar — null quando já foi alcançado.
function pctFalta(atual, limiar) {
  if (limiar <= 0 || atual >= limiar) return null;
  return Math.round(((limiar - atual) / limiar) * 100);
}

// Barra de progresso com marcadores de mínima/média, cor muda conforme o
// nível atingido no dia.
function NivelBar({ atual, minima, media, meta, unidade, unidadePlural }) {
  const max = Math.max(meta, atual, 1);
  const nivel = nivelDe(atual, minima, media, meta);
  const pct = Math.min(100, Math.round((atual / max) * 100));
  const posMinima = Math.min(100, Math.round((minima / max) * 100));
  const posMedia = Math.min(100, Math.round((media / max) * 100));
  const faltaMeta = Math.max(0, meta - atual);
  const plural = unidadePlural || `${unidade}s`;
  const faltaPctMinima = pctFalta(atual, minima);
  const faltaPctMedia = pctFalta(atual, media);

  return (
    <div>
      <div className="relative w-full bg-slate-100 rounded-full h-3">
        <div className={`h-3 rounded-full transition-all ${NIVEL_BARRA[nivel]}`} style={{ width: `${pct}%` }} />
        <div className="absolute top-0 bottom-0 w-0.5 bg-slate-400/60" style={{ left: `${posMinima}%` }} title={`Mínima: ${minima}`} />
        <div className="absolute top-0 bottom-0 w-0.5 bg-slate-400/60" style={{ left: `${posMedia}%` }} title={`Média: ${media}`} />
      </div>
      <div className="flex items-center justify-between mt-1.5 text-[10px] text-slate-400">
        <span>Mínima {minima}</span>
        <span>Média {media}</span>
        <span>Meta {meta}</span>
      </div>
      <p className={`text-xs font-medium mt-2 ${NIVEL_TEXTO[nivel]}`}>{NIVEL_LABEL[nivel]}</p>
      {faltaPctMinima != null && <p className="text-xs text-red-500 mt-0.5">Faltam {faltaPctMinima}% pra mínima</p>}
      {faltaPctMedia != null && <p className="text-xs text-amber-500 mt-0.5">Faltam {faltaPctMedia}% pra média</p>}
      {faltaMeta > 0 && (
        <p className="text-xs text-slate-400 mt-0.5">
          Faltam {faltaMeta} {faltaMeta === 1 ? unidade : plural} pra meta cheia.
        </p>
      )}
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

  return (
    <div className="flex-1 overflow-y-auto thin-scroll p-3 md:p-6 max-w-4xl space-y-4 md:space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Metas</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Meta de recebimento do dia. Regra atual: <strong>{resumo.metaPctRecebimento}%</strong> de todos os
          leads que estão na etapa Recebimento precisam pagar hoje (mínima {resumo.metaPctRecebimentoMinima}%, média {resumo.metaPctRecebimentoMedia}%).
          <a href="/configuracoes?tab=metas" className="text-emerald-600 hover:underline ml-1">Configurar</a>
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-slate-700">Meta de vendas hoje</p>
          <p className="text-sm text-slate-500">{resumo.vendasHoje} / {resumo.metaVendasDia}</p>
        </div>
        <NivelBar
          atual={resumo.vendasHoje}
          minima={resumo.metaVendasMinima}
          media={resumo.metaVendasMedia}
          meta={resumo.metaVendasDia}
          unidade="venda"
        />
      </div>

      <Card titulo="Leads atualmente em Recebimento" valor={resumo.totalEmRecebimento} sub="Base do cálculo da meta de recebimento de hoje" cor="violet" />

      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-slate-700">Meta de recebimentos hoje ({resumo.metaPctRecebimento}%)</p>
          <p className="text-sm text-slate-500">
            {resumo.recebimentosHoje} / {resumo.metaRecebimentosHoje} clientes
          </p>
        </div>
        <NivelBar
          atual={resumo.recebimentosHoje}
          minima={resumo.metaRecebimentosMinima}
          media={resumo.metaRecebimentosMedia}
          meta={resumo.metaRecebimentosHoje}
          unidade="cliente"
          unidadePlural="clientes"
        />
        <p className="text-[11px] text-slate-400 mt-2">
          A meta conta <strong>clientes distintos</strong> que pagaram hoje, não o número de parcelas — se um cliente
          quitar 2 dias de atraso de uma vez, conta como 1 aqui (mas como 2 nas "baixas" abaixo).
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Card
          titulo="Baixas de parcela hoje"
          valor={resumo.baixasHoje}
          sub={`${resumo.recebimentosHoje} cliente${resumo.recebimentosHoje === 1 ? "" : "s"} distinto${resumo.recebimentosHoje === 1 ? "" : "s"}`}
          cor="emerald"
        />
        <Card titulo="Valor recebido hoje" valor={money(resumo.valorRecebidoHoje)} cor="emerald" />
      </div>
    </div>
  );
}
