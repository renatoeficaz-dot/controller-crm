"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import MediaBubble from "./MediaBubble";
import { aReceber, inadimplenciaCravo } from "@/lib/relatorios";
import { interpolarVariaveis } from "@/lib/variaveis";
import { parcelaAtrasada } from "@/lib/finance";

// Data de hoje (local) como "YYYY-MM-DD"
function todayStr() {
  return new Date().toLocaleDateString("en-CA");
}

// Situação de cobrança do contato (mesma lógica do Kanban):
//  "atrasado" = tem parcela vencida e não baixada
//  "hoje"     = tem parcela que vence hoje e não baixada
//  "emdia"    = tem plano de parcelas, sem atraso nem vencimento hoje
//  "sem"      = não tem plano de parcelas (ainda não está em cobrança)
function situacaoContato(c) {
  const ciclo = c.cicloAtual || 1;
  const parcelas = (c.parcelas || []).filter((p) => (p.ciclo || 1) === ciclo);
  if (parcelas.length === 0) return "sem";
  const hoje = todayStr();
  let vencida = false;
  let hojeVence = false;
  for (const p of parcelas) {
    if (p.paid) continue;
    const d = new Date(p.dueDate).toISOString().slice(0, 10);
    if (d < hoje) vencida = true;
    else if (d === hoje) hojeVence = true;
  }
  if (vencida) return "atrasado";
  if (hojeVence) return "hoje";
  return "emdia";
}

const STATUS_LABEL = { atrasado: "Atrasado", hoje: "Vence hoje", emdia: "Em dia", sem: "Sem cobrança" };

