"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import MediaBubble from "./MediaBubble";
import PuxadaAnexo from "./PuxadaAnexo";
import CobrancaLead from "./CobrancaLead";
import { aReceber, inadimplenciaCravo } from "@/lib/relatorios";
import { interpolarVariaveis } from "@/lib/variaveis";
import { parcelaAtrasada } from "@/lib/finance";
import { UFS_BR } from "@/lib/ddd";
import Icone from "@/components/Icones";

// Data de hoje (local) como "YYYY-MM-DD"
function todayStr() {
  return new Date().toLocaleDateString("en-CA");
}

// Dia da semana + data + hora em que o lead entrou no funil.
function fmtCriacao(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const diaSemana = d.toLocaleDateString("pt-BR", { weekday: "long" });
  const data = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${diaSemana.charAt(0).toUpperCase()}${diaSemana.slice(1)}, ${data} às ${hora}`;
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
  const [encaminharMsg, setEncaminharMsg] = useState(null); // mensagem sendo encaminhada | null
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
  const [cpfCopiado, setCpfCopiado] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [tplSent, setTplSent] = useState(false);
  const [numbers, setNumbers] = useState([]);
  const [selectedInstance, setSelectedInstance] = useState("");
  const [resumo, setResumo] = useState(null); // { dia, semana, mes, pendenteTotal, clientes }
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [attachError, setAttachError] = useState("");
  const [multaPct, setMultaPct] = useState(50);
  const [tasks, setTasks] = useState([]);
  const [taskTypes, setTaskTypes] = useState([]);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: "", tipoId: "", dueDate: "", dueTime: "09:00" });
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
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [modoBusca, setModoBusca] = useState("conversas"); // conversas | mensagens
  const [resultadosMsg, setResultadosMsg] = useState([]);
  const [buscandoMsg, setBuscandoMsg] = useState(false);
  const [resumoIa, setResumoIa] = useState(null);
  const [resumindo, setResumindo] = useState(false);

  const [mostrarArquivadas, setMostrarArquivadas] = useState(false);

  const loadConversations = useCallback(async () => {
    const data = await fetch(`/api/chat${mostrarArquivadas ? "?arquivadas=1" : ""}`).then((r) => r.json()).catch(() => []);
    setConversations(Array.isArray(data) ? data : []);
  }, [mostrarArquivadas]);

  useEffect(() => {
    loadConversations();
    const t = setInterval(loadConversations, 5000);
    return () => clearInterval(t);
  }, [loadConversations]);

  async function toggleChatFixado(c) {
    setConversations((prev) => prev.map((x) => (x.id === c.id ? { ...x, chatFixado: !x.chatFixado } : x)));
    await fetch(`/api/contacts/${c.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatFixado: !c.chatFixado }),
    });
    loadConversations();
  }

  async function toggleChatArquivado(c) {
    await fetch(`/api/contacts/${c.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatArquivado: !c.chatArquivado }),
    });
    if (!mostrarArquivadas) setConversations((prev) => prev.filter((x) => x.id !== c.id));
    loadConversations();
  }

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
    fetch("/api/task-types").then((r) => r.json()).then((t) => setTaskTypes(Array.isArray(t) ? t : [])).catch(() => {});
    fetch("/api/config").then((r) => r.json()).then((cfg) => {
      if (cfg?.multaPct != null) setMultaPct(cfg.multaPct);
      setHoraLimite(cfg?.pagamentoHoraLimite || "");
    }).catch(() => {});
  }, []);

  // Quantos números distintos aparecem de fato nas mensagens DESTA conversa —
  // usado pra decidir se mostra a etiqueta "📱 número" em cada balão. Antes
  // isso dependia de `numbers.length` (a lista de números que o usuário logado
  // tem permissão de ver); um cobrador com só 1 número visível nunca via a
  // etiqueta, mesmo numa conversa que teve mensagens de outro número (ex.:
  // atendida antes por outro cobrador/setor).
  const instanciasNaConversa = useMemo(
    () => new Set(messages.map((m) => m.instance).filter(Boolean)),
    [messages]
  );

  // Aplica busca + filtros + ordenação na lista de conversas
  // Busca dentro das conversas (inclui transcrição de áudio, que fica no body).
  // Com debounce pra não disparar uma consulta por tecla digitada.
  useEffect(() => {
    if (modoBusca !== "mensagens") return;
    const termo = busca.trim();
    if (termo.length < 3) { setResultadosMsg([]); return; }
    setBuscandoMsg(true);
    const t = setTimeout(() => {
      fetch(`/api/mensagens/busca?q=${encodeURIComponent(termo)}`)
        .then((r) => r.json())
        .then((d) => setResultadosMsg(Array.isArray(d) ? d : []))
        .catch(() => setResultadosMsg([]))
        .finally(() => setBuscandoMsg(false));
    }, 400);
    return () => clearTimeout(t);
  }, [busca, modoBusca]);

  // Resumo é sempre do histórico atual — some ao trocar de conversa.
  useEffect(() => { setResumoIa(null); }, [selectedId]);

  async function gerarResumo() {
    if (!selectedId) return;
    setResumindo(true);
    setResumoIa(null);
    const res = await fetch(`/api/contacts/${selectedId}/resumo`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setResumindo(false);
    setResumoIa(res.ok ? d.resumo : `Erro: ${d.error || "não foi possível resumir."}`);
  }

  const chatFiltrosAtivosCount =
    (statusFiltro ? 1 : 0) + (stageFiltro ? 1 : 0) + (tagFiltro ? 1 : 0) + (instanceFiltro ? 1 : 0);

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

  const loadTasks = useCallback(async () => {
    if (!selectedId) return;
    const requestedId = selectedId;
    const data = await fetch(`/api/tasks?contactId=${requestedId}`).then((r) => r.json()).catch(() => []);
    if (requestedId !== selectedIdRef.current) return;
    setTasks(Array.isArray(data) ? data : []);
  }, [selectedId]);

  const loadContact = useCallback(async () => {
    if (!selectedId) return;
    const requestedId = selectedId;
    const ct = await fetch(`/api/contacts/${requestedId}`).then((r) => r.json()).catch(() => null);
    loadTasks();
    if (requestedId !== selectedIdRef.current) return; // trocou de conversa enquanto isso — descarta
    if (ct && !ct.error) {
      setContact(ct);
      setForm({
        name: ct.name || "",
        phone: ct.phone || "",
        notes: ct.notes || "",
        responsavel: ct.responsavel || "",
        stageId: ct.stageId || "",
        valorCapital: ct.valorCapital ?? "",
        pagamentoCapital: ct.pagamentoCapital ? new Date(ct.pagamentoCapital).toISOString().slice(0, 10) : "",
        estado: ct.estado || "",
        genero: ct.genero || "",
        tipoCliente: ct.tipoCliente || "",
        cpf: ct.cpf || "",
      });
      setContactTags((ct.tags || []).map((t) => t.id));
    }
  }, [selectedId, loadTasks]);

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

  async function apagarMensagem(id) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, apagada: true } : m)));
    await fetch(`/api/messages/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apagada: true }),
    });
  }

  // Encaminha reaproveitando a mesma rota de envio de mensagem pronta — o
  // destino recebe como se fosse enviada agora, com seu próprio número/data.
  async function encaminharPara(destinoContactId) {
    const m = encaminharMsg;
    setEncaminharMsg(null);
    if (!m || !destinoContactId) return;
    await fetch(`/api/contacts/${destinoContactId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: m.kind === "text" || (!m.mediaUrl)
        ? JSON.stringify({ body: m.body || "" })
        : JSON.stringify({ mediaType: m.kind, mediaUrl: m.mediaUrl, mediaMimetype: m.mimeType, mediaFileName: m.fileName, body: m.body || "" }),
    });
  }

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

  async function createTask(e) {
    e.preventDefault();
    if (!taskForm.title.trim() || !selectedId) return;
    const dia = taskForm.dueDate || todayStr();
    const hora = taskForm.dueTime || "09:00";
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...taskForm, contactId: selectedId, dueDate: `${dia}T${hora}:00` }),
    });
    setTaskForm({ title: "", tipoId: "", dueDate: "", dueTime: "09:00" });
    setShowTaskForm(false);
    loadTasks();
  }

  async function toggleTaskDone(t) {
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
    await fetch(`/api/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !t.done }),
    });
  }

  async function removeTask(id) {
    if (!confirm("Excluir esta tarefa?")) return;
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    loadTasks();
  }

  const selected = conversations.find((c) => c.id === selectedId);
  const parcelas = contact?.parcelas || [];
  const parcelasAtuais = parcelas.filter((p) => (p.ciclo || 1) === (contact?.cicloAtual || 1));
  const pagas = parcelasAtuais.filter((p) => p.paid).length;
  const totalParcelas = parcelasAtuais.length;
  const faltaQuitar = parcelasAtuais.filter((p) => !p.paid && !p.renegociada).reduce((s, p) => s + p.amount, 0);

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
      <div className={`${selectedId ? "hidden md:flex" : "flex"} w-full md:w-80 flex-1 md:flex-none border-r border-slate-200 bg-white flex-col min-h-0`}>
        <div className="px-4 py-3 border-b border-slate-200 shrink-0 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-800 text-sm">Conversas</h2>
            <span className="text-[11px] text-slate-400">{conversasFiltradas.length}</span>
          </div>
          <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
            {[
              { key: "conversas", label: "Conversas" },
              { key: "mensagens", label: "Mensagens" },
            ].map((m) => (
              <button
                key={m.key}
                onClick={() => setModoBusca(m.key)}
                className={`flex-1 text-[11px] px-2 py-1 rounded-md transition-colors ${
                  modoBusca === m.key ? "bg-white shadow-sm text-slate-700 font-medium" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={modoBusca === "mensagens" ? "Buscar dentro das conversas…" : "Buscar por nome ou telefone…"}
              className="flex-1 min-w-0 text-xs border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-emerald-400"
            />
            <button
              onClick={() => setFiltrosAbertos(true)}
              className={`shrink-0 flex items-center gap-1 text-[11px] rounded-full px-2.5 py-1.5 border transition-colors ${
                chatFiltrosAtivosCount > 0
                  ? "bg-slate-800 text-white border-slate-800"
                  : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
              }`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
                <path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" />
              </svg>
              Filtros
              {chatFiltrosAtivosCount > 0 && (
                <span className="bg-white/20 rounded-full w-3.5 h-3.5 flex items-center justify-center text-[9px] leading-none">
                  {chatFiltrosAtivosCount}
                </span>
              )}
            </button>
            <button
              type="button"
              title={mostrarArquivadas ? "Ver conversas normais" : "Ver conversas arquivadas"}
              onClick={() => setMostrarArquivadas((v) => !v)}
              className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-full border transition-colors ${
                mostrarArquivadas ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-400 border-slate-200 hover:border-slate-300"
              }`}
            >
              <Icone nome="documento" className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {filtrosAbertos && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={() => setFiltrosAbertos(false)}>
            <div
              className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[85vh] overflow-y-auto thin-scroll"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
                <h3 className="font-semibold text-slate-800">Filtros</h3>
                <div className="flex items-center gap-3">
                  {chatFiltrosAtivosCount > 0 && (
                    <button
                      onClick={() => { setStatusFiltro(""); setStageFiltro(""); setTagFiltro(""); setInstanceFiltro(""); }}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      Limpar tudo
                    </button>
                  )}
                  <button onClick={() => setFiltrosAbertos(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
                </div>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <span className="text-xs text-slate-400">Situação</span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {["", "atrasado", "hoje", "emdia", "sem"].map((s) => (
                      <button
                        key={s || "todos"}
                        onClick={() => setStatusFiltro(s)}
                        className={`text-xs rounded-full px-3 py-1 border transition-colors ${
                          statusFiltro === s
                            ? "bg-slate-800 text-white border-slate-800"
                            : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        {s ? STATUS_LABEL[s] : "Todos"}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="block">
                  <span className="text-xs text-slate-400">Etapa</span>
                  <select
                    value={stageFiltro}
                    onChange={(e) => setStageFiltro(e.target.value)}
                    className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:border-emerald-400"
                  >
                    <option value="">Todas etapas</option>
                    {stagesList.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs text-slate-400">Etiqueta</span>
                  <select
                    value={tagFiltro}
                    onChange={(e) => setTagFiltro(e.target.value)}
                    className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:border-emerald-400"
                  >
                    <option value="">Todas etiquetas</option>
                    {allTags.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs text-slate-400">Número</span>
                  <select
                    value={instanceFiltro}
                    onChange={(e) => setInstanceFiltro(e.target.value)}
                    className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:border-emerald-400"
                  >
                    <option value="">Todos números</option>
                    {numbers.map((n) => (
                      <option key={n.id} value={n.instance}>{n.label}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs text-slate-400">Ordenar</span>
                  <select
                    value={ordem}
                    onChange={(e) => setOrdem(e.target.value)}
                    className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:border-emerald-400"
                  >
                    <option value="recentes">Mais recentes</option>
                    <option value="antigas">Mais antigas</option>
                    <option value="nome">Nome (A-Z)</option>
                  </select>
                </label>
              </div>
            </div>
          </div>
        )}

        {modoBusca === "mensagens" ? (
          <div className="flex-1 overflow-y-auto thin-scroll">
            {busca.trim().length < 3 ? (
              <p className="text-xs text-slate-400 p-4">Digite ao menos 3 letras pra buscar dentro das conversas.</p>
            ) : buscandoMsg ? (
              <p className="text-xs text-slate-400 p-4">Buscando…</p>
            ) : resultadosMsg.length === 0 ? (
              <p className="text-xs text-slate-400 p-4">Nada encontrado.</p>
            ) : (
              resultadosMsg.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { setSelectedId(m.contactId); setContact(null); setMessages([]); setShowInfo(false); }}
                  className="w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-700 truncate">{m.contactName}</span>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {new Date(m.createdAt).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                    {m.kind === "audio" && <span title="veio de um áudio" className="inline-flex align-middle mr-1"><Icone nome="fone" className="w-3 h-3" /></span>}
                    {m.fromMe ? "Você: " : ""}
                    {m.body}
                  </p>
                </button>
              ))
            )}
          </div>
        ) : (
        <div className="flex-1 overflow-y-auto thin-scroll">
          {conversasFiltradas.map((c) => (
            <div key={c.id} className="group relative">
              <button
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
                    <div className="flex justify-between items-baseline gap-1">
                      <p className="text-sm font-medium text-slate-800 truncate flex items-center gap-1">
                        {c.chatFixado && <Icone nome="local" className="w-2.5 h-2.5 text-amber-500 shrink-0" />}
                        {c.name}
                      </p>
                      {c.lastMessage && (
                        <span className="text-[10px] text-slate-400 shrink-0 ml-2">{fmtTime(c.lastMessage.createdAt)}</span>
                      )}
                    </div>
                    {c.lastMessage && (
                      <p className="text-xs text-slate-400 truncate mt-0.5 pr-10">
                        {c.lastMessage.fromMe ? "Você: " : ""}
                        {c.lastMessage.kind !== "text" ? `[${c.lastMessage.kind}]` : c.lastMessage.body?.slice(0, 50)}
                      </p>
                    )}
                  </div>
                </div>
              </button>
              {/* Fixar/arquivar (itens 81/82) — só aparece no hover, não rouba clique do item */}
              <span className="absolute top-2.5 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  title={c.chatFixado ? "Desafixar" : "Fixar no topo"}
                  onClick={(e) => { e.stopPropagation(); toggleChatFixado(c); }}
                  className={`w-6 h-6 rounded-full flex items-center justify-center ${c.chatFixado ? "text-amber-500" : "text-slate-300 hover:text-amber-500"}`}
                >
                  <Icone nome="local" className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  title={c.chatArquivado ? "Desarquivar" : "Arquivar"}
                  onClick={(e) => { e.stopPropagation(); toggleChatArquivado(c); }}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-slate-300 hover:text-slate-600"
                >
                  <Icone nome="documento" className="w-3.5 h-3.5" />
                </button>
              </span>
            </div>
          ))}
          {conversasFiltradas.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">Nenhuma conversa encontrada.</p>
          )}
        </div>
        )}
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
                onClick={gerarResumo}
                disabled={resumindo}
                title="Resumir a conversa com IA"
                className="shrink-0 flex items-center gap-1 text-xs font-medium rounded-full px-2.5 py-1 border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
              >
                {resumindo ? "Resumindo…" : (<><Icone nome="estrela" className="w-3 h-3" /> Resumir</>)}
              </button>
              {selected.phone && (
                <a
                  href={`https://wa.me/${selected.phone.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  title="Abrir conversa no WhatsApp pra ligar pro cliente (o sistema não faz a chamada sozinho)"
                  className="shrink-0 flex items-center gap-1 text-xs font-medium rounded-full px-2.5 py-1 border border-slate-200 text-slate-500 hover:bg-slate-50"
                >
                  <Icone nome="cobranca" className="w-3 h-3" /> Ligar
                </a>
              )}
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
                  <span className="flex items-center gap-1"><Icone nome="robo" className="w-3.5 h-3.5" /> {contact.iaPausada ? "IA desligada" : "IA ligada"}</span>
                </button>
              )}
              <button
                onClick={() => setShowInfo((v) => !v)}
                className="text-xs text-emerald-600 hover:text-emerald-700 border border-emerald-200 rounded-lg px-2.5 py-1 shrink-0"
              >
                {showInfo ? "Ocultar" : "Dados"}
              </button>
            </div>
            {resumoIa && (
              <div className="mx-4 mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 shrink-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="flex items-center gap-1 text-xs font-semibold text-sky-700"><Icone nome="estrela" className="w-3 h-3" /> Resumo da conversa</p>
                  <button onClick={() => setResumoIa(null)} className="text-sky-400 hover:text-sky-600 text-sm leading-none">×</button>
                </div>
                <p className="text-xs text-slate-600 mt-1.5 whitespace-pre-line">{resumoIa}</p>
              </div>
            )}
            <div className="flex-1 overflow-y-auto thin-scroll p-4 space-y-2">
              {messages.map((m) => (
                <div key={m.id} className={`group flex items-center gap-1 ${m.fromMe ? "justify-end" : "justify-start"}`}>
                  {/* Ações aparecem só no hover, e só pras nossas — encaminhar
                      qualquer uma, apagar (item 88, só da nossa lista) só a nossa. */}
                  {!m.apagada && (
                    <span className={`shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ${m.fromMe ? "order-first" : ""}`}>
                      <button type="button" title="Encaminhar" onClick={() => setEncaminharMsg(m)} className="w-6 h-6 flex items-center justify-center rounded-full text-slate-400 hover:text-emerald-600 hover:bg-slate-100">
                        <Icone nome="seta" className="w-3 h-3 -rotate-90" />
                      </button>
                      {m.fromMe && (
                        <button type="button" title="Apagar da minha lista" onClick={() => apagarMensagem(m.id)} className="w-6 h-6 flex items-center justify-center rounded-full text-slate-400 hover:text-red-500 hover:bg-slate-100">
                          <Icone nome="x" className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                  )}
                  <div
                    className={`max-w-[70%] rounded-xl px-3 py-2 text-sm ${
                      m.fromMe
                        ? "bg-emerald-500 text-white rounded-br-sm"
                        : "bg-white text-slate-800 border border-slate-200 rounded-bl-sm"
                    }`}
                  >
                    {m.instance && instanciasNaConversa.size > 1 && (
                      <p className={`flex items-center gap-1 text-[10px] mb-0.5 ${m.fromMe ? "text-emerald-100" : "text-slate-400"}`}>
                        <Icone nome="celular" className="w-2.5 h-2.5" /> {numberLabel(m.instance, numbers)}
                      </p>
                    )}
                    {m.apagada ? (
                      <p className={`italic ${m.fromMe ? "text-emerald-100" : "text-slate-400"}`}>Mensagem apagada</p>
                    ) : (
                      <>
                        {(m.kind === "audio" || m.kind === "image" || m.kind === "document" || m.kind === "location") && <MediaBubble message={m} />}
                        {m.kind !== "location" && (m.kind === "text" || m.body) && <p>{m.body}</p>}
                      </>
                    )}
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
                  className="shrink-0 w-9 h-9 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 flex items-center justify-center"
                >
                  <Icone nome="clipe" className="w-4 h-4" />
                </button>
                <div className="flex-1 relative min-w-0">
                  <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={recording ? "Gravando áudio…" : uploading ? "Enviando anexo…" : "Digite uma mensagem… (\"/\" pra mensagem pronta)"}
                    disabled={recording}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400 disabled:bg-slate-50"
                  />
                  {text.startsWith("/") && (
                    <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto thin-scroll z-10">
                      {templates.filter((t) => t.title.toLowerCase().includes(text.slice(1).toLowerCase())).slice(0, 8).map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => { setText(""); pickTemplate(t.id); }}
                          className="w-full text-left text-xs text-slate-700 hover:bg-emerald-50 px-3 py-2 truncate border-b border-slate-50 last:border-0"
                        >
                          {t.title}
                        </button>
                      ))}
                      {templates.filter((t) => t.title.toLowerCase().includes(text.slice(1).toLowerCase())).length === 0 && (
                        <p className="text-xs text-slate-400 px-3 py-2">Nenhuma mensagem pronta com esse nome.</p>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={recording ? stopRecording : startRecording}
                  disabled={uploading}
                  title={recording ? "Parar gravação" : "Gravar áudio"}
                  className={`shrink-0 w-9 h-9 rounded-lg border flex items-center justify-center disabled:opacity-40 ${
                    recording
                      ? "border-red-300 bg-red-50 text-red-600 animate-pulse"
                      : "border-slate-200 text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  <Icone nome={recording ? "parar" : "microfone"} className="w-4 h-4" />
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

      {/* Painel direito: edição do lead. No mobile era um overlay w-full que
          cobria o chat inteiro — agora é uma gaveta mais estreita (com fundo
          escurecido atrás) pra sobrar um pouco do chat visível do lado. */}
      {selectedId && contact && showInfo && (
        <div className="md:hidden fixed inset-0 bg-slate-900/30 z-20" onClick={() => setShowInfo(false)} />
      )}
      {selectedId && contact && showInfo && (
        <div className="w-[82%] max-w-sm md:w-72 lg:w-80 shrink-0 border-l border-slate-200 bg-white overflow-y-auto thin-scroll absolute md:relative inset-y-0 right-0 md:inset-auto z-30 md:z-auto shadow-xl md:shadow-none">
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
              <span className="text-[11px] text-slate-400">Tipo de cliente</span>
              <select value={form.tipoCliente || ""} onChange={set("tipoCliente")} className={selectCls}>
                <option value="">— Não identificado —</option>
                <option value="motoboy">Motoboy</option>
                <option value="uber">Uber</option>
                <option value="comerciante">Comerciante</option>
              </select>
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

            {/* Estado do lead — a IA já preenche pelo DDD do telefone (ou pelo
                que o cliente contar na conversa); dá pra corrigir manualmente. */}
            <label className="block">
              <span className="flex items-center gap-1 text-[11px] text-slate-400"><Icone nome="local" className="w-3 h-3" /> Estado (UF)</span>
              <select value={form.estado || ""} onChange={set("estado")} className={selectCls}>
                <option value="">— Não identificado —</option>
                {UFS_BR.map((uf) => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
              </select>
            </label>

            {/* Gênero do lead — a IA já preenche pelo nome; dá pra corrigir manualmente. */}
            <label className="block">
              <span className="text-[11px] text-slate-400">Gênero</span>
              <select value={form.genero || ""} onChange={set("genero")} className={selectCls}>
                <option value="">— Não identificado —</option>
                <option value="masculino">Masculino</option>
                <option value="feminino">Feminino</option>
              </select>
            </label>

            {/* Criação — quando o lead entrou no funil (dia da semana, data e hora). Só leitura. */}
            <div className="block">
              <span className="text-[11px] text-slate-400">Criação</span>
              <p className="mt-0.5 text-xs text-slate-600">{fmtCriacao(contact?.createdAt)}</p>
            </div>

            {/* CPF — a IA preenche sozinha ao ler um RG/CNH recebido; dá pra corrigir manualmente. */}
            <label className="block">
              <span className="text-[11px] text-slate-400">CPF</span>
              <div className="mt-0.5 flex items-center gap-1.5">
                <input
                  type="text"
                  value={form.cpf || ""}
                  onChange={(e) => setForm((f) => ({ ...f, cpf: e.target.value.replace(/\D/g, "").slice(0, 11) }))}
                  placeholder="Só números — a IA preenche pelo documento"
                  className={`flex-1 min-w-0 ${inputCls}`}
                />
                {form.cpf && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(form.cpf);
                        setCpfCopiado(true);
                        setTimeout(() => setCpfCopiado(false), 1500);
                      } catch {}
                    }}
                    title="Copiar CPF"
                    className="shrink-0 flex items-center justify-center border border-slate-200 rounded px-2 py-1.5 text-slate-500 hover:text-emerald-600 hover:border-emerald-300 transition-colors"
                  >
                    <Icone nome={cpfCopiado ? "check" : "copiar"} className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </label>

            {/* Puxada (consulta de crédito) em PDF — fixa no card, não depende do chat */}
            <PuxadaAnexo
              contactId={selectedId}
              cpf={form.cpf || contact?.cpf}
              puxadaUrl={contact?.puxadaUrl}
              puxadaFileName={contact?.puxadaFileName}
              puxadaScore={contact?.puxadaScore}
              puxadaRisco={contact?.puxadaRisco}
              puxadaLimite={contact?.puxadaLimite}
              puxadaMotivos={contact?.puxadaMotivos}
              puxadaRenda={contact?.puxadaRenda}
              puxadaEmprestimos={contact?.puxadaEmprestimos}
              puxadaCcf={contact?.puxadaCcf}
              puxadaProcessos={contact?.puxadaProcessos}
              onChange={(patch) => setContact((c) => ({ ...c, ...patch }))}
            />

            <CobrancaLead contactId={selectedId} contact={contact} onChanged={loadContact} />

            {/* Tarefas do lead */}
            <div className="border border-slate-200 rounded-lg p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-600">Tarefas ({tasks.filter((t) => !t.done).length} pendentes)</span>
                <button type="button" onClick={() => setShowTaskForm((v) => !v)} className="text-[11px] text-emerald-600 hover:text-emerald-700">
                  {showTaskForm ? "Cancelar" : "+ Tarefa"}
                </button>
              </div>
              {showTaskForm && (
                <form onSubmit={createTask} className="mt-2 space-y-1.5">
                  <input
                    value={taskForm.title}
                    onChange={(e) => setTaskForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="Título da tarefa"
                    className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-emerald-400"
                  />
                  <select
                    value={taskForm.tipoId}
                    onChange={(e) => setTaskForm((f) => ({ ...f, tipoId: e.target.value }))}
                    className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 bg-white outline-none"
                  >
                    <option value="">— Sem tipo —</option>
                    {taskTypes.map((t) => (
                      <option key={t.id} value={t.id}>{t.emoji ? `${t.emoji} ` : ""}{t.name}</option>
                    ))}
                  </select>
                  <div className="flex gap-1.5">
                    <input
                      type="date"
                      value={taskForm.dueDate}
                      onChange={(e) => setTaskForm((f) => ({ ...f, dueDate: e.target.value }))}
                      className="min-w-0 flex-1 text-xs border border-slate-200 rounded px-2 py-1.5"
                    />
                    <input
                      type="time"
                      value={taskForm.dueTime}
                      onChange={(e) => setTaskForm((f) => ({ ...f, dueTime: e.target.value }))}
                      className="min-w-0 w-24 shrink-0 text-xs border border-slate-200 rounded px-2 py-1.5"
                    />
                  </div>
                  <button className="w-full bg-emerald-500 text-white rounded py-1.5 text-xs hover:bg-emerald-600">Criar tarefa</button>
                </form>
              )}
              {tasks.length > 0 && (
                <ul className="mt-2 divide-y divide-slate-100">
                  {tasks.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 py-1.5">
                      <input type="checkbox" checked={t.done} onChange={() => toggleTaskDone(t)} className="accent-emerald-500 shrink-0" />
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {new Date(t.dueDate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className={`text-xs flex-1 min-w-0 truncate ${t.done ? "text-slate-400 line-through" : "text-slate-600"}`}>{t.title}</span>
                      {t.tipo && (
                        <span className="text-[9px] font-medium rounded-full px-1.5 py-0.5 text-white shrink-0" style={{ backgroundColor: t.tipo.color }}>
                          {t.tipo.emoji ? `${t.tipo.emoji} ` : ""}{t.tipo.name}
                        </span>
                      )}
                      <button onClick={() => removeTask(t.id)} className="text-red-400 hover:text-red-600 shrink-0">×</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

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

      {/* Encaminhar mensagem (item 79) */}
      {encaminharMsg && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={() => setEncaminharMsg(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-800 mb-3">Encaminhar pra…</h3>
            <div className="max-h-72 overflow-y-auto thin-scroll -mx-1 px-1 space-y-0.5">
              {conversations
                .filter((c) => c.id !== selectedId)
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => encaminharPara(c.id)}
                    className="w-full text-left text-sm text-slate-700 hover:bg-slate-50 rounded-lg px-2.5 py-2 truncate"
                  >
                    {c.name} <span className="text-slate-400 text-xs">{c.phone}</span>
                  </button>
                ))}
              {conversations.length <= 1 && <p className="text-xs text-slate-400 py-2">Nenhuma outra conversa pra encaminhar.</p>}
            </div>
            <button onClick={() => setEncaminharMsg(null)} className="mt-3 text-xs text-slate-400 hover:text-slate-600">Cancelar</button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
