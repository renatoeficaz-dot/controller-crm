"use client";

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import ContactModal from "./ContactModal";

// Iniciais para o avatar do contato
function initials(name) {
  return (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

// Data de hoje (local) como "YYYY-MM-DD"
function todayStr() {
  return new Date().toLocaleDateString("en-CA");
}

const money = (n) =>
  "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Soma das parcelas do ciclo atual que ainda não foram marcadas como pagas
// (o valor que falta receber desse lead).
function valorAReceber(contact) {
  const ciclo = contact.cicloAtual || 1;
  return (contact.parcelas || [])
    .filter((p) => (p.ciclo || 1) === ciclo && !p.paid)
    .reduce((sum, p) => sum + p.amount, 0);
}

// Situação de cobrança do contato:
//  "atrasado" = tem parcela vencida e não baixada
//  "hoje"     = tem parcela que vence hoje e não baixada
//  "emdia"    = tem plano de parcelas, sem atraso nem vencimento hoje
//  "sem"      = não tem plano de parcelas (ainda não está em cobrança)
function situacaoContato(contact) {
  const parcelas = contact.parcelas || [];
  if (parcelas.length === 0) return "sem";
  const hoje = todayStr();
  let vencida = false;
  let hojeVence = false;
  for (const p of parcelas) {
    if (p.paid) continue;
    const d = new Date(p.dueDate).toISOString().slice(0, 10); // UTC
    if (d < hoje) vencida = true;
    else if (d === hoje) hojeVence = true;
  }
  if (vencida) return "atrasado";
  if (hojeVence) return "hoje";
  return "emdia";
}

// Situação das tarefas (pendentes) do contato:
//  "sem"      = nenhuma tarefa pendente cadastrada
//  "atrasada" = tem tarefa pendente com prazo já vencido
//  "hoje"     = tem tarefa pendente que vence hoje
//  "futura"   = só tem tarefas pendentes com prazo futuro
function statusTarefas(contact) {
  const tarefas = contact.tarefasPendentes || [];
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

// Estilo do card por situação
const CARD_STYLE = {
  atrasado: "border-red-400 bg-red-50 hover:border-red-500",
  hoje: "border-amber-400 bg-amber-50 hover:border-amber-500",
  base: "border-slate-200 bg-white hover:border-emerald-300",
};

// Opções de filtro (multi-seleção) por situação
const FILTRO_OPCOES = [
  { label: "Atrasados", sit: "atrasado", dot: "bg-red-500" },
  { label: "Vencem hoje", sit: "hoje", dot: "bg-amber-400" },
  { label: "Em dia", sit: "emdia", dot: "bg-emerald-500" },
];

export default function KanbanBoard() {
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [dragging, setDragging] = useState(null); // { contactId, fromStageId }
  const [overStage, setOverStage] = useState(null);
  const [openId, setOpenId] = useState(null); // contato aberto no modal
  const [cardMenuId, setCardMenuId] = useState(null); // contato com o menu (⋮) do card aberto
  const [cardMenuPos, setCardMenuPos] = useState(null); // { top, left } do menu — calculado do botão, renderizado via portal (evita ser cortado pelo scroll da coluna)
  const [moveSubmenuId, setMoveSubmenuId] = useState(null); // contato com o submenu "Mover para" aberto
  const [adding, setAdding] = useState(null); // stageId onde estou adicionando
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [notify, setNotify] = useState("");
  const [filtros, setFiltros] = useState([]); // situações selecionadas; vazio = todos
  const [busca, setBusca] = useState(""); // nome ou telefone
  const [ordem, setOrdem] = useState("recentes"); // "recentes" | "antigas" — ordenação dos cards por última mensagem
  const [respFiltro, setRespFiltro] = useState(""); // "" = todos; "__none__" = sem responsável
  const [usuarios, setUsuarios] = useState([]);
  const [tags, setTags] = useState([]);
  const [tagFiltro, setTagFiltro] = useState(""); // "" = todas; tagId = só leads com essa tag
  const [estadoFiltro, setEstadoFiltro] = useState(""); // "" = todos; UF = só leads desse estado
  const [generoFiltro, setGeneroFiltro] = useState(""); // "" = todos; "masculino" | "feminino"
  const [tipoClienteFiltro, setTipoClienteFiltro] = useState(""); // "" = todos; "motoboy" | "uber" | "comerciante"
  const [tarefaFiltro, setTarefaFiltro] = useState(""); // "" = todas; "sem" | "atrasada" | "hoje" | "futura"
  const [bulkAction, setBulkAction] = useState(""); // "", stage, responsavel, unit, delete
  const [bulkValue, setBulkValue] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  function toggleFiltro(sit) {
    setFiltros((prev) =>
      prev.includes(sit) ? prev.filter((s) => s !== sit) : [...prev, sit]
    );
  }

  function flash(msg) {
    setNotify(msg);
    setTimeout(() => setNotify(""), 4000);
  }

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await fetch("/api/stages");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStages(data);
    } catch {
      // Sem isso, uma falha de rede/sessão deixava a tela presa em
      // "Carregando funil…" pra sempre, sem nenhum aviso ou jeito de tentar de novo.
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/users").then((r) => r.json()).then(setUsuarios).catch(() => {});
    fetch("/api/tags").then((r) => r.json()).then(setTags).catch(() => {});
  }, []);

  async function moveContact(contactId, toStageId) {
    // Atualização otimista
    setStages((prev) => {
      let moved;
      const cleaned = prev.map((s) => ({
        ...s,
        contacts: s.contacts.filter((c) => {
          if (c.id === contactId) {
            moved = c;
            return false;
          }
          return true;
        }),
      }));
      return cleaned.map((s) =>
        s.id === toStageId && moved ? { ...s, contacts: [...s.contacts, moved] } : s
      );
    });

    const res = await fetch(`/api/contacts/${contactId}/move`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageId: toStageId }),
    });

    // Se o backend recusar (ex.: regra do capital), reverte recarregando
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      flash(data.error || "Não foi possível mover o contato.");
      load();
    }
  }

  async function removeContact(contactId) {
    if (!confirm("Excluir este contato? Essa ação não pode ser desfeita.")) return;
    setCardMenuId(null);
    await fetch(`/api/contacts/${contactId}`, { method: "DELETE" });
    load();
  }

  function onDrop(toStageId) {
    if (dragging && dragging.fromStageId !== toStageId) {
      const contact = stages
        .flatMap((s) => s.contacts)
        .find((c) => c.id === dragging.contactId);
      const target = stages.find((s) => s.id === toStageId);

      // Trava: só pode ir para "Liberação pagamento" com Valor do capital preenchido
      if (target?.name === "Liberação pagamento" && !contact?.valorCapital) {
        flash("Preencha o Valor do capital antes de mover para Liberação pagamento.");
        setDragging(null);
        setOverStage(null);
        return;
      }

      moveContact(dragging.contactId, toStageId);
    }
    setDragging(null);
    setOverStage(null);
  }

  async function createContact(stageId) {
    if (!newName.trim()) return;
    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, phone: newPhone, stageId }),
    });
    const data = await res.json().catch(() => ({}));
    setNewName("");
    setNewPhone("");
    setAdding(null);
    if (data.existing) {
      flash(`Esse telefone já é o lead "${data.contact.name}" — abrindo o card existente em vez de duplicar.`);
      setOpenId(data.contact.id);
    }
    load();
  }

  // UFs presentes na base (pra só mostrar no seletor o que existe de fato).
  const estadosDisponiveis = Array.from(
    new Set(stages.flatMap((s) => s.contacts.map((c) => c.estado).filter(Boolean)))
  ).sort();

  // Um lead passa pelo filtro atual (situação + responsável + região + busca)?
  function passaFiltro(c) {
    if (filtros.length && !filtros.includes(situacaoContato(c))) return false;
    if (respFiltro === "__none__" && c.responsavel) return false;
    if (respFiltro && respFiltro !== "__none__" && c.responsavel !== respFiltro) return false;
    if (tagFiltro && !(c.tags || []).some((t) => t.id === tagFiltro)) return false;
    if (estadoFiltro && c.estado !== estadoFiltro) return false;
    if (generoFiltro && c.genero !== generoFiltro) return false;
    if (tipoClienteFiltro && c.tipoCliente !== tipoClienteFiltro) return false;
    if (tarefaFiltro && statusTarefas(c) !== tarefaFiltro) return false;
    if (busca.trim()) {
      const termo = busca.trim().toLowerCase();
      const nomeBate = (c.name || "").toLowerCase().includes(termo);
      // Telefone: compara só os dígitos, pra achar mesmo se a busca ou o
      // número cadastrado tiver espaço/traço/parênteses/DDI diferente.
      const digitosTermo = termo.replace(/\D/g, "");
      const telefoneBate = digitosTermo && (c.phone || "").replace(/\D/g, "").includes(digitosTermo);
      if (!nomeBate && !telefoneBate) return false;
    }
    return true;
  }

  // Todos os leads visíveis no filtro (somando todas as colunas)
  const leadsFiltrados = stages.flatMap((s) => s.contacts.filter(passaFiltro));

  // Aplica a ação escolhida a TODOS os leads do filtro.
  async function aplicarEmMassa() {
    const ids = leadsFiltrados.map((c) => c.id);
    if (!bulkAction || ids.length === 0) return;
    if (bulkAction === "stage" && !bulkValue) {
      flash("Escolha a coluna de destino.");
      return;
    }
    const labelAcao = {
      stage: "mover de coluna",
      responsavel: "trocar o responsável",
      delete: "EXCLUIR",
    }[bulkAction];
    if (!confirm(`Confirmar: ${labelAcao} de ${ids.length} lead(s) do filtro?`)) return;

    setBulkBusy(true);
    const res = await fetch("/api/contacts/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, action: bulkAction, value: bulkValue || null }),
    });
    setBulkBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      flash(data.error || "Falha na ação em massa.");
      return;
    }
    if (data.skipped) {
      flash(`${data.moved} movido(s); ${data.skipped} sem Valor do capital foram ignorados.`);
    }
    setBulkAction("");
    setBulkValue("");
    load();
  }

  if (loading) {
    return <div className="p-6 text-slate-400">Carregando funil…</div>;
  }

  if (loadError) {
    return (
      <div className="p-6 text-slate-500">
        <p className="mb-2">Não foi possível carregar o funil.</p>
        <button
          onClick={() => { setLoading(true); load(); }}
          className="text-sm bg-emerald-500 text-white rounded-lg px-3 py-1.5 hover:bg-emerald-600"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  const totalContatos = stages.reduce((s, st) => s + st.contacts.length, 0);

  return (
    <>
      {/* Ações do cabeçalho (o título/subtítulo já vêm de app/contatos/page.js) */}
      <div className="flex items-center justify-end gap-2 px-3 md:px-4 pt-3">
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/configuracoes?tab=automacao"
            className="hidden sm:flex items-center gap-1.5 text-xs font-medium border border-slate-200 rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            ⚡ Automatizar funil
          </Link>
          <button
            onClick={() => setAdding(stages[0]?.id)}
            disabled={!stages[0]}
            className="flex items-center gap-1.5 bg-emerald-500 text-white text-sm font-medium rounded-lg px-3.5 py-2 hover:bg-emerald-600 disabled:opacity-50 transition-colors"
          >
            + Novo contato
          </button>
        </div>
      </div>

      {notify && (
        <div className="mx-4 mt-2 rounded-lg bg-amber-50 border border-amber-300 text-amber-700 text-sm px-3 py-2">
          ⚠️ {notify}
        </div>
      )}

      {/* Busca por nome ou telefone */}
      <div className="px-3 md:px-4 pt-3">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou telefone…"
          className="w-full max-w-xs text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:border-emerald-400"
        />
      </div>

      {/* Filtro por situação de cobrança (multi-seleção) */}
      <div className="flex items-center gap-2 px-3 md:px-4 pt-3 flex-wrap overflow-x-auto">
        <span className="text-xs text-slate-400">Filtrar:</span>
        <button
          onClick={() => setFiltros([])}
          className={`text-xs rounded-full px-3 py-1 border transition-colors ${
            filtros.length === 0
              ? "bg-slate-800 text-white border-slate-800"
              : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
          }`}
        >
          Todos
        </button>
        {FILTRO_OPCOES.map(({ label, sit, dot }) => {
          const active = filtros.includes(sit);
          return (
            <button
              key={sit}
              onClick={() => toggleFiltro(sit)}
              className={`flex items-center gap-1.5 text-xs rounded-full px-3 py-1 border transition-colors ${
                active
                  ? "bg-slate-800 text-white border-slate-800"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${dot}`} />
              {label}
            </button>
          );
        })}

        {/* Filtro por responsável */}
        <span className="text-xs text-slate-400 ml-2">Responsável:</span>
        <select
          value={respFiltro}
          onChange={(e) => setRespFiltro(e.target.value)}
          className={`text-xs rounded-full px-3 py-1 border bg-white outline-none transition-colors ${
            respFiltro ? "border-slate-800 text-slate-800" : "border-slate-200 text-slate-600"
          }`}
        >
          <option value="">Todos</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.name}>{u.name}</option>
          ))}
          <option value="__none__">Sem responsável</option>
        </select>

        {/* Filtro por tag */}
        {tags.length > 0 && (
          <>
            <span className="text-xs text-slate-400 ml-2">Tag:</span>
            <select
              value={tagFiltro}
              onChange={(e) => setTagFiltro(e.target.value)}
              className={`text-xs rounded-full px-3 py-1 border bg-white outline-none transition-colors ${
                tagFiltro ? "border-slate-800 text-slate-800" : "border-slate-200 text-slate-600"
              }`}
            >
              <option value="">Todas</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </>
        )}

        {/* Filtro por região (estado do lead, detectado pela IA ou pelo DDD) */}
        {estadosDisponiveis.length > 0 && (
          <>
            <span className="text-xs text-slate-400 ml-2">Região:</span>
            <select
              value={estadoFiltro}
              onChange={(e) => setEstadoFiltro(e.target.value)}
              className={`text-xs rounded-full px-3 py-1 border bg-white outline-none transition-colors ${
                estadoFiltro ? "border-slate-800 text-slate-800" : "border-slate-200 text-slate-600"
              }`}
            >
              <option value="">Todas</option>
              {estadosDisponiveis.map((uf) => (
                <option key={uf} value={uf}>{uf}</option>
              ))}
            </select>
          </>
        )}

        {/* Filtro por gênero */}
        <span className="text-xs text-slate-400 ml-2">Gênero:</span>
        <select
          value={generoFiltro}
          onChange={(e) => setGeneroFiltro(e.target.value)}
          className={`text-xs rounded-full px-3 py-1 border bg-white outline-none transition-colors ${
            generoFiltro ? "border-slate-800 text-slate-800" : "border-slate-200 text-slate-600"
          }`}
        >
          <option value="">Todos</option>
          <option value="masculino">Masculino</option>
          <option value="feminino">Feminino</option>
        </select>

        {/* Filtro por tipo de cliente */}
        <span className="text-xs text-slate-400 ml-2">Tipo de cliente:</span>
        <select
          value={tipoClienteFiltro}
          onChange={(e) => setTipoClienteFiltro(e.target.value)}
          className={`text-xs rounded-full px-3 py-1 border bg-white outline-none transition-colors ${
            tipoClienteFiltro ? "border-slate-800 text-slate-800" : "border-slate-200 text-slate-600"
          }`}
        >
          <option value="">Todos</option>
          <option value="motoboy">Motoboy</option>
          <option value="uber">Uber</option>
          <option value="comerciante">Comerciante</option>
        </select>

        {/* Filtro por situação das tarefas pendentes */}
        <span className="text-xs text-slate-400 ml-2">Tarefas:</span>
        <select
          value={tarefaFiltro}
          onChange={(e) => setTarefaFiltro(e.target.value)}
          className={`text-xs rounded-full px-3 py-1 border bg-white outline-none transition-colors ${
            tarefaFiltro ? "border-slate-800 text-slate-800" : "border-slate-200 text-slate-600"
          }`}
        >
          <option value="">Todas</option>
          <option value="sem">Sem tarefas</option>
          <option value="atrasada">Atrasadas</option>
          <option value="hoje">De hoje</option>
          <option value="futura">A vencer</option>
        </select>

        {/* Ordenação dos cards por última mensagem */}
        <span className="text-xs text-slate-400 ml-2">Ordenar:</span>
        <select
          value={ordem}
          onChange={(e) => setOrdem(e.target.value)}
          className="text-xs rounded-full px-3 py-1 border bg-white border-slate-200 text-slate-600 outline-none transition-colors"
        >
          <option value="recentes">Mais recentes</option>
          <option value="antigas">Mais antigas</option>
        </select>
      </div>

      {/* Ações em massa sobre os leads do filtro */}
      <div className="flex items-center gap-2 px-3 md:px-4 pt-2 flex-wrap overflow-x-auto">
        <span className="text-xs text-slate-400">Em massa:</span>
        <select
          value={bulkAction}
          onChange={(e) => {
            setBulkAction(e.target.value);
            setBulkValue("");
          }}
          className="text-xs rounded-full px-3 py-1 border bg-white border-slate-200 text-slate-600 outline-none focus:border-emerald-400"
        >
          <option value="">— escolher ação —</option>
          <option value="stage">Mover de coluna</option>
          <option value="responsavel">Trocar responsável</option>
          <option value="delete">Excluir</option>
        </select>

        {bulkAction === "stage" && (
          <select
            value={bulkValue}
            onChange={(e) => setBulkValue(e.target.value)}
            className="text-xs rounded-full px-3 py-1 border bg-white border-slate-200 text-slate-600 outline-none focus:border-emerald-400"
          >
            <option value="">— coluna destino —</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
        {bulkAction === "responsavel" && (
          <select
            value={bulkValue}
            onChange={(e) => setBulkValue(e.target.value)}
            className="text-xs rounded-full px-3 py-1 border bg-white border-slate-200 text-slate-600 outline-none focus:border-emerald-400"
          >
            <option value="">— Sem responsável —</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.name}>{u.name}</option>
            ))}
          </select>
        )}
        {bulkAction && (
          <button
            onClick={aplicarEmMassa}
            disabled={bulkBusy || leadsFiltrados.length === 0}
            className={`text-xs rounded-full px-3 py-1 text-white transition-colors disabled:opacity-50 ${
              bulkAction === "delete" ? "bg-red-500 hover:bg-red-600" : "bg-emerald-500 hover:bg-emerald-600"
            }`}
          >
            {bulkBusy ? "Aplicando…" : `Aplicar a ${leadsFiltrados.length} lead(s)`}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-x-auto thin-scroll p-2 md:p-4">
        <div className="flex gap-3 md:gap-4 h-full items-start">
          {stages.map((stage) => {
            const isOver = overStage === stage.id;
            const visiveis = stage.contacts.filter(passaFiltro).sort((a, b) => {
              const da = new Date(a.lastMessageAt || 0);
              const db = new Date(b.lastMessageAt || 0);
              return ordem === "recentes" ? db - da : da - db;
            });
            // Soma do que ainda falta receber (parcelas do ciclo atual não baixadas)
            // e contagem de atrasados/vencem hoje entre os leads visíveis nesta
            // coluna — só faz sentido em "Recebimento".
            const totalAReceber =
              stage.name === "Recebimento"
                ? visiveis.reduce((sum, c) => sum + valorAReceber(c), 0)
                : 0;
            const qtdAtrasados =
              stage.name === "Recebimento"
                ? visiveis.filter((c) => situacaoContato(c) === "atrasado").length
                : 0;
            const qtdHoje =
              stage.name === "Recebimento"
                ? visiveis.filter((c) => situacaoContato(c) === "hoje").length
                : 0;
            return (
              <div
                key={stage.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverStage(stage.id);
                }}
                onDragLeave={() => setOverStage((s) => (s === stage.id ? null : s))}
                onDrop={() => onDrop(stage.id)}
                className={`w-64 md:w-72 shrink-0 rounded-xl bg-slate-100/70 border transition-colors ${
                  isOver ? "border-emerald-400 bg-emerald-50" : "border-slate-200"
                }`}
              >
                {/* Cabeçalho da coluna */}
                <div className="flex flex-col gap-0.5 px-3 py-2.5 border-b border-slate-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ background: stage.color }}
                      />
                      <span className="font-medium text-sm text-slate-700">{stage.name}</span>
                      <span className="text-xs text-slate-400 bg-slate-200 rounded-full px-1.5">
                        {visiveis.length}
                      </span>
                    </div>
                  </div>
                  {stage.name === "Recebimento" && (
                    <div className="flex items-center gap-2 pl-[18px]">
                      <p className="text-xs text-emerald-700 font-medium">
                        A receber: {money(totalAReceber)}
                      </p>
                      {qtdAtrasados > 0 && (
                        <span className="text-[11px] text-red-600 font-medium">
                          {qtdAtrasados} atrasado{qtdAtrasados > 1 ? "s" : ""}
                        </span>
                      )}
                      {qtdHoje > 0 && (
                        <span className="text-[11px] text-amber-600 font-medium">
                          {qtdHoje} hoje
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Cartões */}
                <div className="p-2 flex flex-col gap-2 min-h-[60px] max-h-[calc(100vh-220px)] overflow-y-auto thin-scroll">
                  {visiveis.map((c) => {
                    const sit = situacaoContato(c);
                    const style = CARD_STYLE[sit] || CARD_STYLE.base;
                    // Lead em Recebimento sem nenhuma tarefa cadastrada — provavelmente
                    // o plano de cobrança não gerou as tarefas diárias; precisa de atenção.
                    const semTarefa = stage.name === "Recebimento" && (c.tasksCount || 0) === 0;
                    return (
                      <div
                        key={c.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", c.id);
                          e.dataTransfer.effectAllowed = "move";
                          setDragging({ contactId: c.id, fromStageId: stage.id });
                        }}
                        onDragEnd={() => {
                          setDragging(null);
                          setOverStage(null);
                        }}
                        onClick={() => setOpenId(c.id)}
                        title={semTarefa ? "Lead em Recebimento sem nenhuma tarefa cadastrada" : undefined}
                        className={`group relative rounded-lg border p-3 cursor-pointer hover:shadow-sm transition-all active:cursor-grabbing ${style} ${
                          semTarefa ? "ring-2 ring-red-600" : ""
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="relative w-8 h-8 shrink-0 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold flex items-center justify-center">
                            {initials(c.name)}
                            {c.unreadCount > 0 && (
                              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{c.name}</p>
                          </div>
                          {semTarefa && (
                            <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-600 text-white">
                              Sem tarefa
                            </span>
                          )}
                          {!semTarefa && (sit === "atrasado" || sit === "hoje") && (
                            <span
                              className={`ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                                sit === "atrasado" ? "bg-red-500 text-white" : "bg-amber-400 text-white"
                              }`}
                            >
                              {sit === "atrasado" ? "Atrasado" : "Vence hoje"}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const r = e.currentTarget.getBoundingClientRect();
                              setMoveSubmenuId(null);
                              if (cardMenuId === c.id) {
                                setCardMenuId(null);
                              } else {
                                setCardMenuPos({ top: r.bottom + 4, left: Math.max(8, r.right - 176) });
                                setCardMenuId(c.id);
                              }
                            }}
                            className={`shrink-0 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded px-1 ${(semTarefa || sit === "atrasado" || sit === "hoje") ? "" : "ml-auto"}`}
                          >
                            ⋮
                          </button>
                        </div>

                        {/* Renderizado via portal (fora da coluna, que tem overflow-y-auto e
                            cortava esse menu — "Mover para" simplesmente não aparecia). */}
                        {cardMenuId === c.id && cardMenuPos && createPortal(
                          <>
                            <div className="fixed inset-0 z-30" onClick={() => { setCardMenuId(null); setMoveSubmenuId(null); }} />
                            <div
                              className="fixed z-40 bg-white border border-slate-200 rounded-xl shadow-lg py-1 w-44 text-sm max-h-64 overflow-y-auto thin-scroll"
                              style={{ top: cardMenuPos.top, left: cardMenuPos.left }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button onClick={() => { setCardMenuId(null); setOpenId(c.id); }} className="w-full text-left px-3 py-1.5 text-slate-600 hover:bg-slate-50">
                                Abrir
                              </button>
                              <button
                                onClick={() => setMoveSubmenuId((m) => (m === c.id ? null : c.id))}
                                className="w-full flex items-center justify-between px-3 py-1.5 text-slate-600 hover:bg-slate-50"
                              >
                                Mover para <span className="text-slate-300">{moveSubmenuId === c.id ? "︿" : "›"}</span>
                              </button>
                              {moveSubmenuId === c.id && (
                                <div className="bg-slate-50 border-y border-slate-100 py-1">
                                  {stages.filter((s) => s.id !== stage.id).map((s) => (
                                    <button
                                      key={s.id}
                                      onClick={() => { setCardMenuId(null); setMoveSubmenuId(null); moveContact(c.id, s.id); }}
                                      className="w-full text-left pl-6 pr-3 py-1.5 text-slate-600 hover:bg-slate-100 truncate"
                                    >
                                      {s.name}
                                    </button>
                                  ))}
                                </div>
                              )}
                              <button onClick={() => removeContact(c.id)} className="w-full text-left px-3 py-1.5 text-red-500 hover:bg-slate-50">
                                Excluir
                              </button>
                            </div>
                          </>,
                          document.body
                        )}
                        {(c.tags || []).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {c.tags.map((t) => (
                              <span
                                key={t.id}
                                className="text-[10px] font-medium rounded-full px-1.5 py-0.5 text-white"
                                style={{ backgroundColor: t.color }}
                              >
                                {t.name}
                              </span>
                            ))}
                          </div>
                        )}
                        {c.phone && (
                          <p className="mt-2 text-xs text-slate-500 flex items-center gap-1">
                            <span className="text-emerald-500">●</span> {c.phone}
                            <span className="ml-auto flex items-center gap-1 shrink-0">
                              {c.genero && (
                                <span
                                  className={`text-[10px] font-medium rounded-full px-1.5 py-0.5 ${
                                    c.genero === "feminino" ? "bg-pink-50 text-pink-500" : "bg-sky-50 text-sky-600"
                                  }`}
                                  title={c.genero === "feminino" ? "Feminino" : "Masculino"}
                                >
                                  {c.genero === "feminino" ? "♀" : "♂"}
                                </span>
                              )}
                              {c.estado && (
                                <span className="text-[10px] font-medium bg-slate-100 text-slate-500 rounded-full px-1.5 py-0.5">
                                  📍 {c.estado}
                                </span>
                              )}
                            </span>
                          </p>
                        )}
                        {stage.name === "Recebimento" && (
                          <p className="mt-1 text-xs font-medium text-emerald-700">
                            A receber: {money(valorAReceber(c))}
                          </p>
                        )}
                      </div>
                    );
                  })}

                  {/* Form rápido de novo contato */}
                  {adding === stage.id ? (
                    <div className="bg-white rounded-lg border border-emerald-300 p-2 flex flex-col gap-2">
                      <input
                        autoFocus
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Nome"
                        className="text-sm border border-slate-200 rounded px-2 py-1 outline-none focus:border-emerald-400"
                      />
                      <input
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        placeholder="WhatsApp (5511...)"
                        className="text-sm border border-slate-200 rounded px-2 py-1 outline-none focus:border-emerald-400"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => createContact(stage.id)}
                          className="flex-1 bg-emerald-500 text-white text-sm rounded px-2 py-1 hover:bg-emerald-600"
                        >
                          Adicionar
                        </button>
                        <button
                          onClick={() => {
                            setAdding(null);
                            setNewName("");
                            setNewPhone("");
                          }}
                          className="text-slate-400 text-sm px-2 hover:text-slate-600"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAdding(stage.id)}
                      className="text-sm text-slate-400 hover:text-emerald-600 hover:bg-white rounded-lg py-1.5 transition-colors"
                    >
                      + Adicionar contato
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Rodapé com total (as colunas/cards já respeitam o filtro atual) */}
      <div className="flex items-center justify-end px-3 md:px-4 py-2 border-t border-slate-100 text-xs text-slate-500 shrink-0">
        Total de contatos: <span className="font-medium text-slate-700 ml-1">{totalContatos}</span>
      </div>

      {openId && (
        <ContactModal
          contactId={openId}
          onClose={() => setOpenId(null)}
          onChanged={load}
        />
      )}
    </>
  );
}
