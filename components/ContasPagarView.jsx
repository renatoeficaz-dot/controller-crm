"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Icone from "@/components/Icones";

const money = (n) =>
  "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const hojeStr = () => new Date().toLocaleDateString("en-CA");
const diaStr = (v) => String(v).slice(0, 10);
const fmtData = (v) => new Date(diaStr(v) + "T00:00:00").toLocaleDateString("pt-BR");

const EMPTY = {
  descricao: "", valor: "", vencimento: hojeStr(), categoriaId: "", bancoId: "",
  observacao: "", recorrente: false, tipoRecorrencia: "meses", recorrenciaMeses: "12",
};

export default function ContasPagarView() {
  const [contas, setContas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [bancos, setBancos] = useState([]);
  const [status, setStatus] = useState("aberto");
  const [form, setForm] = useState(EMPTY);
  const [formAberto, setFormAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [c, cat, b] = await Promise.all([
      fetch(`/api/contas-pagar?status=${status}`).then((r) => r.json()).catch(() => []),
      fetch("/api/lancamentos/categorias").then((r) => r.json()).catch(() => []),
      fetch("/api/lancamentos/bancos").then((r) => r.json()).catch(() => []),
    ]);
    setContas(Array.isArray(c) ? c : []);
    setCategorias(Array.isArray(cat) ? cat.filter((x) => x.type === "saida") : []);
    setBancos(Array.isArray(b) ? b : []);
    setLoading(false);
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const totais = useMemo(() => {
    const hoje = hojeStr();
    const abertas = contas.filter((c) => !c.pago);
    return {
      aberto: abertas.reduce((a, c) => a + c.valor, 0),
      vencidas: abertas.filter((c) => diaStr(c.vencimento) < hoje).reduce((a, c) => a + c.valor, 0),
      qtdVencidas: abertas.filter((c) => diaStr(c.vencimento) < hoje).length,
      venceHoje: abertas.filter((c) => diaStr(c.vencimento) === hoje).reduce((a, c) => a + c.valor, 0),
    };
  }, [contas]);

  async function criar(e) {
    e.preventDefault();
    setErro("");
    setSalvando(true);
    const res = await fetch("/api/contas-pagar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        // "ilimitada" = recorrente sem número de meses definido
        recorrenciaMeses: form.recorrente && form.tipoRecorrencia === "meses" ? form.recorrenciaMeses : null,
      }),
    });
    const d = await res.json().catch(() => ({}));
    setSalvando(false);
    if (!res.ok) { setErro(d.error || "Erro ao salvar."); return; }
    setForm(EMPTY);
    setFormAberto(false);
    load();
  }

  async function pagar(conta) {
    if (!confirm(`Marcar "${conta.descricao}" como paga (${money(conta.valor)})?\n\nIsso gera um lançamento de saída e altera o saldo.`)) return;
    await fetch(`/api/contas-pagar/${conta.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pago: true }),
    });
    load();
  }

  async function estornar(conta) {
    if (!confirm(`Estornar "${conta.descricao}"?\n\nO lançamento de saída correspondente será removido.`)) return;
    await fetch(`/api/contas-pagar/${conta.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pago: false }),
    });
    load();
  }

  async function excluir(conta) {
    const ehSerie = conta.recorrente || conta.origemId;
    let futuras = false;
    if (ehSerie) {
      futuras = confirm(
        `"${conta.descricao}" faz parte de uma recorrência.\n\n` +
        `OK = excluir esta e todas as próximas em aberto\nCancelar = excluir só esta`
      );
    } else if (!confirm(`Excluir "${conta.descricao}"?`)) {
      return;
    }
    await fetch(`/api/contas-pagar/${conta.id}${futuras ? "?futuras=1" : ""}`, { method: "DELETE" });
    load();
  }

  function situacao(c) {
    if (c.pago) return { label: "Paga", cor: "text-emerald-600 bg-emerald-50" };
    const d = diaStr(c.vencimento);
    const hoje = hojeStr();
    if (d < hoje) return { label: "Vencida", cor: "text-red-600 bg-red-50" };
    if (d === hoje) return { label: "Vence hoje", cor: "text-amber-600 bg-amber-50" };
    return { label: "A vencer", cor: "text-slate-500 bg-slate-100" };
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-400">Total em aberto</p>
          <p className="text-2xl font-semibold mt-1 text-slate-700">{money(totais.aberto)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-400">Vencidas</p>
          <p className="text-2xl font-semibold mt-1 text-red-500">{money(totais.vencidas)}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{totais.qtdVencidas} conta(s)</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-400">Vence hoje</p>
          <p className="text-2xl font-semibold mt-1 text-amber-600">{money(totais.venceHoje)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
          {[
            { key: "aberto", label: "Em aberto" },
            { key: "pago", label: "Pagas" },
            { key: "", label: "Todas" },
          ].map((o) => (
            <button
              key={o.key || "todas"}
              onClick={() => setStatus(o.key)}
              className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                status === o.key ? "bg-white shadow-sm text-slate-700 font-medium" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setFormAberto((v) => !v)}
          className="ml-auto bg-emerald-500 text-white rounded-lg px-3.5 py-2 text-sm font-medium hover:bg-emerald-600 transition-colors"
        >
          {formAberto ? "Cancelar" : "+ Nova conta a pagar"}
        </button>
      </div>

      {formAberto && (
        <form onSubmit={criar} className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 grid sm:grid-cols-2 gap-3">
          <label className="block sm:col-span-2">
            <span className="text-xs text-slate-400">Descrição</span>
            <input
              value={form.descricao}
              onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
              placeholder="Ex.: Aluguel da sala"
              className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Valor (R$)</span>
            <input
              type="number"
              step="0.01"
              value={form.valor}
              onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
              className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Vencimento</span>
            <input
              type="date"
              value={form.vencimento}
              onChange={(e) => setForm((f) => ({ ...f, vencimento: e.target.value }))}
              className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Categoria</span>
            <select
              value={form.categoriaId}
              onChange={(e) => setForm((f) => ({ ...f, categoriaId: e.target.value }))}
              className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-emerald-400"
            >
              <option value="">— Sem categoria —</option>
              {categorias.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Banco</span>
            <select
              value={form.bancoId}
              onChange={(e) => setForm((f) => ({ ...f, bancoId: e.target.value }))}
              className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-emerald-400"
            >
              <option value="">— Sem banco —</option>
              {bancos.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
            </select>
          </label>

          <div className="sm:col-span-2 bg-slate-50 rounded-xl p-3.5">
            <label className="flex items-center justify-between gap-2">
              <span className="text-sm text-slate-600">Repetir todo mês</span>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, recorrente: !f.recorrente }))}
                className={`relative shrink-0 w-9 h-5 rounded-full transition-colors ${form.recorrente ? "bg-emerald-500" : "bg-slate-200"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.recorrente ? "translate-x-4" : ""}`} />
              </button>
            </label>

            {form.recorrente && (
              <div className="mt-3 space-y-2">
                <div className="flex gap-1.5">
                  {[
                    { key: "meses", label: "Por X meses" },
                    { key: "ilimitada", label: "Ilimitada" },
                  ].map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, tipoRecorrencia: o.key }))}
                      className={`flex-1 text-xs rounded-lg py-2 border transition-colors ${
                        form.tipoRecorrencia === o.key
                          ? "bg-slate-800 text-white border-slate-800"
                          : "bg-white text-slate-600 border-slate-200"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                {form.tipoRecorrencia === "meses" ? (
                  <label className="block">
                    <span className="text-xs text-slate-400">Quantas vezes no total</span>
                    <input
                      type="number"
                      min="2"
                      max="120"
                      value={form.recorrenciaMeses}
                      onChange={(e) => setForm((f) => ({ ...f, recorrenciaMeses: e.target.value }))}
                      className="mt-0.5 w-32 text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400"
                    />
                  </label>
                ) : (
                  <p className="text-[11px] text-slate-400">
                    Sem data pra acabar. O sistema mantém sempre os próximos 12 meses lançados e vai criando os
                    seguintes conforme o tempo passa — dá pra encerrar quando quiser, excluindo as futuras.
                  </p>
                )}
              </div>
            )}
          </div>

          {erro && <p className="text-xs text-red-500 sm:col-span-2">{erro}</p>}
          <button
            disabled={salvando}
            className="sm:col-span-2 bg-emerald-500 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 transition-colors"
          >
            {salvando ? "Salvando…" : "Criar conta"}
          </button>
        </form>
      )}

      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
        {loading ? (
          <p className="text-sm text-slate-400 p-5">Carregando…</p>
        ) : contas.length === 0 ? (
          <p className="text-sm text-slate-400 p-5">Nenhuma conta {status === "pago" ? "paga" : status === "aberto" ? "em aberto" : ""}.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {contas.map((c) => {
              const s = situacao(c);
              return (
                <div key={c.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-medium truncate ${c.pago ? "text-slate-400 line-through" : "text-slate-700"}`}>
                        {c.descricao}
                      </span>
                      <span className={`text-[10px] rounded-full px-2 py-0.5 ${s.cor}`}>{s.label}</span>
                      {(c.recorrente || c.origemId) && (
                        <span className="flex items-center gap-1 text-[10px] rounded-full px-2 py-0.5 bg-sky-50 text-sky-600" title="Faz parte de uma recorrência">
                          <Icone nome="repetir" className="w-2.5 h-2.5" /> {c.recorrente && c.recorrenciaMeses == null ? "ilimitada" : "recorrente"}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Vence {fmtData(c.vencimento)}
                      {c.categoria ? ` · ${c.categoria.name}` : ""}
                      {c.banco ? ` · ${c.banco.name}` : ""}
                      {c.pago && c.pagoEm ? ` · pago em ${fmtData(c.pagoEm)}` : ""}
                    </p>
                  </div>
                  <p className={`text-sm font-semibold shrink-0 ${c.pago ? "text-slate-400" : "text-red-500"}`}>
                    {money(c.valor)}
                  </p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {c.pago ? (
                      <button onClick={() => estornar(c)} className="text-xs rounded-lg px-3 py-2 border border-slate-200 text-slate-600 hover:border-slate-300">
                        Estornar
                      </button>
                    ) : (
                      <button onClick={() => pagar(c)} className="text-xs rounded-lg px-3 py-2 bg-emerald-500 text-white hover:bg-emerald-600">
                        Pagar
                      </button>
                    )}
                    <button onClick={() => excluir(c)} className="text-xs text-red-400 hover:text-red-600 px-2">
                      Excluir
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
