"use client";

import { useEffect, useState } from "react";
import Secao from "@/components/SecaoColapsavel";

const money = (n) => (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const horasTxt = (seg) => {
  const m = Math.round((seg || 0) / 60);
  return m < 60 ? `${m}min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
};
const ddmm = (s) => s.slice(8, 10) + "/" + s.slice(5, 7);

// Barras = recebido (R$), linha = horas ativas no sistema do colaborador escolhido. Por dia do período ou por hora do dia.
export default function RecebimentoVsTrabalho({ ini, fim }) {
  const [usuario, setUsuario] = useState("");
  const [visao, setVisao] = useState("dia"); // "dia" | "hora"
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [hover, setHover] = useState(null);
  const [semAcesso, setSemAcesso] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/relatorios/recebimento-trabalho?${new URLSearchParams({ ini, fim, usuario })}`)
      .then(async (r) => ({ ok: r.ok, st: r.status, d: await r.json().catch(() => null) }))
      .then(({ ok, st, d }) => {
        if (!vivo) return;
        if (st === 403) { setSemAcesso(true); return; }
        if (!ok) { setErro(d?.error || "Não foi possível calcular."); return; }
        setErro(""); setDados(d);
      })
      .catch(() => vivo && setErro("Não foi possível calcular."));
    return () => { vivo = false; };
  }, [ini, fim, usuario]);

  const pontos = (visao === "dia" ? dados?.dias : dados?.horas) || [];
  const rotulo = (p) => (visao === "dia" ? ddmm(p.dia) : `${String(p.hora).padStart(2, "0")}h`);
  const maxR = Math.max(1, ...pontos.map((p) => p.recebido));
  const maxS = Math.max(3600, ...pontos.map((p) => p.segundos));
  const n = Math.max(1, pontos.length);

  const W = 720, H = 220, PL = 50, PR = 44, PT = 18, PB = 26;
  const larg = (W - PL - PR) / n;
  const cx = (i) => PL + larg * i + larg / 2;
  const yR = (v) => PT + (1 - v / maxR) * (H - PT - PB);
  const yS = (v) => PT + (1 - v / maxS) * (H - PT - PB);
  const linha = pontos.map((p, i) => `${i ? "L" : "M"}${cx(i).toFixed(1)},${yS(p.segundos).toFixed(1)}`).join(" ");
  const passo = Math.ceil(n / 16);
  const t = dados?.total;
  const quem = usuario || "todos os colaboradores";
  const hv = hover != null ? pontos[hover] : null;

  if (semAcesso) return null; // só admin vê tempo de uso dos colaboradores
  return (
    <Secao titulo="Recebimento x horas trabalhadas" className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-4 mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h2 className="text-sm font-semibold text-slate-800">Recebimento x horas trabalhadas</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select value={usuario} onChange={(e) => setUsuario(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700" aria-label="Colaborador">
            <option value="">Todos os colaboradores</option>
            {(dados?.usuarios || []).map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <div className="flex gap-1">
            {[["dia", "Por dia"], ["hora", "Por hora do dia"]].map(([k, txt]) => (
              <button key={k} type="button" onClick={() => { setVisao(k); setHover(null); }} className={`text-xs rounded-full px-3 py-1 border ${visao === k ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200"}`}>{txt}</button>
            ))}
          </div>
        </div>
      </div>
      <p className="text-[11px] text-slate-400 mb-2">
        Barras: pagamentos de parcelas recebidos (operação toda). Linha: tempo ativo no sistema de {quem} (mouse/teclado com a tela aberta).
        {visao === "hora" && dados?.horasDesde && ini < dados.horasDesde ? ` As horas por hora do dia só existem desde ${ddmm(dados.horasDesde)}.` : ""}
      </p>
      {t && (
        <div className="flex flex-wrap gap-4 text-xs text-slate-600 mb-2">
          <span>Recebido: <b className="text-emerald-700">{money(t.recebido)}</b></span>
          <span>Horas trabalhadas: <b className="text-indigo-700">{horasTxt(t.segundos)}</b></span>
          <span>Recebido por hora trabalhada: <b className="text-slate-800">{t.porHora != null ? money(t.porHora) : "—"}</b></span>
        </div>
      )}
      {erro && <p className="text-xs text-red-500 mb-2">{erro}</p>}
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[480px]" onMouseLeave={() => setHover(null)}>
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={PL} x2={W - PR} y1={yR(maxR * f)} y2={yR(maxR * f)} stroke="#e2e8f0" />
              <text x={PL - 4} y={yR(maxR * f) + 3} textAnchor="end" fontSize="9" fill="#059669">{Math.round(maxR * f).toLocaleString("pt-BR")}</text>
              <text x={W - PR + 4} y={yS(maxS * f) + 3} fontSize="9" fill="#4f46e5">{horasTxt(maxS * f)}</text>
            </g>
          ))}
          {pontos.map((p, i) => (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={PL + larg * i} y={PT} width={larg} height={H - PT - PB} fill={hover === i ? "#f1f5f9" : "transparent"} />
              <rect x={cx(i) - Math.min(14, larg * 0.32)} y={yR(p.recebido)} width={Math.min(28, larg * 0.64)} height={Math.max(0, H - PB - yR(p.recebido))} rx="2" fill="#10b981" opacity="0.75" />
              {i % passo === 0 && <text x={cx(i)} y={H - 9} textAnchor="middle" fontSize="9" fill="#94a3b8">{rotulo(p)}</text>}
            </g>
          ))}
          {linha && <path d={linha} fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinejoin="round" pointerEvents="none" />}
          {pontos.map((p, i) => <circle key={i} cx={cx(i)} cy={yS(p.segundos)} r={hover === i ? 4 : 2.2} fill="#4f46e5" pointerEvents="none" />)}
          {hv && (
            <text x={Math.min(Math.max(cx(hover), 130), W - 130)} y={11} textAnchor="middle" fontSize="10" fill="#334155">
              {rotulo(hv)}: {money(hv.recebido)} · {horasTxt(hv.segundos)} trabalhadas{hv.segundos >= 600 ? ` · ${money(hv.recebido / (hv.segundos / 3600))}/h` : ""}
            </text>
          )}
        </svg>
      </div>
      <div className="flex gap-4 text-[11px] text-slate-500 mt-1">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-emerald-500/75" /> Recebido (R$)</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-indigo-600" /> Horas trabalhadas</span>
      </div>
    </Secao>
  );
}
