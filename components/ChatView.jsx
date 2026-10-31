"use client";

import { rolarAteOFim } from "@/lib/rolar";
import { CHECKLIST_DOC } from "@/lib/checklistDoc";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import MediaBubble from "./MediaBubble";
import PuxadaAnexo from "./PuxadaAnexo";
import CnpjCard from "./CnpjCard";
import CobrancaLead from "./CobrancaLead";
import { aReceber, inadimplenciaCravo } from "@/lib/relatorios";
import { interpolarVariaveis } from "@/lib/variaveis";
import { parcelaAtrasada, valorParcelaAtual } from "@/lib/finance";
import { UFS_BR } from "@/lib/ddd";
import Icone from "@/components/Icones";
import AgendarMensagemModal from "./AgendarMensagemModal";
import VideoChamadaCall from "./VideoChamadaCall";
import TarefaBarra from "./TarefaBarra";
import RenovacaoRapida from "./RenovacaoRapida";
import CalculadoraRapida from "./CalculadoraRapida";
import AcordoModal from "./AcordoModal";
import ContactModal from "./ContactModal";
import TarefaAtalhos, { tarefaPadrao, diaBR } from "./TarefaAtalhos";

// Data de hoje (local) como "YYYY-MM-DD"
function todayStr() {
  return new Date().toLocaleDateString("en-CA");
}

