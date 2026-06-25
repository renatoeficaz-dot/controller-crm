"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { aReceber, totalRecebido, inadimplenciaCravo, fimSemanaStr, fimMesStr } from "@/lib/relatorios";
import { hojeStr } from "@/lib/finance";

const money = (n) =>
  "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// "YYYY-MM-DD" do 1º dia do mês corrente
function inicioMesStr() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString("en-CA");
}
// "YYYY-MM-DD" da segunda-feira desta semana
function inicioSemanaStr() {
  const d = new Date();
  const dowSegBase = (d.getDay() + 6) % 7; // 0 = segunda
  d.setDate(d.getDate() - dowSegBase);
  return d.toLocaleDateString("en-CA");
}

const PRESETS = [
  { key: "hoje", label: "Hoje", range: () => [hojeStr(), hojeStr()] },
  { key: "semana", label: "Esta semana", range: () => [inicioSemanaStr(), fimSemanaStr()] },
  { key: "mes", label: "Este mês", range: () => [inicioMesStr(), fimMesStr()] },
];

export default function Relatorios() {
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState("mes");
  const [ini, setIni] = useState(inicioMesStr());
  const [fim, setFim] = useState(hojeStr());

  const load = useCallback(async () => {
    const data = await fetch("/api/stages").then((r) => r.json()).catch(() => []);
    setStages(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  function aplicarPreset(p) {
    setPreset(p.key);
    const [a, b] = p.range();
    setIni(a);
    setFim(b);
  }

  const receber = useMemo(() => aReceber(stages), [stages]);
  const recebido = useMemo(() => totalRecebido(stages, ini, fim), [stages, ini, fim]);
  const inad = useMemo(() => inadimplenciaCravo(stages), [stages]);

  if (loading) return <div className="p-6 text-slate-400">Carregando relatórios…</div>;

  return (
    <div className="flex-1 overflow-y-auto thin-scroll p-6 space-y-6 max-w-5xl">
      {/* A receber */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">A receber</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <Card titulo="Hoje" valor={receber.dia} cor="emerald" />
          <Card titulo="Esta semana" valor={receber.semana} cor="sky" />
          <Card titulo="Este mês" valor={receber.mes} cor="violet" />
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Parcelas em aberto que vencem de hoje até o fim de cada período (já com multa de 50% nas vencidas).
        </p>
      </section>

      {/* Total recebido por período */}
      <section>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <h2 className="text-sm font-semibold text-slate-700">Total recebido</h2>
          <div className="flex items-center gap-1.5 flex-wrap">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => aplicarPreset(p)}
                className={`text-xs rounded-full px-3 py-1 border transition-colors ${
                  preset === p.key
                    ? "bg-slate-800 text-white border-slate-800"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                }`}
              >
                {p.label}
              </button>
            ))}
            <input
              type="date"
              value={ini}
              onChange={(e) => { setPreset("custom"); setIni(e.target.value); }}
              className="text-xs border border-slate-200 rounded px-2 py-1 outline-none focus:border-emerald-400"
            />
            <span className="text-xs text-slate-400">até</span>
            <input
              type="date"
              value={fim}
              onChange={(e) => { setPreset("custom"); setFim(e.target.value); }}
              className="text-xs border border-slate-200 rounded px-2 py-1 outline-none focus:border-emerald-400"
            />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-3xl font-semibold text-emerald-600">{money(recebido)}</p>
          <p className="text-xs text-slate-400 mt-1">
            Recebido entre {ini} e {fim} (parcelas baixadas no período).
          </p>
        </div>
      </section>

      {/* Inadimplência (Cravo) */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">
          Inadimplência <span className="text-slate-400 font-normal">— leads em Cravo ({inad.clientes})</span>
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <Card titulo="Pendente em capital" valor={inad.pendenteCapital} cor="red" />
          <Card titulo="Pendente total (com honorários + multa)" valor={inad.pendenteTotal} cor="red" />
        </div>
      </section>
    </div>
  );
}

const CORES = {
  emerald: "text-emerald-600",
  sky: "text-sky-600",
  violet: "text-violet-600",
  red: "text-red-500",
};

function Card({ titulo, valor, cor }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <p className="text-xs text-slate-400">{titulo}</p>
      <p className={`text-2xl font-semibold mt-1 ${CORES[cor] || "text-slate-700"}`}>{money(valor)}</p>
    </div>
  );
}
