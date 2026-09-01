"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icone from "@/components/Icones";

const fmtHora = (d) => new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const fmtDia = (d) => new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

function iniciais(nome) {
  return (nome || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

// Chat entre os USUÁRIOS do sistema (não é o WhatsApp do cliente). Além de
// conversar, dá pra marcar alguém numa mensagem pedindo que resolva algo — a
// mensagem fica pendente até ser ticada.
export default function ChatInternoView() {
  const [eu, setEu] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [conversas, setConversas] = useState([]);
  const [selecionada, setSelecionada] = useState(null);
  const [detalhe, setDetalhe] = useState(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [cobrarDe, setCobrarDe] = useState("");
  const [novaAberta, setNovaAberta] = useState(false);
  const [novoGrupo, setNovoGrupo] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoMembros, setNovoMembros] = useState([]);
  const [erro, setErro] = useState("");
  const [soPendentes, setSoPendentes] = useState(false);
  const fimRef = useRef(null);
  const selRef = useRef(null);
  useEffect(() => {
    selRef.current = selecionada;
  }, [selecionada]);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)).then(setEu).catch(() => {});
    fetch("/api/users").then((r) => r.json()).then((u) => setUsuarios(Array.isArray(u) ? u : [])).catch(() => {});
  }, []);

  const carregarConversas = useCallback(async () => {
    const d = await fetch("/api/chat-interno").then((r) => r.json()).catch(() => []);
    setConversas(Array.isArray(d) ? d : []);
  }, []);

  const carregarDetalhe = useCallback(async (id) => {
    if (!id) return;
    const d = await fetch(`/api/chat-interno/${id}`).then((r) => r.json()).catch(() => null);
    // Só aplica se ainda é a conversa aberta — senão uma resposta lenta
    // sobrescreveria a conversa que a pessoa acabou de abrir.
    if (d && !d.error && selRef.current === id) setDetalhe(d);
  }, []);

  useEffect(() => {
    carregarConversas();
  }, [carregarConversas]);

  // Polling leve: a lista atualiza sozinha e a conversa aberta acompanha.
  useEffect(() => {
    const t = setInterval(() => {
      carregarConversas();
      if (selRef.current) carregarDetalhe(selRef.current);
    }, 6000);
    return () => clearInterval(t);
  }, [carregarConversas, carregarDetalhe]);

  useEffect(() => {
    if (selecionada) {
      setDetalhe(null);
      carregarDetalhe(selecionada);
    }
  }, [selecionada, carregarDetalhe]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [detalhe?.mensagens?.length]);

  const outrosUsuarios = useMemo(() => usuarios.filter((u) => u.id !== eu?.id), [usuarios, eu]);

  async function criarConversa() {
    setErro("");
    const res = await fetch("/api/chat-interno", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grupo: novoGrupo, nome: novoNome, userIds: novoMembros }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErro(d.error || "Não foi possível criar a conversa.");
      return;
    }
    setNovaAberta(false);
    setNovoNome("");
    setNovoMembros([]);
    setNovoGrupo(false);
    await carregarConversas();
    setSelecionada(d.id);
  }

  async function enviar(e) {
    e?.preventDefault();
    if (!texto.trim() || !selecionada) return;
    setEnviando(true);
    setErro("");
    const res = await fetch(`/api/chat-interno/${selecionada}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: texto, atribuidoAId: cobrarDe || null }),
    });
    setEnviando(false);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErro(d.error || "Não foi possível enviar.");
      return;
    }
    setTexto("");
    setCobrarDe("");
    carregarDetalhe(selecionada);
    carregarConversas();
  }

  async function alternarResolvido(msg) {
    const res = await fetch(`/api/chat-interno/mensagens/${msg.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolvido: !msg.resolvido }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErro(d.error || "Não foi possível atualizar.");
      return;
    }
    setDetalhe((p) => p && { ...p, mensagens: p.mensagens.map((m) => (m.id === d.id ? d : m)) });
    carregarConversas();
  }

  const mensagensVisiveis = useMemo(() => {
    const ms = detalhe?.mensagens || [];
    return soPendentes ? ms.filter((m) => m.atribuidoAId && !m.resolvido) : ms;
  }, [detalhe, soPendentes]);

  const totalPendentes = conversas.reduce((s, c) => s + (c.pendentes || 0), 0);
  const tituloAberta = conversas.find((c) => c.id === selecionada)?.titulo || "Conversa";

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">
      {/* Lista de conversas */}
      <div
        className={`${selecionada ? "hidden md:flex" : "flex"} w-full md:w-72 lg:w-80 shrink-0 flex-col border-r border-slate-200 bg-white min-h-0`}
      >
        <div className="px-4 py-3 border-b border-slate-200">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-800 text-sm">Chat interno</h2>
            <button
              onClick={() => setNovaAberta((v) => !v)}
              className="text-xs text-emerald-600 hover:text-emerald-700 border border-emerald-200 rounded-lg px-2 py-1"
            >
              {novaAberta ? "Cancelar" : "+ Nova"}
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">Conversa entre a equipe — não vai pro cliente.</p>
          {totalPendentes > 0 && (
            <p className="mt-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              {totalPendentes} pedido{totalPendentes > 1 ? "s" : ""} esperando você resolver
            </p>
          )}
        </div>

        {novaAberta && (
          <div className="p-3 border-b border-slate-200 bg-slate-50 space-y-2">
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={novoGrupo} onChange={(e) => setNovoGrupo(e.target.checked)} />
              Criar um grupo
            </label>
            {novoGrupo && (
              <input
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                placeholder="Nome do grupo"
                className="w-full text-sm border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-emerald-400"
              />
            )}
            <div className="max-h-40 overflow-y-auto thin-scroll space-y-1">
              {outrosUsuarios.map((u) => (
                <label key={u.id} className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type={novoGrupo ? "checkbox" : "radio"}
                    name="novo-membro"
                    checked={novoMembros.includes(u.id)}
                    onChange={(e) =>
                      setNovoMembros(
                        novoGrupo
                          ? e.target.checked
                            ? [...novoMembros, u.id]
                            : novoMembros.filter((x) => x !== u.id)
                          : [u.id]
                      )
                    }
                  />
                  {u.name} <span className="text-slate-400">({u.role})</span>
                </label>
              ))}
            </div>
            <button
              onClick={criarConversa}
              disabled={!novoMembros.length || (novoGrupo && !novoNome.trim())}
              className="w-full bg-emerald-500 text-white rounded-lg py-1.5 text-xs font-medium hover:bg-emerald-600 disabled:opacity-50"
            >
              Criar conversa
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto thin-scroll">
          {conversas.length === 0 && <p className="text-sm text-slate-400 text-center py-8">Nenhuma conversa ainda.</p>}
          {conversas.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelecionada(c.id)}
              className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors ${selecionada === c.id ? "bg-emerald-50/60" : ""}`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${c.grupo ? "bg-sky-100 text-sky-700" : "bg-emerald-100 text-emerald-700"}`}
                >
                  {c.grupo ? "GR" : iniciais(c.titulo)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 truncate">{c.titulo}</p>
                  <p className="text-xs text-slate-400 truncate">
                    {c.ultimaMensagem
                      ? `${c.grupo && c.ultimaMensagem.autor ? c.ultimaMensagem.autor + ": " : ""}${c.ultimaMensagem.body}`
                      : "Sem mensagens"}
                  </p>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  {c.naoLidas > 0 && (
                    <span className="bg-emerald-500 text-white text-[10px] rounded-full px-1.5 py-0.5">{c.naoLidas}</span>
                  )}
                  {c.pendentes > 0 && (
                    <span
                      className="bg-amber-400 text-white text-[10px] rounded-full px-1.5 py-0.5"
                      title="Pedidos pra você resolver"
                    >
                      {c.pendentes}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Conversa aberta */}
      <div className={`${selecionada ? "flex" : "hidden md:flex"} flex-1 flex-col bg-slate-50 min-h-0`}>
        {!selecionada ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Selecione uma conversa</div>
        ) : (
          <>
            <div className="px-4 py-3 bg-white border-b border-slate-200 flex items-center gap-3 shrink-0">
              <button onClick={() => setSelecionada(null)} className="md:hidden text-slate-500 text-lg">
                ←
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 truncate">{tituloAberta}</p>
                <p className="text-xs text-slate-400 truncate">{(detalhe?.membros || []).map((m) => m.name).join(", ")}</p>
              </div>
              <button
                onClick={() => setSoPendentes((v) => !v)}
                className={`shrink-0 text-xs rounded-full px-2.5 py-1 border ${soPendentes ? "bg-amber-50 text-amber-700 border-amber-200" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}
              >
                Só pendentes
              </button>
            </div>

            <div className="flex-1 overflow-y-auto thin-scroll p-4 space-y-2">
              {!detalhe && <p className="text-center text-xs text-slate-400">Carregando…</p>}
              {detalhe && mensagensVisiveis.length === 0 && (
                <p className="text-center text-xs text-slate-400 mt-4">
                  {soPendentes ? "Nenhum pedido pendente." : "Nenhuma mensagem ainda. Diga olá!"}
                </p>
              )}
              {mensagensVisiveis.map((m) => {
                const minha = m.autorId === eu?.id;
                const pedido = !!m.atribuidoAId;
                return (
                  <div key={m.id} className={`flex ${minha ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${
                        pedido
                          ? m.resolvido
                            ? "bg-emerald-50 border border-emerald-200 text-slate-700"
                            : "bg-amber-50 border border-amber-300 text-slate-800"
                          : minha
                            ? "bg-emerald-500 text-white"
                            : "bg-white border border-slate-200 text-slate-800"
                      }`}
                    >
                      {!minha && (
                        <p className={`text-[10px] font-semibold mb-0.5 ${pedido ? "text-slate-500" : "text-slate-400"}`}>
                          {m.autor?.name}
                        </p>
                      )}
                      {pedido && (
                        <p className="text-[11px] font-semibold text-amber-700 mb-1 flex items-center gap-1">
                          <Icone nome="alerta" className="w-3 h-3" />
                          Pedido para {m.atribuidoA?.name}
                          {m.resolvido && <span className="text-emerald-700">· resolvido</span>}
                        </p>
                      )}
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <div
                        className={`flex items-center gap-2 mt-1 text-[10px] ${minha && !pedido ? "text-emerald-100" : "text-slate-400"}`}
                      >
                        <span>
                          {fmtDia(m.createdAt)} {fmtHora(m.createdAt)}
                        </span>
                        {m.resolvido && m.resolvidoPor && <span className="text-emerald-600">✓ {m.resolvidoPor}</span>}
                      </div>
                      {pedido && (
                        <button
                          onClick={() => alternarResolvido(m)}
                          className={`mt-1.5 text-xs font-medium rounded px-2 py-1 border ${
                            m.resolvido
                              ? "border-slate-200 text-slate-500 hover:bg-slate-50"
                              : "border-emerald-300 bg-emerald-500 text-white hover:bg-emerald-600"
                          }`}
                        >
                          {m.resolvido ? "Reabrir" : "✓ Marcar como resolvido"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={fimRef} />
            </div>

            {erro && <p className="px-4 text-xs text-red-500 pb-1">{erro}</p>}

            <form onSubmit={enviar} className="p-3 bg-white border-t border-slate-200 shrink-0 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 shrink-0">Cobrar de:</span>
                <select
                  value={cobrarDe}
                  onChange={(e) => setCobrarDe(e.target.value)}
                  className="flex-1 text-xs border border-slate-200 rounded px-2 py-1.5 bg-white outline-none focus:border-emerald-400"
                >
                  <option value="">— Só mensagem (sem cobrar ninguém) —</option>
                  {(detalhe?.membros || [])
                    .filter((m) => m.id !== eu?.id)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} precisa resolver
                      </option>
                    ))}
                </select>
              </div>
              <div className="flex gap-2">
                <input
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Escreva uma mensagem…"
                  className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400"
                />
                <button
                  disabled={enviando || !texto.trim()}
                  className="bg-emerald-500 text-white rounded-lg px-4 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50"
                >
                  {enviando ? "…" : "Enviar"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