// Texto da mensagem com URLs viradas em link clicável (abre em nova aba) —
// sem isso o link de vídeo chamada, puxada etc. mandado pro cliente aparecia
// só como texto solto no chat, precisando copiar e colar.
const URL_REGEX = /(https?:\/\/[^\s<]+[^\s<.,;:!?)"'\]])/g;
function LinkifiedText({ text }) {
  // split() com grupo de captura devolve os trechos casados intercalados nos
  // índices ímpares — usa isso em vez de re-testar com a MESMA regex (que tem
  // flag "g" e guarda posição entre chamadas de .test(), dando falso negativo
  // alternado se testada de novo depois do split).
  const partes = String(text ?? "").split(URL_REGEX);
  return (
    <p className="whitespace-pre-wrap break-words">
      {partes.map((parte, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={parte}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="underline underline-offset-2 hover:opacity-80 break-all"
          >
            {parte}
          </a>
        ) : (
          parte
        )
      )}
    </p>
  );
}

// Dia da semana + data + hora em que o lead entrou no funil.
function fmtCriacao(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const diaSemana = d.toLocaleDateString("pt-BR", { weekday: "long" });
  const data = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  return `${diaSemana.charAt(0).toUpperCase()}${diaSemana.slice(1)}, ${data} às ${hora}`;
}

// Data curta + hora pro feed de atividade ("30/08 14:05").
function fmtAtividade(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const data = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  return `${data} ${hora}`;
}

// Situação de cobrança do contato (mesma lógica do Kanban):
//  "atrasado" = tem parcela vencida e não baixada
//  "hoje"     = tem parcela que vence hoje e não baixada
//  "emdia"    = tem plano de parcelas, sem atraso nem vencimento hoje
//  "sem"      = não tem plano de parcelas (ainda não está em cobrança)
// Situação das tarefas pendentes (mesma lógica do Kanban): sem | atrasada | hoje | futura
function statusTarefas(c) {
  const tarefas = c.tarefasPendentes || [];
  if (tarefas.length === 0) return "sem";
  const hoje = todayStr();
  let atrasada = false;
  let hojeVence = false;
  for (const t of tarefas) {
    const d = new Date(t.dueDate).toISOString().slice(0, 10);
    if (d < hoje) atrasada = true;
    else if (d === hoje) hojeVence = true;
  }
  if (atrasada) return "atrasada";
  if (hojeVence) return "hoje";
  return "futura";
}

// "Sem pagar hoje": tem parcela em aberto no ciclo atual e NENHUM pagamento (total ou parcial) entrou hoje.
function semPagarHoje(c) {
  const ciclo = c.cicloAtual || 1;
  const ps = (c.parcelas || []).filter((p) => (p.ciclo || 1) === ciclo && !p.renegociada);
  if (!ps.some((p) => !p.paid)) return false;
  const hoje = todayStr();
  const dia = (v) => (v ? new Date(v).toLocaleDateString("en-CA") : null);
  return !(c.parcelas || []).some((p) => dia(p.paidAt) === hoje || dia(p.valorPagoEm) === hoje);
}

// Há quantos dias o cliente não paga nada (total ou parcial); null = nunca pagou ou sem parcela em aberto no ciclo atual.
function diasSemPagar(c) {
  const ciclo = c.cicloAtual || 1;
  const ps = (c.parcelas || []).filter((p) => (p.ciclo || 1) === ciclo && !p.renegociada);
  if (!ps.some((p) => !p.paid)) return null;
  const dia = (v) => (v ? new Date(v).toLocaleDateString("en-CA") : null);
  const datas = [dia(c.ultimoPagamentoEm)];
  for (const p of c.parcelas || []) datas.push(dia(p.paidAt), dia(p.valorPagoEm));
  const ultimo = datas.filter(Boolean).sort().pop();
  if (!ultimo) return null;
  return Math.round((new Date(todayStr() + "T00:00:00Z") - new Date(ultimo + "T00:00:00Z")) / 86400000);
}

function situacaoContato(c) {
  const ciclo = c.cicloAtual || 1;
  // renegociada = substituída por acordo, não é mais dívida em aberto. Sem
  // esse filtro um lead com acordo em dia ficava "Atrasado" pra sempre.
  const parcelas = (c.parcelas || []).filter((p) => (p.ciclo || 1) === ciclo && !p.renegociada);
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

const STATUS_LABEL = { atrasado: "Atrasado", hoje: "Vence hoje", emdia: "Em dia", sem: "Sem cobrança", semhoje: "Sem pagar hoje" };

function fmtTime(iso) {
  const d = new Date(iso);
  const data = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  return `${data} ${hora}`;
}

// ✓ enviado, ✓✓ cinza entregue (chegou no aparelho do cliente), ✓✓ azul lido
// — igual ao WhatsApp. status vem do webhook do provedor (ver lib/webhookCommon.js
// processMessageAck); enquanto o provedor não confirma nada, fica só o ✓.
function TicksEnvio({ status }) {
  if (status === "lido") return <span className="text-sky-300" title="Lido">✓✓</span>;
  if (status === "entregue") return <span title="Entregue">✓✓</span>;
  return <span title="Enviado">✓</span>;
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

// Dia seguinte ao vencimento da última parcela do ciclo (pula domingo, que não tem cobrança) — "jogar para depois da última".
function depoisDaUltima(parcelas, ignorarId) {
  const datas = (parcelas || []).filter((p) => p.id !== ignorarId).map((p) => String(p.dueDate).slice(0, 10)).sort();
  if (!datas.length) return null;
  const d = new Date(datas[datas.length - 1] + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function ChatView() {
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [encaminharMsg, setEncaminharMsg] = useState(null); // mensagem sendo encaminhada | null
  const [enviarCampoMsg, setEnviarCampoMsg] = useState(null); // mensagem sendo mandada pra um campo do lead | null
  const [contact, setContact] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  // Painel de dados do lead: o mesmo painel do Kanban.
  const abaDados = "completo"; // o painel completo (mesmo do Kanban) já inclui Juntar parcelas e Negociação
  const [contactErro, setContactErro] = useState(""); // motivo de a ficha do lead não ter carregado
  const chatEnd = useRef(null);
  const selectedIdRef = useRef(null);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  // Espelho das mensagens num ref: o loadMessages roda dentro de um
  // setInterval e, se lesse o state direto, ficaria preso na versão do
  // primeiro render (closure velha) e mandaria sempre o mesmo "desde".
  const messagesRef = useRef([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Dados pra edição do lead
  const [form, setForm] = useState({});
  const [users, setUsers] = useState([]);
  const [stagesList, setStagesList] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [euAdmin, setEuAdmin] = useState(false);
  const [meuId, setMeuId] = useState(null);
  const [encaminharLeadAberto, setEncaminharLeadAberto] = useState(false);
  const [conversasInternas, setConversasInternas] = useState([]);
  const [convInternaAlvo, setConvInternaAlvo] = useState("");
  const [notaInterna, setNotaInterna] = useState("");
  const [pendenteDe, setPendenteDe] = useState("");
  const [enviandoInterno, setEnviandoInterno] = useState(false);
  const [novaTag, setNovaTag] = useState("");
  const [criandoTag, setCriandoTag] = useState(false);
  const [contactTags, setContactTags] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [cpfCopiado, setCpfCopiado] = useState(false);
  const [phoneCopiado, setPhoneCopiado] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [tplSent, setTplSent] = useState(false);
  const [numbers, setNumbers] = useState([]);
  const [selectedInstance, setSelectedInstance] = useState("");
  const [resumo, setResumo] = useState(null); // { dia, semana, mes, pendenteTotal, clientes }
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [agendarAberto, setAgendarAberto] = useState(false);
  const [calcAberta, setCalcAberta] = useState(false); // calculadora rápida (botão ao lado do envio)
  const [gerandoLinkVideo, setGerandoLinkVideo] = useState(false);
  const [videoChamadaAberta, setVideoChamadaAberta] = useState(null); // sessaoId | null
  const [attachError, setAttachError] = useState("");
  const [multaPct, setMultaPct] = useState(50);
  const [cfgGlobal, setCfgGlobal] = useState(null); // Config inteiro — usado pra interpolar {{chave_pix}} nos envios manuais
  const [tasks, setTasks] = useState([]);
  const [minim, setMinim] = useState({}); // bloco -> minimizado (sem chave = padrão pela etapa)
  const [atividade, setAtividade] = useState([]);
  const [atividadeAberta, setAtividadeAberta] = useState(false);
  const [taskTypes, setTaskTypes] = useState([]);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [tarefaModalAberta, setTarefaModalAberta] = useState(false);
  // Botão vermelho "!" — reporta erro da IA nesta lead (mesma fila do Kanban: Configurações → IA → Suporte da IA).
  const [suporteIaAberto, setSuporteIaAberto] = useState(false);
  const [suporteIaDescricao, setSuporteIaDescricao] = useState("");
  const [enviandoSuporteIa, setEnviandoSuporteIa] = useState(false);
  async function reportarErroIa() {
    if (!selectedId) return;
    setEnviandoSuporteIa(true);
    const res = await fetch("/api/suporte-ia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: selectedId, descricao: suporteIaDescricao }),
    });
    setEnviandoSuporteIa(false);
    if (!res.ok) { alert("Não foi possível registrar."); return; }
    setSuporteIaAberto(false);
    setSuporteIaDescricao("");
  }
  useEffect(() => { if (tarefaModalAberta) setTaskForm((f) => (f.dueDate < diaBR(0) ? { ...f, dueDate: diaBR(0) } : f)); }, [tarefaModalAberta]);
  const [taskForm, setTaskForm] = useState(tarefaPadrao());
  // Tipo padrão = Cobrança (sem opção "Sem tipo").
  useEffect(() => {
    if (taskForm.tipoId) return;
    const t = taskTypes.find((x) => /cobran/i.test(x.name));
    if (t) setTaskForm((p) => (p.tipoId ? p : { ...p, tipoId: t.id }));
  }, [taskForm.tipoId, taskTypes]);
  const [horaLimite, setHoraLimite] = useState("");
  const fileInputRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);

  // Filtros da lista de conversas
  const [busca, setBusca] = useState(""); // nome ou telefone
  const [statusFiltro, setStatusFiltro] = useState(""); // "" = todos
  const [semPagarFiltro, setSemPagarFiltro] = useState(""); // "" = todos; "1".."7" = N dias sem pagar; "8" = mais de 7
  const [tagFiltro, setTagFiltro] = useState("");
  const [renovandoRapido, setRenovandoRapido] = useState(false);
  // "Juntar parcelas": marca várias parcelas em aberto e dá baixa num valor só (aplicado a partir da 1ª marcada, nas seguintes em aberto).
  const [acordoAberto, setAcordoAberto] = useState(false); // negociação (acordo parcelado) do que está em aberto
  const [juntando, setJuntando] = useState(false);
  const [juntarSel, setJuntarSel] = useState([]); // ids das parcelas marcadas
  const [juntarModal, setJuntarModal] = useState(null); // { valor, dinheiro } | null
  const [enviandoJunto, setEnviandoJunto] = useState(false);
  const [editVenc, setEditVenc] = useState(null); // { parcela, novo, motivo } — mudar o vencimento de uma parcela pelo chat
  const [salvandoVenc, setSalvandoVenc] = useState(false);
  // A lista tem milhares de conversas: desenhar todas travava a tela (cada tecla digitada redesenhava tudo). Mostra em lotes.
  const [limiteLista, setLimiteLista] = useState(80);
  const [tarefaFiltro, setTarefaFiltro] = useState(""); // "" | "com" | "sem" | "atrasada" | "hoje" | "futura"
  const [stageFiltro, setStageFiltro] = useState([]); // várias etapas ao mesmo tempo (lista de ids; vazia = todas)
  // "" = todas | "naolidas" | "semresposta" | "ambas" (notificadas E sem resposta)
  const [filtroMsgs, setFiltroMsgs] = useState("");
  const [instanceFiltro, setInstanceFiltro] = useState(""); // número/instância que está conversando
  const [ordem, setOrdem] = useState("recentes"); // "recentes" | "antigas" | "nome"
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [modoBusca, setModoBusca] = useState("conversas"); // conversas | mensagens
  const [resultadosMsg, setResultadosMsg] = useState([]);
  const [buscandoMsg, setBuscandoMsg] = useState(false);
  const [resumoIa, setResumoIa] = useState(null);
  const [resumindo, setResumindo] = useState(false);

  const [mostrarArquivadas, setMostrarArquivadas] = useState(false);
  const [selecionando, setSelecionando] = useState(false); // seleção em massa na lista
  const [selIds, setSelIds] = useState([]);
  const [fecharMenu, setFecharMenu] = useState(false);
  const [massaChat, setMassaChat] = useState(null); // { texto, enviando, feitos, falhas }
  const [menuConversaId, setMenuConversaId] = useState(null); // menu ⋮ da lista (Fechar conversa)

  const loadConversations = useCallback(async () => {
    const data = await fetch(`/api/chat${mostrarArquivadas ? "?arquivadas=1" : ""}`).then((r) => r.json()).catch(() => []);
    setConversations(Array.isArray(data) ? data : []);
  }, [mostrarArquivadas]);

  useEffect(() => {
    loadConversations();
    // 15s, não 5s: essa é uma busca COMPLETA de todas as conversas (sem
    // incremental como a de mensagens abaixo) — a cada 3s a mais de intervalo
    // é uma consulta pesada a menos rodando o dia inteiro em cada aba de Chat
    // aberta, sem perder responsividade real pro uso (lista de conversas, não
    // a conversa aberta em si).
    const t = setInterval(() => { if (!document.hidden) loadConversations(); }, 15000);
    const onVis = () => { if (!document.hidden) loadConversations(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
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

  // Fecha as conversas e agenda a volta (minutos); sem minutos fecha até o cliente escrever.
  async function fecharVarias(ids, minutos) {
    const volta = minutos ? new Date(Date.now() + minutos * 60e3).toISOString() : null;
    setFecharMenu(false);
    await Promise.all(ids.map((id) => fetch(`/api/contacts/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatArquivado: true, chatVoltaEm: volta }),
    }).catch(() => null)));
    if (!mostrarArquivadas) setConversations((prev) => prev.filter((x) => !ids.includes(x.id)));
    setSelIds([]);
    setSelecionando(false);
    loadConversations();
  }

  // Liga pelo WhatsApp via Wavoip: abre a janela já no clique (senão o navegador bloqueia o popup)
  // e troca pela URL de chamada quando o servidor responde. Sem token, cai no wa.me.
  async function ligarWhatsapp(phone, nome) {
    const digitos = String(phone || "").replace(/\D/g, "");
    const w = window.open("", "wavoip", "width=320,height=520");
    try {
      const r = await fetch(`/api/wavoip/ligar?phone=${digitos}&name=${encodeURIComponent(nome || "")}`).then((x) => x.json());
      const url = r?.url || `https://wa.me/${digitos}`;
      if (w) w.location.href = url; else window.open(url, "_blank");
    } catch {
      if (w) w.location.href = `https://wa.me/${digitos}`;
    }
  }

  function sairSelecaoChat() { setSelecionando(false); setSelIds([]); setFecharMenu(false); }

  // Responde a mesma mensagem para todas as conversas selecionadas (uma por vez, pelo número padrão de cada uma).
  async function enviarEmMassaChat() {
    const texto = (massaChat?.texto || "").trim();
    if (!texto || !selIds.length) return;
    setMassaChat((m) => ({ ...m, enviando: true, feitos: 0, falhas: 0 }));
    let feitos = 0, falhas = 0;
    for (const id of selIds) {
      const r = await fetch(`/api/contacts/${id}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: texto }),
      }).catch(() => null);
      if (r && r.ok) feitos++; else falhas++;
      setMassaChat((m) => ({ ...m, feitos, falhas }));
      await new Promise((ok) => setTimeout(ok, 1200));
    }
    setMassaChat(null);
    setSelIds([]);
    setSelecionando(false);
    loadConversations();
    if (falhas) alert(`${feitos} enviada(s), ${falhas} falharam.`);
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
    const t = setInterval(() => { if (!document.hidden) loadResumo(); }, 30000);
    return () => clearInterval(t);
  }, [loadResumo]);

  // Carrega listas auxiliares (uma vez)
  useEffect(() => {
    fetch("/api/users").then((r) => r.json()).then(setUsers).catch(() => {});
    fetch("/api/tags").then((r) => r.json()).then(setAllTags).catch(() => {});
    // Só admin pode criar etiqueta (a API recusa os demais) — sem saber o
    // papel, o campo apareceria pra todo mundo e daria erro ao usar.
    fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null))
      .then((u) => { setEuAdmin(u?.role === "admin"); setMeuId(u?.id || null); }).catch(() => {});
    fetch("/api/templates").then((r) => r.json()).then(setTemplates).catch(() => {});
    fetch("/api/numbers").then((r) => r.json()).then((n) => setNumbers(Array.isArray(n) ? n : [])).catch(() => {});
    fetch("/api/task-types").then((r) => r.json()).then((t) => setTaskTypes(Array.isArray(t) ? t : [])).catch(() => {});
    fetch("/api/config").then((r) => r.json()).then((cfg) => {
      if (cfg?.multaPct != null) setMultaPct(cfg.multaPct);
      setHoraLimite(cfg?.pagamentoHoraLimite || "");
      setCfgGlobal(cfg);
    }).catch(() => {});
  }, []);

  // Números que aparecem nas mensagens DESTA conversa (não só os que o usuário
  // logado pode ver) — decide se mostra a etiqueta do número em cada balão.
  // Um cobrador com 1 número visível mas conversa com mensagens de outro número
  // (atendida antes por outro setor) ainda vê a etiqueta.
  const instanciasNaConversa = useMemo(
    () => new Set(messages.map((m) => m.instance).filter(Boolean)),
    [messages]
  );

  // Timeline única: mensagens + atividade (campo/etapa) intercaladas por
  // horário, igual mensagem de sistema do WhatsApp — assim dá pra ver ali no
  // meio da conversa quem mudou o quê e quando, sem precisar abrir o painel
  // "Dados" à parte.
  const timeline = useMemo(() => {
    const msgs = messages.map((m) => ({ tipo: "msg", createdAt: m.createdAt, msg: m }));
    const ativ = atividade.map((a) => ({ tipo: "atividade", createdAt: a.createdAt, ativ: a }));
    return [...msgs, ...ativ].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }, [messages, atividade]);

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
    (statusFiltro ? 1 : 0) + (semPagarFiltro ? 1 : 0) + (stageFiltro.length ? 1 : 0) + (tagFiltro ? 1 : 0) + (instanceFiltro ? 1 : 0) + (filtroMsgs ? 1 : 0) + (tarefaFiltro ? 1 : 0);

  // Filtros da lista lembrados no navegador: o chat abre sempre com o último filtro escolhido (busca e "arquivadas" não entram).
  const [filtrosCarregados, setFiltrosCarregados] = useState(false);
  useEffect(() => {
    try {
      const f = JSON.parse(localStorage.getItem("chat:filtros") || "null");
      if (f && typeof f === "object") {
        if (typeof f.statusFiltro === "string") setStatusFiltro(f.statusFiltro);
        if (typeof f.tarefaFiltro === "string") setTarefaFiltro(f.tarefaFiltro);
        if (typeof f.tagFiltro === "string") setTagFiltro(f.tagFiltro);
        if (Array.isArray(f.stageFiltro)) setStageFiltro(f.stageFiltro.filter((x) => typeof x === "string"));
        else if (typeof f.stageFiltro === "string" && f.stageFiltro) setStageFiltro([f.stageFiltro]); // formato antigo (uma etapa só)
        if (typeof f.filtroMsgs === "string") setFiltroMsgs(f.filtroMsgs);
        if (typeof f.instanceFiltro === "string") setInstanceFiltro(f.instanceFiltro);
        if (typeof f.ordem === "string") setOrdem(f.ordem);
      }
    } catch {}
    setFiltrosCarregados(true); // só depois disso (já com os valores lidos aplicados) o efeito abaixo passa a gravar
  }, []);
  useEffect(() => {
    if (!filtrosCarregados) return;
    try {
      localStorage.setItem("chat:filtros", JSON.stringify({ statusFiltro, tarefaFiltro, tagFiltro, stageFiltro, filtroMsgs, instanceFiltro, ordem }));
    } catch {}
  }, [filtrosCarregados, statusFiltro, tarefaFiltro, tagFiltro, stageFiltro, filtroMsgs, instanceFiltro, ordem]);

  useEffect(() => { setLimiteLista(80); }, [busca, statusFiltro, tarefaFiltro, tagFiltro, stageFiltro, instanceFiltro, filtroMsgs, ordem, mostrarArquivadas, modoBusca]);

  const conversasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const termoDigitos = busca.replace(/\D/g, "");
    let out = conversations.filter((c) => {
      if (termo) {
        const bateNome = (c.name || "").toLowerCase().includes(termo);
        const batePhone = termoDigitos && (c.phone || "").replace(/\D/g, "").includes(termoDigitos);
        if (!bateNome && !batePhone) return false;
      }
      if (semPagarFiltro) {
        const d = diasSemPagar(c);
        if (d == null) return false;
        if (semPagarFiltro === "8" ? d <= 7 : d !== Number(semPagarFiltro)) return false;
      }
      if (statusFiltro === "semhoje") { if (!semPagarHoje(c)) return false; }
      else if (statusFiltro && situacaoContato(c) !== statusFiltro) return false;
      if (tarefaFiltro) {
        const st = statusTarefas(c);
        if (tarefaFiltro === "com" ? st === "sem" : st !== tarefaFiltro) return false;
      }
      if (tagFiltro && !(c.tags || []).some((t) => t.id === tagFiltro)) return false;
      if (stageFiltro.length && !stageFiltro.includes(c.stageId)) return false;
      if (instanceFiltro && c.instance !== instanceFiltro) return false;
      // Sem resposta = a última mensagem da conversa é do cliente (ainda não respondemos).
      const naoLida = c.unreadCount > 0;
      const semResposta = !!c.lastMessage && c.lastMessage.fromMe === false;
      if (filtroMsgs === "naolidas" && !naoLida) return false;
      if (filtroMsgs === "semresposta" && !semResposta) return false;
      if (filtroMsgs === "ambas" && !(naoLida && semResposta)) return false;
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
  }, [conversations, busca, statusFiltro, semPagarFiltro, tarefaFiltro, tagFiltro, stageFiltro, instanceFiltro, filtroMsgs, ordem]);

  const loadTasks = useCallback(async () => {
    if (!selectedId) return;
    const requestedId = selectedId;
    const data = await fetch(`/api/tasks?contactId=${requestedId}`).then((r) => r.json()).catch(() => []);
    if (requestedId !== selectedIdRef.current) return;
    setTasks(Array.isArray(data) ? data : []);
  }, [selectedId]);

  const loadAtividade = useCallback(async () => {
    if (!selectedId) return;
    const requestedId = selectedId;
    const data = await fetch(`/api/contacts/${requestedId}/atividade`).then((r) => r.json()).catch(() => []);
    if (requestedId !== selectedIdRef.current) return;
    setAtividade(Array.isArray(data) ? data : []);
  }, [selectedId]);

  const loadContact = useCallback(async () => {
    if (!selectedId) return;
    const requestedId = selectedId;
    const ct = await fetch(`/api/contacts/${requestedId}`).then((r) => r.json()).catch(() => null);
    if (requestedId === selectedIdRef.current) setContactErro(ct?.error || (ct ? "" : "Falha de conexão ao carregar o lead."));
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
        cnpj: ct.cnpj || "",
        razaoSocial: ct.razaoSocial || "",
        endereco: ct.endereco || "",
        enderecoComercial: ct.enderecoComercial || "",
        comercioNaResidencia: !!ct.comercioNaResidencia,
        pixChave: ct.pixChave || "",
        pixNomeCompleto: ct.pixNomeCompleto || "",
        checklistTelefoneBate: !!ct.checklistTelefoneBate,
        checklistDivergenciaPrint: !!ct.checklistDivergenciaPrint,
        checklistAntecedentes: !!ct.checklistAntecedentes,
        checklistDocumentacao: (() => { try { return ct.checklistDocumentacao ? JSON.parse(ct.checklistDocumentacao) : {}; } catch { return {}; } })(),
      });
      setContactTags((ct.tags || []).map((t) => t.id));
    }
  }, [selectedId, loadTasks]);

  // Conta os ciclos de polling pra saber quando fazer a recarga completa.
  const ciclosRef = useRef(0);

  const loadMessages = useCallback(async (completa = false) => {
    if (!selectedId) return;
    const requestedId = selectedId;

    // Recarga INCREMENTAL: manda o horário da última mensagem que já temos e
    // recebe só o que chegou depois. Antes vinha a conversa inteira a cada 4s
    // (180KB numa conversa de 437 mensagens = 2,6 MB/min por usuário).
    //
    // A recarga completa continua acontecendo de tempos em tempos porque
    // mensagem já existente pode mudar (apagada, lida) — e isso a busca
    // incremental, por definição, nunca veria.
    const atuais = messagesRef.current;
    const podeIncremental = !completa && atuais.length > 0;
    const ultima = podeIncremental ? atuais[atuais.length - 1]?.createdAt : null;
    const url = ultima
      ? `/api/contacts/${requestedId}/messages?desde=${encodeURIComponent(ultima)}`
      : `/api/contacts/${requestedId}/messages`;

    const msgs = await fetch(url).then((r) => r.json()).catch(() => []);
    if (requestedId !== selectedIdRef.current) return; // trocou de conversa enquanto isso — descarta
    if (!Array.isArray(msgs)) return;

    if (ultima) {
      if (msgs.length === 0) return; // nada novo: não mexe no estado (evita re-render à toa)
      setMessages((prev) => {
        const vistos = new Set(prev.map((m) => m.id));
        return [...prev, ...msgs.filter((m) => !vistos.has(m.id))];
      });
    } else {
      setMessages(msgs);
    }
  }, [selectedId]);

  // Parcelas, ciclo, etapa e tarefas mudam em outras telas (ficha do contato, kanban): recarrega só isso a cada 15s e ao voltar pra aba,
  // sem mexer no que a pessoa está digitando no formulário.
  const atualizarFinanceiro = useCallback(async () => {
    if (!selectedId) return;
    const id = selectedId;
    const ct = await fetch(`/api/contacts/${id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!ct || id !== selectedIdRef.current) return;
    setContact((c) => (c && c.id === id ? { ...c, parcelas: ct.parcelas, cicloAtual: ct.cicloAtual, stage: ct.stage ?? c.stage, stageId: ct.stageId ?? c.stageId } : c));
    loadTasks();
  }, [selectedId, loadTasks]);
  useEffect(() => {
    if (!selectedId) return;
    const t = setInterval(() => { if (!document.hidden) atualizarFinanceiro(); }, 15000);
    const onFocus = () => atualizarFinanceiro();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, [selectedId, atualizarFinanceiro]);

  useEffect(() => {
    loadContact();
    loadAtividade();
    ciclosRef.current = 0;
    loadMessages(true); // ao abrir a conversa, sempre completa
    if (!selectedId) return;
    const t = setInterval(() => {
      if (document.hidden) return;
      ciclosRef.current += 1;
      // 1 recarga completa a cada 10 ciclos (40s) pra pegar mensagem apagada
      // ou marcada como lida; nas outras 9, só o que chegou de novo.
      loadMessages(ciclosRef.current % 10 === 0);
    }, 4000);
    return () => clearInterval(t);
  }, [loadContact, loadAtividade, loadMessages, selectedId]);

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
    // Padrão = último número que ENVIOU mensagem pra esse cliente (se nunca enviamos, o da última mensagem recebida).
    const lastWithInstance = [...messages].reverse().find((m) => m.instance && m.fromMe) || [...messages].reverse().find((m) => m.instance);
    setSelectedInstance(lastWithInstance?.instance || numbers[0]?.instance || "");
    // Só trava depois que as mensagens carregaram: travar com a lista ainda vazia deixava sempre o 1º número, mesmo a conversa sendo de outro.
    if (messages.length > 0) instanceDefaultedForRef.current = selectedId;
  }, [messages, selectedId, numbers]);

  const userRolouRef = useRef(false);
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
    rolarAteOFim(chatEnd.current, !firstLoad);
    if (firstLoad) {
      // Ao abrir a conversa o conteúdo ainda cresce (histórico de alterações, imagens, áudios): repete a rolagem por alguns segundos,
      // até a pessoa mexer na lista — no celular a conversa abria no meio/início por causa disso.
      userRolouRef.current = false;
      const ts = [120, 400, 900, 1800, 3500].map((ms) => setTimeout(() => { if (!userRolouRef.current) rolarAteOFim(chatEnd.current, false); }, ms));
      return () => ts.forEach(clearTimeout);
    }
  }, [messages, selectedId]);

  // Quando o histórico de alterações (atividade) chega depois das mensagens, volta pro fim se a pessoa ainda não rolou.
  useEffect(() => {
    if (!userRolouRef.current) rolarAteOFim(chatEnd.current, false);
  }, [atividade]);

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

  // Campos do lead que fazem sentido receber o texto de uma mensagem —
  // aparecem no menu de "..." de cada mensagem do chat.
  const CAMPOS_ENVIAR = [
    { chave: "notes", label: "Resumo do cliente" },
    { chave: "endereco", label: "Endereço" },
    { chave: "cpf", label: "CPF" },
    { chave: "pixChave", label: "Chave Pix" },
    { chave: "pixNomeCompleto", label: "Nome completo (Pix)" },
    { chave: "horarioRecebimento", label: "Horário de recebimento" },
    { chave: "name", label: "Nome do lead" },
  ];

  async function enviarParaCampo(campo) {
    const m = enviarCampoMsg;
    setEnviarCampoMsg(null);
    if (!m || !selectedId || !(m.body || "").trim()) return;
    await fetch(`/api/contacts/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [campo]: m.body.trim() }),
    });
    loadContact();
    loadAtividade();
  }

  async function send(e) {
    e.preventDefault();
    if (!text.trim() || !selectedId) return;
    const body = text;
    setText("");
    setSending(true);
    // No celular a conexão cai/oscila: sem try/finally o fetch rejeitado deixava `sending`
    // travado em true (botão Enviar apagado pra sempre) e o texto digitado se perdia.
    // O timeout evita ficar pendurado numa requisição que nunca volta.
    let res;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45000);
    try {
      res = await fetch(`/api/contacts/${selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, instance: selectedInstance }),
        signal: ctrl.signal,
      });
    } catch {
      setText((atual) => atual || body);
      alert("Sem conexão ou resposta lenta — a mensagem não foi enviada. O texto foi mantido, toque em Enviar de novo (confira a conversa antes, ela pode ter saído).");
      return;
    } finally {
      clearTimeout(timer);
      setSending(false);
    }
    const data = await res.json().catch(() => ({}));
    if (data.message) setMessages((prev) => [...prev, data.message]);
    if (!res.ok) alert(data.error || "Falha ao enviar — a mensagem ficou marcada como \"falhou\" na conversa.");
    loadConversations();
  }

  async function gerarLinkVideoChamada() {
    if (!selectedId || gerandoLinkVideo) return;
    if (!confirm("Gerar link de vídeo chamada e mandar pro cliente agora?")) return;
    setGerandoLinkVideo(true);
    const res = await fetch(`/api/contacts/${selectedId}/video-chamada-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instance: selectedInstance }),
    });
    const d = await res.json().catch(() => ({}));
    setGerandoLinkVideo(false);
    if (!res.ok) { alert(d.error || "Não foi possível gerar o link."); return; }
    if (d.message) setMessages((prev) => [...prev, d.message]);
    if (!d.mensagemEnviada) alert(`Não deu pra mandar pelo WhatsApp automaticamente. Copie e mande na mão:\n${d.link}`);
    loadConversations();
    if (d.id) setVideoChamadaAberta(d.id);
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
        payload.body = interpolarVariaveis(t.body || "", contact, { cfg: cfgGlobal });
      }
      const res = await fetch(`/api/contacts/${selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => null);
      setSending(false);
      if (!res) { alert("Sem conexão — o envio não foi concluído. Tente de novo."); return; }
      const data = await res.json().catch(() => ({}));
      if (data.message) setMessages((prev) => [...prev, data.message]);
      if (res.ok) {
        setTplSent(true);
        setTimeout(() => setTplSent(false), 1500);
      } else {
        alert(data.error || "Falha ao enviar — a mensagem ficou marcada como \"falhou\" na conversa.");
      }
      loadConversations();
      return;
    }

    const bodyFinal = interpolarVariaveis(t.body, contact, { cfg: cfgGlobal });
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

  // Colar imagem (Ctrl+V) copiada de um print/navegador — sem precisar salvar
  // em arquivo e escolher no seletor. Só intercepta quando o clipboard tem
  // imagem; texto colado continua indo pro campo normalmente.
  function onPasteImage(e) {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
    if (!item) return;
    e.preventDefault();
    const file = item.getAsFile();
    if (file) uploadMedia(file, "image");
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

  // Move de etapa pelo select do chat. Espelha o forçar/erro do Kanban e do
  // modal "Dados do contato" — sem isso, um bloqueio (limite de escalonamento,
  // CPF com calote, motivo de perda) fazia essa tela mostrar "Salvo ✓" mesmo
  // com a etapa NUNCA tendo mudado de verdade (e o capital nunca liberado).
  async function moveStageChat(stageId, forcar = false, motivoPerda = null) {
    const res = await fetch(`/api/contacts/${selectedId}/move`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageId, forcar, motivoPerda }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      if ((data?.bloqueioCpf || data?.escalonamentoExcedido) && !forcar) {
        if (confirm(`${data.error}\n\nForçar mesmo assim? (só administrador consegue)`)) {
          return moveStageChat(stageId, true, motivoPerda);
        }
        return false;
      }
      if (data?.precisaMotivoPerda) {
        setMotivoPerdaChat({ stageId, motivo: "" });
        return false;
      }
      alert(data?.error || "Não foi possível mover o contato.");
      return false;
    }
    return true;
  }

  async function confirmarMotivoPerdaChat() {
    const mp = motivoPerdaChat;
    if (!mp?.motivo) return;
    setMotivoPerdaChat(null);
    const ok = await moveStageChat(mp.stageId, false, mp.motivo);
    if (ok) {
      loadContact();
      loadAtividade();
      loadConversations();
    } else {
      setForm((f) => ({ ...f, stageId: contact?.stageId || f.stageId }));
    }
  }

  function cancelarMotivoPerdaChat() {
    setMotivoPerdaChat(null);
    setForm((f) => ({ ...f, stageId: contact?.stageId || f.stageId }));
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
      await moveStageChat(form.stageId);
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    loadContact();
    loadAtividade();
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

  // Cria a etiqueta e já aplica nesta lead, sem sair pro Configurações.
  async function criarEAplicarTag() {
    const nome = novaTag.trim();
    if (!nome) return;
    setCriandoTag(true);
    const res = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nome }),
    });
    const t = await res.json().catch(() => ({}));
    setCriandoTag(false);
    if (!res.ok) { alert(t.error || "Não foi possível criar a etiqueta."); return; }
    setAllTags((prev) => [...prev, t].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
    setNovaTag("");
    await toggleTag(t.id);
  }

  // Manda a lead pro chat interno pra equipe discutir. A mensagem carrega o
  // contactId, entao no chat interno ela vira um card clicavel que abre a
  // ficha completa — em vez de alguem ter que procurar o nome na mao.
  async function abrirEncaminharLead() {
    setEncaminharLeadAberto(true);
    const d = await fetch("/api/chat-interno").then((r) => r.json()).catch(() => []);
    setConversasInternas(Array.isArray(d) ? d : []);
  }

  async function encaminharLead() {
    if (!convInternaAlvo || !selectedId) return;
    setEnviandoInterno(true);
    const res = await fetch(`/api/chat-interno/${convInternaAlvo}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: notaInterna, contactId: selectedId, atribuidoAId: pendenteDe || null }),
    });
    setEnviandoInterno(false);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { alert(d.error || "Não foi possível encaminhar."); return; }
    setEncaminharLeadAberto(false);
    setNotaInterna("");
    setConvInternaAlvo("");
    setPendenteDe("");
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
  // Dar baixa: abre a tela "Valor pago" (valor já preenchido, editável) em vez de baixar direto. Desmarcar uma baixa segue direto como antes.
  // Venda perdida exige motivo (catálogo de Configurações → Motivos de perda): pergunta antes de mover, igual ao Kanban e à ficha.
  const [motivosPerda, setMotivosPerda] = useState([]);
  const [motivoPerdaChat, setMotivoPerdaChat] = useState(null); // { stageId, motivo } | null
  useEffect(() => {
    fetch("/api/motivos-perda").then((r) => r.json()).then((m) => setMotivosPerda(Array.isArray(m) ? m : [])).catch(() => {});
  }, []);
  const [pagarParcela, setPagarParcela] = useState(null); // { parcela, valor, dinheiro, atrasada }
  async function togglePaid(p) {
    const vaiPagar = !p.paid;
    if (vaiPagar) {
      const atrasada = parcelaAtrasada(p, undefined, multaOpts);
      const base = valorParcelaAtual(p, undefined, multaOpts); // já considera multa, valor travado e desconto
      setPagarParcela({ parcela: p, valor: base.toFixed(2), dinheiro: false, atrasada });
      return;
    }
    await aplicarBaixa(p, false, undefined, undefined);
  }

  async function confirmarPagarParcela() {
    const pp = pagarParcela;
    const v = Number(pp?.valor);
    if (!pp || !(v > 0)) return;
    setPagarParcela(null);
    await aplicarBaixa(pp.parcela, true, v, pp.dinheiro ? "dinheiro" : "pix");
  }

  async function aplicarBaixa(p, vaiPagar, amountPago, formaPagamento) {
    setContact((c) => ({
      ...c,
      parcelas: (c.parcelas || []).map((x) => (x.id === p.id ? { ...x, paid: vaiPagar, amountPago: vaiPagar ? (amountPago ?? p.amount) : null } : x)),
    }));
    await fetch(`/api/parcelas/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paid: vaiPagar, amountPago, formaPagamento }),
    });
    atualizarFinanceiro();
  }

  async function createTask(e) {
    e.preventDefault();
    if (!selectedId) return;
    const dia = taskForm.dueDate || diaBR(0);
    const hora = taskForm.dueTime || "19:00";
    // Título não é mais obrigatório — sem nada digitado, usa o tipo
    // escolhido (ex.: "Ligar") como título, ou "Tarefa" se nem isso.
    const tipoEscolhido = taskTypes.find((t) => t.id === taskForm.tipoId);
    const title = taskForm.title.trim() || tipoEscolhido?.name || "Tarefa";
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...taskForm, title, contactId: selectedId, dueDate: `${dia}T${hora}:00`, repetir: taskForm.repetir ? { ate: taskForm.ate || "17:00", cadaMin: Number(taskForm.cadaMin) || 60, ateData: taskForm.ateData || undefined, soDiasUteis: !!taskForm.soDiasUteis } : undefined }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.error || "Não foi possível criar a tarefa.");
      return;
    }
    setTaskForm(tarefaPadrao());
    setShowTaskForm(false);
    setTarefaModalAberta(false);
    loadTasks();
  }

  async function confirmarBaixaJunta() {
    const marcadas = (contact?.parcelas || [])
      .filter((x) => juntarSel.includes(x.id) && !x.paid && !x.renegociada)
      .sort((a, b) => a.number - b.number);
    const v = Number(juntarModal?.valor);
    if (!marcadas.length || !(v > 0)) return;
    setEnviandoJunto(true);
    const res = await fetch(`/api/parcelas/${marcadas[0].id}/baixa-parcial`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ valor: v, formaPagamento: juntarModal.dinheiro ? "dinheiro" : "pix" }),
    });
    setEnviandoJunto(false);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { alert(d.error || "Erro ao registrar a baixa."); return; }
    const linhas = [];
    if (d.parcela) linhas.push(`${d.parcela.number}ª parcela: ${d.parcela.paid ? "quitada" : `recebido ${money(d.parcela.valorPago)}`}`);
    for (const q of d.quitadasAdiantado || []) linhas.push(`${q.number}ª parcela: R$ ${q.valor}${q.completou ? " (quitada)" : " (parcial)"}`);
    const aviso = d.sobrouSemAplicar > 0 ? "\n\nATENÇÃO: sobraram R$ " + d.sobrouSemAplicar + " sem parcela em aberto. Esse valor NÃO foi lançado no caixa." : "";
    if (linhas.length) alert("Baixa registrada:\n\n" + linhas.join("\n") + aviso);
    else if (aviso) alert(aviso.trim());
    setJuntarModal(null);
    setJuntando(false);
    setJuntarSel([]);
    atualizarFinanceiro();
    loadConversations();
  }

  async function salvarVencimento() {
    if (!editVenc?.novo || !editVenc?.motivo?.trim()) return;
    setSalvandoVenc(true);
    const res = await fetch(`/api/parcelas/${editVenc.parcela.id}/vencimento`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ novoVencimento: editVenc.novo, motivo: editVenc.motivo }),
    });
    setSalvandoVenc(false);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { alert(d.error || "Erro ao alterar vencimento."); return; }
    setContact((c) => (c ? { ...c, parcelas: (c.parcelas || []).map((x) => (x.id === d.id ? { ...x, ...d } : x)) } : c));
    setEditVenc(null);
    loadConversations();
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
  const emRecebimentoMin = selected?.stage?.name === "Recebimento" || selected?.stage?.name === "Renovação";
  // Blocos que podem ser minimizados (Dados pra conferência, checklists, tarefas). Em Recebimento/Renovação começam minimizados.
  const estaMin = (k) => (k in minim ? minim[k] : emRecebimentoMin);
  const alternarMin = (k) => setMinim((m) => ({ ...m, [k]: !estaMin(k) }));
  const parcelas = contact?.parcelas || [];
  // Parcela renegociada foi substituída por acordo: não conta (nem aparece), igual à ficha do contato.
  const parcelasAtuais = parcelas.filter((p) => (p.ciclo || 1) === (contact?.cicloAtual || 1) && !p.renegociada);
  // Mesma regra da ficha do contato: cliente não-uber com horário de recebimento próprio usa ESSE horário pra decidir atraso/multa.
  const horaLimiteEfetiva = (contact?.tipoCliente && contact.tipoCliente !== "uber" ? contact.horarioRecebimento : null) || horaLimite;
  const multaOpts = { multaPct, horaLimite: horaLimiteEfetiva };
  const totalRecebido = parcelasAtuais.reduce((sum, p) => sum + (p.paid ? (p.amountPago != null ? p.amountPago : p.amount) : (p.valorPago || 0)), 0);
  const pagas = parcelasAtuais.filter((p) => p.paid).length;
  const totalParcelas = parcelasAtuais.length;
  const faltaQuitar = parcelasAtuais.filter((p) => !p.paid && !p.renegociada).reduce((s, p) => s + Math.max(0, p.amount - (p.valorPago || 0)), 0);

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
              title={mostrarArquivadas ? "Voltar às conversas abertas" : "Ver conversas fechadas"}
              onClick={() => setMostrarArquivadas((v) => !v)}
              className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-full border transition-colors ${
                mostrarArquivadas ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-400 border-slate-200 hover:border-slate-300"
              }`}
            >
              <Icone nome="documento" className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Selecionar conversas (responder ou fechar em massa)"
              onClick={() => (selecionando ? sairSelecaoChat() : setSelecionando(true))}
              className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-full border text-sm transition-colors ${
                selecionando ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-400 border-slate-200 hover:border-slate-300"
              }`}
            >
              ☑
            </button>
          </div>
          {selecionando && (
            <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 p-2 space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                <button
                  type="button"
                  onClick={() => setSelIds(selIds.length === conversasFiltradas.length ? [] : conversasFiltradas.map((x) => x.id))}
                  className="font-medium text-emerald-700 hover:underline"
                >
                  {selIds.length === conversasFiltradas.length && conversasFiltradas.length > 0 ? "Desmarcar todos" : `Selecionar todos (${conversasFiltradas.length})`}
                </button>
                <span>{selIds.length} selecionada(s)</span>
                <button type="button" onClick={sairSelecaoChat} className="text-slate-500 hover:underline">Cancelar</button>
              </div>
              <div className="flex gap-1.5 relative">
                <button
                  type="button"
                  disabled={!selIds.length}
                  onClick={() => setMassaChat({ texto: "", enviando: false, feitos: 0, falhas: 0 })}
                  className="flex-1 text-xs rounded-lg bg-emerald-600 text-white py-1.5 disabled:opacity-40"
                >
                  Responder
                </button>
                <button
                  type="button"
                  disabled={!selIds.length}
                  onClick={() => setFecharMenu((v) => !v)}
                  className="flex-1 text-xs rounded-lg bg-white border border-slate-300 text-slate-700 py-1.5 disabled:opacity-40"
                >
                  Fechar ▾
                </button>
                {fecharMenu && (
                  <>
                    <span className="fixed inset-0 z-30" onClick={() => setFecharMenu(false)} />
                    <span className="absolute right-0 top-8 z-40 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[190px]">
                      {[[30, "Voltar em 30 min"], [60, "Voltar em 1 hora"], [180, "Voltar em 3 horas"], [300, "Voltar em 5 horas"], [0, "Só quando o cliente escrever"]].map(([min, txt]) => (
                        <button key={min} type="button" onClick={() => fecharVarias(selIds, min)} className="block w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">{txt}</button>
                      ))}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
          {mostrarArquivadas && <p className="text-[11px] text-slate-500 mt-1.5">Conversas fechadas — voltam para a lista quando o cliente escreve.</p>}
        </div>

        {massaChat && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={() => !massaChat.enviando && setMassaChat(null)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-sm font-semibold text-slate-800">Responder {selIds.length} conversa(s)</h3>
              <textarea
                autoFocus
                rows={5}
                value={massaChat.texto}
                disabled={massaChat.enviando}
                onChange={(e) => setMassaChat((m) => ({ ...m, texto: e.target.value }))}
                placeholder="Mensagem que será enviada para todas as selecionadas"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400"
              />
              {massaChat.enviando && <p className="text-xs text-slate-500">Enviando… {massaChat.feitos + massaChat.falhas}/{selIds.length}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" disabled={massaChat.enviando} onClick={() => setMassaChat(null)} className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600">Cancelar</button>
                <button type="button" disabled={massaChat.enviando || !massaChat.texto.trim()} onClick={enviarEmMassaChat} className="text-sm px-3 py-1.5 rounded-lg bg-emerald-600 text-white disabled:opacity-40">Enviar para todas</button>
              </div>
            </div>
          </div>
        )}

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
                      onClick={() => { setStatusFiltro(""); setSemPagarFiltro(""); setStageFiltro([]); setTagFiltro(""); setInstanceFiltro(""); setFiltroMsgs(""); setTarefaFiltro(""); }}
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
                  <span className="text-xs text-slate-400">Mensagens</span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {[
                      ["", "Todas"],
                      ["naolidas", "Não lidas"],
                      ["semresposta", "Sem resposta"],
                      ["ambas", "Notificadas e sem resposta"],
                    ].map(([v, rotulo]) => (
                      <button
                        key={v || "todas"}
                        type="button"
                        onClick={() => setFiltroMsgs(v)}
                        className={`text-xs rounded-full px-3 py-1 border transition-colors ${
                          filtroMsgs === v ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        {rotulo}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-slate-400">Dias sem pagar nada</span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {[["", "Todos"], ["1", "1 dia"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"], ["6", "6"], ["7", "7"], ["8", "+7"]].map(([v, t]) => (
                      <button key={v || "todos"} type="button" onClick={() => setSemPagarFiltro(v)} className={`text-xs rounded-full px-3 py-1 border transition-colors ${semPagarFiltro === v ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}>{t}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-slate-400">Situação</span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {["", "atrasado", "hoje", "emdia", "semhoje", "sem"].map((s) => (
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

                <div>
                  <span className="text-xs text-slate-400">Tarefas</span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {[["", "Todas"], ["com", "Com tarefa"], ["sem", "Sem tarefa"], ["atrasada", "Atrasadas"], ["hoje", "De hoje"], ["futura", "A vencer"]].map(([v, rot]) => (
                      <button
                        key={v || "todas"}
                        onClick={() => setTarefaFiltro(v)}
                        className={`text-xs rounded-full px-3 py-1 border transition-colors ${
                          tarefaFiltro === v
                            ? "bg-slate-800 text-white border-slate-800"
                            : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        {rot}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Etapa (pode marcar várias)</span>
                    {stageFiltro.length > 0 && (
                      <button type="button" onClick={() => setStageFiltro([])} className="text-[11px] text-slate-400 hover:text-slate-600">limpar</button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {stagesList.map((st) => {
                      const ativo = stageFiltro.includes(st.id);
                      return (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => setStageFiltro((sel) => (sel.includes(st.id) ? sel.filter((i) => i !== st.id) : [...sel, st.id]))}
                          className={`text-xs rounded-full px-3 py-1 border transition-colors ${
                            ativo ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          {st.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

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
          {conversasFiltradas.slice(0, limiteLista).map((c) => (
            <div key={c.id} className="group relative">
              <button
                onClick={() => {
                  if (selecionando) { setSelIds((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id])); return; }
                  setSelectedId(c.id); setContact(null); setMessages([]); setShowInfo(false);
                }}
                className={`w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                  selecionando && selIds.includes(c.id) ? "bg-emerald-100" : selectedId === c.id ? "bg-emerald-50" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  {selecionando && <input type="checkbox" readOnly checked={selIds.includes(c.id)} className="shrink-0 w-4 h-4 accent-emerald-600" />}
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
              <span className={`absolute top-2.5 right-2 flex items-center gap-0.5 transition-opacity ${menuConversaId === c.id ? "opacity-100" : "opacity-0 group-hover:opacity-100 max-md:opacity-100 pointer-coarse:opacity-100"}`}>
                <button
                  type="button"
                  title={c.chatFixado ? "Desafixar" : "Fixar no topo"}
                  onClick={(e) => { e.stopPropagation(); toggleChatFixado(c); }}
                  className={`w-6 h-6 rounded-full flex items-center justify-center ${c.chatFixado ? "text-amber-500" : "text-slate-300 hover:text-amber-500"}`}
                >
                  <Icone nome="local" className="w-3.5 h-3.5" />
                </button>
                <span className="relative">
                  <button
                    type="button"
                    title="Mais opções"
                    onClick={(e) => { e.stopPropagation(); setMenuConversaId((v) => (v === c.id ? null : c.id)); }}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 text-base leading-none"
                  >
                    ⋮
                  </button>
                  {menuConversaId === c.id && (
                    <>
                      <span className="fixed inset-0 z-30" onClick={(e) => { e.stopPropagation(); setMenuConversaId(null); }} />
                      <span className="absolute right-0 top-7 z-40 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[150px]">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setMenuConversaId(null); toggleChatArquivado(c); }}
                          className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          {c.chatArquivado ? "Reabrir conversa" : "Fechar conversa"}
                        </button>
                        {!c.chatArquivado && [[30, "Fechar e voltar em 30 min"], [60, "Fechar e voltar em 1 hora"], [180, "Fechar e voltar em 3 horas"], [300, "Fechar e voltar em 5 horas"]].map(([min, txt]) => (
                          <button key={min} type="button" onClick={(e) => { e.stopPropagation(); setMenuConversaId(null); fecharVarias([c.id], min); }} className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 whitespace-nowrap">{txt}</button>
                        ))}
                      </span>
                    </>
                  )}
                </span>
              </span>
            </div>
          ))}
          {conversasFiltradas.length > limiteLista && (
            <button type="button" onClick={() => setLimiteLista((n) => n + 80)} className="w-full text-xs text-emerald-600 hover:bg-slate-50 py-3">
              Mostrar mais ({conversasFiltradas.length - limiteLista} restantes)
            </button>
          )}
          {conversasFiltradas.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">Nenhuma conversa encontrada.</p>
          )}
        </div>
        )}
      </div>

      {/* Painel central: chat */}
      <div className={`${selectedId ? "flex" : "hidden md:flex"} flex-1 flex-col bg-slate-50 min-h-0 min-w-0 overflow-hidden`}>
        {selected ? (
          <>
            <div className="px-4 py-3 bg-white border-b border-slate-200 flex items-center gap-3 shrink-0">
              <button
                onClick={() => setSelectedId(null)}
                className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 shrink-0"
              >
                ←
              </button>
              {/* No mobile, os botões de topo (Resumir/Ligar/IA/Dados) atulham o
                  cabeçalho e empurram o chat pra baixo — clicar na foto abre
                  os Dados do contato (como no WhatsApp de verdade), sem
                  precisar do botão "Dados" que só aparece no desktop. */}
              <button
                type="button"
                onClick={() => setShowInfo(true)}
                title="Ver dados do contato"
                className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold flex items-center justify-center shrink-0"
              >
                {initials(selected.name)}
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 truncate flex items-center gap-2">
                  <span className="truncate">{selected.name}</span>
                  {selected.stageName && (() => {
                    const cor = stagesList.find((x) => x.id === selected.stageId)?.color || "#64748b";
                    return (
                      <span title="Etapa do funil" className="shrink-0 text-[10px] font-semibold rounded-full px-2 py-0.5" style={{ backgroundColor: `${cor}22`, color: cor }}>
                        {selected.stageName}
                      </span>
                    );
                  })()}
                </p>
                {selected.phone && <p className="text-xs text-slate-400">{selected.phone}</p>}
              </div>
              <button
                onClick={abrirEncaminharLead}
                title="Enviar esta lead pro chat interno da equipe"
                className="hidden md:flex shrink-0 items-center gap-1 text-xs font-medium rounded-full px-2.5 py-1 border border-slate-200 text-slate-500 hover:bg-slate-50"
              >
                <Icone nome="pessoas" className="w-3 h-3" /> Chat interno
              </button>
              <button
                onClick={() => setSuporteIaAberto(true)}
                title="Reportar que a IA preencheu/entendeu algo errado nesta lead"
                className="shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
              >
                !
              </button>
              <button
                onClick={gerarResumo}
                disabled={resumindo}
                title="Resumir a conversa com IA"
                className="hidden md:flex shrink-0 items-center gap-1 text-xs font-medium rounded-full px-2.5 py-1 border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
              >
                {resumindo ? "Resumindo…" : (<><Icone nome="estrela" className="w-3 h-3" /> Resumir</>)}
              </button>
              {selected.phone && (
                <button
                  type="button"
                  onClick={() => ligarWhatsapp(selected.phone, selected.name)}
                  title="Ligar pelo WhatsApp (Wavoip). Sem token configurado, abre a conversa no WhatsApp"
                  className="hidden md:flex shrink-0 items-center gap-1 text-xs font-medium rounded-full px-2.5 py-1 border border-slate-200 text-slate-500 hover:bg-slate-50"
                >
                  <Icone nome="cobranca" className="w-3 h-3" /> Ligar
                </button>
              )}
              {contact && (
                <button
                  type="button"
                  onClick={() => setTarefaModalAberta(true)}
                  title="Criar tarefa para este lead"
                  className="hidden md:flex shrink-0 items-center gap-1 text-xs font-medium rounded-full px-2.5 py-1 border border-slate-200 text-slate-600 hover:border-emerald-300 hover:text-emerald-700 transition-colors"
                >
                  + Tarefa
                </button>
              )}
              {contact && (
                <button
                  type="button"
                  onClick={() => setRenovandoRapido(true)}
                  title="Renovação rápida: informe o valor e gere o novo ciclo com as parcelas"
                  className="hidden md:flex shrink-0 items-center gap-1 text-xs font-medium rounded-full px-2.5 py-1 border border-slate-200 text-slate-600 hover:border-emerald-300 hover:text-emerald-700 transition-colors"
                >
                  Renovar
                </button>
              )}
              {contact && (
                <button
                  onClick={toggleIaPausada}
                  title={contact.iaPausada ? "IA desligada — clique para religar" : "IA ligada — clique para desligar (atendimento manual)"}
                  className={`hidden md:inline-flex shrink-0 text-xs font-medium rounded-full px-2.5 py-1 border ${
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
                className="hidden md:inline-block text-xs text-emerald-600 hover:text-emerald-700 border border-emerald-200 rounded-lg px-2.5 py-1 shrink-0"
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
            <div className="flex-1 overflow-y-auto thin-scroll p-4 space-y-2" onWheel={() => { userRolouRef.current = true; }} onTouchMove={() => { userRolouRef.current = true; }}>
              {timeline.map((item) => item.tipo === "atividade" ? (
                <div key={`ativ-${item.ativ.createdAt}-${item.ativ.detalhe}`} className="flex justify-center">
                  <p className="max-w-[85%] text-center text-[11px] text-slate-500 bg-slate-200/70 rounded-full px-3 py-1">
                    <span className="font-semibold">{item.ativ.usuario || "IA"}</span>
                    {" "}
                    {item.ativ.tipo === "etapa" ? item.ativ.detalhe : `alterou — ${item.ativ.detalhe}`}
                    {" "}
                    <span className="text-slate-400">· {fmtTime(item.ativ.createdAt)}</span>
                  </p>
                </div>
              ) : (
                <div key={item.msg.id} className={`group flex items-center gap-1 ${item.msg.fromMe ? "justify-end" : "justify-start"}`}>
                  {/* Ações aparecem só no hover, e só pras nossas — encaminhar
                      qualquer uma, apagar (item 88, só da nossa lista) só a nossa. */}
                  {!item.msg.apagada && (
                    <span className={`shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ${item.msg.fromMe ? "order-first" : ""}`}>
                      <button type="button" title="Encaminhar" onClick={() => setEncaminharMsg(item.msg)} className="w-6 h-6 flex items-center justify-center rounded-full text-slate-400 hover:text-emerald-600 hover:bg-slate-100">
                        <Icone nome="seta" className="w-3 h-3 -rotate-90" />
                      </button>
                      {(item.msg.body || "").trim() && (
                        <button type="button" title="Mandar pra um campo do lead" onClick={() => setEnviarCampoMsg(item.msg)} className="w-6 h-6 flex items-center justify-center rounded-full text-slate-400 hover:text-emerald-600 hover:bg-slate-100 text-base leading-none">
                          ⋮
                        </button>
                      )}
                      {item.msg.fromMe && (
                        <button type="button" title="Apagar da minha lista" onClick={() => apagarMensagem(item.msg.id)} className="w-6 h-6 flex items-center justify-center rounded-full text-slate-400 hover:text-red-500 hover:bg-slate-100">
                          <Icone nome="x" className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                  )}
                  <div
                    className={`max-w-[70%] min-w-0 rounded-xl px-3 py-2 text-sm ${
                      item.msg.fromMe
                        ? "bg-emerald-500 text-white rounded-br-sm"
                        : "bg-white text-slate-800 border border-slate-200 rounded-bl-sm"
                    }`}
                  >
                    {item.msg.instance && (numbers.length > 1 || instanciasNaConversa.size > 1) && (
                      <p className={`flex items-center gap-1 text-[10px] mb-0.5 ${item.msg.fromMe ? "text-emerald-100" : "text-slate-400"}`}>
                        <Icone nome="celular" className="w-2.5 h-2.5" /> {numberLabel(item.msg.instance, numbers)}
                      </p>
                    )}
                    {item.msg.apagada ? (
                      <p className={`italic ${item.msg.fromMe ? "text-emerald-100" : "text-slate-400"}`}>Mensagem apagada</p>
                    ) : (
                      <>
                        {(item.msg.kind === "audio" || item.msg.kind === "image" || item.msg.kind === "document" || item.msg.kind === "location") && <MediaBubble message={item.msg} />}
                        {item.msg.kind !== "location" && (item.msg.kind === "text" || item.msg.body) && <LinkifiedText text={item.msg.body} />}
                      </>
                    )}
                    <p className={`text-[10px] mt-1 flex items-center gap-1 ${item.msg.fromMe ? "text-emerald-200" : "text-slate-400"}`}>
                      {fmtTime(item.msg.createdAt)}
                      {/* "falhou" = falha no envio manual (contacts/[id]/messages); "erro" = falha nos
                          envios automáticos (IA, follow-up, lembrete, campanha, formulário guiado...).
                          Sem checar os dois, uma queda de WhatsApp durante um atendimento automático
                          (79 mensagens perdidas numa janela de 42min em 01/09) ficava sem nenhum aviso
                          visual pro atendente — a mensagem aparecia como se tivesse ido normalmente. */}
                      {item.msg.fromMe && (item.msg.status === "falhou" || item.msg.status === "erro") && (
                        <span className="text-red-100 bg-red-500/80 rounded-full px-1.5 font-medium">falhou</span>
                      )}
                      {item.msg.fromMe && !["falhou", "erro"].includes(item.msg.status) && (
                        <TicksEnvio status={item.msg.status} />
                      )}
                      {item.msg.fromMe && item.msg.enviadoPor && (
                        <span className="flex items-center gap-0.5" title="Quem enviou">
                          <Icone nome={["IA", "Automático", "Agendada"].includes(item.msg.enviadoPor) ? "robo" : item.msg.enviadoPor === "Celular" ? "celular" : "pessoa"} className="w-2.5 h-2.5" /> {item.msg.enviadoPor}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={chatEnd} />
            </div>
            <div className="px-4 pt-2 pb-0 bg-white border-t border-slate-200 shrink-0 min-w-0 max-w-full">
              <TarefaBarra tasks={tasks} onChanged={loadTasks} onCriar={() => setTarefaModalAberta(true)} />
              {renovandoRapido && selected && (
                <RenovacaoRapida contactId={selected.id} nome={selected.name} onClose={() => setRenovandoRapido(false)} onDone={() => { loadConversations(); loadContact(); }} />
              )}
              {numbers.length > 1 && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-slate-400 shrink-0">Enviar por:</span>
                  <select
                    value={selectedInstance}
                    onChange={(e) => setSelectedInstance(e.target.value)}
                    disabled={sending || uploading}
                    className="flex-1 min-w-0 w-full text-xs border border-slate-200 rounded px-2 py-1.5 bg-white outline-none focus:border-emerald-400 disabled:opacity-50"
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
              {/* flex-wrap: em tela estreita, clipe+input+mic+agendar+vídeo+Enviar não
                  cabiam numa linha só — sem quebra, o botão "Enviar" saía da área
                  visível (sem barra de rolagem pra avisar) e sumia no mobile. Com
                  wrap, se não couber tudo numa linha, o que sobra desce pra próxima
                  em vez de ficar escondido. */}
              <form onSubmit={send} className="flex flex-wrap gap-2 pb-3">
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
                <div className="flex-1 relative min-w-[160px]">
                  <textarea
                    rows={1}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      // Ctrl+Enter / Shift+Enter: quebra de linha; Enter sozinho: envia.
                      if (e.ctrlKey || e.shiftKey) {
                        e.preventDefault();
                        const el = e.target;
                        const ini = el.selectionStart;
                        setText(text.slice(0, ini) + "\n" + text.slice(el.selectionEnd));
                        requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = ini + 1; });
                        return;
                      }
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }}
                    onPaste={onPasteImage}
                    placeholder={recording ? "Gravando áudio…" : uploading ? "Enviando anexo…" : "Digite uma mensagem… (\"/\" pra mensagem pronta, Ctrl+V pra colar imagem)"}
                    disabled={recording}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400 disabled:bg-slate-50 resize-none max-h-40 overflow-y-auto"
                    style={{ fieldSizing: "content" }}
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
                  type="button"
                  onClick={() => setCalcAberta(true)}
                  title="Calculadora rápida"
                  className="shrink-0 w-9 h-9 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center text-base"
                >
                  🧮
                </button>
                <button
                  type="button"
                  onClick={() => setAgendarAberto(true)}
                  disabled={uploading || recording}
                  title="Agendar esta mensagem pra outro momento"
                  className="shrink-0 w-9 h-9 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 flex items-center justify-center"
                >
                  <Icone nome="relogio" className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setTarefaModalAberta(true)}
                  disabled={uploading || recording}
                  title="Criar tarefa para este lead"
                  className="shrink-0 w-9 h-9 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 flex items-center justify-center"
                >
                  <Icone nome="tarefa" className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={gerarLinkVideoChamada}
                  disabled={uploading || recording || gerandoLinkVideo}
                  title="Gerar link de vídeo chamada com verificação"
                  className="shrink-0 w-9 h-9 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 flex items-center justify-center"
                >
                  <Icone nome="video" className="w-4 h-4" />
                </button>
                <button
                  disabled={sending || !text.trim()}
                  className="bg-emerald-500 text-white rounded-lg px-4 py-2 text-sm hover:bg-emerald-600 disabled:opacity-50"
                >
                  Enviar
                </button>
              </form>
              {agendarAberto && (
                <AgendarMensagemModal
                  contactId={selectedId}
                  textoInicial={text}
                  templates={templates}
                  numbers={numbers}
                  numeroInicial={numbers.find((n) => n.instance === selectedInstance)?.id || ""}
                  onClose={() => setAgendarAberto(false)}
                  onAgendado={() => {}}
                />
              )}
              {videoChamadaAberta && (
                <VideoChamadaCall sessaoId={videoChamadaAberta} onClose={() => setVideoChamadaAberta(null)} />
              )}
              {suporteIaAberto && (
                <div className="fixed inset-0 z-[60] bg-slate-900/40 flex items-center justify-center p-4" onClick={() => setSuporteIaAberto(false)}>
                  <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
                      <h3 className="font-semibold text-slate-800">Reportar erro da IA</h3>
                      <button onClick={() => setSuporteIaAberto(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
                    </div>
                    <div className="p-5 space-y-3">
                      <p className="text-xs text-slate-500">
                        Fica registrado numa fila em Configurações → IA → Suporte da IA, pra revisar depois e ajustar a IA pra não repetir.
                      </p>
                      <label className="block">
                        <span className="text-xs text-slate-500">O que a IA fez errado? (opcional)</span>
                        <textarea
                          value={suporteIaDescricao}
                          onChange={(e) => setSuporteIaDescricao(e.target.value)}
                          rows={3}
                          placeholder="Ex.: salvou o CPF errado, pegou o endereço errado..."
                          className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-red-400 resize-none"
                          autoFocus
                        />
                      </label>
                      <button
                        onClick={reportarErroIa}
                        disabled={enviandoSuporteIa}
                        className="w-full bg-red-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                      >
                        {enviandoSuporteIa ? "Registrando..." : "Registrar erro"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {tarefaModalAberta && (
                <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setTarefaModalAberta(false)}>
                  <div className="bg-white rounded-xl shadow-lg p-4 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-slate-700">Nova tarefa</span>
                      <button type="button" onClick={() => setTarefaModalAberta(false)} className="text-slate-400 hover:text-slate-600">
                        <Icone nome="x" className="w-4 h-4" />
                      </button>
                    </div>
                    <form onSubmit={createTask} className="space-y-2">
                      <TarefaAtalhos taskTypes={taskTypes} setTaskForm={setTaskForm} />
                      <input
                        value={taskForm.title}
                        onChange={(e) => setTaskForm((f) => ({ ...f, title: e.target.value }))}
                        placeholder="Título da tarefa"
                        autoFocus
                        className="w-full text-sm border border-slate-200 rounded px-2.5 py-2 outline-none focus:border-emerald-400"
                      />
                      <select
                        value={taskForm.tipoId}
                        onChange={(e) => setTaskForm((f) => ({ ...f, tipoId: e.target.value }))}
                        className="w-full text-sm border border-slate-200 rounded px-2.5 py-2 bg-white outline-none"
                      >
                        {taskTypes.map((t) => (
                          <option key={t.id} value={t.id}>{t.emoji ? `${t.emoji} ` : ""}{t.name}</option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <input
                          type="date"
                          value={taskForm.dueDate}
                          onChange={(e) => setTaskForm((f) => ({ ...f, dueDate: e.target.value }))}
                          className="min-w-0 flex-1 text-sm border border-slate-200 rounded px-2.5 py-2"
                        />
                        <input
                          type="time"
                          value={taskForm.dueTime}
                          onChange={(e) => setTaskForm((f) => ({ ...f, dueTime: e.target.value }))}
                          className="min-w-0 w-28 shrink-0 text-sm border border-slate-200 rounded px-2.5 py-2"
                        />
                      </div>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={!!taskForm.repetir} onChange={(e) => setTaskForm((f) => ({ ...f, repetir: e.target.checked }))} className="accent-emerald-500" />
                Repetir dentro de um período
              </label>
              {taskForm.repetir && (
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <span>até</span>
                    <input type="time" value={taskForm.ate || "17:00"} onChange={(e) => setTaskForm((f) => ({ ...f, ate: e.target.value }))} className="text-sm border border-slate-200 rounded px-2 py-1.5 bg-white" />
                    <span>a cada</span>
                    <select value={taskForm.cadaMin || 60} onChange={(e) => setTaskForm((f) => ({ ...f, cadaMin: Number(e.target.value) }))} className="text-sm border border-slate-200 rounded px-2 py-1.5 bg-white">
                      {[10, 15, 20, 30, 45, 60, 90, 120].map((m) => (<option key={m} value={m}>{m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60} h` : `${m} min`}</option>))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-500 flex-wrap">
                    <span>repetir nos dias até</span>
                    <input type="date" value={taskForm.ateData || ""} onChange={(e) => setTaskForm((f) => ({ ...f, ateData: e.target.value }))} className="text-sm border border-slate-200 rounded px-2 py-1.5 bg-white" />
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={!!taskForm.soDiasUteis} onChange={(e) => setTaskForm((f) => ({ ...f, soDiasUteis: e.target.checked }))} className="accent-emerald-500" />
                      só dias úteis
                    </label>
                  </div>
                  <p className="text-[11px] text-slate-400">Cria uma tarefa para cada horário, do horário acima até o final. Com a data preenchida, repete isso todos os dias até ela (máx. 200 tarefas).</p>
                </div>
              )}
                      <button className="w-full bg-emerald-500 text-white rounded py-2 text-sm hover:bg-emerald-600">Criar tarefa</button>
                    </form>
                  </div>
                </div>
              )}
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
      {/* Dados ainda não chegaram (conversa grande demora ou a consulta falhou): antes o clique não fazia nada. */}
      {selectedId && !contact && showInfo && (
        <div className="w-[82%] max-w-sm md:w-72 lg:w-80 shrink-0 border-l border-slate-200 bg-white absolute md:relative inset-y-0 right-0 md:inset-auto z-30 md:z-auto shadow-xl md:shadow-none">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800 text-sm">Editar lead</h3>
            <button onClick={() => setShowInfo(false)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
          </div>
          <div className="p-4 text-sm text-slate-500 space-y-3">
            <p className={contactErro ? "text-red-500" : ""}>{contactErro || "Carregando os dados do lead…"}</p>
            <button onClick={() => loadContact()} className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50">Tentar de novo</button>
          </div>
        </div>
      )}
      {selectedId && contact && showInfo && (
        <div className="md:hidden fixed inset-0 bg-slate-900/30 z-20" onClick={() => setShowInfo(false)} />
      )}
      {selectedId && contact && showInfo && (
        <div className={`${abaDados === "completo" ? "w-[92%] max-w-lg md:w-[440px] lg:w-[500px] flex flex-col" : "w-[82%] max-w-sm md:w-72 lg:w-80 overflow-y-auto thin-scroll"} shrink-0 border-l border-slate-200 bg-white absolute md:relative inset-y-0 right-0 md:inset-auto z-30 md:z-auto shadow-xl md:shadow-none`}>
          <div className="px-4 py-2 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10 shrink-0">
            <h3 className="font-semibold text-slate-800 text-sm">Dados do contato</h3>
            <button onClick={() => setShowInfo(false)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
          </div>
          {abaDados === "completo" && (
            <div className="flex-1 min-h-0">
              <ContactModal
                key={selectedId}
                embutido
                contactId={selectedId}
                onClose={() => setShowInfo(false)}
                onChanged={() => { loadContact(); loadConversations(); }}
              />
            </div>
          )}
          <div className={`p-4 space-y-3 ${abaDados === "completo" ? "hidden" : ""}`}>
            {/* Campos editáveis */}
            <label className="block">
              <span className="text-[11px] text-slate-400">Nome</span>
              <input value={form.name || ""} onChange={set("name")} className={inputCls} />
            </label>
            <label className="block">
              <span className="text-[11px] text-slate-400">Telefone</span>
              <div className="mt-0.5 flex items-center gap-1.5">
                <input value={form.phone || ""} onChange={set("phone")} className={`flex-1 min-w-0 ${inputCls}`} />
                {form.phone && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(form.phone);
                        setPhoneCopiado(true);
                        setTimeout(() => setPhoneCopiado(false), 1500);
                      } catch {}
                    }}
                    title="Copiar telefone"
                    className="shrink-0 flex items-center justify-center border border-slate-200 rounded px-2 py-1.5 text-slate-500 hover:text-emerald-600 hover:border-emerald-300 transition-colors"
                  >
                    <Icone nome={phoneCopiado ? "check" : "copiar"} className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
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
              <select
                value={form.stageId || ""}
                onChange={(e) => {
                  const id = e.target.value;
                  const alvo = stagesList.find((x) => x.id === id);
                  if (alvo?.name === "Venda perdida" && id !== contact?.stageId) {
                    setForm((f) => ({ ...f, stageId: id }));
                    setMotivoPerdaChat({ stageId: id, motivo: "" });
                  } else {
                    set("stageId")(e);
                  }
                }}
                className={selectCls}
              >
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

            {/* Mesmos dados da ficha do Kanban: documentos, endereços, Pix e checklists. */}
            <label className="block">
              <span className="text-[11px] text-slate-400">CNPJ</span>
              <input value={form.cnpj || ""} onChange={set("cnpj")} className={inputCls} />
            </label>
            <label className="block">
              <span className="text-[11px] text-slate-400">Razão social</span>
              <input value={form.razaoSocial || ""} onChange={set("razaoSocial")} className={inputCls} />
            </label>
            {/* Consulta do CNPJ (CNPJá): situação cadastral, atividade, endereço e sócios — a mesma da ficha do contato. */}
            {form.tipoCliente === "comerciante" && selectedId && (
              <CnpjCard
                key={`${selectedId}-${form.cnpj || ""}`}
                contactId={selectedId}
                cnpj={form.cnpj}
                dadosIniciais={contact?.cnpjDados}
                onPreencher={({ razaoSocial, enderecoComercial }) =>
                  setForm((f) => ({ ...f, razaoSocial: f.razaoSocial || razaoSocial || "", enderecoComercial: f.enderecoComercial || enderecoComercial || "" }))
                }
              />
            )}
            <label className="block">
              <span className="text-[11px] text-slate-400">Endereço residencial</span>
              <input
                value={form.endereco || ""}
                onChange={(e) => setForm((f) => ({ ...f, endereco: e.target.value, ...(f.comercioNaResidencia ? { enderecoComercial: e.target.value } : {}) }))}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-slate-400">Endereço comercial</span>
              <input value={form.enderecoComercial || ""} onChange={set("enderecoComercial")} disabled={!!form.comercioNaResidencia} className={`${inputCls} disabled:bg-slate-50 disabled:text-slate-500`} />
              <span className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                <input
                  type="checkbox"
                  checked={!!form.comercioNaResidencia}
                  onChange={(e) => setForm((f) => ({ ...f, comercioNaResidencia: e.target.checked, ...(e.target.checked ? { enderecoComercial: f.endereco || "" } : {}) }))}
                />
                Trabalha em casa — usar o endereço residencial como comercial
              </span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[11px] text-slate-400">Chave Pix</span>
                <input value={form.pixChave || ""} onChange={set("pixChave")} className={inputCls} />
              </label>
              <label className="block">
                <span className="text-[11px] text-slate-400">Nome completo (Pix)</span>
                <input value={form.pixNomeCompleto || ""} onChange={set("pixNomeCompleto")} className={inputCls} />
              </label>
            </div>

            {(() => {
              const tipo = form.tipoCliente === "motoboy" ? "uber" : form.tipoCliente;
              const itens = CHECKLIST_DOC[tipo];
              const marcados = form.checklistDocumentacao || {};
              return (
                <div className={`border border-sky-200 bg-sky-50/50 rounded-lg p-2.5 space-y-1.5 ${estaMin("checkdoc") ? "[&>*:not(:first-child)]:hidden" : ""}`}>
                  <button type="button" onClick={() => alternarMin("checkdoc")} className="flex items-center gap-1 text-left text-xs font-semibold text-sky-700" title={estaMin("checkdoc") ? "Expandir" : "Minimizar"}><span className="text-[9px] w-2.5">{estaMin("checkdoc") ? "▸" : "▾"}</span>Checklist de documentação{tipo === "comerciante" ? " — comerciante" : tipo === "uber" ? " — motorista de app" : ""}</button>
                  {itens ? itens.map(([chave, rotulo]) => (
                    <label key={chave} className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!marcados[chave]}
                        onChange={(e) => setForm((f) => ({ ...f, checklistDocumentacao: { ...(f.checklistDocumentacao || {}), [chave]: e.target.checked } }))}
                        className="mt-0.5"
                      />
                      {rotulo}
                    </label>
                  )) : (
                    <p className="text-[11px] text-slate-400">Escolha o tipo de cliente para ver o checklist.</p>
                  )}
                </div>
              );
            })()}

            <div className={`border border-amber-200 bg-amber-50/50 rounded-lg p-2.5 space-y-1.5 ${estaMin("checkanalise") ? "[&>*:not(:first-child)]:hidden" : ""}`}>
              <button type="button" onClick={() => alternarMin("checkanalise")} className="flex items-center gap-1 text-left text-xs font-semibold text-amber-700" title={estaMin("checkanalise") ? "Expandir" : "Minimizar"}><span className="text-[9px] w-2.5">{estaMin("checkanalise") ? "▸" : "▾"}</span>Checklist da análise</button>
              {[
                ["checklistTelefoneBate", "Telefone precisa bater o do cliente ou 2 pelo menos"],
                ["checklistDivergenciaPrint", "Divergência de print"],
                ["checklistAntecedentes", "Antecedentes conferidos"],
              ].map(([chave, rotulo]) => (
                <label key={chave} className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={!!form[chave]} onChange={(e) => setForm((f) => ({ ...f, [chave]: e.target.checked }))} className="mt-0.5" />
                  {rotulo}
                </label>
              ))}
            </div>

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

            {/* Atividade do lead: quem mudou o quê (campo/etapa), IA ou usuário. */}
            <div className="border border-slate-200 rounded-lg p-2.5">
              <button
                type="button"
                onClick={() => setAtividadeAberta((v) => !v)}
                className="w-full flex items-center justify-between"
              >
                <span className="text-[11px] font-medium text-slate-600">Atividade ({atividade.length})</span>
                <span className="text-[11px] text-emerald-600">{atividadeAberta ? "Ocultar" : "Ver"}</span>
              </button>
              {atividadeAberta && (
                <div className="mt-2 space-y-1.5 max-h-64 overflow-y-auto thin-scroll">
                  {atividade.length === 0 && (
                    <p className="text-[11px] text-slate-400">Nenhuma alteração registrada ainda.</p>
                  )}
                  {atividade.map((a, i) => (
                    <div key={i} className="text-[11px] border-l-2 border-slate-200 pl-2">
                      <div className="flex items-center gap-1 text-slate-500">
                        <span className={`px-1 rounded text-[10px] font-medium ${a.usuario ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700"}`}>
                          {a.usuario || "IA"}
                        </span>
                        <span>{fmtAtividade(a.createdAt)}</span>
                      </div>
                      <p className="text-slate-700">
                        {a.tipo === "etapa" ? `Etapa: ${a.detalhe}` : a.detalhe}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tarefas do lead */}
            <div className={`border border-slate-200 rounded-lg p-2.5 ${estaMin("tarefas") ? "[&>*:not(:first-child)]:hidden" : ""}`}>
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => alternarMin("tarefas")} className="flex items-center gap-1 text-left text-[11px] font-medium text-slate-600" title={estaMin("tarefas") ? "Expandir" : "Minimizar"}><span className="text-[9px] w-2.5">{estaMin("tarefas") ? "▸" : "▾"}</span>Tarefas ({tasks.filter((t) => !t.done).length} pendentes)</button>
                <button type="button" onClick={() => setShowTaskForm((v) => !v)} className="text-[11px] text-emerald-600 hover:text-emerald-700">
                  {showTaskForm ? "Cancelar" : "+ Tarefa"}
                </button>
              </div>
              {showTaskForm && (
                <form onSubmit={createTask} className="mt-2 space-y-1.5">
                  <TarefaAtalhos taskTypes={taskTypes} setTaskForm={setTaskForm} compacto />
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
                        {new Date(t.dueDate).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).replace(",", "")}
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
            {(allTags.length > 0 || euAdmin) && (
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
                {euAdmin && (
                  <div className="flex gap-1.5 mt-1.5">
                    <input
                      value={novaTag}
                      onChange={(e) => setNovaTag(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); criarEAplicarTag(); }
                      }}
                      placeholder="Nova etiqueta…"
                      className="flex-1 min-w-0 text-[10px] border border-slate-200 rounded px-2 py-1 outline-none focus:border-emerald-400"
                    />
                    <button
                      type="button"
                      onClick={criarEAplicarTag}
                      disabled={criandoTag || !novaTag.trim()}
                      className="shrink-0 text-[10px] bg-slate-800 text-white rounded px-2.5 py-1 hover:bg-slate-700 disabled:opacity-50"
                    >
                      {criandoTag ? "…" : "+ Criar"}
                    </button>
                  </div>
                )}
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
                  {parcelasAtuais.some((x) => !x.paid) && (
                    <div className="flex items-center justify-between text-[11px]">
                      <button
                        type="button"
                        onClick={() => { setJuntando((v) => !v); setJuntarSel([]); }}
                        className={juntando ? "text-slate-500 hover:text-slate-700" : "text-emerald-600 hover:text-emerald-700 font-medium"}
                      >
                        {juntando ? "Cancelar" : "Juntar parcelas e dar baixa"}
                      </button>
                      {juntando ? (
                        <span className="text-slate-400">marque as parcelas em aberto</span>
                      ) : (
                        <button type="button" onClick={() => setAcordoAberto(true)} className="text-amber-600 hover:text-amber-700 font-medium" title="Negociar: acordo parcelado do que está em aberto">
                          Negociação
                        </button>
                      )}
                    </div>
                  )}
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
                  <ul className="space-y-0.5 max-h-64 overflow-y-auto text-xs">
                    {parcelasAtuais.map((p) => {
                      const atrasadaP = !p.paid && parcelaAtrasada(p, undefined, multaOpts);
                      const valorAtual = p.paid ? (p.amountPago != null ? p.amountPago : p.amount) : valorParcelaAtual(p, undefined, multaOpts);
                      return (
                        <li key={p.id} className="py-0.5">
                          <div className="flex items-center justify-between">
                            <label className="flex items-center gap-1.5 cursor-pointer min-w-0">
                              <input
                                type="checkbox"
                                checked={juntando ? juntarSel.includes(p.id) : p.paid}
                                disabled={juntando && p.paid}
                                onChange={() => (juntando ? setJuntarSel((sel) => (sel.includes(p.id) ? sel.filter((i) => i !== p.id) : [...sel, p.id])) : togglePaid(p))}
                                className="accent-emerald-500"
                              />
                              <span className={p.paid ? "line-through text-slate-400" : "text-slate-600"}>
                                {p.number}ª · {fmtDate(p.dueDate)}
                              </span>
                              {p.paid && p.paidAt && (
                                <span className="text-[10px] text-emerald-600 bg-emerald-50 rounded-full px-1.5 py-0.5 shrink-0" title="Data em que a baixa foi registrada">
                                  pago {new Date(p.paidAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                                </span>
                              )}
                              {atrasadaP && (
                                <span className="text-[10px] font-semibold bg-red-500 text-white rounded-full px-1.5 py-0.5 shrink-0">+{multaPct}%</span>
                              )}
                            </label>
                            <span className="flex items-center gap-1.5 shrink-0">
                              {!p.paid && (
                                <button
                                  type="button"
                                  onClick={() => setEditVenc({ parcela: p, novo: String(p.dueDate).slice(0, 10), motivo: "" })}
                                  title="Mudar a data de vencimento (pede motivo)"
                                  className="text-slate-300 hover:text-emerald-600"
                                >
                                  <Icone nome="calendario" className="w-3 h-3" />
                                </button>
                              )}
                              <span className={`font-medium ${p.paid ? "text-emerald-600" : atrasadaP ? "text-red-600" : "text-slate-700"}`}>
                                {money(valorAtual)} {p.paid ? "✓" : ""}
                              </span>
                            </span>
                          </div>
                          {!p.paid && p.valorPago > 0 && (
                            <p className="text-[10px] text-amber-600 text-right">
                              {money(p.valorPago)} pago{p.valorPagoEm ? ` em ${new Date(p.valorPagoEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}` : ""} · falta {money(Math.max(0, valorAtual - p.valorPago))}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  <p className="text-[11px] text-slate-500 text-right">
                    Recebido: <span className="font-semibold text-emerald-700">{money(totalRecebido)}</span>
                  </p>
                  {parcelasAtuais.length > 0 && parcelasAtuais.every((x) => x.paid) && (
                    <div className="mt-1 rounded-lg border border-emerald-200 bg-emerald-50/60 p-2 space-y-1.5">
                      <p className="text-xs font-medium text-emerald-700">Ciclo {contact?.cicloAtual || 1} quitado — cliente pronto pra renovar</p>
                      <button
                        type="button"
                        onClick={() => setRenovandoRapido(true)}
                        className="w-full text-xs bg-emerald-600 text-white rounded-lg py-1.5 hover:bg-emerald-700"
                      >
                        Renovar empréstimo
                      </button>
                    </div>
                  )}
                  {juntando && juntarSel.length > 0 && (() => {
                    const marcadas = parcelasAtuais.filter((x) => juntarSel.includes(x.id) && !x.paid);
                    const total = marcadas.reduce((sum, x) => sum + Math.max(0, valorParcelaAtual(x, undefined, multaOpts) - (x.valorPago || 0)), 0);
                    return (
                      <button
                        type="button"
                        onClick={() => setJuntarModal({ valor: total.toFixed(2), dinheiro: false })}
                        className="w-full text-xs bg-emerald-500 text-white rounded-lg py-1.5 hover:bg-emerald-600"
                      >
                        Dar baixa em valor único · {marcadas.length} parcela{marcadas.length > 1 ? "s" : ""} · {money(total)}
                      </button>
                    );
                  })()}
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

      {motivoPerdaChat && (
        <div className="fixed inset-0 z-[70] bg-slate-900/40 flex items-center justify-center p-4" onClick={cancelarMotivoPerdaChat}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-800 mb-1">Por que essa venda foi perdida?</h3>
            <p className="text-xs text-slate-400 mb-3">Ajuda a entender o padrão de quem não fecha.</p>
            {motivosPerda.length === 0 ? (
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2.5 mb-3">
                Nenhum motivo cadastrado ainda — cadastre em Configurações → Motivos de perda.
              </p>
            ) : (
              <select
                autoFocus
                value={motivoPerdaChat.motivo}
                onChange={(e) => setMotivoPerdaChat((m) => ({ ...m, motivo: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400 mb-3"
              >
                <option value="">— Escolha o motivo —</option>
                {motivosPerda.map((m) => (<option key={m.id} value={m.nome}>{m.nome}</option>))}
              </select>
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={cancelarMotivoPerdaChat} className="text-sm text-slate-500 px-3 py-1.5">Cancelar</button>
              <button disabled={!motivoPerdaChat.motivo} onClick={confirmarMotivoPerdaChat} className="text-sm bg-slate-800 text-white rounded-lg px-3.5 py-1.5 disabled:opacity-40">
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {calcAberta && <CalculadoraRapida onClose={() => setCalcAberta(false)} onUsar={(v) => setText((t) => (t ? t + " " : "") + v)} />}

      {acordoAberto && selected && (
        <AcordoModal
          contactId={selected.id}
          contactName={selected.name}
          valorAberto={Math.round(parcelasAtuais.filter((x) => !x.paid).reduce((sum, x) => sum + Math.max(0, valorParcelaAtual(x, undefined, multaOpts) - (x.valorPago || 0)), 0) * 100) / 100}
          onClose={() => setAcordoAberto(false)}
          onSalvou={() => { setAcordoAberto(false); atualizarFinanceiro(); loadConversations(); }}
        />
      )}

      {pagarParcela && (
        <div className="fixed inset-0 z-[70] bg-slate-900/40 flex items-center justify-center p-4" onClick={() => setPagarParcela(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-800">Valor pago</h3>
            <p className="text-sm text-slate-500">
              {pagarParcela.parcela.number}ª parcela · {money(pagarParcela.parcela.amount)}
              {pagarParcela.atrasada ? " (atrasada)" : ""}. Confira o valor para dar a baixa exata.
            </p>
            <label className="block">
              <span className="text-xs text-slate-400">Valor recebido (R$)</span>
              <input
                type="number" min="0" step="0.01" autoFocus value={pagarParcela.valor}
                onChange={(e) => setPagarParcela((m) => ({ ...m, valor: e.target.value }))}
                className="mt-0.5 w-full text-lg font-semibold border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400"
              />
            </label>
            {pagarParcela.atrasada && (
              <div className="flex gap-2 text-xs">
                <button type="button" onClick={() => setPagarParcela((m) => ({ ...m, valor: (m.parcela.amount * (1 + Number(multaPct) / 100)).toFixed(2) }))} className="flex-1 border border-slate-200 rounded-lg py-1.5 text-slate-600 hover:bg-slate-50">
                  Com juros ({money(pagarParcela.parcela.amount * (1 + Number(multaPct) / 100))})
                </button>
                <button type="button" onClick={() => setPagarParcela((m) => ({ ...m, valor: m.parcela.amount.toFixed(2) }))} className="flex-1 border border-slate-200 rounded-lg py-1.5 text-slate-600 hover:bg-slate-50">
                  Sem juros ({money(pagarParcela.parcela.amount)})
                </button>
              </div>
            )}
            <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer select-none">
              <input type="checkbox" checked={pagarParcela.dinheiro} onChange={(e) => setPagarParcela((m) => ({ ...m, dinheiro: e.target.checked }))} className="accent-emerald-500" />
              Foi em dinheiro (espécie)
            </label>
            <div className="flex gap-2">
              <button disabled={!(Number(pagarParcela.valor) > 0)} onClick={confirmarPagarParcela} className="flex-1 text-sm bg-emerald-500 text-white rounded-lg py-2 hover:bg-emerald-600 disabled:opacity-50">
                Dar baixa · {money(Number(pagarParcela.valor) || 0)}
              </button>
              <button onClick={() => setPagarParcela(null)} className="px-3 text-sm text-slate-500 hover:text-slate-700">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {juntarModal && (
        <div className="fixed inset-0 z-[70] bg-slate-900/40 flex items-center justify-center p-4" onClick={() => setJuntarModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-800">Baixa em valor único</h3>
            <p className="text-sm text-slate-500">
              O valor é aplicado a partir da {Math.min(...(contact?.parcelas || []).filter((x) => juntarSel.includes(x.id)).map((x) => x.number))}ª parcela e segue nas próximas em aberto, na ordem.
            </p>
            <label className="block">
              <span className="text-xs text-slate-400">Valor recebido (R$)</span>
              <input
                type="number" min="0" step="0.01" autoFocus value={juntarModal.valor}
                onChange={(e) => setJuntarModal((m) => ({ ...m, valor: e.target.value }))}
                className="mt-0.5 w-full text-lg font-semibold border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer select-none">
              <input type="checkbox" checked={juntarModal.dinheiro} onChange={(e) => setJuntarModal((m) => ({ ...m, dinheiro: e.target.checked }))} className="accent-emerald-500" />
              Foi em dinheiro (espécie)
            </label>
            <div className="flex gap-2">
              <button disabled={enviandoJunto || !(Number(juntarModal.valor) > 0)} onClick={confirmarBaixaJunta} className="flex-1 text-sm bg-emerald-500 text-white rounded-lg py-2 hover:bg-emerald-600 disabled:opacity-50">
                {enviandoJunto ? "Registrando…" : `Dar baixa · ${money(Number(juntarModal.valor) || 0)}`}
              </button>
              <button onClick={() => setJuntarModal(null)} className="px-3 text-sm text-slate-500 hover:text-slate-700">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {editVenc && (
        <div className="fixed inset-0 z-[70] bg-slate-900/40 flex items-center justify-center p-4" onClick={() => setEditVenc(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-800">Mudar vencimento — {editVenc.parcela.number}ª parcela</h3>
            <label className="block">
              <span className="text-xs text-slate-400">Nova data</span>
              <input type="date" autoFocus value={editVenc.novo} onChange={(e) => setEditVenc((f) => ({ ...f, novo: e.target.value }))} className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400" />
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {[{ label: "Amanhã", dias: 1 }, { label: "1 semana", dias: 7 }, { label: "1 mês", dias: 30 }].map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    onClick={() => { const d = new Date(); d.setDate(d.getDate() + a.dias); setEditVenc((f) => ({ ...f, novo: d.toLocaleDateString("en-CA") })); }}
                    className="text-xs rounded-full px-3 py-1 border bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:text-emerald-600 transition-colors"
                  >
                    {a.label}
                  </button>
                ))}
                {depoisDaUltima(parcelasAtuais, editVenc.parcela.id) && (
                  <button
                    type="button"
                    title="Joga esta parcela para o dia seguinte à última parcela do ciclo"
                    onClick={() => setEditVenc((f) => ({ ...f, novo: depoisDaUltima(parcelasAtuais, f.parcela.id) }))}
                    className="text-xs rounded-full px-3 py-1 border bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:text-emerald-600 transition-colors"
                  >
                    Depois da última
                  </button>
                )}
              </div>
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">Motivo (obrigatório)</span>
              <input value={editVenc.motivo} onChange={(e) => setEditVenc((f) => ({ ...f, motivo: e.target.value }))} placeholder="Ex.: cliente pediu pra adiar" className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400" />
            </label>
            <div className="flex gap-2">
              <button disabled={salvandoVenc || !editVenc.novo || !editVenc.motivo.trim()} onClick={salvarVencimento} className="flex-1 text-sm bg-emerald-500 text-white rounded-lg py-2 hover:bg-emerald-600 disabled:opacity-50">
                {salvandoVenc ? "Salvando…" : "Salvar"}
              </button>
              <button onClick={() => setEditVenc(null)} className="px-3 text-sm text-slate-500 hover:text-slate-700">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Encaminhar mensagem (item 79) */}
      {encaminharLeadAberto && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4"
          onClick={() => setEncaminharLeadAberto(false)}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">Enviar lead pro chat interno</h3>
              <button onClick={() => setEncaminharLeadAberto(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-slate-500">
                A equipe recebe um card de <strong>{selected?.name}</strong> e consegue abrir a ficha direto de lá.
              </p>
              <label className="block">
                <span className="text-xs text-slate-500">Conversa</span>
                <select
                  value={convInternaAlvo}
                  onChange={(e) => { setConvInternaAlvo(e.target.value); setPendenteDe(""); }}
                  className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-emerald-400"
                >
                  <option value="">— Escolha —</option>
                  {conversasInternas.map((c) => (
                    <option key={c.id} value={c.id}>{c.grupo ? `Grupo: ${c.titulo}` : c.titulo}</option>
                  ))}
                </select>
                {conversasInternas.length === 0 && (
                  <span className="block text-[11px] text-amber-600 mt-1">
                    Você ainda não tem conversa no chat interno — crie uma na aba "Chat interno".
                  </span>
                )}
              </label>
              <label className="block">
                <span className="text-xs text-slate-500">Marcar como pendente para (opcional)</span>
                <select
                  value={pendenteDe}
                  onChange={(e) => setPendenteDe(e.target.value)}
                  disabled={!convInternaAlvo}
                  className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-emerald-400 disabled:bg-slate-50"
                >
                  <option value="">- So encaminhar, sem cobrar ninguem -</option>
                  {(conversasInternas.find((c) => c.id === convInternaAlvo)?.membros || [])
                    .filter((m) => m.id !== meuId)
                    .map((m) => (
                      <option key={m.id} value={m.id}>{m.name} precisa resolver</option>
                    ))}
                </select>
                <span className="block text-[11px] text-slate-400 mt-0.5">
                  Fica pendente ate a pessoa ticar como resolvido no chat interno.
                </span>
              </label>
              <label className="block">
                <span className="text-xs text-slate-500">Mensagem (opcional)</span>
                <textarea
                  value={notaInterna}
                  onChange={(e) => setNotaInterna(e.target.value)}
                  rows={3}
                  placeholder="Ex.: @Fulano dá uma olhada nessa, o cliente sumiu"
                  className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400 resize-none"
                />
              </label>
              <button
                onClick={encaminharLead}
                disabled={!convInternaAlvo || enviandoInterno}
                className="w-full bg-emerald-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50"
              >
                {enviandoInterno ? "Enviando…" : "Enviar"}
              </button>
            </div>
          </div>
        </div>
      )}

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

      {enviarCampoMsg && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={() => setEnviarCampoMsg(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-800 mb-1">Mandar pra qual campo?</h3>
            <p className="text-xs text-slate-400 mb-3 line-clamp-2">"{enviarCampoMsg.body}"</p>
            <div className="space-y-0.5">
              {CAMPOS_ENVIAR.map((c) => (
                <button
                  key={c.chave}
                  type="button"
                  onClick={() => enviarParaCampo(c.chave)}
                  className="w-full text-left text-sm text-slate-700 hover:bg-slate-50 rounded-lg px-2.5 py-2"
                >
                  {c.label}
                </button>
              ))}
            </div>
            <button onClick={() => setEnviarCampoMsg(null)} className="mt-3 text-xs text-slate-400 hover:text-slate-600">Cancelar</button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