function fmtTime(iso) {
  const d = new Date(iso);
  const data = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${data} ${hora}`;
}

const money = (n) =>
  "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }) : "—";

function numberLabel(instance, numbers) {
  if (!instance) return null;
  const n = numbers.find((x) => x.instance === instance);
  return n ? n.label : instance;
}

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
  const selectedIdRef = useRef(null);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  // Dados pra edição do lead
  const [form, setForm] = useState({});
  const [users, setUsers] = useState([]);
  const [stagesList, setStagesList] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [contactTags, setContactTags] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [tplSent, setTplSent] = useState(false);
  const [numbers, setNumbers] = useState([]);
  const [selectedInstance, setSelectedInstance] = useState("");
  const [resumo, setResumo] = useState(null); // { dia, semana, mes, pendenteTotal, clientes }
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [attachError, setAttachError] = useState("");
  const [multaPct, setMultaPct] = useState(50);
  const [horaLimite, setHoraLimite] = useState("");
  const fileInputRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);

  // Filtros da lista de conversas
  const [busca, setBusca] = useState(""); // nome ou telefone
  const [statusFiltro, setStatusFiltro] = useState(""); // "" = todos
  const [tagFiltro, setTagFiltro] = useState("");
  const [stageFiltro, setStageFiltro] = useState("");
  const [instanceFiltro, setInstanceFiltro] = useState(""); // número/instância que está conversando
  const [ordem, setOrdem] = useState("recentes"); // "recentes" | "antigas" | "nome"

  const loadConversations = useCallback(async () => {
    const data = await fetch("/api/chat").then((r) => r.json()).catch(() => []);
    setConversations(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    loadConversations();
    const t = setInterval(loadConversations, 5000);
    return () => clearInterval(t);
  }, [loadConversations]);

  // Resumo financeiro (a receber / inadimplência) — recarrega periodicamente,
  // não só uma vez ao abrir a tela, senão fica desatualizado.
  const loadResumo = useCallback(async () => {
    const s = await fetch("/api/stages").then((r) => r.json()).catch(() => []);
    const list = Array.isArray(s) ? s : [];
    setStagesList(list.map((st) => ({ id: st.id, name: st.name })));
    const receber = aReceber(list);
    const inad = inadimplenciaCravo(list);
    setResumo({ ...receber, pendenteTotal: inad.pendenteTotal, clientes: inad.clientes });
  }, []);

  useEffect(() => {
    loadResumo();
    const t = setInterval(loadResumo, 30000);
    return () => clearInterval(t);
  }, [loadResumo]);

  // Carrega listas auxiliares (uma vez)
  useEffect(() => {
    fetch("/api/users").then((r) => r.json()).then(setUsers).catch(() => {});
    fetch("/api/tags").then((r) => r.json()).then(setAllTags).catch(() => {});
    fetch("/api/templates").then((r) => r.json()).then(setTemplates).catch(() => {});
    fetch("/api/numbers").then((r) => r.json()).then((n) => setNumbers(Array.isArray(n) ? n : [])).catch(() => {});
    fetch("/api/config").then((r) => r.json()).then((cfg) => {
      if (cfg?.multaPct != null) setMultaPct(cfg.multaPct);
      setHoraLimite(cfg?.pagamentoHoraLimite || "");
    }).catch(() => {});
  }, []);

  // Aplica busca + filtros + ordenação na lista de conversas
  const conversasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const termoDigitos = busca.replace(/\D/g, "");
    let out = conversations.filter((c) => {
      if (termo) {
        const bateNome = (c.name || "").toLowerCase().includes(termo);
        const batePhone = termoDigitos && (c.phone || "").replace(/\D/g, "").includes(termoDigitos);
        if (!bateNome && !batePhone) return false;
      }
      if (statusFiltro && situacaoContato(c) !== statusFiltro) return false;
      if (tagFiltro && !(c.tags || []).some((t) => t.id === tagFiltro)) return false;
      if (stageFiltro && c.stageId !== stageFiltro) return false;
      if (instanceFiltro && c.instance !== instanceFiltro) return false;
      return true;
    });
    if (ordem === "nome") {
      out = [...out].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    } else {
      out = [...out].sort((a, b) => {
        const da = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt) : 0;
        const db = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt) : 0;
        return ordem === "antigas" ? da - db : db - da;
      });
    }
    return out;
  }, [conversations, busca, statusFiltro, tagFiltro, stageFiltro, instanceFiltro, ordem]);

  const loadContact = useCallback(async () => {
    if (!selectedId) return;
    const requestedId = selectedId;
    const ct = await fetch(`/api/contacts/${requestedId}`).then((r) => r.json()).catch(() => null);
    if (requestedId !== selectedIdRef.current) return; // trocou de conversa enquanto isso — descarta
    if (ct && !ct.error) {
      setContact(ct);
      setForm({
        name: ct.name || "",
        phone: ct.phone || "",
        email: ct.email || "",
        company: ct.company || "",
        notes: ct.notes || "",
        responsavel: ct.responsavel || "",
        stageId: ct.stageId || "",
        valorCapital: ct.valorCapital ?? "",
        pagamentoCapital: ct.pagamentoCapital ? new Date(ct.pagamentoCapital).toISOString().slice(0, 10) : "",
      });
      setContactTags((ct.tags || []).map((t) => t.id));
    }
  }, [selectedId]);

  const loadMessages = useCallback(async () => {
    if (!selectedId) return;
    const requestedId = selectedId;
    const msgs = await fetch(`/api/contacts/${requestedId}/messages`).then((r) => r.json()).catch(() => []);
    if (requestedId !== selectedIdRef.current) return; // trocou de conversa enquanto isso — descarta
    setMessages(Array.isArray(msgs) ? msgs : []);
  }, [selectedId]);

  useEffect(() => {
    loadContact();
    loadMessages();
    if (!selectedId) return;
    const t = setInterval(loadMessages, 4000);
    return () => clearInterval(t);
  }, [loadContact, loadMessages, selectedId]);

  // Número (instância) de onde a próxima mensagem vai sair. Ao trocar de
  // conversa, sugere automaticamente o último número usado nela (mesma regra
  // do backend) — mas só uma vez por conversa, pra não atrapalhar se o
  // usuário trocar manualmente enquanto o polling atualiza as mensagens.
  const instanceDefaultedForRef = useRef(null);
  useEffect(() => {
    instanceDefaultedForRef.current = null;
  }, [selectedId]);
  useEffect(() => {
    if (!selectedId || instanceDefaultedForRef.current === selectedId) return;
    const lastWithInstance = [...messages].reverse().find((m) => m.instance);
    setSelectedInstance(lastWithInstance?.instance || numbers[0]?.instance || "");
    if (messages.length > 0 || numbers.length > 0) instanceDefaultedForRef.current = selectedId;
  }, [messages, selectedId, numbers]);

  const scrolledForRef = useRef(null);
  const lastMsgIdRef = useRef(null);
  useEffect(() => {
    if (!messages.length) return;
    const lastId = messages[messages.length - 1].id;
    const firstLoad = scrolledForRef.current !== selectedId;
    if (!firstLoad && lastId === lastMsgIdRef.current) return; // polling sem mensagem nova — não mexe no scroll
    // Ao abrir/trocar de conversa, pula direto pro final (sem animação).
    // Em mensagens novas na mesma conversa, rola suave.
    scrolledForRef.current = selectedId;
    lastMsgIdRef.current = lastId;
    chatEnd.current?.scrollIntoView({ behavior: firstLoad ? "auto" : "smooth" });
  }, [messages, selectedId]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim() || !selectedId) return;
    const body = text;
    setText("");
    setSending(true);
    const res = await fetch(`/api/contacts/${selectedId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, instance: selectedInstance }),
    });
    setSending(false);
    if (res.ok) {
      const { message: msg } = await res.json().catch(() => ({}));
      if (msg) setMessages((prev) => [...prev, msg]);
    }
    loadConversations();
  }

  async function pickTemplate(id) {
    const t = templates.find((x) => x.id === id);
    if (!t || !selectedId) return;

    if (t.mediaType && t.mediaType !== "text") {
      setSending(true);
      const payload = { mediaType: t.mediaType, instance: selectedInstance };
      if (t.mediaType === "contact") {
        payload.contactName = t.contactName;
        payload.contactPhone = t.contactPhone;
      } else {
        payload.mediaUrl = t.mediaUrl;
        payload.mediaMimetype = t.mediaMimetype;
        payload.mediaFileName = t.mediaFileName;
        payload.body = interpolarVariaveis(t.body || "", contact);
      }
      const res = await fetch(`/api/contacts/${selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSending(false);
      if (res.ok) {
        const { message: msg } = await res.json().catch(() => ({}));
        if (msg) setMessages((prev) => [...prev, msg]);
        setTplSent(true);
        setTimeout(() => setTplSent(false), 1500);
      }
      loadConversations();
      return;
    }

    const bodyFinal = interpolarVariaveis(t.body, contact);
    setText(bodyFinal);
    try {
      await navigator.clipboard.writeText(bodyFinal);
      setTplSent(true);
      setTimeout(() => setTplSent(false), 1500);
    } catch { /* sem clipboard */ }
  }

  // Envia um arquivo (anexo escolhido ou áudio gravado) via WhatsApp
  async function uploadMedia(file, kind, caption = "") {
    if (!selectedId) return;
    setUploading(true);
    setAttachError("");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", kind);
    fd.append("caption", caption);
    fd.append("instance", selectedInstance || "");
    const res = await fetch(`/api/contacts/${selectedId}/media`, { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    setUploading(false);
    if (!res.ok) {
      setAttachError(data.error || "Falha ao enviar o anexo.");
      return;
    }
    if (data.message) setMessages((prev) => [...prev, data.message]);
    loadConversations();
  }

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
      setAttachError("Não foi possível acessar o microfone.");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
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

  // Liga/desliga a IA pra este lead — atendimento manual assume a conversa.
  async function toggleIaPausada() {
    if (!selectedId || !contact) return;
    const iaPausada = !contact.iaPausada;
    setContact((c) => ({ ...c, iaPausada }));
    await fetch(`/api/contacts/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ iaPausada }),
    });
  }

  // Marca/desmarca uma parcela como paga direto pelo painel do chat.
  async function togglePaid(p) {
    const vaiPagar = !p.paid;
    let amountPago;
    if (vaiPagar && parcelaAtrasada(p, undefined, { multaPct, horaLimite })) {
      const comMulta = p.amount * (1 + Number(multaPct) / 100);
      const cobrarComJuros = confirm(
        `Essa parcela está atrasada.\n\nOK = cobrar COM juros (${money(comMulta)})\nCancelar = cobrar SEM juros (${money(p.amount)})`
      );
      amountPago = cobrarComJuros ? comMulta : p.amount;
    }
    setContact((c) => ({
      ...c,
      parcelas: (c.parcelas || []).map((x) => (x.id === p.id ? { ...x, paid: vaiPagar, amountPago: vaiPagar ? (amountPago ?? p.amount) : null } : x)),
    }));
    await fetch(`/api/parcelas/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paid: vaiPagar, amountPago }),
    });
  }

  const selected = conversations.find((c) => c.id === selectedId);
  const parcelas = contact?.parcelas || [];
  const parcelasAtuais = parcelas.filter((p) => (p.ciclo || 1) === (contact?.cicloAtual || 1));
  const pagas = parcelasAtuais.filter((p) => p.paid).length;
  const totalParcelas = parcelasAtuais.length;
  const faltaQuitar = parcelasAtuais.filter((p) => !p.paid).reduce((s, p) => s + p.amount, 0);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const inputCls = "w-full text-xs border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-emerald-400";
  const selectCls = inputCls + " bg-white";

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Resumo financeiro geral (a receber / inadimplência) */}
      {resumo && (
        <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-2 flex flex-wrap gap-x-6 gap-y-1 text-xs">
          <span className="text-slate-400">
            A receber hoje: <strong className="text-slate-700">{money(resumo.dia)}</strong>
          </span>
          <span className="text-slate-400">
            Semana: <strong className="text-slate-700">{money(resumo.semana)}</strong>
          </span>
          <span className="text-slate-400">
            Mês: <strong className="text-slate-700">{money(resumo.mes)}</strong>
          </span>
          <span className="text-slate-400">
            Inadimplência (Cravo): <strong className="text-red-600">{money(resumo.pendenteTotal)}</strong>
            {resumo.clientes > 0 && <span className="text-slate-400"> ({resumo.clientes} cliente{resumo.clientes > 1 ? "s" : ""})</span>}
          </span>
        </div>
      )}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
      {/* Lista de conversas */}
      <div className={`${selectedId ? "hidden md:flex" : "flex"} w-full md:w-80 shrink-0 border-r border-slate-200 bg-white flex-col min-h-0`}>
        <div className="px-4 py-3 border-b border-slate-200 shrink-0 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-800 text-sm">Conversas</h2>
            <span className="text-[11px] text-slate-400">{conversasFiltradas.length}</span>
          </div>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou telefone…"
            className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-emerald-400"
          />
          <div className="flex flex-wrap gap-1">
            {["", "atrasado", "hoje", "emdia", "sem"].map((s) => (
              <button
                key={s || "todos"}
                onClick={() => setStatusFiltro(s)}
                className={`text-[11px] rounded-full px-2 py-0.5 border transition-colors ${
                  statusFiltro === s
                    ? "bg-slate-800 text-white border-slate-800"
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                }`}
              >
                {s ? STATUS_LABEL[s] : "Todos"}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <select
              value={stageFiltro}
              onChange={(e) => setStageFiltro(e.target.value)}
              className="text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white outline-none focus:border-emerald-400"
            >
              <option value="">Todas etapas</option>
              {stagesList.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <select
              value={tagFiltro}
              onChange={(e) => setTagFiltro(e.target.value)}
              className="text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white outline-none focus:border-emerald-400"
            >
              <option value="">Todas etiquetas</option>
              {allTags.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <select
              value={instanceFiltro}
              onChange={(e) => setInstanceFiltro(e.target.value)}
              className="text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white outline-none focus:border-emerald-400"
            >
              <option value="">Todos números</option>
              {numbers.map((n) => (
                <option key={n.id} value={n.instance}>{n.label}</option>
              ))}
            </select>
            <select
              value={ordem}
              onChange={(e) => setOrdem(e.target.value)}
              className="text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white outline-none focus:border-emerald-400"
            >
              <option value="recentes">Mais recentes</option>
              <option value="antigas">Mais antigas</option>
              <option value="nome">Nome (A-Z)</option>
            </select>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto thin-scroll">
          {conversasFiltradas.map((c) => (
            <button
              key={c.id}
              onClick={() => { setSelectedId(c.id); setContact(null); setMessages([]); setShowInfo(false); }}
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
          {conversasFiltradas.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">Nenhuma conversa encontrada.</p>
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
              {contact && (
                <button
                  onClick={toggleIaPausada}
                  title={contact.iaPausada ? "IA desligada — clique para religar" : "IA ligada — clique para desligar (atendimento manual)"}
                  className={`shrink-0 text-xs font-medium rounded-full px-2.5 py-1 border ${
                    contact.iaPausada
                      ? "bg-red-50 text-red-600 border-red-200"
                      : "bg-emerald-50 text-emerald-600 border-emerald-200"
                  }`}
                >
                  {contact.iaPausada ? "🤖 IA desligada" : "🤖 IA ligada"}
                </button>
              )}
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
                    {m.instance && numbers.length > 1 && (
                      <p className={`text-[10px] mb-0.5 ${m.fromMe ? "text-emerald-100" : "text-slate-400"}`}>
                        📱 {numberLabel(m.instance, numbers)}
                      </p>
                    )}
                    {(m.kind === "audio" || m.kind === "image" || m.kind === "document" || m.kind === "location") && <MediaBubble message={m} />}
                    {m.kind !== "location" && (m.kind === "text" || m.body) && <p>{m.body}</p>}
                    <p className={`text-[10px] mt-1 ${m.fromMe ? "text-emerald-200" : "text-slate-400"}`}>
                      {fmtTime(m.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={chatEnd} />
            </div>
            <div className="px-4 pt-2 pb-0 bg-white border-t border-slate-200 shrink-0">
              {numbers.length > 1 && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-slate-400 shrink-0">Enviar por:</span>
                  <select
                    value={selectedInstance}
                    onChange={(e) => setSelectedInstance(e.target.value)}
                    disabled={sending || uploading}
                    className="flex-1 text-xs border border-slate-200 rounded px-2 py-1.5 bg-white outline-none focus:border-emerald-400 disabled:opacity-50"
                  >
                    {numbers.map((n) => (
                      <option key={n.id} value={n.instance}>{n.label} ({n.number})</option>
                    ))}
                  </select>
                </div>
              )}
              {templates.length > 0 && (
                <div className="flex items-center gap-2 mb-2">
                  <select
                    value=""
                    onChange={(e) => { pickTemplate(e.target.value); e.target.value = ""; }}
                    disabled={sending}
                    className="flex-1 text-xs border border-slate-200 rounded px-2 py-1.5 bg-white outline-none focus:border-emerald-400 disabled:opacity-50"
                  >
                    <option value="">— Mensagem pronta —</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.mediaType && t.mediaType !== "text" ? `[${t.mediaType === "contact" ? "Contato" : t.mediaType === "image" ? "Imagem" : t.mediaType === "audio" ? "Áudio" : "Doc"}] ` : ""}
                        {t.title}
                      </option>
                    ))}
                  </select>
                  {tplSent && <span className="text-xs text-emerald-600 shrink-0">enviado ✓</span>}
                </div>
              )}
              {attachError && <p className="text-xs text-red-500 pb-1">{attachError}</p>}
              <form onSubmit={send} className="flex gap-2 pb-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,audio/*,application/pdf,.zip,.rar,.doc,.docx,.xls,.xlsx"
                  onChange={onPickFile}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || recording}
                  title="Enviar anexo"
                  className="shrink-0 w-9 h-9 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 text-lg"
                >
                  📎
                </button>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={recording ? "Gravando áudio…" : uploading ? "Enviando anexo…" : "Digite uma mensagem…"}
                  disabled={recording}
                  className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400 disabled:bg-slate-50"
                />
                <button
                  type="button"
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
                  disabled={sending || !text.trim()}
                  className="bg-emerald-500 text-white rounded-lg px-4 py-2 text-sm hover:bg-emerald-600 disabled:opacity-50"
                >
                  Enviar
                </button>
              </form>
            </div>
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

            {/* Estado do lead — detectado sozinho pela IA a partir da conversa */}
            {contact?.estado && (
              <p className="text-[11px] text-slate-400 flex items-center gap-1">
                📍 Estado (IA): <span className="font-medium text-slate-600">{contact.estado}</span>
              </p>
            )}

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
                  {faltaQuitar > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Falta quitar</span>
                      <span className="font-medium text-red-500">{money(faltaQuitar)}</span>
                    </div>
                  )}
                  <div className="w-full bg-slate-100 rounded-full h-1.5">
                    <div
                      className="bg-emerald-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${(pagas / totalParcelas) * 100}%` }}
                    />
                  </div>
                  <ul className="space-y-0.5 max-h-32 overflow-y-auto text-xs">
                    {parcelasAtuais.map((p) => (
                      <li key={p.id} className="flex items-center justify-between py-0.5">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={p.paid}
                            onChange={() => togglePaid(p)}
                            className="accent-emerald-500"
                          />
                          <span className={p.paid ? "line-through text-slate-400" : "text-slate-600"}>
                            {p.number}ª · {fmtDate(p.dueDate)}
                          </span>
                        </label>
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
    </div>
  );
}
