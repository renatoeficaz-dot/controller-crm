"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { resumoCobranca, valorParcelaAtual, parcelaAtrasada, NUM_PARCELAS } from "@/lib/finance";
import { limiteEscalonado } from "@/lib/escalonamento";
import { validarCPF } from "@/lib/cpf";
import { UFS_BR } from "@/lib/ddd";
import MediaBubble, { MediaLightbox } from "./MediaBubble";
import PuxadaAnexo from "./PuxadaAnexo";
import CobrancaLead from "./CobrancaLead";
import Icone from "@/components/Icones";
import PixModal from "./PixModal";
import DocumentosPopup from "./DocumentosPopup";
import TimelineLead from "./TimelineLead";
import AgendarMensagemModal from "./AgendarMensagemModal";
import AgendamentosPendentesModal from "./AgendamentosPendentesModal";

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

// Dia da semana + data + hora em que o lead entrou no funil — usado nos
// relatórios pra cruzar inadimplência/recebimento com o dia de criação.
function fmtCriacao(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const diaSemana = d.toLocaleDateString("pt-BR", { weekday: "long" });
  const data = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${diaSemana.charAt(0).toUpperCase()}${diaSemana.slice(1)}, ${data} às ${hora}`;
}

function numberLabel(instance, numbers) {
  if (!instance) return null;
  const n = numbers.find((x) => x.instance === instance);
  return n ? n.label : instance;
}

// DateTime ISO -> "YYYY-MM-DD" (para <input type=date>)
const toDateInput = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");

export default function ContactModal({ contactId, onClose, onChanged }) {
  const [contact, setContact] = useState(null);
  const [messages, setMessages] = useState([]);
  const [parcelas, setParcelas] = useState([]);
  // Item 173: 3 envios seguidos falhando (sem sucesso nem resposta entre eles)
  // é o único sinal indireto que o WhatsApp dá de que o número te bloqueou.
  const possivelBloqueio = useMemo(() => {
    const enviadas = messages.filter((m) => m.fromMe).slice(-3);
    return enviadas.length === 3 && enviadas.every((m) => m.status === "falhou" || m.status === "erro");
  }, [messages]);
  const [editandoBaixa, setEditandoBaixa] = useState(null); // { parcela, modo: "valor"|"desfazer", novoValor, motivo }
  const [pixAberto, setPixAberto] = useState(null); // parcela | null
  const [baixaParcialAberta, setBaixaParcialAberta] = useState(null); // parcela | null
  const [parcelaAvulsaAberta, setParcelaAvulsaAberta] = useState(null); // { valor, vencimento, descricao } | null
  const [salvandoAvulsa, setSalvandoAvulsa] = useState(false);
  const [editandoVencimento, setEditandoVencimento] = useState(null); // { parcela, novoVencimento, motivo } | null
  const [salvandoVencimento, setSalvandoVencimento] = useState(false);
  const [descontoAberto, setDescontoAberto] = useState(null); // { parcela, valorPedido, motivo } | null
  const [enviandoDesconto, setEnviandoDesconto] = useState(false);
  const [descontoMsg, setDescontoMsg] = useState("");

  async function pedirDesconto() {
    if (!descontoAberto?.valorPedido || !descontoAberto?.motivo?.trim()) return;
    setEnviandoDesconto(true);
    setDescontoMsg("");
    const res = await fetch(`/api/parcelas/${descontoAberto.parcela.id}/desconto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ valorPedido: Number(descontoAberto.valorPedido), motivo: descontoAberto.motivo.trim() }),
    });
    setEnviandoDesconto(false);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setDescontoMsg(d.error || "Erro ao pedir desconto."); return; }
    setDescontoAberto(null);
  }

  async function salvarParcelaAvulsa() {
    if (!parcelaAvulsaAberta?.valor || !parcelaAvulsaAberta?.vencimento) return;
    setSalvandoAvulsa(true);
    const res = await fetch(`/api/contacts/${contactId}/parcelas/avulsa`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parcelaAvulsaAberta),
    });
    setSalvandoAvulsa(false);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { alert(d.error || "Erro ao criar parcela."); return; }
    setParcelas((prev) => [...prev, d]);
    setParcelaAvulsaAberta(null);
  }

  async function salvarVencimento() {
    if (!editandoVencimento?.novoVencimento || !editandoVencimento?.motivo?.trim()) return;
    setSalvandoVencimento(true);
    const res = await fetch(`/api/parcelas/${editandoVencimento.parcela.id}/vencimento`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ novoVencimento: editandoVencimento.novoVencimento, motivo: editandoVencimento.motivo }),
    });
    setSalvandoVencimento(false);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { alert(d.error || "Erro ao alterar vencimento."); return; }
    setParcelas((prev) => prev.map((x) => (x.id === d.id ? d : x)));
    setEditandoVencimento(null);
  }
  const [valorParcial, setValorParcial] = useState("");
  const [enviandoParcial, setEnviandoParcial] = useState(false);

  async function confirmarBaixaParcial() {
    if (!baixaParcialAberta || !valorParcial || Number(valorParcial) <= 0) return;
    setEnviandoParcial(true);
    const res = await fetch(`/api/parcelas/${baixaParcialAberta.id}/baixa-parcial`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ valor: Number(valorParcial) }),
    });
    setEnviandoParcial(false);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { alert(d.error || "Erro ao registrar baixa parcial."); return; }
    // Item 162: sobra do pagamento pode ter quitado (total ou parcialmente) as
    // próximas parcelas — recarrega tudo em vez de só a que foi clicada.
    // Sobra que não coube em nenhuma parcela precisa ser dita em voz alta: o
    // dinheiro está com o cobrador e não vai virar lançamento sozinho.
    const avisoSobra = d.sobrouSemAplicar > 0
      ? `\n\nATENÇÃO: sobraram R$ ${d.sobrouSemAplicar} sem parcela em aberto pra aplicar. Esse valor NÃO foi lançado no caixa — devolva ao cliente ou lance à parte em Lançamentos.`
      : "";

    if (d.quitadasAdiantado?.length > 0) {
      const linhas = d.quitadasAdiantado.map((q) => `${q.number}ª parcela: R$ ${q.valor}${q.completou ? " (quitada)" : " (parcial)"}`);
      alert(`Sobrou dinheiro do pagamento e foi usado nas próximas parcelas:\n\n${linhas.join("\n")}${avisoSobra}`);
      await loadContact();
    } else {
      if (avisoSobra) alert(avisoSobra.trim());
      setParcelas((prev) => prev.map((x) => (x.id === baixaParcialAberta.id ? d.parcela : x)));
    }
    setBaixaParcialAberta(null);
    setValorParcial("");
  }
  const [documentosAberto, setDocumentosAberto] = useState(false);
  const [timelineAberta, setTimelineAberta] = useState(false);
  const [camposDef, setCamposDef] = useState([]);
  const [agendarAberto, setAgendarAberto] = useState(false);
  const [agendamentosAberto, setAgendamentosAberto] = useState(false);
  const [honorariosPct, setHonorariosPct] = useState(30);
  const [multaPct, setMultaPct] = useState(50);
  const [escalonamentoCfg, setEscalonamentoCfg] = useState(null);
  const [caloteAviso, setCaloteAviso] = useState(null);
  const [horaLimite, setHoraLimite] = useState("");
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
  const [cpfCopiado, setCpfCopiado] = useState(false);
  const [allTags, setAllTags] = useState([]);
  const [contactTags, setContactTags] = useState([]);
  const [numbers, setNumbers] = useState([]);
  const [selectedInstance, setSelectedInstance] = useState("");
  const [cicloAtual, setCicloAtual] = useState(1);
  const [showHistorico, setShowHistorico] = useState(false);
  const [showRenegociadas, setShowRenegociadas] = useState(false);
  const [renovForm, setRenovForm] = useState({ valorCapital: "", pagamentoCapital: "" });
  const [renovando, setRenovando] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [taskTypes, setTaskTypes] = useState([]);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: "", tipoId: "", dueDate: "", dueTime: "09:00" });
  const chatEnd = useRef(null);
  const fileInputRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);

  const loadTasks = useCallback(async () => {
    const data = await fetch(`/api/tasks?contactId=${contactId}`).then((r) => r.json()).catch(() => []);
    setTasks(Array.isArray(data) ? data : []);
  }, [contactId]);

  const loadContact = useCallback(async () => {
    const [res, cfg] = await Promise.all([
      fetch(`/api/contacts/${contactId}`),
      fetch("/api/config").then((r) => r.json()).catch(() => null),
      loadTasks(),
    ]);
    const data = await res.json();
    setContact(data);
    setForm({
      name: data.name || "",
      phone: data.phone || "",
      notes: data.notes || "",
      valorCapital: data.valorCapital ?? "",
      pagamentoCapital: toDateInput(data.pagamentoCapital),
      responsavel: data.responsavel || "",
      estado: data.estado || "",
      genero: data.genero || "",
      tipoCliente: data.tipoCliente || "",
      cpf: data.cpf || "",
      camposCustom: JSON.parse(data.camposCustom || "{}"),
    });
    setMessages(data.messages || []);
    setParcelas(data.parcelas || []);
    setContactTags((data.tags || []).map((t) => t.id));
    setCicloAtual(data.cicloAtual || 1);
    if (cfg?.honorariosPct != null) setHonorariosPct(cfg.honorariosPct);
    if (cfg?.multaPct != null) setMultaPct(cfg.multaPct);
    setHoraLimite(cfg?.pagamentoHoraLimite || "");
    setEscalonamentoCfg(cfg?.escalonamentoAtivo ? cfg : null);
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
    fetch("/api/tags").then((r) => r.json()).then(setAllTags).catch(() => {});
    fetch("/api/task-types").then((r) => r.json()).then((t) => setTaskTypes(Array.isArray(t) ? t : [])).catch(() => {});
    fetch("/api/numbers").then((r) => r.json()).then((n) => setNumbers(Array.isArray(n) ? n : [])).catch(() => {});
    fetch("/api/campos-personalizados").then((r) => r.json()).then((c) => setCamposDef(Array.isArray(c) ? c : [])).catch(() => {});
  }, []);

  // Número (instância) sugerido pro próximo envio: o último usado nesta
  // conversa — mas só define uma vez por contato aberto, pra não atrapalhar
  // se o usuário trocar manualmente enquanto o polling atualiza as mensagens.
  const instanceDefaultedForRef = useRef(null);
  useEffect(() => {
    instanceDefaultedForRef.current = null;
  }, [contactId]);
  useEffect(() => {
    if (instanceDefaultedForRef.current === contactId) return;
    const lastWithInstance = [...messages].reverse().find((m) => m.instance);
    setSelectedInstance(lastWithInstance?.instance || numbers[0]?.instance || "");
    if (messages.length > 0 || numbers.length > 0) instanceDefaultedForRef.current = contactId;
  }, [messages, contactId, numbers]);

  // Escolhe uma mensagem pronta: texto → campo de envio; mídia/contato → envia direto
  async function pickTemplate(id) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;

    // Templates de mídia ou contato: envia direto ao clicar
    if (t.mediaType && t.mediaType !== "text") {
      setSending(true);
      setError("");
      const payload = { mediaType: t.mediaType, instance: selectedInstance };
      if (t.mediaType === "contact") {
        payload.contactName = t.contactName;
        payload.contactPhone = t.contactPhone;
      } else {
        payload.mediaUrl = t.mediaUrl;
        payload.mediaMimetype = t.mediaMimetype;
        payload.mediaFileName = t.mediaFileName;
        payload.body = t.body || "";
      }
      const res = await fetch(`/api/contacts/${contactId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      setSending(false);
      if (data.message) setMessages((m) => [...m, data.message]);
      if (!res.ok) { setError(data.error || "Falha ao enviar."); return; }
      setTplCopied(true);
      setTimeout(() => setTplCopied(false), 1500);
      return;
    }

    // Template de texto: joga no campo de envio
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

  const hasScrolledRef = useRef(false);
  const lastMsgIdRef = useRef(null);
  useEffect(() => {
    if (!messages.length) return;
    const lastId = messages[messages.length - 1].id;
    if (hasScrolledRef.current && lastId === lastMsgIdRef.current) return; // polling sem mensagem nova — não mexe no scroll
    // Ao abrir o card, pula direto pro final (sem animação); mensagens novas rolam suave.
    chatEnd.current?.scrollIntoView({ behavior: hasScrolledRef.current ? "smooth" : "auto" });
    hasScrolledRef.current = true;
    lastMsgIdRef.current = lastId;
  }, [messages]);

  async function saveContact() {
    const res = await fetch(`/api/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => null);
    setCaloteAviso(data?.caloteAviso || null);
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
    const vaiPagar = !p.paid;
    // Desmarcar uma baixa já registrada é uma ALTERAÇÃO — pede motivo antes
    // (fica logado em Configurações > Alterações).
    if (!vaiPagar) {
      setEditandoBaixa({ parcela: p, modo: "desfazer", novoValor: "", motivo: "" });
      return;
    }
    let amountPago;
    if (parcelaAtrasada(p, undefined, { multaPct, horaLimite })) {
      const comMulta = p.amount * (1 + Number(multaPct) / 100);
      const cobrarComJuros = confirm(
        `Essa parcela está atrasada.\n\nOK = cobrar COM juros (${money(comMulta)})\nCancelar = cobrar SEM juros (${money(p.amount)})`
      );
      amountPago = cobrarComJuros ? comMulta : p.amount;
    }
    // Controle de espécie (item 32): dinheiro em mãos do cobrador precisa ser
    // rastreado até o depósito; Pix não passa pela mão de ninguém.
    const formaPagamento = confirm("Como foi pago?\n\nOK = Pix/transferência\nCancelar = Dinheiro em espécie") ? "pix" : "dinheiro";
    setParcelas((prev) => prev.map((x) => (x.id === p.id ? { ...x, paid: true, amountPago: amountPago ?? p.amount } : x)));
    const res = await fetch(`/api/parcelas/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paid: true, amountPago, formaPagamento }),
    });
    if (!res.ok) {
      // Item 152: alguém já deu baixa nessa parcela nesse meio tempo — desfaz
      // a marcação otimista e recarrega pra mostrar o estado real.
      setParcelas((prev) => prev.map((x) => (x.id === p.id ? p : x)));
      const d = await res.json().catch(() => ({}));
      alert(d.error || "Falha ao registrar a baixa.");
      loadContact();
    }
  }

  function abrirEdicaoValorBaixa(p) {
    setEditandoBaixa({ parcela: p, modo: "valor", novoValor: String(p.amountPago ?? p.amount), motivo: "" });
  }

  async function confirmarEdicaoBaixa() {
    if (!editandoBaixa) return;
    const motivo = editandoBaixa.motivo.trim();
    if (!motivo) return;
    const p = editandoBaixa.parcela;
    const paid = editandoBaixa.modo === "valor";
    const amountPago = paid ? Number(editandoBaixa.novoValor) : null;
    if (paid && (!amountPago || amountPago <= 0)) return;

    setParcelas((prev) => prev.map((x) => (x.id === p.id ? { ...x, paid, amountPago } : x)));
    const res = await fetch(`/api/parcelas/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paid, amountPago, motivo }),
    });
    if (!res.ok) {
      // reverte a mudança otimista se o servidor recusar (ex.: motivo vazio)
      setParcelas((prev) => prev.map((x) => (x.id === p.id ? p : x)));
      const d = await res.json().catch(() => ({}));
      alert(d.error || "Falha ao registrar a alteração.");
      return;
    }
    setEditandoBaixa(null);
  }

  async function createTask(e) {
    e.preventDefault();
    if (!taskForm.title.trim()) return;
    const dia = taskForm.dueDate || toDateInput(new Date());
    const hora = taskForm.dueTime || "09:00";
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...taskForm, contactId, dueDate: `${dia}T${hora}:00` }),
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

  async function send() {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    setError("");
    const res = await fetch(`/api/contacts/${contactId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, instance: selectedInstance }),
    });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    if (data.message) setMessages((m) => [...m, data.message]);
    if (!res.ok) {
      setError(data.error || "Falha ao enviar.");
      return;
    }
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
    fd.append("instance", selectedInstance || "");
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

  async function renovar() {
    if (!renovForm.valorCapital || !renovForm.pagamentoCapital) {
      setCobrancaMsg("Preencha o capital e a data de pagamento da renovação.");
      return;
    }
    setRenovando(true);
    const res = await fetch(`/api/contacts/${contactId}/renovar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(renovForm),
    });
    setRenovando(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setCobrancaMsg(d.error || "Erro ao renovar.");
      return;
    }
    setRenovForm({ valorCapital: "", pagamentoCapital: "" });
    loadContact();
    onChanged?.();
  }

  async function toggleTag(tagId) {
    const has = contactTags.includes(tagId);
    setContactTags((prev) => (has ? prev.filter((id) => id !== tagId) : [...prev, tagId]));
    await fetch(`/api/contacts/${contactId}/tags`, {
      method: has ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId }),
    });
    onChanged?.();
  }

  async function removeContact() {
    if (!confirm("Remover este contato e todo o histórico?")) return;
    let res = await fetch(`/api/contacts/${contactId}`, { method: "DELETE" });
    if (res.status === 409) {
      const d = await res.json().catch(() => ({}));
      if (!d.temParcelasAbertas || !confirm(`${d.error}\n\nExcluir mesmo assim?`)) return;
      res = await fetch(`/api/contacts/${contactId}?force=1`, { method: "DELETE" });
    }
    onChanged?.();
    onClose();
  }

  // Liga/desliga a IA pra este lead — atendimento manual assume a conversa.
  async function toggleIaPausada() {
    const iaPausada = !contact.iaPausada;
    setContact((c) => ({ ...c, iaPausada }));
    await fetch(`/api/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ iaPausada }),
    });
    onChanged?.();
  }

  const isRecebimento = contact?.stage?.name === "Recebimento";
  const resumo = resumoCobranca(form.valorCapital, honorariosPct);
  // Limite de capital do ciclo atual, quando o escalonamento está ligado.
  const limiteCiclo = escalonamentoCfg ? limiteEscalonado(cicloAtual, escalonamentoCfg) : null;
  const acimaDoLimite = limiteCiclo != null && Number(form.valorCapital || 0) > limiteCiclo;
  const limiteProximoCiclo = escalonamentoCfg ? limiteEscalonado(cicloAtual + 1, escalonamentoCfg) : null;
  const multaOpts = { multaPct, horaLimite }; // multa por atraso + horário limite (config)
  // Renegociada = virou acordo, não é mais cobrança ativa — some da lista
  // principal (senão fica um "zumbi" com checkbox e vencimento vencido que
  // ninguém deve mais cobrar) e vai pra uma seção recolhida à parte, só pra
  // manter o rastro de que ela existiu.
  const parcelasAtuais = parcelas.filter((p) => (p.ciclo || 1) === cicloAtual && !p.renegociada);
  const parcelasRenegociadas = parcelas.filter((p) => (p.ciclo || 1) === cicloAtual && p.renegociada);
  const parcelasHistorico = parcelas.filter((p) => (p.ciclo || 1) < cicloAtual);
  const totalPago = parcelasAtuais.filter((p) => p.paid).reduce((s, p) => s + p.amount, 0);
  const faltaQuitar = parcelasAtuais.filter((p) => !p.paid && !p.renegociada).reduce((s, p) => s + p.amount, 0);
  const todasPagas = parcelasAtuais.length > 0 && parcelasAtuais.every((p) => p.paid);

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
      className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-0 md:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white md:rounded-2xl shadow-xl w-full h-full md:max-w-3xl md:h-[80vh] flex flex-col md:flex-row overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Coluna esquerda: dados do contato */}
        <div className="w-full md:w-1/2 md:border-r border-b md:border-b-0 border-slate-200 flex flex-col max-h-[50vh] md:max-h-none">
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

            {/* Estado do lead — a IA já preenche pelo DDD do telefone (ou pelo
                que o cliente contar na conversa); dá pra corrigir manualmente. */}
            <label className="block">
              <span className="flex items-center gap-1 text-xs text-slate-400"><Icone nome="local" className="w-3 h-3" /> Estado (UF)</span>
              <select
                value={form.estado || ""}
                onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value }))}
                className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 bg-white outline-none focus:border-emerald-400"
              >
                <option value="">— Não identificado —</option>
                {UFS_BR.map((uf) => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
              </select>
            </label>

            {/* Gênero do lead — a IA já preenche pelo nome; dá pra corrigir manualmente. */}
            <label className="block">
              <span className="text-xs text-slate-400">Gênero</span>
              <select
                value={form.genero || ""}
                onChange={(e) => setForm((f) => ({ ...f, genero: e.target.value }))}
                className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 bg-white outline-none focus:border-emerald-400"
              >
                <option value="">— Não identificado —</option>
                <option value="masculino">Masculino</option>
                <option value="feminino">Feminino</option>
              </select>
            </label>

            {/* Tipo de cliente */}
            <label className="block">
              <span className="text-xs text-slate-400">Tipo de cliente</span>
              <select
                value={form.tipoCliente || ""}
                onChange={(e) => setForm((f) => ({ ...f, tipoCliente: e.target.value }))}
                className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 bg-white outline-none focus:border-emerald-400"
              >
                <option value="">— Não identificado —</option>
                <option value="motoboy">Motoboy</option>
                <option value="uber">Uber</option>
                <option value="comerciante">Comerciante</option>
              </select>
            </label>

            {/* Criação — quando o lead entrou no funil (dia da semana, data e hora). Só leitura. */}
            <div className="block">
              <span className="text-xs text-slate-400">Criação</span>
              <p className="mt-0.5 text-sm text-slate-600">{fmtCriacao(contact?.createdAt)}</p>
            </div>

            {/* CPF — a IA preenche sozinha ao ler um RG/CNH recebido; dá pra corrigir manualmente. */}
            <label className="block">
              <span className="text-xs text-slate-400">CPF</span>
              <div className="mt-0.5 flex items-center gap-1.5">
                <input
                  type="text"
                  value={form.cpf || ""}
                  onChange={(e) => setForm((f) => ({ ...f, cpf: e.target.value.replace(/\D/g, "").slice(0, 11) }))}
                  placeholder="Só números — a IA preenche pelo documento"
                  className="flex-1 min-w-0 text-sm border border-slate-200 rounded px-2 py-1.5 bg-white outline-none focus:border-emerald-400"
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
              {/* Só o dígito verificador — não confirma que a pessoa existe, mas
                  evita gastar consulta de puxada com CPF digitado errado. */}
              {form.cpf?.length === 11 && !validarCPF(form.cpf) && (
                <p className="text-[11px] text-red-500 mt-1">CPF inválido — confira os números antes de consultar a puxada.</p>
              )}
            </label>

            {/* Campos personalizados (item 67) — definidos em Configurações → Campos */}
            {camposDef.length > 0 && (
              <div className="border border-slate-200 rounded-lg p-2.5 space-y-2">
                <span className="text-xs font-medium text-slate-600">Campos adicionais</span>
                {camposDef.map((c) => (
                  <label key={c.chave} className="block">
                    <span className="text-[11px] text-slate-400">{c.label}</span>
                    {c.tipo === "opcoes" ? (
                      <select
                        value={form.camposCustom?.[c.chave] || ""}
                        onChange={(e) => setForm((f) => ({ ...f, camposCustom: { ...f.camposCustom, [c.chave]: e.target.value } }))}
                        className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 bg-white outline-none focus:border-emerald-400"
                      >
                        <option value="">—</option>
                        {(c.opcoes || "").split(",").map((o) => o.trim()).filter(Boolean).map((o) => (<option key={o} value={o}>{o}</option>))}
                      </select>
                    ) : (
                      <input
                        type={c.tipo === "numero" ? "number" : c.tipo === "data" ? "date" : "text"}
                        value={form.camposCustom?.[c.chave] || ""}
                        onChange={(e) => setForm((f) => ({ ...f, camposCustom: { ...f.camposCustom, [c.chave]: e.target.value } }))}
                        className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-emerald-400"
                      />
                    )}
                  </label>
                ))}
              </div>
            )}

            {/* Puxada (consulta de crédito) em PDF — fixa no card, não depende do chat */}
            <PuxadaAnexo
              contactId={contactId}
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

            <CobrancaLead contactId={contactId} contact={contact} onChanged={() => { loadContact(); onChanged?.(); }} />

            {/* Documentos e mídias — organizados por tipo (itens 68/69) */}
            <button
              type="button"
              onClick={() => setDocumentosAberto(true)}
              className="w-full flex items-center justify-between text-xs font-medium text-slate-600 border border-slate-200 rounded-lg p-2.5 hover:bg-slate-50"
            >
              <span className="flex items-center gap-1"><Icone nome="imagem" className="w-3.5 h-3.5" /> Documentos e mídias</span>
              <Icone nome="seta" className="w-3.5 h-3.5 text-slate-400 -rotate-90" />
            </button>

            {/* Linha do tempo unificada (item 66) */}
            <div className="border border-slate-200 rounded-lg p-2.5">
              <button
                type="button"
                onClick={() => setTimelineAberta((v) => !v)}
                className="w-full flex items-center justify-between text-xs font-medium text-slate-600"
              >
                <span className="flex items-center gap-1"><Icone nome="documento" className="w-3.5 h-3.5" /> Linha do tempo</span>
                <Icone nome="seta" className={`w-3.5 h-3.5 text-slate-400 transition-transform ${timelineAberta ? "rotate-180" : ""}`} />
              </button>
              {timelineAberta && (
                <div className="mt-2">
                  <TimelineLead contactId={contactId} />
                </div>
              )}
            </div>

            {/* Tarefas do lead */}
            <div className="border border-slate-200 rounded-lg p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600">Tarefas ({tasks.filter((t) => !t.done).length} pendentes)</span>
                <button type="button" onClick={() => setShowTaskForm((v) => !v)} className="text-xs text-emerald-600 hover:text-emerald-700">
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
                      value={taskForm.dueTime || "09:00"}
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

            {/* Tags / Etiquetas */}
            {allTags.length > 0 && (
              <div>
                <span className="text-xs text-slate-400">Etiquetas</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {allTags.map((t) => {
                    const on = contactTags.includes(t.id);
                    return (
                      <button
                        type="button"
                        key={t.id}
                        onClick={() => toggleTag(t.id)}
                        className="text-[11px] font-medium rounded-full px-2 py-0.5 border transition-colors"
                        style={on ? { backgroundColor: t.color, borderColor: t.color, color: "#fff" } : { borderColor: "#e2e8f0", color: "#64748b" }}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Aviso de CPF que já deu calote em outro cadastro */}
            {caloteAviso && (
              <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
                <Icone nome="alerta" className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Esse CPF já deu calote no cadastro <strong>{caloteAviso.name}</strong>
                  {caloteAviso.phone ? ` (${caloteAviso.phone})` : ""}. Avançar no funil vai exigir liberação de um administrador.
                </span>
              </div>
            )}

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
                {limiteCiclo != null && (
                  <span className={`block text-[10px] mt-0.5 ${acimaDoLimite ? "text-red-600 font-medium" : "text-slate-400"}`}>
                    Limite do ciclo {cicloAtual}: {money(limiteCiclo)}
                    {acimaDoLimite ? " — acima do limite, precisa de admin" : ""}
                  </span>
                )}
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
                  {parcelasAtuais.length > 0 && (
                    <>
                      <span className="text-red-600 font-semibold">Falta quitar</span>
                      <span className="text-right font-semibold text-red-600">{money(faltaQuitar)}</span>
                    </>
                  )}
                </div>

                <button
                  onClick={gerarParcelas}
                  className="w-full text-xs bg-emerald-500 text-white rounded py-1.5 hover:bg-emerald-600 mb-1"
                >
                  {parcelas.length ? "Atualizar parcelas" : "Gerar 10 parcelas"}
                </button>
                {parcelas.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setParcelaAvulsaAberta({ valor: "", vencimento: new Date().toLocaleDateString("en-CA"), descricao: "" })}
                    className="w-full text-[11px] text-slate-500 hover:text-emerald-600 mb-2"
                  >
                    + Adicionar parcela avulsa (taxa extra, multa acordada...)
                  </button>
                )}
                {cobrancaMsg && <p className="text-xs text-red-500 mb-2">{cobrancaMsg}</p>}

                {cicloAtual > 1 && (
                  <p className="text-[11px] text-slate-400 mb-1">Ciclo atual: {cicloAtual} (renovação {cicloAtual - 1})</p>
                )}
                {parcelasAtuais.length > 0 && (
                  <>
                    <ul className="divide-y divide-emerald-100 text-xs">
                      {parcelasAtuais.map((p) => {
                        const atrasada = parcelaAtrasada(p, undefined, multaOpts);
                        // Ponto de equilíbrio (item 106): parcela em que o capital
                        // emprestado volta pro caixa — antes dela, cliente que
                        // some ainda dá prejuízo.
                        const noPontoEquilibrio = !p.deAcordo && p.number === Math.ceil(NUM_PARCELAS / (1 + honorariosPct / 100));
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
                            {!p.paid && (
                              <button
                                type="button"
                                onClick={(e) => { e.preventDefault(); setEditandoVencimento({ parcela: p, novoVencimento: String(p.dueDate).slice(0, 10), motivo: "" }); }}
                                title="Mudar o vencimento (pede motivo)"
                                className="text-slate-300 hover:text-emerald-600"
                              >
                                <Icone nome="calendario" className="w-3 h-3" />
                              </button>
                            )}
                            {noPontoEquilibrio && (
                              <span title="Capital investido volta a partir daqui" className="text-[10px] font-semibold bg-violet-100 text-violet-700 rounded-full px-1.5 py-0.5">
                                capital volta
                              </span>
                            )}
                            {atrasada && (
                              <span className="text-[10px] font-semibold bg-red-500 text-white rounded-full px-1.5 py-0.5">
                                +{multaPct}%
                              </span>
                            )}
                          </label>
                          <span className="flex items-center gap-1.5">
                            {!p.paid && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setBaixaParcialAberta(p)}
                                  title="Registrar baixa parcial"
                                  className="text-amber-400 hover:text-amber-600"
                                >
                                  <Icone nome="repetir" className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPixAberto(p)}
                                  title="Gerar Pix desta parcela"
                                  className="text-sky-400 hover:text-sky-600"
                                >
                                  <Icone nome="dinheiro" className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setDescontoAberto({ parcela: p, valorPedido: "", motivo: "" }); setDescontoMsg(""); }}
                                  title="Pedir desconto pontual (precisa aprovação do admin)"
                                  className="text-violet-400 hover:text-violet-600"
                                >
                                  <Icone nome="lapis" className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                            <span className={`font-medium ${p.paid ? "text-emerald-600" : atrasada ? "text-red-600" : "text-slate-700"}`}>
                              {money(p.paid ? p.amountPago : valorParcelaAtual(p, undefined, multaOpts))}
                            </span>
                            {!p.paid && p.valorPago > 0 && (
                              <span className="text-[10px] text-amber-600 bg-amber-50 rounded-full px-1.5 py-0.5" title="Já pago desta parcela">
                                {money(p.valorPago)} pago
                              </span>
                            )}
                            {p.paid && (
                              <button
                                type="button"
                                onClick={() => abrirEdicaoValorBaixa(p)}
                                title="Mudar o valor dessa baixa (pede motivo)"
                                className="text-slate-300 hover:text-emerald-600"
                              >
                                <Icone nome="lapis" className="w-3 h-3" />
                              </button>
                            )}
                          </span>
                        </li>
                        );
                      })}
                    </ul>
                    <p className="text-xs text-slate-500 mt-2 text-right">
                      Recebido: <span className="font-semibold text-emerald-700">{money(totalPago)}</span> / {money(resumo.total)}
                    </p>

                    {/* Renovação — aparece só quando todas as parcelas do ciclo estão pagas */}
                    {todasPagas && (
                      <div className="mt-3 pt-3 border-t border-emerald-100 space-y-2">
                        <p className="text-xs font-medium text-emerald-700">Ciclo {cicloAtual} quitado — cliente pronto pra renovar</p>
                        <p className="text-[11px] text-slate-500">
                          Cliente que renova costuma pagar bem melhor que o primeiro empréstimo.
                          {limiteProximoCiclo != null && (
                            <> Pelo escalonamento, o ciclo {cicloAtual + 1} libera até <strong>{money(limiteProximoCiclo)}</strong>.</>
                          )}
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="block">
                            <span className="text-[11px] text-slate-400">Novo capital (R$)</span>
                            <input
                              type="number"
                              step="0.01"
                              value={renovForm.valorCapital}
                              onChange={(e) => setRenovForm((f) => ({ ...f, valorCapital: e.target.value }))}
                              className="mt-0.5 w-full text-xs border border-slate-200 rounded px-2 py-1 outline-none focus:border-emerald-400"
                            />
                            {limiteProximoCiclo != null && (
                              <button
                                type="button"
                                onClick={() => setRenovForm((f) => ({ ...f, valorCapital: String(limiteProximoCiclo) }))}
                                className="text-[10px] text-emerald-600 hover:underline mt-0.5"
                              >
                                usar {money(limiteProximoCiclo)}
                              </button>
                            )}
                          </label>
                          <label className="block">
                            <span className="text-[11px] text-slate-400">Data de pagamento</span>
                            <input
                              type="date"
                              value={renovForm.pagamentoCapital}
                              onChange={(e) => setRenovForm((f) => ({ ...f, pagamentoCapital: e.target.value }))}
                              className="mt-0.5 w-full text-xs border border-slate-200 rounded px-2 py-1 outline-none focus:border-emerald-400"
                            />
                          </label>
                        </div>
                        <button
                          onClick={renovar}
                          disabled={renovando}
                          className="w-full text-xs bg-emerald-600 text-white rounded py-1.5 hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {renovando ? "Renovando…" : "Renovar empréstimo"}
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* Parcelas substituídas por acordo (minimizado) */}
                {parcelasRenegociadas.length > 0 && (
                  <div className="mt-3">
                    <button
                      onClick={() => setShowRenegociadas((v) => !v)}
                      className="text-[11px] text-slate-400 hover:text-slate-600"
                    >
                      {showRenegociadas ? "▼" : "▶"} Substituídas por acordo ({parcelasRenegociadas.length} parcela(s))
                    </button>
                    {showRenegociadas && (
                      <ul className="mt-1 divide-y divide-slate-100 text-[11px]">
                        {parcelasRenegociadas.map((p) => (
                          <li key={p.id} className="flex justify-between py-1 px-1.5 rounded bg-slate-50 text-slate-400">
                            <span>{p.number}ª · {fmtDate(p.dueDate)} · virou acordo</span>
                            <span>{money(p.amount)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* Histórico de ciclos anteriores (minimizado) */}
                {parcelasHistorico.length > 0 && (
                  <div className="mt-3">
                    <button
                      onClick={() => setShowHistorico((v) => !v)}
                      className="text-[11px] text-slate-400 hover:text-slate-600"
                    >
                      {showHistorico ? "▼" : "▶"} Histórico ({parcelasHistorico.length} parcela(s) de {cicloAtual - 1} ciclo(s) anterior(es))
                    </button>
                    {showHistorico && (
                      <ul className="mt-1 divide-y divide-slate-100 text-[11px]">
                        {parcelasHistorico.map((p) => {
                          const due = new Date(p.dueDate).toISOString().slice(0, 10);
                          const paid = p.paidAt ? new Date(p.paidAt).toISOString().slice(0, 10) : null;
                          const atrasado = paid && paid > due;
                          return (
                            <li key={p.id} className={`flex justify-between py-1 px-1.5 rounded ${atrasado ? "bg-red-50" : "bg-emerald-50"}`}>
                              <span className={atrasado ? "text-red-600" : "text-emerald-700"}>
                                Ciclo {p.ciclo || 1} · {p.number}ª · {fmtDate(p.dueDate)}
                                {atrasado && <span className="ml-1 text-[9px] font-semibold">ATRASADO</span>}
                              </span>
                              <span className={`flex items-center gap-1 ${atrasado ? "text-red-600" : "text-emerald-600"}`}>
                                {money(p.amount)} <Icone nome={atrasado ? "alerta" : "check"} className="w-3 h-3" />
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
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
        <div className="w-full md:w-1/2 flex flex-col bg-slate-50 flex-1 min-h-0">
          <div className="px-5 py-4 border-b border-slate-200 bg-white flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center">
              <Icone nome="cobranca" className="w-3.5 h-3.5" />
            </span>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-slate-800 text-sm leading-tight">WhatsApp</h2>
              <p className="text-xs text-slate-400 leading-tight">
                {form.phone ? form.phone : "sem telefone cadastrado"}
              </p>
            </div>
            <button
              onClick={toggleIaPausada}
              title={contact?.iaPausada ? "IA desligada — clique para religar" : "IA ligada — clique para desligar (atendimento manual)"}
              className={`shrink-0 text-xs font-medium rounded-full px-2.5 py-1 border ${
                contact?.iaPausada
                  ? "bg-red-50 text-red-600 border-red-200"
                  : "bg-emerald-50 text-emerald-600 border-emerald-200"
              }`}
            >
              <span className="flex items-center gap-1"><Icone nome="robo" className="w-3.5 h-3.5" /> {contact?.iaPausada ? "IA desligada" : "IA ligada"}</span>
            </button>
          </div>

          {possivelBloqueio && (
            <div className="px-4 py-2 bg-red-50 border-b border-red-100 text-xs text-red-600 flex items-center gap-1.5">
              <Icone nome="alerta" className="w-3.5 h-3.5 shrink-0" />
              As últimas 3 mensagens pra esse número falharam ao enviar — pode ter bloqueado o WhatsApp. Considere ligar ou tentar outro canal.
            </div>
          )}

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
                {m.instance && numbers.length > 1 && (
                  <p className={`flex items-center gap-1 text-[10px] mb-0.5 ${m.fromMe ? "text-emerald-100" : "text-slate-400"}`}>
                    <Icone nome="celular" className="w-2.5 h-2.5" /> {numberLabel(m.instance, numbers)}
                  </p>
                )}
                {(m.kind === "audio" || m.kind === "image" || m.kind === "document" || m.kind === "location") && (
                  <MediaBubble message={m} />
                )}
                {m.kind !== "location" && m.body && (
                  <p className="whitespace-pre-wrap break-words mt-1">{m.body}</p>
                )}
                <span
                  className={`block text-[10px] mt-1 ${
                    m.fromMe ? "text-emerald-100" : "text-slate-400"
                  }`}
                >
                  {fmtTime(m.createdAt)}
                  {m.fromMe && m.status === "simulado" ? " • simulado" : ""}
                  {m.fromMe && m.status === "falhou" ? " • falhou ao enviar" : ""}
                </span>
              </div>
            ))}
            <div ref={chatEnd} />
          </div>

          {error && (
            <p className="px-4 text-xs text-red-500 pb-1">{error}</p>
          )}

          {numbers.length > 1 && (
            <div className="px-3 pt-2 bg-white flex items-center gap-2">
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

          <div className="p-3 border-t border-slate-200 bg-white flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,audio/*,application/pdf,.zip,.rar,.doc,.docx,.xls,.xlsx"
              onChange={onPickFile}
              className="hidden"
            />
            {/* Anexo */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || recording}
              title="Enviar anexo"
              className="shrink-0 w-9 h-9 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 flex items-center justify-center"
            >
              <Icone nome="clipe" className="w-4 h-4" />
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
              className={`shrink-0 w-9 h-9 rounded-lg border flex items-center justify-center disabled:opacity-40 ${
                recording
                  ? "border-red-300 bg-red-50 text-red-600 animate-pulse"
                  : "border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}
            >
              <Icone nome={recording ? "parar" : "microfone"} className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setAgendarAberto(true)}
              title="Agendar esta mensagem pra outro momento"
              className="shrink-0 w-9 h-9 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center"
            >
              <Icone nome="relogio" className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setAgendamentosAberto(true)}
              title="Ver/cancelar mensagens agendadas"
              className="shrink-0 w-9 h-9 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center"
            >
              <Icone nome="calendario" className="w-4 h-4" />
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

      {/* Alterar valor de uma baixa já registrada, ou desmarcá-la — sempre
          pede o motivo (fica logado em Configurações > Alterações). */}
      {baixaParcialAberta && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 flex items-center justify-center p-4" onClick={() => setBaixaParcialAberta(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-800">Baixa parcial — {baixaParcialAberta.number}ª parcela</h3>
            <p className="text-xs text-slate-400">
              Falta {money(valorParcelaAtual(baixaParcialAberta, undefined, multaOpts) - baixaParcialAberta.valorPago)}
              {baixaParcialAberta.valorPago > 0 && <> ({money(baixaParcialAberta.valorPago)} já pago)</>}
            </p>
            <label className="block">
              <span className="text-xs text-slate-500">Valor recebido agora</span>
              <input
                type="number" step="0.01" autoFocus
                value={valorParcial}
                onChange={(e) => setValorParcial(e.target.value)}
                className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400"
              />
            </label>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setBaixaParcialAberta(null)} className="text-sm text-slate-500 px-3 py-1.5">Cancelar</button>
              <button disabled={enviandoParcial} onClick={confirmarBaixaParcial} className="text-sm bg-emerald-500 text-white rounded-lg px-3.5 py-1.5 disabled:opacity-50">
                {enviandoParcial ? "Salvando…" : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {descontoAberto && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 flex items-center justify-center p-4" onClick={() => setDescontoAberto(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-800">Pedir desconto — {descontoAberto.parcela.number}ª parcela</h3>
            <p className="text-xs text-slate-400">
              Valor atual: {money(valorParcelaAtual(descontoAberto.parcela, undefined, multaOpts))}. Um admin precisa aprovar antes de valer.
            </p>
            <label className="block">
              <span className="text-xs text-slate-500">Novo valor (com desconto)</span>
              <input
                type="number" step="0.01" autoFocus
                value={descontoAberto.valorPedido}
                onChange={(e) => setDescontoAberto((f) => ({ ...f, valorPedido: e.target.value }))}
                className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400"
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500">Motivo</span>
              <textarea
                value={descontoAberto.motivo}
                onChange={(e) => setDescontoAberto((f) => ({ ...f, motivo: e.target.value }))}
                rows={2}
                className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400 resize-none"
              />
            </label>
            {descontoMsg && <p className="text-xs text-red-500">{descontoMsg}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDescontoAberto(null)} className="text-sm text-slate-500 px-3 py-1.5">Cancelar</button>
              <button
                disabled={enviandoDesconto || !descontoAberto.valorPedido || !descontoAberto.motivo.trim()}
                onClick={pedirDesconto}
                className="text-sm bg-violet-500 text-white rounded-lg px-3.5 py-1.5 disabled:opacity-50"
              >
                {enviandoDesconto ? "Enviando…" : "Pedir aprovação"}
              </button>
            </div>
          </div>
        </div>
      )}

      {parcelaAvulsaAberta && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 flex items-center justify-center p-4" onClick={() => setParcelaAvulsaAberta(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-800">Nova parcela avulsa</h3>
            <label className="block">
              <span className="text-xs text-slate-500">Descrição</span>
              <input value={parcelaAvulsaAberta.descricao} onChange={(e) => setParcelaAvulsaAberta((f) => ({ ...f, descricao: e.target.value }))} placeholder="Ex.: taxa de atraso acordada" className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500">Valor</span>
              <input type="number" step="0.01" autoFocus value={parcelaAvulsaAberta.valor} onChange={(e) => setParcelaAvulsaAberta((f) => ({ ...f, valor: e.target.value }))} className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500">Vencimento</span>
              <input type="date" value={parcelaAvulsaAberta.vencimento} onChange={(e) => setParcelaAvulsaAberta((f) => ({ ...f, vencimento: e.target.value }))} className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400" />
            </label>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setParcelaAvulsaAberta(null)} className="text-sm text-slate-500 px-3 py-1.5">Cancelar</button>
              <button disabled={salvandoAvulsa} onClick={salvarParcelaAvulsa} className="text-sm bg-emerald-500 text-white rounded-lg px-3.5 py-1.5 disabled:opacity-50">
                {salvandoAvulsa ? "Salvando…" : "Adicionar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editandoVencimento && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 flex items-center justify-center p-4" onClick={() => setEditandoVencimento(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-800">Mudar vencimento — {editandoVencimento.parcela.number}ª parcela</h3>
            <label className="block">
              <span className="text-xs text-slate-500">Novo vencimento</span>
              <input type="date" autoFocus value={editandoVencimento.novoVencimento} onChange={(e) => setEditandoVencimento((f) => ({ ...f, novoVencimento: e.target.value }))} className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500">Motivo</span>
              <input value={editandoVencimento.motivo} onChange={(e) => setEditandoVencimento((f) => ({ ...f, motivo: e.target.value }))} placeholder="Ex.: cliente pediu pra adiar" className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400" />
            </label>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditandoVencimento(null)} className="text-sm text-slate-500 px-3 py-1.5">Cancelar</button>
              <button disabled={salvandoVencimento || !editandoVencimento.motivo.trim()} onClick={salvarVencimento} className="text-sm bg-emerald-500 text-white rounded-lg px-3.5 py-1.5 disabled:opacity-50">
                {salvandoVencimento ? "Salvando…" : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pixAberto && <PixModal parcela={pixAberto} onClose={() => setPixAberto(null)} />}
      {agendamentosAberto && <AgendamentosPendentesModal contactId={contactId} onClose={() => setAgendamentosAberto(false)} />}
      {documentosAberto && <DocumentosPopup contactId={contactId} messages={messages} onClose={() => setDocumentosAberto(false)} />}
      {agendarAberto && (
        <AgendarMensagemModal
          contactId={contactId}
          textoInicial={text}
          templates={templates}
          numbers={numbers}
          numeroInicial={numbers.find((n) => n.instance === selectedInstance)?.id || ""}
          onClose={() => setAgendarAberto(false)}
          onAgendado={() => setSavedFlash(true)}
        />
      )}

      {editandoBaixa && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 flex items-center justify-center p-4" onClick={() => setEditandoBaixa(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-800">
              {editandoBaixa.modo === "valor" ? "Mudar valor da baixa" : "Desmarcar baixa"}
            </h3>
            <p className="text-xs text-slate-400">
              Parcela {editandoBaixa.parcela.number}ª
              {editandoBaixa.modo === "valor" && <> — valor atual: {money(editandoBaixa.parcela.amountPago)}</>}
            </p>
            {editandoBaixa.modo === "valor" && (
              <label className="block">
                <span className="text-xs text-slate-400">Novo valor</span>
                <input
                  type="number"
                  step="0.01"
                  value={editandoBaixa.novoValor}
                  onChange={(e) => setEditandoBaixa((d) => ({ ...d, novoValor: e.target.value }))}
                  className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400"
                />
              </label>
            )}
            <label className="block">
              <span className="text-xs text-slate-400">Motivo da alteração</span>
              <textarea
                value={editandoBaixa.motivo}
                onChange={(e) => setEditandoBaixa((d) => ({ ...d, motivo: e.target.value }))}
                rows={3}
                placeholder="Ex.: cliente pagou a mais e foi devolvido, valor lançado errado…"
                className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400 resize-none"
              />
            </label>
            <div className="flex gap-2 pt-1">
              <button
                onClick={confirmarEdicaoBaixa}
                disabled={!editandoBaixa.motivo.trim() || (editandoBaixa.modo === "valor" && !Number(editandoBaixa.novoValor))}
                className="flex-1 bg-emerald-500 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 transition-colors"
              >
                Confirmar
              </button>
              <button onClick={() => setEditandoBaixa(null)} className="px-4 text-sm text-slate-400 hover:text-slate-600">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

