"use client";

import { useEffect, useState } from "react";

// Campanha em massa segmentada (item 44) — dispara pra quem está no filtro
// atual do Kanban, com espaçamento aleatório entre mensagens (mesmo padrão
// anti-bloqueio usado no lembrete de cobrança). A lista de destinatários é
// congelada no momento da criação, não recalculada depois.
export default function CampanhaMassaModal({ contactIds, onClose }) {
  const [templates, setTemplates] = useState([]);
  const [numbers, setNumbers] = useState([]);
  const [nome, setNome] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [numeroId, setNumeroId] = useState("");
  const [criando, setCriando] = useState(false);
  const [criada, setCriada] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    fetch("/api/templates").then((r) => r.json()).then((d) => setTemplates(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/numbers").then((r) => r.json()).then((d) => setNumbers(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  async function criar(e) {
    e.preventDefault();
    setErro("");
    if (!nome.trim() || !numeroId) { setErro("Dê um nome e escolha o número de envio."); return; }
    if (!templateId && !mensagem.trim()) { setErro("Escolha uma mensagem pronta ou escreva o texto."); return; }
    setCriando(true);
    const res = await fetch("/api/campanhas-massa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, templateId: templateId || null, mensagem: templateId ? null : mensagem, numeroId, filtros: { ids: contactIds } }),
    });
    const d = await res.json().catch(() => ({}));
    setCriando(false);
    if (!res.ok) { setErro(d.error || "Erro ao criar."); return; }
    setCriada(d);
  }

  async function iniciar() {
    await fetch(`/api/campanhas-massa/${criada.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "enviando" }),
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-800">Campanha segmentada</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        {!criada ? (
          <form onSubmit={criar} className="space-y-3">
            <p className="text-xs text-slate-400">
              Vai pra <strong className="text-slate-600">{contactIds.length} lead(s)</strong> que estão no filtro atual, com espaçamento entre os envios (não é instantâneo).
            </p>
            <label className="block">
              <span className="text-xs text-slate-400">Nome da campanha</span>
              <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Promoção outubro" className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400" />
            </label>
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
                <textarea rows={3} value={mensagem} onChange={(e) => setMensagem(e.target.value)} className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400 resize-none" />
              </label>
            )}
            <label className="block">
              <span className="text-xs text-slate-400">Enviar por</span>
              <select value={numeroId} onChange={(e) => setNumeroId(e.target.value)} className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-emerald-400">
                <option value="">— Escolha —</option>
                {numbers.map((n) => (<option key={n.id} value={n.id}>{n.label}</option>))}
              </select>
            </label>
            {erro && <p className="text-xs text-red-500">{erro}</p>}
            <button disabled={criando} className="w-full bg-slate-800 text-white rounded-lg py-2 text-sm font-medium hover:bg-slate-700 disabled:opacity-50">
              {criando ? "Criando…" : "Revisar antes de enviar"}
            </button>
          </form>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-700">
              "{criada.nome}" pronta pra <strong>{criada.totalAlvos}</strong> lead(s).
            </p>
            <p className="text-xs text-slate-400">Confirma o disparo? Não dá pra desfazer depois de começar.</p>
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 border border-slate-200 text-slate-600 rounded-lg py-2 text-sm hover:bg-slate-50">Deixar pra depois</button>
              <button onClick={iniciar} className="flex-1 bg-emerald-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-emerald-600">Disparar agora</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
