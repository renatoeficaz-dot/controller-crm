"use client";

import { useState } from "react";

// Agendamento de mensagem (item 45) — escolhe um modelo pronto ou usa o texto
// livre já digitado, e marca a data/hora de envio.
export default function AgendarMensagemModal({ contactId, textoInicial, templates, numbers, numeroInicial, onClose, onAgendado }) {
  const [templateId, setTemplateId] = useState("");
  const [corpo, setCorpo] = useState(textoInicial || "");
  const [numeroId, setNumeroId] = useState(numeroInicial || "");
  const [dataHora, setDataHora] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    if (!numeroId || !dataHora) { setErro("Escolha o número e a data/hora."); return; }
    setSalvando(true);
    const res = await fetch("/api/mensagens-agendadas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId, numeroId, templateId: templateId || null, corpo: templateId ? null : corpo, dataHora }),
    });
    const d = await res.json().catch(() => ({}));
    setSalvando(false);
    if (!res.ok) { setErro(d.error || "Erro ao agendar."); return; }
    onAgendado?.();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/40 flex items-center justify-center p-4" onClick={onClose}>
      <form onSubmit={salvar} className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">Agendar mensagem</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <label className="block">
          <span className="text-xs text-slate-400">Mensagem pronta (opcional)</span>
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-emerald-400">
            <option value="">— Texto livre —</option>
            {templates.map((t) => (<option key={t.id} value={t.id}>{t.title}</option>))}
          </select>
        </label>
        {!templateId && (
          <label className="block">
            <span className="text-xs text-slate-400">Texto</span>
            <textarea rows={3} value={corpo} onChange={(e) => setCorpo(e.target.value)} className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400 resize-none" />
          </label>
        )}
        <label className="block">
          <span className="text-xs text-slate-400">Enviar por</span>
          <select value={numeroId} onChange={(e) => setNumeroId(e.target.value)} className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-emerald-400">
            <option value="">— Escolha —</option>
            {numbers.map((n) => (<option key={n.id} value={n.id}>{n.label}</option>))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-slate-400">Data e hora</span>
          <input type="datetime-local" value={dataHora} onChange={(e) => setDataHora(e.target.value)} className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400" />
        </label>
        {erro && <p className="text-xs text-red-500">{erro}</p>}
        <button disabled={salvando} className="w-full bg-emerald-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50">
          {salvando ? "Agendando…" : "Agendar"}
        </button>
      </form>
    </div>
  );
}
