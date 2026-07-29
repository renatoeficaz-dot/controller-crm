"use client";

import { useState } from "react";

export const TIPOS = [
  { valor: "ligacao", label: "Ligação" },
  { valor: "whatsapp", label: "WhatsApp" },
  { valor: "presencial", label: "Presencial" },
];

export const RESULTADOS = [
  { valor: "atendeu", label: "Atendeu" },
  { valor: "nao_atendeu", label: "Não atendeu" },
  { valor: "prometeu", label: "Prometeu pagar" },
  { valor: "recusou", label: "Recusou pagar" },
  { valor: "numero_errado", label: "Número errado" },
];

export const RESULTADO_LABEL = Object.fromEntries(RESULTADOS.map((r) => [r.valor, r.label]));
export const TIPO_LABEL = Object.fromEntries(TIPOS.map((t) => [t.valor, t.label]));

export default function TentativaModal({ contactId, contactName, onClose, onSalvou }) {
  const [tipo, setTipo] = useState("ligacao");
  const [resultado, setResultado] = useState("nao_atendeu");
  const [notas, setNotas] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    setSalvando(true);
    const res = await fetch(`/api/contacts/${contactId}/tentativas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo, resultado, notas }),
    });
    setSalvando(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErro(d.error || "Falha ao registrar.");
      return;
    }
    onSalvou?.();
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={salvar}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">Registrar tentativa</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        {contactName && <p className="text-xs text-slate-400 -mt-2">{contactName}</p>}

        <div>
          <span className="text-xs text-slate-400">Como tentou</span>
          <div className="grid grid-cols-3 gap-1.5 mt-1">
            {TIPOS.map((t) => (
              <button
                key={t.valor}
                type="button"
                onClick={() => setTipo(t.valor)}
                className={`text-xs rounded-lg py-2 border transition-colors ${
                  tipo === t.valor ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="text-xs text-slate-400">O que aconteceu</span>
          <div className="grid grid-cols-2 gap-1.5 mt-1">
            {RESULTADOS.map((r) => (
              <button
                key={r.valor}
                type="button"
                onClick={() => setResultado(r.valor)}
                className={`text-xs rounded-lg py-2 border transition-colors ${
                  resultado === r.valor ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="text-xs text-slate-400">Observação (opcional)</span>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            placeholder="Ex.: pediu pra ligar depois das 18h"
            className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400 resize-none"
          />
        </label>

        {erro && <p className="text-xs text-red-500">{erro}</p>}
        <button
          disabled={salvando}
          className="w-full bg-emerald-500 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 transition-colors"
        >
          {salvando ? "Salvando…" : "Registrar"}
        </button>
      </form>
    </div>
  );
}
