"use client";

import { useEffect, useState, useCallback } from "react";
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
  const [dragging, setDragging] = useState(null); // { contactId, fromStageId }
  const [overStage, setOverStage] = useState(null);
  const [openId, setOpenId] = useState(null); // contato aberto no modal
  const [adding, setAdding] = useState(null); // stageId onde estou adicionando
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [notify, setNotify] = useState("");
  const [filtros, setFiltros] = useState([]); // situações selecionadas; vazio = todos
  const [respFiltro, setRespFiltro] = useState(""); // "" = todos; "__none__" = sem responsável
  const [usuarios, setUsuarios] = useState([]);
  const [unidades, setUnidades] = useState([]); // rutas/unidades para o seletor do card

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
    const res = await fetch("/api/stages");
    const data = await res.json();
    setStages(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/users").then((r) => r.json()).then(setUsuarios).catch(() => {});
    fetch("/api/units").then((r) => r.json()).then(setUnidades).catch(() => {});
  }, []);

  // Define a ruta (unidade) de uma lead direto pelo card
  async function setUnit(contactId, unitId) {
    setStages((prev) =>
      prev.map((s) => ({
        ...s,
        contacts: s.contacts.map((c) => (c.id === contactId ? { ...c, unitId: unitId || null } : c)),
      }))
    );
    await fetch(`/api/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unitId: unitId || null }),
    }).catch(() => {});
  }

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
    await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, phone: newPhone, stageId }),
    });
    setNewName("");
    setNewPhone("");
    setAdding(null);
    load();
  }

  if (loading) {
    return <div className="p-6 text-slate-400">Carregando funil…</div>;
  }

  return (
    <>
      {notify && (
        <div className="mx-4 mt-2 rounded-lg bg-amber-50 border border-amber-300 text-amber-700 text-sm px-3 py-2">
          ⚠️ {notify}
        </div>
      )}

      {/* Filtro por situação de cobrança (multi-seleção) */}
      <div className="flex items-center gap-2 px-4 pt-3 flex-wrap">
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
      </div>

      <div className="flex-1 overflow-x-auto thin-scroll p-4">
        <div className="flex gap-4 h-full items-start">
          {stages.map((stage) => {
            const isOver = overStage === stage.id;
            const visiveis = stage.contacts.filter((c) => {
              if (filtros.length && !filtros.includes(situacaoContato(c))) return false;
              if (respFiltro === "__none__" && c.responsavel) return false;
              if (respFiltro && respFiltro !== "__none__" && c.responsavel !== respFiltro) return false;
              return true;
            });
            return (
              <div
                key={stage.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverStage(stage.id);
                }}
                onDragLeave={() => setOverStage((s) => (s === stage.id ? null : s))}
                onDrop={() => onDrop(stage.id)}
                className={`w-72 shrink-0 rounded-xl bg-slate-100/70 border transition-colors ${
                  isOver ? "border-emerald-400 bg-emerald-50" : "border-slate-200"
                }`}
              >
                {/* Cabeçalho da coluna */}
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-200">
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

                {/* Cartões */}
                <div className="p-2 flex flex-col gap-2 min-h-[60px] max-h-[calc(100vh-220px)] overflow-y-auto thin-scroll">
                  {visiveis.map((c) => {
                    const sit = situacaoContato(c);
                    const style = CARD_STYLE[sit] || CARD_STYLE.base;
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
                        className={`group rounded-lg border p-3 cursor-pointer hover:shadow-sm transition-all active:cursor-grabbing ${style}`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 shrink-0 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold flex items-center justify-center">
                            {initials(c.name)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{c.name}</p>
                          </div>
                          {(sit === "atrasado" || sit === "hoje") && (
                            <span
                              className={`ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                                sit === "atrasado" ? "bg-red-500 text-white" : "bg-amber-400 text-white"
                              }`}
                            >
                              {sit === "atrasado" ? "Atrasado" : "Vence hoje"}
                            </span>
                          )}
                        </div>
                        {c.phone && (
                          <p className="mt-2 text-xs text-slate-500 flex items-center gap-1">
                            <span className="text-emerald-500">●</span> {c.phone}
                          </p>
                        )}

                        {/* Seletor de ruta da lead */}
                        <select
                          value={c.unitId || ""}
                          draggable={false}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            e.stopPropagation();
                            setUnit(c.id, e.target.value);
                          }}
                          className="mt-2 w-full text-xs border border-slate-200 rounded px-1.5 py-1 bg-white text-slate-600 outline-none focus:border-emerald-400 cursor-pointer"
                        >
                          <option value="">— Ruta —</option>
                          {unidades.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.number} - {u.name}
                            </option>
                          ))}
                        </select>
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
