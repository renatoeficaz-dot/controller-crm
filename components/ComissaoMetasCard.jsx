"use client";

import { useCallback, useEffect, useState } from "react";
import Icone from "@/components/Icones";

const money = (n) => "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DIA_CURTO = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const labelDia = (iso) => `${DIA_CURTO[new Date(iso + "T00:00:00.000Z").getUTCDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const NOME_FAIXA = { minima: "mínima", media: "média", maxima: "máxima" };
// A faixa sai do recebido do dia; o valor da comissão pode ser diferente: na segunda soma sábado depois das 17h + domingo, no sábado
// sai o que passou das 17h (vai pra segunda).
function corteTexto(d) {
  const a = d.ajusteRec || 0;
  if (Math.abs(a) <= 0.009) return "";
  return a > 0
    ? `% sobre ${money(d.recebido)} (+${money(a)} de sábado após 17h e domingo, não conta pra meta)`
    : `% sobre ${money(d.recebido)} (−${money(-a)} depois das 17h vai pra segunda)`;
}

// Adiantamentos e descontos a abater dos próximos pagamentos de comissão. Quem lança é outro admin (não o próprio colaborador).
function Ajustes({ userId, totalSemana }) {
  const [d, setD] = useState({ itens: [], pendente: 0, podeLancar: false });
  const [f, setF] = useState({ tipo: "adiantamento", valor: "", descricao: "" });
  const [erro, setErro] = useState("");
  const load = useCallback(async () => {
    const r = await fetch(`/api/comissao-ajustes?userId=${userId}`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    if (r) setD(r);
  }, [userId]);
  useEffect(() => { load(); }, [load]);
  async function lancar() {
    setErro("");
    const r = await fetch("/api/comissao-ajustes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, ...f }) });
    if (!r.ok) { setErro((await r.json().catch(() => ({}))).error || "Não foi possível lançar."); return; }
    setF({ tipo: f.tipo, valor: "", descricao: "" });
    load();
  }
  async function marcar(id, descontado) {
    await fetch("/api/comissao-ajustes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, descontado }) });
    load();
  }
  async function apagar(id) {
    if (!confirm("Apagar este lançamento?")) return;
    await fetch(`/api/comissao-ajustes?id=${id}`, { method: "DELETE" });
    load();
  }
  const liquido = Math.round((totalSemana - d.pendente) * 100) / 100;
  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 text-xs">
        <span className="font-medium text-slate-600">Adiantamentos e descontos</span>
        <span className="text-slate-500">a descontar: <b className="text-red-600">{money(d.pendente)}</b> · líquido da semana: <b className={liquido < 0 ? "text-red-600" : "text-emerald-600"}>{money(liquido)}</b></span>
      </div>
      {d.podeLancar && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} className="text-xs border border-slate-200 rounded px-2 py-1.5 bg-white">
            <option value="adiantamento">Adiantamento</option>
            <option value="desconto">Desconto</option>
          </select>
          <input value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} inputMode="decimal" placeholder="Valor R$" className="w-24 text-xs border border-slate-200 rounded px-2 py-1.5" />
          <input value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} placeholder="Descrição (opcional)" className="min-w-0 flex-1 text-xs border border-slate-200 rounded px-2 py-1.5" />
          <button type="button" onClick={lancar} className="text-xs font-medium rounded-lg bg-emerald-500 text-white px-3 py-1.5 hover:bg-emerald-600">Lançar</button>
        </div>
      )}
      {erro && <p className="mt-1 text-[11px] text-red-600">{erro}</p>}
      <ul className="mt-2 space-y-1">
        {d.itens.length === 0 && <li className="text-[11px] text-slate-400">Nenhum lançamento.</li>}
        {d.itens.map((i) => (
          <li key={i.id} className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 w-12 shrink-0">{new Date(i.data).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" })}</span>
            <span className="text-slate-600 flex-1 min-w-0 truncate">{i.tipo === "desconto" ? "Desconto" : "Adiantamento"}{i.descricao ? ` — ${i.descricao}` : ""}</span>
            <span className={`shrink-0 font-medium ${i.descontadoEm ? "text-slate-400 line-through" : "text-red-600"}`}>{money(i.valor)}</span>
            {d.podeLancar && (
              <>
                <button type="button" onClick={() => marcar(i.id, !i.descontadoEm)} className="shrink-0 text-[11px] text-slate-500 hover:text-emerald-600">{i.descontadoEm ? "reabrir" : "descontado"}</button>
                <button type="button" onClick={() => apagar(i.id)} className="shrink-0 text-[11px] text-slate-300 hover:text-red-500">✕</button>
              </>
            )}
            {!d.podeLancar && i.descontadoEm && <span className="shrink-0 text-[11px] text-slate-400">descontado</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Quanto a pessoa está ganhando de comissão por metas: hoje (em R$ e em %) e o acumulado da semana (seg–sáb, fecha sábado 17h).
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
        {h?.conta !== false && (
          <div className="hidden md:flex items-stretch gap-2 text-[11px] shrink-0">
            <div className="rounded-lg bg-slate-50 border border-slate-100 px-2.5 py-1.5"><p className="text-slate-400">Recebimento</p><p className="font-medium text-slate-700">{h?.faixaRec ? `meta ${NOME_FAIXA[h.faixaRec]} · +${h.pctRec}%` : "meta não batida · 0%"}</p></div>
            <div className="rounded-lg bg-slate-50 border border-slate-100 px-2.5 py-1.5"><p className="text-slate-400">Liberação</p><p className="font-medium text-slate-700">{h?.faixaLib ? `meta ${NOME_FAIXA[h.faixaLib]} · +${h.pctLib}%` : "meta não batida · 0%"}</p></div>
          </div>
        )}
        <div className="text-right shrink-0">
          <p className="text-[11px] text-slate-400">na semana</p>
          <p className="text-sm font-semibold text-slate-700">{money(r.totalSemana)}</p>
        </div>
        <Icone nome="seta" className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>

      {h?.conta !== false && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] md:hidden">
          <div className="rounded-lg bg-slate-50 border border-slate-100 px-2.5 py-1.5"><p className="text-slate-400">Recebimento</p><p className="font-medium text-slate-700">{h?.faixaRec ? `meta ${NOME_FAIXA[h.faixaRec]} · +${h.pctRec}%` : "meta não batida · 0%"}</p></div>
          <div className="rounded-lg bg-slate-50 border border-slate-100 px-2.5 py-1.5"><p className="text-slate-400">Liberação</p><p className="font-medium text-slate-700">{h?.faixaLib ? `meta ${NOME_FAIXA[h.faixaLib]} · +${h.pctLib}%` : "meta não batida · 0%"}</p></div>
        </div>
      )}

      <Ajustes userId={r.userId} totalSemana={r.totalSemana} />

      {aberto && (
        <div className="mt-3 border-t border-slate-100 pt-3 space-y-1">
          <p className="text-[11px] text-slate-400 mb-1">
            Semana {r.inicio.slice(8, 10)}/{r.inicio.slice(5, 7)} a {r.fim.slice(8, 10)}/{r.fim.slice(5, 7)} · a meta (%) conta só o que entrou no próprio dia; no valor, o recebido de sábado após 17h e de domingo soma na segunda · cada meta rende {r.pcts.minima}% / {r.pcts.media}% / {r.pcts.maxima}% (mínima / média / máxima)
          </p>
          {r.detalhe.map((d) => (
            <div key={d.dia} className="flex items-center justify-between text-xs gap-2">
              <span className="text-slate-500 w-20 shrink-0">{labelDia(d.dia)}</span>
              {d.conta ? (
                <>
                  <span className="text-slate-600 flex-1 truncate" title={corteTexto(d)}>
                    {money(d.recebidoDia ?? d.recebido)} rec. ({d.faixaRec ? NOME_FAIXA[d.faixaRec] : "—"}) · {money(d.liberado)} lib. ({d.faixaLib ? NOME_FAIXA[d.faixaLib] : "—"})
                    {corteTexto(d) && <span className="text-amber-600"> · {corteTexto(d)}</span>}
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
  return <div className={`grid gap-3 ${lista.length > 1 ? "md:grid-cols-2" : ""}`}>{lista.map((r) => <Cartao key={r.userId} r={r} />)}</div>;
}
