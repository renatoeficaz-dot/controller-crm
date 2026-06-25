"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

const money = (n) =>
  Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dateLong = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString("pt-BR", {
        day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
      })
    : "—";

const dateTime = (iso) =>
  iso
    ? new Date(iso)
        .toLocaleString("pt-BR", {
          day: "2-digit", month: "2-digit", year: "numeric",
          hour: "2-digit", minute: "2-digit", second: "2-digit",
        })
        .replace(",", "")
    : "—";

const FILTERS = ["Todos", "Sem caixa", "Aberta", "Fechada"];

export default function UnitsTable() {
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("Todos");
  const [verTodas, setVerTodas] = useState(false);
  const router = useRouter();

  const load = useCallback(async () => {
    const res = await fetch("/api/units");
    setUnits(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleStatus(u) {
    const status = u.status === "open" ? "closed" : "open";
    setUnits((prev) => prev.map((x) => (x.id === u.id ? { ...x, status } : x)));
    await fetch(`/api/units/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  const filtered = units.filter((u) => {
    if (filter === "Aberta") return u.status === "open";
    if (filter === "Fechada") return u.status === "closed";
    if (filter === "Sem caixa") return !u.caixa;
    return true;
  });

  if (loading) return <div className="p-6 text-slate-400">Carregando empresas…</div>;

  return (
    <div className="p-4 md:p-6">
      {/* Filtros do topo */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 min-w-[260px]">
          <option>/1/ - Empresa CN 1142801</option>
        </select>
        <select className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 min-w-[200px]">
          <option>Todas as unidades ({units.length})</option>
          {units.map((u) => (
            <option key={u.id}>
              {u.number} - {u.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={verTodas}
            onChange={(e) => setVerTodas(e.target.checked)}
            className="accent-emerald-500"
          />
          Ver todas as unidades
        </label>
      </div>

      {/* Card principal */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 border border-slate-300 rounded-lg px-3 py-1.5">
            {filter !== "Todos" && (
              <button
                onClick={() => setFilter("Todos")}
                className="text-slate-400 hover:text-slate-600"
                title="Limpar filtro"
              >
                ×
              </button>
            )}
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="text-sm bg-transparent outline-none text-slate-700"
            >
              {FILTERS.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </div>
          <button
            className="flex items-center gap-2 border border-emerald-300 text-emerald-600 rounded-lg px-4 py-2 text-sm hover:bg-emerald-50"
          >
            ⚙ Configurar pontuação
          </button>
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto thin-scroll">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-emerald-500 text-white text-left">
                {["Pontuação", "Unidade", "CN", "Localização", "Estado", "Caixa", "Data da caixa",
                  "Caixa inicial", "Caixa final", "Progresso", "Última sincronização", "PIN / Versão do aplicativo"].map((h) => (
                  <th key={h} className="font-semibold px-3 py-2.5 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((u, i) => (
                <tr
                  key={u.id}
                  onClick={() => router.push(`/rutas/${u.id}`)}
                  className={`border-b border-slate-100 cursor-pointer hover:bg-emerald-50/40 ${i % 2 ? "bg-slate-50/50" : "bg-white"}`}
                >
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center justify-center w-9 h-9 rounded bg-slate-500 text-white font-semibold">
                      {u.score}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-semibold text-slate-800 whitespace-nowrap">
                    {u.number} - {u.name}
                  </td>
                  <td className="px-3 py-3 text-slate-500">{u.cn}</td>
                  <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{u.location}</td>
                  <td className="px-3 py-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleStatus(u); }}
                      className={`rounded-full px-4 py-1 text-xs font-medium text-white transition-colors ${
                        u.status === "open"
                          ? "bg-emerald-500 hover:bg-emerald-600"
                          : "bg-slate-400 hover:bg-slate-500"
                      }`}
                      title="Clique para alternar"
                    >
                      {u.status === "open" ? "Abrir" : "Fechado"}
                    </button>
                  </td>
                  <td className="px-3 py-3 text-slate-600">{u.caixa ?? "—"}</td>
                  <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{dateLong(u.caixaDate)}</td>
                  <td className="px-3 py-3 text-slate-700 whitespace-nowrap">{money(u.caixaInicial)}</td>
                  <td className="px-3 py-3 text-slate-700 whitespace-nowrap">{money(u.caixaFinal)}</td>
                  <td className="px-3 py-3 text-slate-700">{u.progresso}%</td>
                  <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{dateTime(u.ultimaSync)}</td>
                  <td className="px-3 py-3 text-slate-600 whitespace-nowrap">
                    PIN: {u.pin || "—"} / Versão: {u.appVersion || "—"}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-3 py-8 text-center text-slate-400">
                    Nenhuma unidade para este filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
