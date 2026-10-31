"use client";

import { useEffect, useState } from "react";
import Secao from "@/components/SecaoColapsavel";

const money = (n) => (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Gráfico de linha: recebimentos por hora do dia (Brasília), pra ver os melhores horários de cobrança.
export default function HorarioRecebimento({ ini, fim }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [metrica, setMetrica] = useState("qtd"); // "qtd" | "valor"
  const [hover, setHover] = useState(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/relatorios/horario-recebimento?${new URLSearchParams({ ini, fim })}`)
      .then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => null) }))
      .then(({ ok, d }) => {
        if (!vivo) return;
        if (!ok) { setErro(d?.error || "Não foi possível calcular."); return; }
        setErro(""); setDados(d);
      })
      .catch(() => vivo && setErro("Não foi possível calcular."));
    return () => { vivo = false; };
  }, [ini, fim]);

  const horas = dados?.horas || [];
  const vals = horas.map((h) => h[metrica]);
  const max = Math.max(1, ...vals);
  const melhor = vals.some((v) => v > 0) ? vals.indexOf(Math.max(...vals)) : -1;
  const fmt = (v) => (metrica === "valor" ? money(v) : `${v} pgto${v === 1 ? "" : "s"}`);

  // Top 3 horários
  const top = horas.filter((h) => h[metrica] > 0).sort((a, b) => b[metrica] - a[metrica]).slice(0, 3);

  const W = 720, H = 200, PL = 36, PR = 12, PT = 14, PB = 24;
  const x = (h) => PL + (h / 23) * (W - PL - PR);
  const y = (v) => PT + (1 - v / max) * (H - PT - PB);
  const linha = horas.map((h, i) => `${i ? "L" : "M"}${x(h.hora).toFixed(1)},${y(h[metrica]).toFixed(1)}`).join(" ");
  const area = horas.length ? `${linha} L${x(23).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z` : "";

  return (
    <Secao titulo="Horários de recebimento" className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-4 mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h2 className="text-sm font-semibold text-slate-800">Horários de recebimento</h2>
        <div className="flex gap-1">
          {[["qtd", "Quantidade"], ["valor", "Valor"]].map(([k, t]) => (
            <button key={k} type="button" onClick={() => setMetrica(k)} className={`text-xs rounded-full px-3 py-1 border ${metrica === k ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200"}`}>{t}</button>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-slate-400 mb-2">
        Pagamentos de parcelas de {ini.split("-").reverse().join("/")} a {fim.split("-").reverse().join("/")}, pela hora em que entraram (Brasília).
        {dados ? ` Total: ${dados.total.qtd} pagamentos · ${money(dados.total.valor)}.` : ""}
      </p>
      {erro && <p className="text-xs text-red-500 mb-2">{erro}</p>}
      {top.length > 0 && (
        <p className="text-xs text-slate-600 mb-2">
          Melhores horários:{" "}
          {top.map((h, i) => (
            <span key={h.hora} className="font-medium text-emerald-700">{i ? " · " : ""}{String(h.hora).padStart(2, "0")}h ({fmt(h[metrica])})</span>
          ))}
        </p>
      )}
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[480px]" onMouseLeave={() => setHover(null)}>
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={PL} x2={W - PR} y1={y(max * f)} y2={y(max * f)} stroke="#e2e8f0" strokeWidth="1" />
              <text x={PL - 4} y={y(max * f) + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{metrica === "valor" ? Math.round(max * f) : Math.round(max * f * 10) / 10}</text>
            </g>
          ))}
          {horas.map((h) => (h.hora % 2 === 0) && (
            <text key={h.hora} x={x(h.hora)} y={H - 8} textAnchor="middle" fontSize="9" fill="#94a3b8">{h.hora}h</text>
          ))}
          {area && <path d={area} fill="#10b981" opacity="0.12" />}
          {linha && <path d={linha} fill="none" stroke="#059669" strokeWidth="2" strokeLinejoin="round" />}
          {horas.map((h) => (
            <g key={h.hora} onMouseEnter={() => setHover(h.hora)}>
              <rect x={x(h.hora) - 12} y={PT} width="24" height={H - PT - PB} fill="transparent" />
              <circle cx={x(h.hora)} cy={y(h[metrica])} r={h.hora === melhor || hover === h.hora ? 4 : 2.2} fill={h.hora === melhor ? "#f59e0b" : "#059669"} />
            </g>
          ))}
          {hover != null && horas[hover] && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PT} y2={H - PB} stroke="#94a3b8" strokeDasharray="3 3" />
              <text x={Math.min(Math.max(x(hover), 90), W - 90)} y={10} textAnchor="middle" fontSize="10" fill="#334155">
                {String(hover).padStart(2, "0")}h: {horas[hover].qtd} pgto(s) · {money(horas[hover].valor)}
              </text>
            </g>
          )}
        </svg>
      </div>
    </Secao>
  );
}
