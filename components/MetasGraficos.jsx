"use client";

import { useState } from "react";
import Icone from "@/components/Icones";

const money = (n) =>
  "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyCurto = (n) => {
  const v = Number(n || 0);
  if (v >= 1000) return "R$ " + (v / 1000).toFixed(1).replace(".", ",") + "k";
  return "R$ " + v.toFixed(0);
};

const DIA_CURTO = ["D", "S", "T", "Q", "Q", "S", "S"];
const chaveDia = (d) => new Date(d + "T00:00:00.000Z");
const diaDoMes = (d) => chaveDia(d).getUTCDate();
const fmtDiaCurto = (d) =>
  `${String(chaveDia(d).getUTCDate()).padStart(2, "0")}/${String(chaveDia(d).getUTCMonth() + 1).padStart(2, "0")}`;

/* ---------------- 4. Gráfico dos últimos 30 dias ---------------- */
export function Grafico30Dias({ serie, onDia }) {
  const [metrica, setMetrica] = useState("valorRecebido");
  const [hover, setHover] = useState(null);

  const METRICAS = [
    { key: "valorRecebido", label: "Recebido", cor: "#10b981", moeda: true },
    { key: "valorRecuperado", label: "Recuperado", cor: "#f59e0b", moeda: true },
    { key: "vendas", label: "Vendas", cor: "#6366f1", moeda: false },
  ];
  const m = METRICAS.find((x) => x.key === metrica);
  const max = Math.max(...serie.map((d) => d[metrica] || 0), 1);

  return (
    <section className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-800">Últimos 30 dias</h2>
          <p className="text-[11px] text-slate-400">
            Barra clara é domingo (folga). Clique numa barra pra abrir aquele dia.
          </p>
        </div>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
          {METRICAS.map((x) => (
            <button
              key={x.key}
              onClick={() => setMetrica(x.key)}
              className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${
                metrica === x.key ? "bg-white shadow-sm text-slate-700 font-medium" : "text-slate-500"
              }`}
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-end gap-[3px] h-32">
        {serie.map((d) => {
          const v = d[metrica] || 0;
          const alt = max > 0 ? Math.max(2, Math.round((v / max) * 100)) : 2;
          const ativo = hover === d.dia;
          return (
            <button
              key={d.dia}
              type="button"
              onClick={() => onDia?.(d.dia)}
              onMouseEnter={() => setHover(d.dia)}
              onMouseLeave={() => setHover(null)}
              title={`${fmtDiaCurto(d.dia)} — ${m.moeda ? money(v) : v + " venda(s)"}`}
              className="flex-1 min-w-0 flex flex-col justify-end h-full group"
            >
              <span
                className="w-full rounded-t transition-all"
                style={{
                  height: `${alt}%`,
                  background: m.cor,
                  opacity: d.diaUtil ? (ativo ? 1 : 0.85) : 0.3,
                }}
              />
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between mt-1.5 text-[10px] text-slate-400">
        <span>{fmtDiaCurto(serie[0]?.dia || "")}</span>
        {hover && (
          <span className="font-medium text-slate-600">
            {fmtDiaCurto(hover)}:{" "}
            {m.moeda
              ? money(serie.find((d) => d.dia === hover)?.[metrica])
              : serie.find((d) => d.dia === hover)?.[metrica] + " venda(s)"}
          </span>
        )}
        <span>{fmtDiaCurto(serie[serie.length - 1]?.dia || "")}</span>
      </div>
    </section>
  );
}

/* ---------------- 9. Calendário do mês em cores ---------------- */
const COR_NIVEL = {
  meta: "bg-emerald-500 text-white",
  media: "bg-sky-400 text-white",
  minima: "bg-amber-400 text-white",
  abaixo: "bg-red-400 text-white",
  sem: "bg-slate-100 text-slate-400",
  folga: "bg-slate-50 text-slate-300",
};

function nivelDoDia(d, metrica) {
  if (!d.diaUtil) return "folga";
  if (!d.temMeta) return "sem";
  if (metrica === "vendas") {
    if (d.metaVendasDia == null) return "sem";
    if (d.vendas >= d.metaVendasDia) return "meta";
    if (d.vendas >= d.metaVendasMedia) return "media";
    if (d.vendas >= d.metaVendasMinima) return "minima";
    return "abaixo";
  }
  if (d.metaRecebimentosDia == null) return "sem";
  if (d.recebimentos >= d.metaRecebimentosDia) return "meta";
  if (d.recebimentos >= d.metaRecebimentosMedia) return "media";
  if (d.recebimentos >= d.metaRecebimentosMinima) return "minima";
  return "abaixo";
}

export function CalendarioMes({ serie, diaAtual, onDia }) {
  const [metrica, setMetrica] = useState("recebimentos");
  if (!serie?.length) return null;

  // Alinha o 1º dia na coluna certa da semana (domingo = coluna 0).
  const vazios = chaveDia(serie[0].dia).getUTCDay();

  return (
    <section className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-800">Calendário do mês</h2>
          <p className="text-[11px] text-slate-400">A cor é o nível que bateu no dia. Clique pra abrir.</p>
        </div>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
          {[
            { key: "recebimentos", label: "Recebimento" },
            { key: "vendas", label: "Vendas" },
          ].map((x) => (
            <button
              key={x.key}
              onClick={() => setMetrica(x.key)}
              className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${
                metrica === x.key ? "bg-white shadow-sm text-slate-700 font-medium" : "text-slate-500"
              }`}
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {DIA_CURTO.map((d, i) => (
          <span key={i} className="text-[10px] text-slate-400 text-center pb-0.5">{d}</span>
        ))}
        {Array.from({ length: vazios }).map((_, i) => <span key={"v" + i} />)}
        {serie.map((d) => {
          const nv = nivelDoDia(d, metrica);
          const atual = d.dia === diaAtual;
          const valor = metrica === "vendas" ? d.vendas : d.recebimentos;
          const meta = metrica === "vendas" ? d.metaVendasDia : d.metaRecebimentosDia;
          return (
            <button
              key={d.dia}
              type="button"
              onClick={() => onDia?.(d.dia)}
              title={
                nv === "folga"
                  ? `${fmtDiaCurto(d.dia)} — domingo (folga)`
                  : nv === "sem"
                  ? `${fmtDiaCurto(d.dia)} — ${valor} (sem meta registrada nesse dia)`
                  : `${fmtDiaCurto(d.dia)} — ${valor} de ${meta}`
              }
              className={`aspect-square rounded-md text-[10px] font-medium flex items-center justify-center transition-transform hover:scale-105 ${COR_NIVEL[nv]} ${
                atual ? "ring-2 ring-slate-800 ring-offset-1" : ""
              }`}
            >
              {diaDoMes(d.dia)}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-[10px] text-slate-500">
        {[
          ["meta", "Meta cheia"], ["media", "Média"], ["minima", "Mínima"],
          ["abaixo", "Abaixo"], ["sem", "Sem meta"], ["folga", "Folga"],
        ].map(([k, label]) => (
          <span key={k} className="flex items-center gap-1">
            <span className={`w-2.5 h-2.5 rounded ${COR_NIVEL[k]}`} /> {label}
          </span>
        ))}
      </div>
    </section>
  );
}

/* ---------------- 6. Placar por responsável ---------------- */
export function PlacarEquipe({ placar, onUsuario }) {
  if (!placar?.length) return null;
  return (
    <section className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-800">Placar do dia por pessoa</h2>
        <p className="text-[11px] text-slate-400">
          Venda conta pro responsável do lead; recebimento, pra quem deu a baixa. Clique num nome pra ver só ele.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400 border-b border-slate-100">
              <th className="text-left font-medium px-4 py-2">Pessoa</th>
              <th className="text-right font-medium px-3 py-2">Vendas</th>
              <th className="text-right font-medium px-3 py-2">Liberado</th>
              <th className="text-right font-medium px-3 py-2">Clientes</th>
              <th className="text-right font-medium px-3 py-2">Recebido</th>
              <th className="text-right font-medium px-3 py-2">Recuperado</th>
              <th className="text-right font-medium px-4 py-2">Carteira</th>
            </tr>
          </thead>
          <tbody>
            {placar.map((r) => (
              <tr
                key={r.nome}
                onClick={() => onUsuario?.(r.nome)}
                className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 cursor-pointer"
              >
                <td className="px-4 py-2.5 text-slate-700 truncate">{r.nome}</td>
                <td className="px-3 py-2.5 text-right text-slate-500">{r.vendas}</td>
                <td className="px-3 py-2.5 text-right text-slate-500">{moneyCurto(r.valorVendido)}</td>
                <td className="px-3 py-2.5 text-right text-slate-500">{r.recebimentos}</td>
                <td className="px-3 py-2.5 text-right font-medium text-emerald-600">{money(r.valorRecebido)}</td>
                <td className="px-3 py-2.5 text-right text-amber-600">{money(r.valorRecuperado)}</td>
                <td className="px-4 py-2.5 text-right text-slate-400">{r.carteira}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------------- 10. Sequência de dias batendo ---------------- */
export function Sequencia({ seq }) {
  if (!seq || seq.diasAvaliados === 0) return null;
  const itens = [
    { n: seq.vendasCheia, label: "meta cheia de vendas", cor: "text-emerald-600" },
    { n: seq.vendasMinima, label: "mínima de vendas", cor: "text-amber-600" },
    { n: seq.recebimentosMinima, label: "mínima de recebimento", cor: "text-sky-600" },
  ].filter((x) => x.n > 0);

  if (!itens.length) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-4">
        <p className="text-xs text-slate-400">
          Nenhuma sequência ativa — o último dia fechado não bateu nenhuma das metas.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-amber-500"><Icone nome="trofeu" className="w-4 h-4" /></span>
        <h2 className="text-sm font-semibold text-slate-800">Sequência atual</h2>
      </div>
      <ul className="space-y-1">
        {itens.map((x) => (
          <li key={x.label} className="text-xs text-slate-600">
            <strong className={x.cor}>{x.n} dia{x.n > 1 ? "s" : ""} seguido{x.n > 1 ? "s" : ""}</strong> na {x.label}
          </li>
        ))}
      </ul>
      <p className="text-[10px] text-slate-400 mt-2">
        Conta só dias úteis já fechados — hoje ainda pode bater, então não entra.
      </p>
    </div>
  );
}
