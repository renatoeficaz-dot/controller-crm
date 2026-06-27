"use client";

import { useEffect, useState, useCallback, useRef } from "react";

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

const money = (n) =>
  "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function initials(name) {
  return (name || "?").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("");
}

export default function ChatView() {
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [contact, setContact] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const chatEnd = useRef(null);

  // Dados pra edição do lead
  const [form, setForm] = useState({});
  const [users, setUsers] = useState([]);
  const [units, setUnits] = useState([]);
  const [stagesList, setStagesList] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [contactTags, setContactTags] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadConversations = useCallback(async () => {
    const data = await fetch("/api/chat").then((r) => r.json()).catch(() => []);
    setConversations(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    loadConversations();
    const t = setInterval(loadConversations, 5000);
    return () => clearInterval(t);
  }, [loadConversations]);

  // Carrega listas auxiliares (uma vez)
  useEffect(() => {
    fetch("/api/users").then((r) => r.json()).then(setUsers).catch(() => {});
    fetch("/api/units").then((r) => r.json()).then(setUnits).catch(() => {});
    fetch("/api/tags").then((r) => r.json()).then(setAllTags).catch(() => {});
    fetch("/api/stages").then((r) => r.json()).then((s) => {
      setStagesList(Array.isArray(s) ? s.map((st) => ({ id: st.id, name: st.name })) : []);
    }).catch(() => {});
  }, []);

  const loadContact = useCallback(async () => {
    if (!selectedId) return;
    const ct = await fetch(`/api/contacts/${selectedId}`).then((r) => r.json()).catch(() => null);
    if (ct && !ct.error) {
      setContact(ct);
      setForm({
        name: ct.name || "",
        phone: ct.phone || "",
        email: ct.email || "",
        company: ct.company || "",
        notes: ct.notes || "",
        responsavel: ct.responsavel || "",
        unitId: ct.unitId || "",
        stageId: ct.stageId || "",
        valorCapital: ct.valorCapital ?? "",
        pagamentoCapital: ct.pagamentoCapital ? new Date(ct.pagamentoCapital).toISOString().slice(0, 10) : "",
      });
      setContactTags((ct.tags || []).map((t) => t.id));
    }
  }, [selectedId]);

  const loadMessages = useCallback(async () => {
    if (!selectedId) return;
    const msgs = await fetch(`/api/contacts/${selectedId}/messages`).then((r) => r.json()).catch(() => []);
    setMessages(Array.isArray(msgs) ? msgs : []);
  }, [selectedId]);

  useEffect(() => {
    loadContact();
    loadMessages();
    if (!selectedId) return;
    const t = setInterval(loadMessages, 4000);
    return () => clearInterval(t);
  }, [loadContact, loadMessages, selectedId]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim() || !selectedId) return;
    const body = text;
    setText("");
    setSending(true);
    const res = await fetch(`/api/contacts/${selectedId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    setSending(false);
    if (res.ok) {
      const { message: msg } = await res.json().catch(() => ({}));
      if (msg) setMessages((prev) => [...prev, msg]);
    }
    loadConversations();
  }

  async function saveContact() {
    setSaving(true);
    await fetch(`/api/contacts/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        valorCapital: form.valorCapital === "" ? null : Number(form.valorCapital),
        pagamentoCapital: form.pagamentoCapital || null,
      }),
    });
    // Mover de etapa
    if (form.stageId && form.stageId !== contact?.stageId) {
      await fetch(`/api/contacts/${selectedId}/move`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageId: form.stageId }),
      });
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    loadContact();
  }

  async function toggleTag(tagId) {
    const has = contactTags.includes(tagId);
    setContactTags((prev) => (has ? prev.filter((id) => id !== tagId) : [...prev, tagId]));
    await fetch(`/api/contacts/${selectedId}/tags`, {
      method: has ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId }),
    });
  }

  const selected = conversations.find((c) => c.id === selectedId);
  const parcelas = contact?.parcelas || [];
  const parcelasAtuais = parcelas.filter((p) => (p.ciclo || 1) === (contact?.cicloAtual || 1));
  const pagas = parcelasAtuais.filter((p) => p.paid).length;
  const totalParcelas = parcelasAtuais.length;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const inputCls = "w-full text-xs border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-emerald-400";
  const selectCls = inputCls + " bg-white";

  return (
    <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
      {/* Lista de conversas */}
      <div className={`${selectedId ? "hidden md:flex" : "flex"} w-full md:w-80 shrink-0 border-r border-slate-200 bg-white flex-col min-h-0`}>
        <div className="px-4 py-3 border-b border-slate-200 shrink-0">
          <h2 className="font-semibold text-slate-800 text-sm">Conversas</h2>
        </div>
        <div className="flex-1 overflow-y-auto thin-scroll">
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => { setSelectedId(c.id); setContact(null); setShowInfo(false); }}
              className={`w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                selectedId === c.id ? "bg-emerald-50" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="relative w-9 h-9 shrink-0 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold flex items-center justify-center">
                  {initials(c.name)}
                  {c.unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white text-[8px] text-white font-bold flex items-center justify-center">
                      {c.unreadCount > 9 ? "9+" : c.unreadCount}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between items-baseline">
                    <p className="text-sm font-medium text-slate-800 truncate">{c.name}</p>
                    {c.lastMessage && (
                      <span className="text-[10px] text-slate-400 shrink-0 ml-2">{fmtTime(c.lastMessage.createdAt)}</span>
                    )}
                  </div>
                  {c.lastMessage && (
                    <p className="text-xs text-slate-400 truncate mt-0.5">
                      {c.lastMessage.fromMe ? "Você: " : ""}
                      {c.lastMessage.kind !== "text" ? `[${c.lastMessage.kind}]` : c.lastMessage.body?.slice(0, 50)}
                    </p>
                  )}
                </div>
              </div>
            </button>
          ))}
          {conversations.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">Nenhuma conversa.</p>
          )}
        </div>
      </div>

      {/* Painel central: chat */}
      <div className={`${selectedId ? "flex" : "hidden md:flex"} flex-1 flex-col bg-slate-50 min-h-0 overflow-hidden`}>
        {selected ? (
          <>
            <div className="px-4 py-3 bg-white border-b border-slate-200 flex items-center gap-3 shrink-0">
              <button
                onClick={() => setSelectedId(null)}
                className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 shrink-0"
              >
                ←
              </button>
              <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold flex items-center justify-center shrink-0">
                {initials(selected.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 truncate">{selected.name}</p>
                {selected.phone && <p className="text-xs text-slate-400">{selected.phone}</p>}
              </div>
              <button
                onClick={() => setShowInfo((v) => !v)}
                className="text-xs text-emerald-600 hover:text-emerald-700 border border-emerald-200 rounded-lg px-2.5 py-1 shrink-0"
              >
                {showInfo ? "Ocultar" : "Dados"}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto thin-scroll p-4 space-y-2">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.fromMe ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[70%] rounded-xl px-3 py-2 text-sm ${
                      m.fromMe
                        ? "bg-emerald-500 text-white rounded-br-sm"
                        : "bg-white text-slate-800 border border-slate-200 rounded-bl-sm"
                    }`}
                  >
                    {m.kind === "audio" && <audio controls src={m.mediaUrl} className="max-w-[200px] h-8" />}
                    {m.kind === "image" && <img src={m.mediaUrl} alt="" className="rounded max-w-[200px] max-h-[200px] object-cover" />}
                    {m.kind === "document" && (
                      <a href={m.mediaUrl} target="_blank" rel="noreferrer" className="underline text-xs">
                        {m.fileName || "documento"}
                      </a>
                    )}
                    {(m.kind === "text" || m.body) && <p>{m.body}</p>}
                    <p className={`text-[10px] mt-1 ${m.fromMe ? "text-emerald-200" : "text-slate-400"}`}>
                      {fmtTime(m.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={chatEnd} />
            </div>
            <form onSubmit={send} className="px-4 py-3 bg-white border-t border-slate-200 flex gap-2 shrink-0">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Digite uma mensagem…"
                className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400"
              />
              <button
                disabled={sending || !text.trim()}
                className="bg-emerald-500 text-white rounded-lg px-4 py-2 text-sm hover:bg-emerald-600 disabled:opacity-50"
              >
                Enviar
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
            Selecione uma conversa
          </div>
        )}
      </div>

      {/* Painel direito: edição do lead */}
      {selectedId && contact && showInfo && (
        <div className="w-full md:w-72 lg:w-80 shrink-0 border-l border-slate-200 bg-white overflow-y-auto thin-scroll absolute md:relative inset-0 md:inset-auto z-30 md:z-auto">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
            <h3 className="font-semibold text-slate-800 text-sm">Editar lead</h3>
            <button onClick={() => setShowInfo(false)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
          </div>
          <div className="p-4 space-y-3">
            {/* Campos editáveis */}
            <label className="block">
              <span className="text-[11px] text-slate-400">Nome</span>
              <input value={form.name || ""} onChange={set("name")} className={inputCls} />
            </label>
            <label className="block">
              <span className="text-[11px] text-slate-400">Telefone</span>
              <input value={form.phone || ""} onChange={set("phone")} className={inputCls} />
            </label>
            <label className="block">
              <span className="text-[11px] text-slate-400">Email</span>
              <input value={form.email || ""} onChange={set("email")} className={inputCls} />
            </label>
            <label className="block">
              <span className="text-[11px] text-slate-400">Empresa</span>
              <input value={form.company || ""} onChange={set("company")} className={inputCls} />
            </label>

            {/* Etapa */}
            <label className="block">
              <span className="text-[11px] text-slate-400">Etapa</span>
              <select value={form.stageId || ""} onChange={set("stageId")} className={selectCls}>
                {stagesList.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>

            {/* Responsável */}
            <label className="block">
              <span className="text-[11px] text-slate-400">Responsável</span>
              <select value={form.responsavel || ""} onChange={set("responsavel")} className={selectCls}>
                <option value="">— Sem responsável —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.name}>{u.name}</option>
                ))}
              </select>
            </label>

            {/* Ruta */}
            <label className="block">
              <span className="text-[11px] text-slate-400">Ruta</span>
              <select value={form.unitId || ""} onChange={set("unitId")} className={selectCls}>
                <option value="">— Sem ruta —</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>{u.number} - {u.name}</option>
                ))}
              </select>
            </label>

            {/* Tags */}
            {allTags.length > 0 && (
              <div>
                <span className="text-[11px] text-slate-400">Etiquetas</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {allTags.map((t) => {
                    const on = contactTags.includes(t.id);
                    return (
                      <button
                        type="button"
                        key={t.id}
                        onClick={() => toggleTag(t.id)}
                        className="text-[10px] font-medium rounded-full px-2 py-0.5 border transition-colors"
                        style={on ? { backgroundColor: t.color, borderColor: t.color, color: "#fff" } : { borderColor: "#e2e8f0", color: "#64748b" }}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Financeiro */}
            <div className="border-t border-slate-100 pt-3 space-y-2">
              <span className="text-[11px] text-slate-400 font-medium">Financeiro</span>
              <label className="block">
                <span className="text-[11px] text-slate-400">Valor do capital (R$)</span>
                <input type="number" step="0.01" value={form.valorCapital ?? ""} onChange={set("valorCapital")} className={inputCls} />
              </label>
              <label className="block">
                <span className="text-[11px] text-slate-400">Pagamento de capital</span>
                <input type="date" value={form.pagamentoCapital || ""} onChange={set("pagamentoCapital")} className={inputCls} />
              </label>

              {totalParcelas > 0 && (
                <>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Parcelas</span>
                    <span className="text-slate-700">{pagas}/{totalParcelas} pagas</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5">
                    <div
                      className="bg-emerald-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${(pagas / totalParcelas) * 100}%` }}
                    />
                  </div>
                  <ul className="space-y-0.5 max-h-32 overflow-y-auto text-xs">
                    {parcelasAtuais.map((p) => (
                      <li key={p.id} className="flex justify-between">
                        <span className={p.paid ? "line-through text-slate-400" : "text-slate-600"}>
                          {p.number}ª
                        </span>
                        <span className={p.paid ? "text-emerald-600" : "text-slate-700"}>
                          {money(p.amount)} {p.paid ? "✓" : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            {/* Notas */}
            <label className="block">
              <span className="text-[11px] text-slate-400">Notas</span>
              <textarea
                value={form.notes || ""}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                className={inputCls + " resize-none"}
              />
            </label>

            {/* Botão salvar */}
            <button
              onClick={saveContact}
              disabled={saving}
              className="w-full bg-emerald-500 text-white rounded-lg py-2 text-xs font-medium hover:bg-emerald-600 disabled:opacity-50"
            >
              {saved ? "Salvo ✓" : saving ? "Salvando…" : "Salvar alterações"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
