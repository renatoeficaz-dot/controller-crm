"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { resumoCobranca, valorParcelaAtual, parcelaAtrasada } from "@/lib/finance";

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

const money = (n) =>
  "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }) : "—";

// DateTime ISO -> "YYYY-MM-DD" (para <input type=date>)
const toDateInput = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");

export default function ContactModal({ contactId, onClose, onChanged }) {
  const [contact, setContact] = useState(null);
  const [messages, setMessages] = useState([]);
  const [parcelas, setParcelas] = useState([]);
  const [honorariosPct, setHonorariosPct] = useState(30);
  const [form, setForm] = useState({});
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState("");
  const [cobrancaMsg, setCobrancaMsg] = useState("");
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [users, setUsers] = useState([]);
  const [stagesList, setStagesList] = useState([]);
  const [moveErr, setMoveErr] = useState("");
  const [templates, setTemplates] = useState([]);
  const [tplCopied, setTplCopied] = useState(false);
  const [unidades, setUnidades] = useState([]);
  const chatEnd = useRef(null);
  const fileInputRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);

  const loadContact = useCallback(async () => {
    const [res, cfg] = await Promise.all([
      fetch(`/api/contacts/${contactId}`),
      fetch("/api/config").then((r) => r.json()).catch(() => null),
    ]);
    const data = await res.json();
    setContact(data);
    setForm({
      name: data.name || "",
      phone: data.phone || "",
      email: data.email || "",
      company: data.company || "",
      notes: data.notes || "",
      valorCapital: data.valorCapital ?? "",
      pagamentoCapital: toDateInput(data.pagamentoCapital),
      responsavel: data.responsavel || "",
      unitId: data.unitId || "",
    });
    setMessages(data.messages || []);
    setParcelas(data.parcelas || []);
    if (cfg?.honorariosPct != null) setHonorariosPct(cfg.honorariosPct);
  }, [contactId]);

  useEffect(() => {
    loadContact();
  }, [loadContact]);

  // Usuários (responsável), etapas (mudar de coluna) e mensagens prontas
  useEffect(() => {
    fetch("/api/users").then((r) => r.json()).then(setUsers).catch(() => {});
    fetch("/api/stages")
      .then((r) => r.json())
      .then((d) => setStagesList(d.map((s) => ({ id: s.id, name: s.name }))))
      .catch(() => {});
    fetch("/api/templates").then((r) => r.json()).then(setTemplates).catch(() => {});
    fetch("/api/units").then((r) => r.json()).then(setUnidades).catch(() => {});
  }, []);

  // Escolhe uma mensagem pronta: joga no campo de envio e copia pra área de transferência
  async function pickTemplate(id) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setText(t.body);
    try {
      await navigator.clipboard.writeText(t.body);
      setTplCopied(true);
      setTimeout(() => setTplCopied(false), 1500);
    } catch {
      // sem clipboard (navegador antigo/HTTP) — o texto já foi pro campo de envio
    }
  }

  // Move o contato para outra etapa direto do card
  async function changeStage(stageId) {
    setMoveErr("");
    // salva os campos antes (capital/responsável) p/ as regras de movimentação valerem
    await fetch(`/api/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const res = await fetch(`/api/contacts/${contactId}/move`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMoveErr(data.error || "Não foi possível mover o contato.");
      return;
    }
    loadContact();
    onChanged?.();
  }

  // Polling leve para puxar mensagens recebidas pelo webhook
  useEffect(() => {
    const t = setInterval(async () => {
      const res = await fetch(`/api/contacts/${contactId}/messages`);
      if (res.ok) setMessages(await res.json());
    }, 5000);
    return () => clearInterval(t);
  }, [contactId]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function saveContact() {
    await fetch(`/api/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
    onChanged?.();
  }

  // (Re)gera as parcelas — salva o contato antes para garantir capital/data atualizados
  async function gerarParcelas() {
    setCobrancaMsg("");
    await fetch(`/api/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const res = await fetch(`/api/contacts/${contactId}/parcelas`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setCobrancaMsg(data.error || "Erro ao gerar parcelas.");
      return;
    }
    setParcelas(data);
  }

  async function togglePaid(p) {
    setParcelas((prev) => prev.map((x) => (x.id === p.id ? { ...x, paid: !x.paid } : x)));
    await fetch(`/api/parcelas/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paid: !p.paid }),
    });
  }

  async function send() {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    setError("");
    const res = await fetch(`/api/contacts/${contactId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    const data = await res.json();
    setSending(false);
    if (!res.ok) {
      setError(data.error || "Falha ao enviar.");
      return;
    }
    setMessages((m) => [...m, data.message]);
    setText("");
  }

  // Envia um arquivo (áudio gravado, imagem ou documento) via WhatsApp
  async function uploadMedia(file, kind, caption = "") {
    setUploading(true);
    setError("");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", kind);
    fd.append("caption", caption);
    const res = await fetch(`/api/contacts/${contactId}/media`, { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    setUploading(false);
    if (!res.ok) {
      setError(data.error || "Falha ao enviar o anexo.");
      return;
    }
    setMessages((m) => [...m, data.message]);
  }

  // Anexo: detecta o tipo pelo mime
  function onPickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const kind = file.type.startsWith("image/")
      ? "image"
      : file.type.startsWith("audio/")
      ? "audio"
      : "document";
    uploadMedia(file, kind);
  }

  // Gravação de áudio via microfone
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (ev) => ev.data.size && chunksRef.current.push(ev.data);
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const file = new File([blob], `audio-${Date.now()}.webm`, { type: "audio/webm" });
        uploadMedia(file, "audio");
        streamRef.current?.getTracks().forEach((t) => t.stop());
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch {
      setError("Não foi possível acessar o microfone.");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  async function removeContact() {
    if (!confirm("Remover este contato e todo o histórico?")) return;
    await fetch(`/api/contacts/${contactId}`, { method: "DELETE" });
    onChanged?.();
    onClose();
  }

  const isRecebimento = contact?.stage?.name === "Recebimento";
  const resumo = resumoCobranca(form.valorCapital, honorariosPct);
  const totalPago = parcelas.filter((p) => p.paid).reduce((s, p) => s + p.amount, 0);

  function field(label, key, type = "text") {
    return (
      <label className="block">
        <span className="text-xs text-slate-400">{label}</span>
        <input
          type={type}
          value={form[key] || ""}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-emerald-400"
        />
      </label>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-3xl h-[80vh] flex overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Coluna esquerda: dados do contato */}
        <div className="w-1/2 border-r border-slate-200 flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Dados do contato</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">
              ×
            </button>
          </div>
          <div className="p-5 flex flex-col gap-3 overflow-y-auto thin-scroll flex-1">
            {field("Nome", "name")}
            {field("WhatsApp (ex.: 5511999998888)", "phone")}

            {/* Mensagens prontas — escolhe um modelo e joga no campo de envio */}
            <label className="block">
              <span className="text-xs text-slate-400 flex items-center gap-2">
                Mensagens prontas
                {tplCopied && <span className="text-emerald-600">copiado ✓</span>}
              </span>
              <select
                value=""
                onChange={(e) => {
                  pickTemplate(e.target.value);
                  e.target.value = "";
                }}
                disabled={templates.length === 0}
                className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 bg-white outline-none focus:border-emerald-400 disabled:bg-slate-50 disabled:text-slate-400"
              >
                <option value="">
                  {templates.length ? "— Selecionar mensagem —" : "Nenhuma (cadastre em Configurações)"}
                </option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs text-slate-400">Observações</span>
              <textarea
                value={form.notes || ""}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={4}
                className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-emerald-400 resize-none"
              />
            </label>
            {contact?.stage && (
              <label className="block">
                <span className="text-xs text-slate-400">Coluna (etapa)</span>
                <select
                  value={contact.stage.id}
                  onChange={(e) => changeStage(e.target.value)}
                  className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 bg-white outline-none focus:border-emerald-400"
                >
                  {stagesList.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                {moveErr && <p className="text-xs text-red-500 mt-1">{moveErr}</p>}
              </label>
            )}

            {/* Responsável pela lead — seletor dos usuários cadastrados */}
            <label className="block">
              <span className="text-xs text-slate-400">Responsável pela lead</span>
              <select
                value={form.responsavel ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, responsavel: e.target.value }))}
                className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 bg-white outline-none focus:border-emerald-400"
              >
                <option value="">— Sem responsável —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.name}>{u.name}</option>
                ))}
                {/* mantém um valor antigo que não esteja na lista de usuários */}
                {form.responsavel && !users.some((u) => u.name === form.responsavel) && (
                  <option value={form.responsavel}>{form.responsavel}</option>
                )}
              </select>
            </label>

            {/* Ruta (unidade) associada à lead */}
            <label className="block">
              <span className="text-xs text-slate-400">Ruta</span>
              <select
                value={form.unitId ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, unitId: e.target.value }))}
                className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 bg-white outline-none focus:border-emerald-400"
              >
                <option value="">— Sem ruta —</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>{u.number} - {u.name}</option>
                ))}
              </select>
            </label>

            {/* Dados financeiros do empréstimo */}
            <div className="border-t border-slate-100 pt-3 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-slate-400">Valor do capital (R$)</span>
                <input
                  type="number"
                  step="0.01"
                  value={form.valorCapital ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, valorCapital: e.target.value }))}
                  className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-emerald-400"
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-400">Pagamento de capital</span>
                <input
                  type="date"
                  value={form.pagamentoCapital || ""}
                  onChange={(e) => setForm((f) => ({ ...f, pagamentoCapital: e.target.value }))}
                  className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-emerald-400"
                />
              </label>
            </div>

            {/* Seção de cobrança — aparece quando o contato está em "Recebimento" */}
            {isRecebimento && (
              <div className="border border-emerald-200 bg-emerald-50/40 rounded-lg p-3 mt-1">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-emerald-700">Cobrança</h3>
                  <span className="text-xs text-slate-400">honorários {honorariosPct}%</span>
                </div>

                <div className="grid grid-cols-2 gap-y-1 text-xs text-slate-600 mb-3">
                  <span>Capital</span>
                  <span className="text-right font-medium">{money(resumo.capital)}</span>
                  <span>Honorários ({honorariosPct}%)</span>
                  <span className="text-right font-medium">{money(resumo.honorarios)}</span>
                  <span className="text-slate-800 font-semibold">Total a receber</span>
                  <span className="text-right font-semibold text-emerald-700">{money(resumo.total)}</span>
                  <span>Parcela (10× diárias)</span>
                  <span className="text-right font-medium">{money(resumo.valorParcela)}</span>
                </div>

                <button
                  onClick={gerarParcelas}
                  className="w-full text-xs bg-emerald-500 text-white rounded py-1.5 hover:bg-emerald-600 mb-2"
                >
                  {parcelas.length ? "Atualizar parcelas" : "Gerar 10 parcelas"}
                </button>
                {cobrancaMsg && <p className="text-xs text-red-500 mb-2">{cobrancaMsg}</p>}

                {parcelas.length > 0 && (
                  <>
                    <ul className="divide-y divide-emerald-100 text-xs">
                      {parcelas.map((p) => {
                        const atrasada = parcelaAtrasada(p);
                        return (
                        <li key={p.id} className="flex items-center justify-between py-1.5">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={p.paid}
                              onChange={() => togglePaid(p)}
                              className="accent-emerald-500"
                            />
                            <span className={p.paid ? "line-through text-slate-400" : "text-slate-600"}>
                              {p.number}ª · {fmtDate(p.dueDate)}
                            </span>
                            {atrasada && (
                              <span className="text-[10px] font-semibold bg-red-500 text-white rounded-full px-1.5 py-0.5">
                                +50%
                              </span>
                            )}
                          </label>
                          <span className={`font-medium ${p.paid ? "text-emerald-600" : atrasada ? "text-red-600" : "text-slate-700"}`}>
                            {money(valorParcelaAtual(p))}
                          </span>
                        </li>
                        );
                      })}
                    </ul>
                    <p className="text-xs text-slate-500 mt-2 text-right">
                      Recebido: <span className="font-semibold text-emerald-700">{money(totalPago)}</span> / {money(resumo.total)}
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="p-4 border-t border-slate-200 flex items-center gap-2">
            <button
              onClick={saveContact}
              className="flex-1 bg-emerald-500 text-white text-sm rounded-lg py-2 hover:bg-emerald-600"
            >
              {savedFlash ? "Salvo ✓" : "Salvar"}
            </button>
            <button
              onClick={removeContact}
              className="text-sm text-red-400 hover:text-red-600 px-3"
            >
              Excluir
            </button>
          </div>
        </div>

        {/* Coluna direita: chat WhatsApp */}
        <div className="w-1/2 flex flex-col bg-slate-50">
          <div className="px-5 py-4 border-b border-slate-200 bg-white flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center text-sm">
              ✆
            </span>
            <div>
              <h2 className="font-semibold text-slate-800 text-sm leading-tight">WhatsApp</h2>
              <p className="text-xs text-slate-400 leading-tight">
                {form.phone ? form.phone : "sem telefone cadastrado"}
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto thin-scroll p-4 flex flex-col gap-2">
            {messages.length === 0 && (
              <p className="text-center text-xs text-slate-400 mt-4">
                Nenhuma mensagem ainda. Diga olá!
              </p>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  m.fromMe
                    ? "self-end bg-emerald-500 text-white"
                    : "self-start bg-white border border-slate-200 text-slate-700"
                }`}
              >
                {m.kind === "audio" && (
                  <audio controls src={m.mediaUrl} className="max-w-[220px] h-9" />
                )}
                {m.kind === "image" && (
                  <a href={m.mediaUrl} target="_blank" rel="noreferrer">
                    <img src={m.mediaUrl} alt={m.fileName || "imagem"} className="rounded-md max-w-[220px] max-h-[220px] object-cover" />
                  </a>
                )}
                {m.kind === "document" && (
                  <a
                    href={m.mediaUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={`flex items-center gap-2 underline ${m.fromMe ? "text-white" : "text-emerald-700"}`}
                  >
                    📎 {m.fileName || "documento"}
                  </a>
                )}
                {m.body && (
                  <p className="whitespace-pre-wrap break-words mt-1">{m.body}</p>
                )}
                <span
                  className={`block text-[10px] mt-1 ${
                    m.fromMe ? "text-emerald-100" : "text-slate-400"
                  }`}
                >
                  {fmtTime(m.createdAt)} {m.fromMe && m.status === "simulado" ? "• simulado" : ""}
                </span>
              </div>
            ))}
            <div ref={chatEnd} />
          </div>

          {error && (
            <p className="px-4 text-xs text-red-500 pb-1">{error}</p>
          )}

          <div className="p-3 border-t border-slate-200 bg-white flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,audio/*,application/pdf"
              onChange={onPickFile}
              className="hidden"
            />
            {/* Anexo */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || recording}
              title="Enviar anexo"
              className="shrink-0 w-9 h-9 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 text-lg"
            >
              📎
            </button>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder={recording ? "Gravando áudio…" : uploading ? "Enviando anexo…" : "Escreva uma mensagem…"}
              disabled={recording}
              className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400 resize-none max-h-24 disabled:bg-slate-50"
            />
            {/* Gravar áudio — ao lado do Enviar */}
            <button
              onClick={recording ? stopRecording : startRecording}
              disabled={uploading}
              title={recording ? "Parar gravação" : "Gravar áudio"}
              className={`shrink-0 w-9 h-9 rounded-lg border text-lg disabled:opacity-40 ${
                recording
                  ? "border-red-300 bg-red-50 text-red-600 animate-pulse"
                  : "border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}
            >
              {recording ? "⏹" : "🎙"}
            </button>
            <button
              onClick={send}
              disabled={sending || !text.trim()}
              className="bg-emerald-500 text-white rounded-lg px-4 py-2 text-sm hover:bg-emerald-600 disabled:opacity-40"
            >
              {sending ? "…" : "Enviar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
