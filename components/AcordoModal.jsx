"use client";

import { useMemo, useState } from "react";

const money = (n) =>
  "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const hojeStr = () => new Date().toLocaleDateString("en-CA");

// Propõe um acordo parcelado pro que está em aberto. O valor combinado pode ser
// menor que a dívida (desconto embutido na negociação) — recuperar parte vale
// mais que insistir num valor cheio que não vem.
export default function AcordoModal({ contactId, contactName, valorAberto, onClose, onSalvou }) {
  const [form, setForm] = useState({
    valorTotal: String(valorAberto || ""),
    parcelas: "3",
    primeiroVencimento: hojeStr(),
    intervaloDias: "30",
    notas: "",
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const previa = useMemo(() => {
    const n = Number(form.parcelas);
    const total = Number(form.valorTotal);
    if (!n || n < 1 || !total) return null;
    const base = Math.floor((total / n) * 100) / 100;
    const ultima = Math.round((total - base * (n - 1)) * 100) / 100;
    const desconto = Number(valorAberto || 0) - total;
    return { base, ultima, n, desconto };
  }, [form.parcelas, form.valorTotal, valorAberto]);

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    setSalvando(true);
    const res = await fetch(`/api/contacts/${contactId}/negociacoes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "acordo_parcelado", ...form }),
    });
    const d = await res.json().catch(() => ({}));
    setSalvando(false);
    if (!res.ok) { setErro(d.error || "Erro ao criar o acordo."); return; }
    onSalvou?.();
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={salvar}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto thin-scroll p-5 space-y-3"
      >
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-800">Acordo parcelado</h3>
            <p className="text-xs text-slate-400 truncate">{contactName}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <div className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600">
          Em aberto hoje: <strong>{money(valorAberto)}</strong>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-slate-400">Valor total do acordo</span>
            <input
              type="number"
              step="0.01"
              value={form.valorTotal}
              onChange={(e) => setForm((f) => ({ ...f, valorTotal: e.target.value }))}
              className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Em quantas vezes</span>
            <input
              type="number"
              min="1"
              max="36"
              value={form.parcelas}
              onChange={(e) => setForm((f) => ({ ...f, parcelas: e.target.value }))}
              className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">1º vencimento</span>
            <input
              type="date"
              value={form.primeiroVencimento}
              onChange={(e) => setForm((f) => ({ ...f, primeiroVencimento: e.target.value }))}
              className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Intervalo (dias)</span>
            <input
              type="number"
              min="1"
              max="60"
              value={form.intervaloDias}
              onChange={(e) => setForm((f) => ({ ...f, intervaloDias: e.target.value }))}
              className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-xs text-slate-400">Observação (opcional)</span>
          <input
            value={form.notas}
            onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
            placeholder="Ex.: cliente perdeu o emprego, combinou pagar no salário"
            className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400"
          />
        </label>

        {previa && (
          <div className="rounded-lg border border-sky-200 bg-sky-50 p-2.5 text-xs text-slate-600 space-y-1">
            <p>
              {previa.n}× de <strong>{money(previa.base)}</strong>
              {previa.ultima !== previa.base && <> (última de {money(previa.ultima)})</>}
            </p>
            {previa.desconto > 0 && (
              <p className="text-amber-700">Desconto embutido: {money(previa.desconto)}</p>
            )}
            {previa.desconto < 0 && (
              <p className="text-slate-500">Acréscimo sobre a dívida: {money(-previa.desconto)}</p>
            )}
          </div>
        )}

        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          As parcelas em aberto de hoje saem da cobrança e são substituídas pelas do acordo. O que já foi pago não muda.
        </p>

        {erro && <p className="text-xs text-red-500">{erro}</p>}

        <button
          disabled={salvando}
          className="w-full bg-emerald-500 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 transition-colors"
        >
          {salvando ? "Criando…" : "Criar acordo"}
        </button>
      </form>
    </div>
  );
}
