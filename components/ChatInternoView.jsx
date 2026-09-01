"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icone from "@/components/Icones";
import ContactModal from "@/components/ContactModal";

// Emojis mais usados no dia a dia da equipe. Lista fixa de propósito: um
// seletor completo exigiria biblioteca externa (centenas de KB) pra um chat
// interno de 4 pessoas.
const EMOJIS = [
  "👍", "👎", "👌", "🙏", "👏", "💪", "🤝", "✅", "❌", "⚠️",
  "🔥", "🎯", "💰", "📌", "📎", "⏰", "🚀", "✨", "💡", "📊",
  "😀", "😅", "😂", "🙂", "😉", "😍", "🤔", "😐", "😴", "🥳",
  "😢", "😡", "😱", "🤯", "🫡", "🤞", "👀", "❤️", "🎉", "☕",
];

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

// Resumo curto de uma mensagem, pro bloco de citação (a original pode ser só
// um anexo, sem texto nenhum).
function resumo(m) {
  if (m?.body) return m.body.length > 80 ? m.body.slice(0, 80) + "…" : m.body;
  if (m?.mediaKind === "image") return "📷 imagem";
  if (m?.mediaKind === "audio") return "🎤 áudio";
  if (m?.mediaKind === "document") return "📎 arquivo";
  return "mensagem";
}

// Texto com as @mencoes destacadas. Casa do nome mais longo pro mais curto
// pra "@Arthur trabalho" nao virar "@Arthur" + " trabalho" solto.
function TextoComMencoes({ body, mencionados, claro }) {
  if (!body) return null;
  const nomes = (mencionados || []).map((m) => m.name).sort((a, b) => b.length - a.length);
  if (!nomes.length) return <p className="whitespace-pre-wrap break-words">{body}</p>;

  // Varredura manual em vez de regex: os nomes vêm do cadastro e podem ter
  // qualquer caractere (ponto, parêntese, emoji), o que quebraria um regex
  // montado com eles.
  const partes = [];
  const minusculo = body.toLowerCase();
  let i = 0;
  let buffer = "";
  while (i < body.length) {
    let achou = null;
    if (body[i] === "@") {
      for (const nome of nomes) {
        if (minusculo.startsWith("@" + nome.toLowerCase(), i)) {
          achou = body.slice(i, i + 1 + nome.length);
          break;
        }
      }
    }
    if (achou) {
      if (buffer) { partes.push({ texto: buffer }); buffer = ""; }
      partes.push({ texto: achou, mencao: true });
      i += achou.length;
    } else {
      buffer += body[i];
      i += 1;
    }
  }
  if (buffer) partes.push({ texto: buffer });

  return (
    <p className="whitespace-pre-wrap break-words">
      {partes.map((p, idx) =>
        p.mencao ? (
          <span
            key={idx}
            className={`font-semibold rounded px-0.5 ${claro ? "text-sky-700 bg-sky-100" : "text-white bg-emerald-600/60"}`}
          >
            {p.texto}
          </span>
        ) : (
          <span key={idx}>{p.texto}</span>
        )
      )}
    </p>
  );
}

// Cores/rotulo por prioridade da pendencia. null = pendencia antiga (de antes
// do campo existir) e cai em "media".
const PRIORIDADE = {
  urgente: { rotulo: "URGENTE", badge: "bg-red-600 text-white", caixa: "bg-red-50 border-red-400" },
  media: { rotulo: "Média", badge: "bg-amber-400 text-white", caixa: "bg-amber-50 border-amber-300" },
  baixa: { rotulo: "Baixa", badge: "bg-slate-300 text-slate-700", caixa: "bg-slate-50 border-slate-300" },
};
const estiloPrioridade = (p) => PRIORIDADE[p] || PRIORIDADE.media;

// Lead encaminhada pro chat interno: card clicavel que abre a ficha completa.
function CardLead({ contact, onAbrir, claro }) {
  if (!contact) return null;
  return (
    <button
      type="button"
      onClick={() => onAbrir(contact.id)}
      className={`mt-1 w-full text-left rounded-lg border px-2.5 py-2 transition-colors ${
        claro ? "bg-white border-slate-200 hover:border-emerald-300" : "bg-emerald-600/40 border-emerald-300 hover:bg-emerald-600/60"
      }`}
    >
      <p className={`text-[10px] font-semibold ${claro ? "text-slate-400" : "text-emerald-100"}`}>LEAD</p>
      <p className={`text-sm font-medium truncate ${claro ? "text-slate-800" : "text-white"}`}>{contact.name}</p>
      <p className={`text-[11px] truncate ${claro ? "text-slate-500" : "text-emerald-50"}`}>
        {contact.phone || "sem telefone"}
        {contact.stage?.name ? ` · ${contact.stage.name}` : ""}
        {contact.valorCapital ? ` · R$ ${contact.valorCapital}` : ""}
      </p>
      <p className={`text-[10px] mt-0.5 underline ${claro ? "text-emerald-600" : "text-emerald-100"}`}>abrir ficha</p>
    </button>
  );
}

