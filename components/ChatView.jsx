"use client";

import { useEffect, useState, useCallback, useRef } from "react";

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function initials(name) {
  return (name || "?").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("");
}

export default function ChatView() {
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const chatEnd = useRef(null);

  const loadConversations = useCallback(async () => {
    const data = await fetch("/api/chat").then((r) => r.json()).catch(() => []);
    setConversations(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    loadConversations();
    const t = setInterval(loadConversations, 5000);
    return () => clearInterval(t);
  }, [loadConversations]);

  const loadMessages = useCallback(async () => {
    if (!selectedId) return;
    const data = await fetch(`/api/contacts/${selectedId}/messages`).then((r) => r.json()).catch(() => []);
    setMessages(Array.isArray(data) ? data : []);
    // Marcar como lidas (o GET do contato já faz, mas precisamos forçar via contato)
    await fetch(`/api/contacts/${selectedId}`).catch(() => {});
    loadConversations();
  }, [selectedId, loadConversations]);

  useEffect(() => {
    loadMessages();
    if (!selectedId) return;
    const t = setInterval(loadMessages, 4000);
    return () => clearInterval(t);
  }, [loadMessages, selectedId]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim() || !selectedId) return;
    setSending(true);
    await fetch(`/api/contacts/${selectedId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text }),
    });
    setText("");
    setSending(false);
    loadMessages();
  }

  const selected = conversations.find((c) => c.id === selectedId);

  return (
    <div className="flex-1 flex min-h-0">
      {/* Lista de conversas */}
      <div className="w-80 shrink-0 border-r border-slate-200 bg-white flex flex-col min-h-0">
        <div className="px-4 py-3 border-b border-slate-200">
          <h2 className="font-semibold text-slate-800 text-sm">Conversas</h2>
        </div>
        <div className="flex-1 overflow-y-auto thin-scroll">
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
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

      {/* Painel de mensagens */}
      <div className="flex-1 flex flex-col bg-slate-50 min-h-0">
        {selected ? (
          <>
            <div className="px-4 py-3 bg-white border-b border-slate-200 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold flex items-center justify-center">
                {initials(selected.name)}
              </div>
              <div>
                <p className="text-sm font-medium text-slate-800">{selected.name}</p>
                {selected.phone && <p className="text-xs text-slate-400">{selected.phone}</p>}
              </div>
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
            <form onSubmit={send} className="px-4 py-3 bg-white border-t border-slate-200 flex gap-2">
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
    </div>
  );
}
