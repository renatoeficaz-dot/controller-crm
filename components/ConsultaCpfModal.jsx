"use client";

import { useState } from "react";

export default function ConsultaCpfModal({ onClose, onAbrirContato }) {
  const [cpf, setCpf] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultado, setResultado] = useState(null); // undefined = ainda não consultado; null = ok; objeto = calote
  const [erro, setErro] = useState("");

  async function consultar(e) {
    e.preventDefault();
    setErro("");
    setResultado(undefined);
    setBuscando(true);
    const r = await fetch(`/api/cpf-check?cpf=${encodeURIComponent(cpf)}`).then((r) => r.json()).catch(() => null);
    setBuscando(false);
    if (!r || r.error) {
      setErro(r?.error || "Erro ao consultar.");
      return;
    }
    setResultado(r.calote);
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">Consultar CPF</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={consultar} className="p-5 space-y-3">
          <label className="block">
            <span className="text-xs text-slate-400">CPF do cliente</span>
            <input
              autoFocus
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              placeholder="000.000.000-00"
              className="mt-1 w-full text-lg font-semibold border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400"
            />
            <span className="text-[11px] text-slate-400 mt-1 block">
              Verifica se esse CPF já deu calote em algum cadastro antes de você prosseguir.
            </span>
          </label>

          <button
            type="submit"
            disabled={buscando}
            className="w-full bg-emerald-500 text-white rounded-lg py-2.5 font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50"
          >
            {buscando ? "Consultando…" : "Consultar"}
          </button>

          {erro && <p className="text-sm text-red-600">{erro}</p>}

          {resultado === null && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-700">
              Nenhum problema encontrado — esse CPF não tem calote registrado.
            </div>
          )}

          {resultado && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 space-y-2">
              <p>
                <strong>Atenção:</strong> esse CPF já deu calote no cadastro de{" "}
                <strong>{resultado.name}</strong> ({resultado.phone || "sem telefone"}).
              </p>
              {onAbrirContato && (
                <button
                  type="button"
                  onClick={() => onAbrirContato(resultado.id)}
                  className="text-xs font-medium text-red-700 underline"
                >
                  Ver esse cadastro
                </button>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
