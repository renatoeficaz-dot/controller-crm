"use client";

import { useState } from "react";

// Faixa baixa com a tarefa pendente mais urgente do lead, logo acima do envio do chat:
// finalizar, adiar 1/2/3 dias, mudar o horário, editar (título, dia e hora) e excluir.
// `tasks` = todas as tarefas do lead; `onChanged` recarrega a lista; `onCriar` abre o formulário de nova tarefa.
export default function TarefaBarra({ tasks, onChanged, onCriar }) {
  const [modo, setModo] = useState(null); // null | "hora" | "editar"
  const [form, setForm] = useState({ title: "", dia: "", hora: "" });
  const [adiarAberto, setAdiarAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const pend = (tasks || []).filter((t) => !t.done).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  if (pend.length === 0) {
    return (
      <div className="mx-3 mt-2 px-2.5 py-1 rounded-lg border border-dashed border-slate-200 bg-slate-50 text-[11px] text-slate-400 flex items-center justify-between">
        <span>Sem tarefa pendente</span>
        {onCriar && (
          <button type="button" onClick={onCriar} className="text-emerald-600 hover:text-emerald-700 font-medium">+ Tarefa</button>
        )}
      </div>
    );
  }

  const t = pend[0];
  const dt = new Date(t.dueDate);
  const agora = new Date();
  const mesmoDia = dt.toDateString() === agora.toDateString();
  const atrasada = dt < agora && !mesmoDia;
  const situacao = atrasada ? "Atrasadas" : mesmoDia ? "Hoje" : "A vencer";
  const cor = atrasada ? "text-red-600" : mesmoDia ? "text-amber-600" : "text-slate-500";
  const quando = dt.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", "");

  const dia = (d) => d.toLocaleDateString("sv-SE"); // yyyy-mm-dd no fuso do navegador
  const hora = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  async function patch(data) {
    setSalvando(true);
    const res = await fetch(`/api/tasks/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    setSalvando(false);
    if (!res.ok) { alert("Não foi possível salvar a tarefa."); return false; }
    onChanged?.();
    return true;
  }

  // Adiar: conta a partir de hoje quando já venceu (senão 1 dia de adiamento continuaria atrasada), mantendo o horário da tarefa.
  async function adiar(dias) {
    setAdiarAberto(false);
    const base = new Date(dt);
    if (base < agora) {
      base.setFullYear(agora.getFullYear(), agora.getMonth(), agora.getDate());
    }
    base.setDate(base.getDate() + dias);
    await patch({ dueDate: base.toISOString() });
  }

  function abrir(m) {
    setAdiarAberto(false);
    setForm({ title: t.title || "", dia: dia(dt), hora: hora(dt) });
    setModo(m);
  }

  async function salvar(e) {
    e.preventDefault();
    const [h, m] = (form.hora || "09:00").split(":").map(Number);
    const novo = modo === "hora" ? new Date(dt) : new Date(`${form.dia || dia(dt)}T12:00:00`);
    novo.setHours(h || 0, m || 0, 0, 0);
    const data = { dueDate: novo.toISOString() };
    if (modo === "editar") {
      if (!form.title.trim()) return;
      data.title = form.title.trim();
    }
    if (await patch(data)) setModo(null);
  }

  async function excluir() {
    if (!confirm("Excluir esta tarefa?")) return;
    await fetch(`/api/tasks/${t.id}`, { method: "DELETE" });
    onChanged?.();
  }

  const btn = "px-1.5 py-0.5 rounded border border-slate-200 bg-white text-[10px] text-slate-600 hover:border-slate-300 disabled:opacity-50";

  return (
    <div className="mx-3 mt-2 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className={`truncate ${cor}`}>
          <span className="font-semibold">{situacao}</span> · {quando}{t.responsavel ? ` para ${t.responsavel}` : ""}
          {pend.length > 1 && <span className="text-slate-400"> · +{pend.length - 1} pendente{pend.length > 2 ? "s" : ""}</span>}
        </span>
        <button type="button" onClick={excluir} title="Excluir tarefa" className="text-slate-300 hover:text-red-500 shrink-0">🗑</button>
      </div>
      <div className="flex items-center gap-2 mt-0.5">
        <button type="button" disabled={salvando} onClick={() => patch({ done: true })} title="Finalizar tarefa" className="w-4 h-4 rounded-full border border-emerald-400 text-emerald-500 flex items-center justify-center text-[9px] hover:bg-emerald-50 shrink-0">✓</button>
        {t.tipo && (
          <span className="text-[10px] font-medium rounded px-1.5 py-0.5 shrink-0" style={{ backgroundColor: `${t.tipo.color}22`, color: t.tipo.color }}>
            {t.tipo.emoji ? `${t.tipo.emoji} ` : ""}{t.tipo.name}
          </span>
        )}
        <span className="font-medium text-slate-800 truncate" title={t.notes || t.title}>{t.title}</span>
      </div>

      {modo === null && (
        <div className="flex flex-wrap items-center gap-1 mt-1 relative">
          <button type="button" disabled={salvando} onClick={() => patch({ done: true })} className={`${btn} text-emerald-700 border-emerald-200`}>Finalizar</button>
          <span className="relative">
            <button type="button" disabled={salvando} onClick={() => setAdiarAberto((v) => !v)} className={btn}>Adiar ▾</button>
            {adiarAberto && (
              <>
                <span className="fixed inset-0 z-30" onClick={() => setAdiarAberto(false)} />
                <span className="absolute left-0 bottom-6 z-40 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[96px]">
                  {[1, 2, 3].map((d) => (
                    <button key={d} type="button" onClick={() => adiar(d)} className="block w-full text-left px-3 py-1 text-[11px] text-slate-700 hover:bg-slate-50">
                      {d} dia{d > 1 ? "s" : ""}
                    </button>
                  ))}
                </span>
              </>
            )}
          </span>
          <button type="button" onClick={() => abrir("hora")} className={btn}>Horário</button>
          <button type="button" onClick={() => abrir("editar")} className={btn}>Editar</button>
          {onCriar && <button type="button" onClick={onCriar} className={`${btn} ml-auto text-emerald-700`}>+ Tarefa</button>}
        </div>
      )}

      {modo !== null && (
        <form onSubmit={salvar} className="flex items-end gap-1.5 mt-1.5 flex-wrap">
          {modo === "editar" && (
            <>
              <label className="block flex-1 min-w-[140px]">
                <span className="text-[10px] text-slate-400">Título</span>
                <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="mt-0.5 block w-full text-xs border border-slate-200 rounded px-1.5 py-1 bg-white outline-none focus:border-emerald-400" />
              </label>
              <label className="block">
                <span className="text-[10px] text-slate-400">Dia</span>
                <input type="date" value={form.dia} onChange={(e) => setForm((f) => ({ ...f, dia: e.target.value }))} className="mt-0.5 block text-xs border border-slate-200 rounded px-1.5 py-1 bg-white outline-none focus:border-emerald-400" />
              </label>
            </>
          )}
          <label className="block">
            <span className="text-[10px] text-slate-400">Hora</span>
            <input type="time" autoFocus={modo === "hora"} value={form.hora} onChange={(e) => setForm((f) => ({ ...f, hora: e.target.value }))} className="mt-0.5 block text-xs border border-slate-200 rounded px-1.5 py-1 bg-white outline-none focus:border-emerald-400" />
          </label>
          <button disabled={salvando} className="bg-emerald-500 text-white rounded px-2.5 py-1 text-xs hover:bg-emerald-600 disabled:opacity-50">Salvar</button>
          <button type="button" onClick={() => setModo(null)} className="text-xs text-slate-500 hover:text-slate-700 px-1">Cancelar</button>
        </form>
      )}
    </div>
  );
}
