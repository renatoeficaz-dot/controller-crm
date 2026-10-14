"use client";

import { useEffect, useState } from "react";

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

// Relatório por HORA de criação do lead: % que chegou a cada etapa do funil. Segue o filtro de data do relatório.
export default function HorarioCriacao({ ini, fim }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [tags, setTags] = useState([]);
  const [tagId, setTagId] = useState("");

  useEffect(() => {
    fetch("/api/tags").then((r) => (r.ok ? r.json() : [])).then((l) => setTags(Array.isArray(l) ? l : [])).catch(() => {});
  }, []);

  useEffect(() => {
    let vivo = true;
    const qs = new URLSearchParams({ ini, fim });
    if (tagId) qs.set("tagId", tagId);
    fetch(`/api/relatorios/horario-criacao?${qs}`)
      .then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => null) }))
      .then(({ ok, d }) => {
        if (!vivo) return;
        if (!ok) { setErro(d?.error || "Não foi possível calcular."); return; }
        setErro("");
        setDados(d);
      })
      .catch(() => vivo && setErro("Não foi possível calcular."));
    return () => { vivo = false; };
  }, [ini, fim, tagId]);

  const celula = (n, d, cor) => {
    const p = pct(n, d);
    if (p == null) return <span className="text-slate-300">—</span>;
    return (
      <span className="inline-flex items-center gap-1.5 justify-end">
        <span className="hidden sm:inline-block w-14 h-1.5 rounded bg-slate-100 overflow-hidden"><span className="block h-full rounded" style={{ width: `${Math.min(100, p)}%`, background: cor }} /></span>
        <span className="tabular-nums">{p.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</span>
        <span className="text-[10px] text-slate-400">({n})</span>
      </span>
    );
  };

  const horas = dados?.horas || [];
  return (
    <section className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-4 mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h2 className="text-sm font-semibold text-slate-800">Funil por horário de criação do lead</h2>
        <select value={tagId} onChange={(e) => setTagId(e.target.value)} className="text-xs border border-slate-200 rounded px-2 py-1 bg-white">
          <option value="">Todas as etiquetas</option>
          {tags.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
        </select>
      </div>
      <p className="text-[11px] text-slate-400 mb-3">
        Leads criados de {ini.split("-").reverse().join("/")} a {fim.split("-").reverse().join("/")}, agrupados pela hora em que chegaram (horário de Brasília). Cada coluna é a % dos leads daquela hora que chegou à etapa (passou por ela em algum momento).
      </p>
      {erro && <p className="text-xs text-red-500 mb-2">{erro}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400 border-b border-slate-100">
              <th className="text-left font-medium py-2 pr-3">Hora</th>
              <th className="text-right font-medium px-3 py-2">Leads</th>
              <th className="text-right font-medium px-3 py-2">Documentação</th>
              <th className="text-right font-medium px-3 py-2">Análise</th>
              <th className="text-right font-medium px-3 py-2">Vídeo chamada</th>
              <th className="text-right font-medium px-3 py-2">Venda (Recebimento)</th>
              <th className="text-right font-medium pl-3 py-2">Venda perdida</th>
            </tr>
          </thead>
          <tbody>
            {horas.filter((h) => h.leads > 0).map((h) => (
              <tr key={h.hora} className="border-b border-slate-50">
                <td className="py-1.5 pr-3 tabular-nums">{String(h.hora).padStart(2, "0")}h–{String((h.hora + 1) % 24).padStart(2, "0")}h</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{h.leads}</td>
                <td className="px-3 py-1.5 text-right">{celula(h.docs, h.leads, "#38bdf8")}</td>
                <td className="px-3 py-1.5 text-right">{celula(h.analise, h.leads, "#a78bfa")}</td>
                <td className="px-3 py-1.5 text-right">{celula(h.video, h.leads, "#f59e0b")}</td>
                <td className="px-3 py-1.5 text-right">{celula(h.venda, h.leads, "#10b981")}</td>
                <td className="pl-3 py-1.5 text-right">{celula(h.perdida, h.leads, "#f87171")}</td>
              </tr>
            ))}
            {dados && horas.every((h) => h.leads === 0) && (
              <tr><td colSpan={7} className="py-4 text-center text-xs text-slate-400">Nenhum lead criado no período.</td></tr>
            )}
          </tbody>
          {dados?.total?.leads > 0 && (
            <tfoot>
              <tr className="text-xs font-semibold text-slate-700">
                <td className="pt-2 pr-3">Total</td>
                <td className="pt-2 px-3 text-right tabular-nums">{dados.total.leads}</td>
                <td className="pt-2 px-3 text-right">{celula(dados.total.docs, dados.total.leads, "#38bdf8")}</td>
                <td className="pt-2 px-3 text-right">{celula(dados.total.analise, dados.total.leads, "#a78bfa")}</td>
                <td className="pt-2 px-3 text-right">{celula(dados.total.video, dados.total.leads, "#f59e0b")}</td>
                <td className="pt-2 px-3 text-right">{celula(dados.total.venda, dados.total.leads, "#10b981")}</td>
                <td className="pt-2 pl-3 text-right">{celula(dados.total.perdida, dados.total.leads, "#f87171")}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}