// Anexo dentro do balão: imagem abre em nova aba, áudio toca ali, resto vira
// link de download.
function Anexo({ m }) {
  if (!m.mediaUrl) return null;
  if (m.mediaKind === "image") {
    return (
      <a href={m.mediaUrl} target="_blank" rel="noreferrer" className="block mt-1">
        <img src={m.mediaUrl} alt={m.mediaNome || "imagem"} className="rounded-lg max-h-64 max-w-full" />
      </a>
    );
  }
  if (m.mediaKind === "audio") {
    return <audio controls src={m.mediaUrl} className="mt-1 max-w-full" />;
  }
  return (
    <a
      href={m.mediaUrl}
      target="_blank"
      rel="noreferrer"
      className="mt-1 flex items-center gap-1.5 text-xs underline break-all"
    >
      <Icone nome="clipe" className="w-3.5 h-3.5 shrink-0" />
      {m.mediaNome || "arquivo"}
    </a>
  );
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
  const [prioridade, setPrioridade] = useState("media");
  const [respondendo, setRespondendo] = useState(null);
  const [novaAberta, setNovaAberta] = useState(false);
  const [novoGrupo, setNovoGrupo] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoMembros, setNovoMembros] = useState([]);
  const [erro, setErro] = useState("");
  const [soPendentes, setSoPendentes] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [leadAberta, setLeadAberta] = useState(null);
  const [sugestoes, setSugestoes] = useState([]);
  const [emojiAberto, setEmojiAberto] = useState(false);
  const [pendencias, setPendencias] = useState([]);
  const [listaPendAberta, setListaPendAberta] = useState(false);
  const [destacada, setDestacada] = useState(null);
  const fimRef = useRef(null);
  const selRef = useRef(null);
  const fileRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  useEffect(() => {
    selRef.current = selecionada;
  }, [selecionada]);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)).then(setEu).catch(() => {});
    fetch("/api/users").then((r) => r.json()).then((u) => setUsuarios(Array.isArray(u) ? u : [])).catch(() => {});
  }, []);

  const carregarConversas = useCallback(async () => {
    const [d, p] = await Promise.all([
      fetch("/api/chat-interno").then((r) => r.json()).catch(() => []),
      fetch("/api/chat-interno/pendencias").then((r) => r.json()).catch(() => []),
    ]);
    setConversas(Array.isArray(d) ? d : []);
    setPendencias(Array.isArray(p) ? p : []);
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
      setRespondendo(null);
      carregarDetalhe(selecionada);
    }
  }, [selecionada, carregarDetalhe]);

  useEffect(() => {
    // Com uma pendência escolhida, rola até ELA em vez do fim da conversa.
    if (destacada) {
      const el = document.getElementById(`msg-${destacada}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        const t = setTimeout(() => setDestacada(null), 4000);
        return () => clearTimeout(t);
      }
      return;
    }
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [detalhe?.mensagens?.length, destacada]);

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

  // Envio único pra texto e anexo: com arquivo vai multipart, sem arquivo vai
  // JSON. Nos dois casos leva junto a citação e o "cobrar de".
  async function enviarMensagem({ file = null, corpo = "" } = {}) {
    if (!selecionada) return;
    setEnviando(true);
    setErro("");
    let res;
    if (file) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("body", corpo);
      if (cobrarDe) { fd.append("atribuidoAId", cobrarDe); fd.append("prioridade", prioridade); }
      if (respondendo?.id) fd.append("respondeAId", respondendo.id);
      res = await fetch(`/api/chat-interno/${selecionada}`, { method: "POST", body: fd });
    } else {
      res = await fetch(`/api/chat-interno/${selecionada}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: corpo,
          atribuidoAId: cobrarDe || null,
          prioridade: cobrarDe ? prioridade : null,
          respondeAId: respondendo?.id || null,
        }),
      });
    }
    setEnviando(false);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErro(d.error || "Não foi possível enviar.");
      return;
    }
    setTexto("");
    setCobrarDe("");
    setPrioridade("media");
    setEmojiAberto(false);
    setRespondendo(null);
    setSugestoes([]);
    carregarDetalhe(selecionada);
    carregarConversas();
  }

  function enviarTexto(e) {
    e?.preventDefault();
    if (!texto.trim()) return;
    enviarMensagem({ corpo: texto });
  }

  function escolherArquivo(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) enviarMensagem({ file, corpo: texto });
  }

  // Colar print (Ctrl+V) direto no campo — só intercepta quando o clipboard
  // tem imagem; texto colado continua indo pro campo normalmente.
  function aoColar(e) {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
    if (!item) return;
    e.preventDefault();
    const file = item.getAsFile();
    if (file) enviarMensagem({ file, corpo: texto });
  }

  async function gravarAudio() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (ev) => ev.data.size && chunksRef.current.push(ev.data);
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        enviarMensagem({ file: new File([blob], `audio-${Date.now()}.webm`, { type: "audio/webm" }) });
        streamRef.current?.getTracks().forEach((t) => t.stop());
      };
      rec.start();
      recorderRef.current = rec;
      setGravando(true);
    } catch {
      setErro("Não foi possível acessar o microfone.");
    }
  }

  function pararAudio() {
    recorderRef.current?.stop();
    setGravando(false);
  }

  // Abre a conversa da pendência e destaca a mensagem, pra pessoa cair
  // direto no que estão esperando dela em vez de procurar na conversa.
  function abrirPendencia(p) {
    setListaPendAberta(false);
    setSoPendentes(false);
    setDestacada(p.id);
    setSelecionada(p.conversaId);
  }

  // Liga pra pessoa. Só em conversa direta: chamada em grupo precisaria de
  // servidor de mídia (SFU), que é outra ordem de complexidade.
  async function ligar(video) {
    const alvo = (detalhe?.membros || []).find((m) => m.id !== eu?.id);
    if (!alvo) return;
    const res = await fetch("/api/chamadas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paraId: alvo.id, video }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) setErro(d.error || "Não foi possível ligar.");
    // Quem atende e a janela da chamada são cuidados pelo ChamadaWatcher,
    // que roda no app inteiro — inclusive pra quem ligou.
  }

  async function apagarMensagem(msg) {
    if (!confirm("Apagar esta mensagem?")) return;
    const res = await fetch(`/api/chat-interno/mensagens/${msg.id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErro(d.error || "Não foi possível apagar.");
      return;
    }
    carregarDetalhe(selecionada);
    carregarConversas();
  }

  async function excluirConversa() {
    if (!confirm("Excluir esta conversa e todas as mensagens dela? Não dá pra desfazer.")) return;
    const res = await fetch(`/api/chat-interno/${selecionada}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErro(d.error || "Não foi possível excluir.");
      return;
    }
    setSelecionada(null);
    setDetalhe(null);
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
    if (!soPendentes) return ms;
    // No modo "só pendentes" o que importa é o que queima primeiro, não a
    // ordem cronológica: urgente no topo, depois média, depois baixa.
    const peso = { urgente: 0, media: 1, baixa: 2 };
    return ms
      .filter((m) => m.atribuidoAId && !m.resolvido)
      .sort((a, b) => (peso[a.prioridade] ?? 1) - (peso[b.prioridade] ?? 1));
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
          {pendencias.length > 0 && (
            <div className="mt-1.5">
              <button
                onClick={() => setListaPendAberta((v) => !v)}
                className="w-full text-left text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 hover:bg-amber-100 flex items-center justify-between gap-2"
              >
                <span>
                  {pendencias.length} pedido{pendencias.length > 1 ? "s" : ""} esperando você resolver
                </span>
                <span className="shrink-0 text-amber-600">{listaPendAberta ? "ocultar" : "ver"}</span>
              </button>
              {listaPendAberta && (
                <ul className="mt-1 space-y-1 max-h-56 overflow-y-auto thin-scroll">
                  {pendencias.map((p) => (
                    <li key={p.id}>
                      <button
                        onClick={() => abrirPendencia(p)}
                        className="w-full text-left rounded border border-slate-200 bg-white px-2 py-1.5 hover:border-emerald-300"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${estiloPrioridade(p.prioridade).badge}`}>
                            {estiloPrioridade(p.prioridade).rotulo}
                          </span>
                          <span className="text-[10px] text-slate-400 truncate">
                            {p.grupo ? p.conversaTitulo : p.autor}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-700 truncate mt-0.5">
                          {p.body || (p.mediaKind ? "(anexo)" : "(sem texto)")}
                        </p>
                        {p.lead && <p className="text-[10px] text-emerald-600 truncate">lead: {p.lead.name}</p>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
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
                      ? `${c.grupo && c.ultimaMensagem.autor ? c.ultimaMensagem.autor + ": " : ""}${c.ultimaMensagem.body || "anexo"}`
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
                  {c.mencoes > 0 && (
                    <span className="bg-sky-500 text-white text-[10px] rounded-full px-1.5 py-0.5" title="Te marcaram">
                      @{c.mencoes}
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
              {!detalhe?.grupo && (
                <>
                  <button
                    onClick={() => ligar(false)}
                    title="Ligar (voz)"
                    className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-emerald-600 hover:border-emerald-300"
                  >
                    <Icone nome="cobranca" className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => ligar(true)}
                    title="Chamada de vídeo (dá pra espelhar a tela)"
                    className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-emerald-600 hover:border-emerald-300"
                  >
                    <Icone nome="video" className="w-4 h-4" />
                  </button>
                </>
              )}
              <button
                onClick={excluirConversa}
                title="Excluir esta conversa"
                className="shrink-0 text-xs rounded-full px-2.5 py-1 border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-300"
              >
                Excluir
              </button>
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
                const claro = pedido || !minha;
                return (
                  <div
                    key={m.id}
                    id={`msg-${m.id}`}
                    className={`group flex ${minha ? "justify-end" : "justify-start"} ${
                      destacada === m.id ? "ring-2 ring-sky-400 rounded-xl" : ""
                    }`}
                  >
                    <div
                      className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${
                        pedido
                          ? m.resolvido
                            ? "bg-emerald-50 border border-emerald-200 text-slate-700"
                            : `border ${estiloPrioridade(m.prioridade).caixa} text-slate-800`
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
                        <p className="text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1 flex-wrap">
                          <Icone nome="alerta" className="w-3 h-3" />
                          Pedido para {m.atribuidoA?.name}
                          {!m.resolvido && (
                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${estiloPrioridade(m.prioridade).badge}`}>
                              {estiloPrioridade(m.prioridade).rotulo}
                            </span>
                          )}
                          {m.resolvido && <span className="text-emerald-700">· resolvido</span>}
                        </p>
                      )}
                      {m.respondeA && (
                        <div
                          className={`mb-1 border-l-2 pl-2 py-0.5 text-[11px] rounded ${
                            claro ? "border-slate-300 bg-slate-100/70 text-slate-500" : "border-emerald-200 bg-emerald-400/30 text-emerald-50"
                          }`}
                        >
                          <span className="font-semibold">{m.respondeA.autor?.name}</span>: {resumo(m.respondeA)}
                        </div>
                      )}
                      {m.apagada ? (
                        <p className={`italic ${claro ? "text-slate-400" : "text-emerald-100"}`}>Mensagem apagada</p>
                      ) : (
                        <>
                          <TextoComMencoes body={m.body} mencionados={m.mencionados} claro={claro} />
                          <CardLead contact={m.contact} onAbrir={setLeadAberta} claro={claro} />
                          <Anexo m={m} />
                        </>
                      )}
                      <div
                        className={`flex items-center gap-2 mt-1 text-[10px] ${minha && !pedido ? "text-emerald-100" : "text-slate-400"}`}
                      >
                        <span>
                          {fmtDia(m.createdAt)} {fmtHora(m.createdAt)}
                        </span>
                        {m.resolvido && m.resolvidoPor && <span className="text-emerald-600">✓ {m.resolvidoPor}</span>}
                        {!m.apagada && (
                          <>
                            <button
                              onClick={() => setRespondendo(m)}
                              className={`opacity-0 group-hover:opacity-100 transition-opacity underline ${claro ? "text-slate-500" : "text-emerald-100"}`}
                            >
                              responder
                            </button>
                            {(minha || eu?.role === "admin") && (
                              <button
                                onClick={() => apagarMensagem(m)}
                                className={`opacity-0 group-hover:opacity-100 transition-opacity underline ${claro ? "text-red-400 hover:text-red-600" : "text-emerald-100"}`}
                              >
                                apagar
                              </button>
                            )}
                          </>
                        )}
                      </div>
                      {pedido && !m.apagada && (
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

            <form onSubmit={enviarTexto} className="p-3 bg-white border-t border-slate-200 shrink-0 space-y-2">
              {respondendo && (
                <div className="flex items-center gap-2 bg-slate-100 border-l-2 border-emerald-400 rounded px-2 py-1.5">
                  <div className="min-w-0 flex-1 text-[11px] text-slate-600">
                    <span className="font-semibold">Respondendo {respondendo.autor?.name}:</span> {resumo(respondendo)}
                  </div>
                  <button
                    type="button"
                    onClick={() => setRespondendo(null)}
                    className="shrink-0 text-slate-400 hover:text-slate-600 text-sm leading-none"
                  >
                    ×
                  </button>
                </div>
              )}
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
                {cobrarDe && (
                  <select
                    value={prioridade}
                    onChange={(e) => setPrioridade(e.target.value)}
                    className="shrink-0 text-xs border border-slate-200 rounded px-2 py-1.5 bg-white outline-none focus:border-emerald-400"
                  >
                    <option value="baixa">Baixa</option>
                    <option value="media">Média</option>
                    <option value="urgente">Urgente</option>
                  </select>
                )}
              </div>
              {sugestoes.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {sugestoes.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        // Troca o "@parcial" que a pessoa digitou pelo nome completo
                        setTexto((t) => t.replace(/@[^@]*$/, `@${u.name} `));
                        setSugestoes([]);
                      }}
                      className="text-[11px] rounded-full px-2 py-0.5 bg-sky-100 text-sky-700 hover:bg-sky-200"
                    >
                      @{u.name}
                    </button>
                  ))}
                </div>
              )}
              {emojiAberto && (
                <div className="flex flex-wrap gap-1 bg-slate-50 border border-slate-200 rounded-lg p-2 max-h-32 overflow-y-auto thin-scroll">
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => setTexto((t) => t + e)}
                      className="text-lg leading-none rounded px-1 py-0.5 hover:bg-slate-200"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2 items-center">
                <button
                  type="button"
                  onClick={() => setEmojiAberto((v) => !v)}
                  title="Emojis"
                  className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-lg border text-lg leading-none ${
                    emojiAberto ? "bg-amber-50 border-amber-300" : "border-slate-200 hover:border-emerald-300"
                  }`}
                >
                  🙂
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,image/gif,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.zip,.rar"
                  onChange={escolherArquivo}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={enviando}
                  title="Anexar imagem, GIF, PDF ou arquivo"
                  className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-emerald-600 hover:border-emerald-300 disabled:opacity-50"
                >
                  <Icone nome="clipe" className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={gravando ? pararAudio : gravarAudio}
                  disabled={enviando}
                  title={gravando ? "Parar e enviar o áudio" : "Gravar áudio"}
                  className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-lg border disabled:opacity-50 ${
                    gravando
                      ? "bg-red-500 border-red-500 text-white animate-pulse"
                      : "border-slate-200 text-slate-500 hover:text-emerald-600 hover:border-emerald-300"
                  }`}
                >
                  <Icone nome={gravando ? "parar" : "microfone"} className="w-4 h-4" />
                </button>
                <input
                  value={texto}
                  onChange={(e) => {
                    const v = e.target.value;
                    setTexto(v);
                    // Sugere membros enquanto a pessoa digita depois do @
                    const m = v.match(/@([^@]*)$/);
                    if (!m) return setSugestoes([]);
                    const busca = m[1].toLowerCase();
                    setSugestoes(
                      (detalhe?.membros || [])
                        .filter((x) => x.id !== eu?.id && x.name.toLowerCase().includes(busca))
                        .slice(0, 5)
                    );
                  }}
                  onPaste={aoColar}
                  placeholder={gravando ? "Gravando… clique no quadrado pra enviar" : "Escreva ou cole um print (Ctrl+V)…"}
                  className="flex-1 min-w-0 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400"
                />
                <button
                  disabled={enviando || !texto.trim()}
                  className="shrink-0 bg-emerald-500 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50"
                >
                  {enviando ? "…" : "Enviar"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>

      {leadAberta && (
        <ContactModal
          contactId={leadAberta}
          onClose={() => setLeadAberta(null)}
          onChanged={() => carregarDetalhe(selecionada)}
        />
      )}
    </div>
  );
}
