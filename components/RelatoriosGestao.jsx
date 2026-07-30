"use client";

import { useCallback, useEffect, useState } from "react";
import ContactModal from "@/components/ContactModal";
import Icone from "@/components/Icones";
import { baixarCsv, numeroCsv } from "@/lib/exportar";

const money = (n) =>
  "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Relatórios de gestão: quem recupera mais, quanto da carteira provavelmente
// não volta, e quais clientes de fato dão lucro.
export default function RelatoriosGestao() {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openContactId, setOpenContactId] = useState(null);
  const [ordemRent, setOrdemRent] = useState("lucro"); // lucro | prejuizo

  const load = useCallback(async () => {
    const res = await fetch("/api/relatorios/gestao").catch(() => null);
    // 403 = não é admin: o bloco simplesmente não existe pra essa pessoa, em
    // vez de mostrar um erro que ela não pode resolver.
    setD(res?.ok ? await res.json().catch(() => null) : null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading || !d) return null;

  const rentOrdenada = ordemRent === "lucro"
    ? d.rentabilidade
    : [...d.rentabilidade].sort((a, b) => a.lucro - b.lucro);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* -------- Comparativo entre cobradores -------- */}
      <section className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-slate-100">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-800">Comparativo entre cobradores</h2>
            <p className="text-[11px] text-slate-400">
              Quanto cada um recuperou e quantos casos estouraram na carteira dele.
            </p>
          </div>
          {d.cobradores.length > 0 && (
            <button
              type="button"
              onClick={() => baixarCsv("cobradores", [
                { label: "Cobrador", chave: "nome" },
                { label: "Recuperado", valor: (r) => numeroCsv(r.recuperado) },
                { label: "Baixas", chave: "baixas" },
                { label: "% em dia", valor: (r) => r.pctEmDia ?? "" },
                { label: "Carteira aberta", valor: (r) => numeroCsv(r.carteira) },
                { label: "Clientes atrasados", chave: "atrasadas" },
                { label: "Calotes (Cravo)", chave: "calotes" },
              ], d.cobradores)}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-emerald-600 shrink-0"
            >
              <Icone nome="baixar" className="w-3 h-3" /> CSV
            </button>
          )}
        </div>
        {d.cobradores.length === 0 ? (
          <p className="text-sm text-slate-400 p-6 text-center">Nenhuma baixa registrada ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-400 border-b border-slate-100">
                  <th className="text-left font-medium px-4 py-2">Cobrador</th>
                  <th className="text-right font-medium px-3 py-2">Recuperado</th>
                  <th className="text-right font-medium px-3 py-2">Baixas</th>
                  <th className="text-right font-medium px-3 py-2">% em dia</th>
                  <th className="text-right font-medium px-3 py-2">Carteira aberta</th>
                  <th className="text-right font-medium px-4 py-2">Calotes</th>
                </tr>
              </thead>
              <tbody>
                {d.cobradores.map((r) => (
                  <tr key={r.nome} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-2.5 text-slate-700 truncate">{r.nome}</td>
                    <td className="px-3 py-2.5 text-right font-medium text-emerald-600">{money(r.recuperado)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-500">{r.baixas}</td>
                    <td className="px-3 py-2.5 text-right text-slate-500">
                      {r.pctEmDia != null ? `${r.pctEmDia}%` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-500">{money(r.carteira)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={r.calotes > 0 ? "text-red-600 font-medium" : "text-slate-400"}>
                        {r.calotes}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* -------- Provisão de perda -------- */}
      <section className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-800">Projeção de perda (provisão)</h2>
            <p className="text-[11px] text-slate-400">
              Quanto da carteira atrasada provavelmente não volta, pelo % esperado de cada faixa.
              Configure em Configurações → Provisão.
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[11px] text-slate-400">Perda provável</p>
            <p className="text-xl font-semibold text-red-600">{money(d.provisao.totalProvisionado)}</p>
            <p className="text-[10px] text-slate-400">de {money(d.provisao.totalAtrasado)} atrasados</p>
          </div>
        </div>
        <ul className="space-y-2">
          {d.provisao.faixas.map((f) => {
            const pctBarra = d.provisao.totalAtrasado > 0
              ? Math.round((f.valor / d.provisao.totalAtrasado) * 100)
              : 0;
            return (
              <li key={f.key}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-600">
                    {f.label} <span className="text-slate-400">· {f.clientes} cliente(s) · {f.pct}% de perda esperada</span>
                  </span>
                  <span className="text-slate-500">
                    {money(f.valor)} → <strong className="text-red-600">{money(f.provisionado)}</strong>
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5">
                  <div className="h-1.5 rounded-full bg-red-400" style={{ width: `${pctBarra}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* -------- Rentabilidade por cliente -------- */}
      <section className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-100">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-800">Rentabilidade por cliente</h2>
            <p className="text-[11px] text-slate-400">
              Lucro = tudo que ele já pagou menos tudo que você já liberou pra ele, na vida.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
              {[
                { key: "lucro", label: "Mais lucro" },
                { key: "prejuizo", label: "Mais prejuízo" },
              ].map((o) => (
                <button
                  key={o.key}
                  onClick={() => setOrdemRent(o.key)}
                  className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${
                    ordemRent === o.key ? "bg-white shadow-sm text-slate-700 font-medium" : "text-slate-500"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {d.rentabilidade.length > 0 && (
              <button
                type="button"
                onClick={() => baixarCsv("rentabilidade", [
                  { label: "Cliente", chave: "name" },
                  { label: "Telefone", chave: "phone" },
                  { label: "Etapa", chave: "etapa" },
                  { label: "Ciclos", chave: "ciclos" },
                  { label: "Emprestado", valor: (r) => numeroCsv(r.emprestado) },
                  { label: "Recebido", valor: (r) => numeroCsv(r.recebido) },
                  { label: "Lucro", valor: (r) => numeroCsv(r.lucro) },
                  { label: "Em aberto", valor: (r) => numeroCsv(r.emAberto) },
                ], rentOrdenada)}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-emerald-600"
              >
                <Icone nome="baixar" className="w-3 h-3" /> CSV
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 p-4 border-b border-slate-100">
          <div>
            <p className="text-[11px] text-slate-400">Lucro total</p>
            <p className={`text-lg font-semibold ${d.totais.lucroTotal >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {money(d.totais.lucroTotal)}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-slate-400">Dão lucro</p>
            <p className="text-lg font-semibold text-emerald-600">{d.totais.clientesLucrativos}</p>
          </div>
          <div>
            <p className="text-[11px] text-slate-400">Dão prejuízo</p>
            <p className="text-lg font-semibold text-red-600">{d.totais.clientesPrejuizo}</p>
          </div>
        </div>

        {rentOrdenada.length === 0 ? (
          <p className="text-sm text-slate-400 p-6 text-center">Sem movimentação financeira por cliente ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-400 border-b border-slate-100">
                  <th className="text-left font-medium px-4 py-2">Cliente</th>
                  <th className="text-right font-medium px-3 py-2">Ciclos</th>
                  <th className="text-right font-medium px-3 py-2">Emprestado</th>
                  <th className="text-right font-medium px-3 py-2">Recebido</th>
                  <th className="text-right font-medium px-3 py-2">Lucro</th>
                  <th className="text-right font-medium px-4 py-2">Em aberto</th>
                </tr>
              </thead>
              <tbody>
                {rentOrdenada.slice(0, 50).map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setOpenContactId(c.id)}
                    className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 cursor-pointer"
                  >
                    <td className="px-4 py-2.5 min-w-0">
                      <p className="text-slate-700 truncate">{c.name || "Sem nome"}</p>
                      <p className="text-[10px] text-slate-400 truncate">{c.etapa}</p>
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-500">{c.ciclos}</td>
                    <td className="px-3 py-2.5 text-right text-slate-500">{money(c.emprestado)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-500">{money(c.recebido)}</td>
                    <td className={`px-3 py-2.5 text-right font-medium ${c.lucro >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {money(c.lucro)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-500">{money(c.emAberto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rentOrdenada.length > 50 && (
              <p className="text-[11px] text-slate-400 text-center py-2">
                Mostrando 50 de {rentOrdenada.length} — baixe o CSV pra ver todos.
              </p>
            )}
          </div>
        )}
      </section>

      {openContactId && (
        <ContactModal contactId={openContactId} onClose={() => setOpenContactId(null)} onChanged={load} />
      )}
    </div>
  );
}
