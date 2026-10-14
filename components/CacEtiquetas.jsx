"use client";

import { useEffect, useState } from "react";

const money = (n) => "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// CAC por etiqueta no período do filtro: o custo por lead de cada etiqueta é digitado aqui (fica salvo na etiqueta);
// venda = lead que foi para Recebimento no período.
export default function CacEtiquetas({ ini, fim, leadIni, leadFim, coorte }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [rascunho, setRascunho] = useState({});
  const [salvando, setSalvando] = useState(null);

  async function carregar() {
    const qs = new URLSearchParams({ ini, fim });
    if (leadIni) qs.set("leadIni", leadIni);
    if (leadFim) qs.set("leadFim", leadFim);
    if (coorte) qs.set("coorte", "1");
    const res = await fetch(`/api/relatorios/cac-etiquetas?${qs}`);
    const d = await res.json().catch(() => null);
    if (!res.ok) { setErro(d?.error || "Não foi possível calcular."); return; }
    setErro("");
    setDados(d);
  }
  useEffect(() => { carregar(); }, [ini, fim, leadIni, leadFim, coorte]);

  async function salvarCusto(l) {
    const txt = rascunho[l.id];
    if (txt === undefined) return;
    const limpo = txt.replace(/\./g, "").replace(",", ".").trim();
    const valor = limpo === "" ? null : Number(limpo);
    if (valor != null && (!Number.isFinite(valor) || valor < 0)) { setErro("Custo inválido."); return; }
    setSalvando(l.id);
    await fetch(`/api/tags/${l.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ custoPorLead: valor }) });
    setSalvando(null);
    setRascunho((r) => { const n = { ...r }; delete n[l.id]; return n; });
    carregar();
  }

  const linhas = dados?.linhas || [];
  return (
    <section className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-4 mt-4">
      <h2 className="text-sm font-semibold text-slate-800">CAC por etiqueta</h2>
      <p className="text-[11px] text-slate-400 mb-3">
        Digite o custo por lead de cada etiqueta. Leads criados de {(leadIni || ini).split("-").reverse().join("/")} a {(leadFim || fim).split("-").reverse().join("/")}; vendas = leads que foram para Recebimento de {ini.split("-").reverse().join("/")} a {fim.split("-").reverse().join("/")}{coorte ? " (só dos leads criados nessa janela)" : ""}. Custo = custo por lead × leads; CAC = custo ÷ vendas.
      </p>
      {erro && <p className="text-xs text-red-500 mb-2">{erro}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400 border-b border-slate-100">
              <th className="text-left font-medium py-2 pr-3">Etiqueta</th>
              <th className="text-right font-medium px-3 py-2">Custo por lead</th>
              <th className="text-right font-medium px-3 py-2">Leads</th>
              <th className="text-right font-medium px-3 py-2">Custo total</th>
              <th className="text-right font-medium px-3 py-2">Vendas</th>
              <th className="text-right font-medium px-3 py-2">Conversão</th>
              <th className="text-right font-medium pl-3 py-2">CAC</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id} className="border-b border-slate-50">
                <td className="py-1.5 pr-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: l.cor }} />
                    {l.nome}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-right">
                  <input
                    inputMode="decimal"
                    value={rascunho[l.id] ?? (l.custoPorLead != null ? String(l.custoPorLead).replace(".", ",") : "")}
                    onChange={(e) => setRascunho((r) => ({ ...r, [l.id]: e.target.value }))}
                    onBlur={() => salvarCusto(l)}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                    placeholder="R$ 0,00"
                    className={`w-24 text-right text-xs border border-slate-200 rounded px-2 py-1 outline-none focus:border-emerald-400 ${salvando === l.id ? "opacity-50" : ""}`}
                  />
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{l.leads}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{l.custo != null ? money(l.custo) : "—"}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{l.vendas}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{l.conversao != null ? (l.conversao * 100).toFixed(1) + "%" : "—"}</td>
                <td className="pl-3 py-1.5 text-right tabular-nums font-medium">{l.cac != null ? money(l.cac) : l.custo != null ? "sem vendas" : "—"}</td>
              </tr>
            ))}
            {linhas.length === 0 && (
              <tr><td colSpan={7} className="py-4 text-center text-xs text-slate-400">Nenhuma etiqueta cadastrada.</td></tr>
            )}
          </tbody>
          {dados?.total && linhas.some((l) => l.custo != null) && (
            <tfoot>
              <tr className="text-xs font-semibold text-slate-700">
                <td className="pt-2 pr-3">Total (etiquetas com custo)</td>
                <td />
                <td />
                <td className="pt-2 px-3 text-right tabular-nums">{money(dados.total.custo)}</td>
                <td className="pt-2 px-3 text-right tabular-nums">{dados.total.vendas}</td>
                <td />
                <td className="pt-2 pl-3 text-right tabular-nums">{dados.total.cac != null ? money(dados.total.cac) : "—"}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}
