"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import ContactModal from "./ContactModal";

function hojeStr() {
  return new Date().toLocaleDateString("en-CA");
}

// Soma/subtrai dias a uma data "YYYY-MM-DD" (local, sem drift de fuso)
function addDaysStr(str, n) {
  const d = new Date(str + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
}

const EMPTY_FORM = { title: "", notes: "", contactId: "", tipoId: "", dueDate: hojeStr(), dueTime: "09:00" };

export default function TarefasView() {
  const [tasks, setTasks] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fStatus, setFStatus] = useState("pendentes"); // pendentes | todas | concluidas
  const [fTipo, setFTipo] = useState("");
  const [openContactId, setOpenContactId] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [detailTask, setDetailTask] = useState(null); // tarefa aberta no modal de detalhes

  const load = useCallback(async () => {
    const done = fStatus === "pendentes" ? "false" : fStatus === "concluidas" ? "true" : "";
    const q = new URLSearchParams();
    if (done) q.set("done", done);
    if (fTipo) q.set("tipoId", fTipo);
    const data = await fetch(`/api/tasks?${q}`).then((r) => r.json()).catch(() => []);
    setTasks(Array.isArray(data) ? data : []);
  }, [fStatus, fTipo]);

  const loadMeta = useCallback(async () => {
    const [tp, stages] = await Promise.all([
      fetch("/api/task-types").then((r) => r.json()).catch(() => []),
      fetch("/api/stages").then((r) => r.json()).catch(() => []),
    ]);
    setTipos(Array.isArray(tp) ? tp : []);
    const allContacts = (Array.isArray(stages) ? stages : []).flatMap((s) => s.contacts || []);
    setContacts(allContacts.map((c) => ({ id: c.id, name: c.name })));
  }, []);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { load(); }, [load]);

  async function create(e) {
    e.preventDefault();
    setError("");
    if (!form.title.trim() || !form.contactId) {
      setError("Preencha o título e escolha o lead.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, dueDate: `${form.dueDate}T${form.dueTime || "09:00"}:00` }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Erro ao salvar tarefa.");
      return;
    }
    setForm(EMPTY_FORM);
    load();
  }

  // Abre o modal de detalhes com uma cópia editável da tarefa clicada.
  function openDetail(t) {
    const d = new Date(t.dueDate);
    setDetailTask({
      id: t.id,
      title: t.title || "",
      notes: t.notes || "",
      contactId: t.contactId || "",
      contactName: t.contact?.name || "",
      tipoId: t.tipoId || "",
      dueDate: d.toLocaleDateString("en-CA"),
      dueTime: d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      done: t.done,
    });
  }

  async function saveDetailTask() {
    if (!detailTask) return;
    setSaving(true);
    const res = await fetch(`/api/tasks/${detailTask.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: detailTask.title,
        notes: detailTask.notes,
        tipoId: detailTask.tipoId,
        dueDate: `${detailTask.dueDate}T${detailTask.dueTime || "09:00"}:00`,
        done: detailTask.done,
      }),
    });
    setSaving(false);
    if (!res.ok) return;
    setDetailTask(null);
    load();
  }

  async function toggleDone(t) {
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
    await fetch(`/api/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !t.done }),
    });
    load();
  }

  async function remove(id) {
    if (!confirm("Excluir esta tarefa?")) return;
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    if (detailTask?.id === id) setDetailTask(null);
    load();
  }

  const hoje = hojeStr();
  const amanha = addDaysStr(hoje, 1);
  const depois = addDaysStr(hoje, 2);

  // Pipeline: cada tarefa cai numa coluna conforme a data de vencimento.
  const COLUNAS = useMemo(
    () => [
      { key: "atrasadas", label: "Atrasadas", color: "#ef4444", targetDate: addDaysStr(hoje, -1) },
      { key: "hoje", label: "Hoje", color: "#f59e0b", targetDate: hoje },
      { key: "amanha", label: "Amanhã", color: "#0284c7", targetDate: amanha },
      { key: "depois", label: "Depois de amanhã", color: "#7c3aed", targetDate: depois },
      { key: "futuras", label: "Futuras", color: "#64748b", targetDate: addDaysStr(depois, 1) },
    ],
    [hoje, amanha, depois]
  );

  function bucketOf(t) {
    const d = t.dueDate.slice(0, 10);
    if (d < hoje) return "atrasadas";
    if (d === hoje) return "hoje";
    if (d === amanha) return "amanha";
    if (d === depois) return "depois";
    return "futuras";
  }

  const grouped = useMemo(() => {
    const g = { atrasadas: [], hoje: [], amanha: [], depois: [], futuras: [] };
    for (const t of tasks) g[bucketOf(t)].push(t);
    return g;
  }, [tasks, hoje, amanha, depois]);

  // Arrastar um card pra outra coluna reagenda a tarefa pra data daquela
  // coluna, preservando o horário original.
  async function moveTask(taskId, colKey) {
    const t = tasks.find((x) => x.id === taskId);
    const col = COLUNAS.find((c) => c.key === colKey);
    if (!t || !col || bucketOf(t) === colKey) return;
    const horario = new Date(t.dueDate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const novaData = `${col.targetDate}T${horario}:00`;
    setTasks((prev) => prev.map((x) => (x.id === taskId ? { ...x, dueDate: novaData } : x)));
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dueDate: novaData }),
    });
    load();
  }

  return (
    <div className="flex-1 overflow-y-auto thin-scroll p-3 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Tarefas</h1>
        <p className="text-sm text-slate-500 mt-0.5">Tarefas manuais dos leads (além das cobranças automáticas de parcela).</p>
      </div>

      <form onSubmit={create} className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-4 md:p-5 grid md:grid-cols-2 gap-3 max-w-2xl">
        <h2 className="font-medium text-slate-800 md:col-span-2">Nova tarefa</h2>
        <label className="block">
          <span className="text-xs text-slate-400">Título</span>
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Ex.: Ligar pra confirmar endereço"
            className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400"
          />
        </label>
        <label className="block">
          <span className="text-xs text-slate-400">Lead</span>
          <select
            value={form.contactId}
            onChange={(e) => setForm((f) => ({ ...f, contactId: e.target.value }))}
            className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-emerald-400"
          >
            <option value="">— Escolher lead —</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-slate-400">Tipo</span>
          <select
            value={form.tipoId}
            onChange={(e) => setForm((f) => ({ ...f, tipoId: e.target.value }))}
            className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-emerald-400"
          >
            <option value="">— Sem tipo —</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>{t.emoji ? `${t.emoji} ` : ""}{t.name}</option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <label className="block flex-1">
            <span className="text-xs text-slate-400">Data</span>
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400"
            />
          </label>
          <label className="block w-28">
            <span className="text-xs text-slate-400">Horário</span>
            <input
              type="time"
              value={form.dueTime}
              onChange={(e) => setForm((f) => ({ ...f, dueTime: e.target.value }))}
              className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400"
            />
          </label>
        </div>
        <label className="block md:col-span-2">
          <span className="text-xs text-slate-400">Observações (opcional)</span>
          <input
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Detalhes da tarefa…"
            className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400"
          />
        </label>
        {error && <p className="text-xs text-red-500 md:col-span-2">{error}</p>}
        <div className="md:col-span-2 flex gap-2">
          <button
            disabled={saving}
            className="flex-1 bg-emerald-500 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 transition-colors"
          >
            {saving ? "Salvando…" : "Criar tarefa"}
          </button>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        {[
          { key: "pendentes", label: "Pendentes" },
          { key: "concluidas", label: "Concluídas" },
          { key: "todas", label: "Todas" },
        ].map((o) => (
          <button
            key={o.key}
            onClick={() => setFStatus(o.key)}
            className={`text-xs rounded-full px-3 py-1.5 border transition-colors ${
              fStatus === o.key ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
            }`}
          >
            {o.label}
          </button>
        ))}
        <select
          value={fTipo}
          onChange={(e) => setFTipo(e.target.value)}
          className="text-xs border border-slate-200 rounded-full px-3 py-1.5 bg-white outline-none ml-auto"
        >
          <option value="">Todos os tipos</option>
          {tipos.map((t) => (
            <option key={t.id} value={t.id}>{t.emoji ? `${t.emoji} ` : ""}{t.name}</option>
          ))}
        </select>
      </div>

      {/* Pipeline por data de vencimento — arraste um card pra reagendar. */}
      <div className="flex gap-3 overflow-x-auto thin-scroll pb-2">
        {COLUNAS.map((col) => {
          const lista = grouped[col.key] || [];
          const isOver = overCol === col.key;
          return (
            <div
              key={col.key}
              onDragOver={(e) => {
                e.preventDefault();
                setOverCol(col.key);
              }}
              onDragLeave={() => setOverCol((c) => (c === col.key ? null : c))}
              onDrop={() => {
                if (draggingId) moveTask(draggingId, col.key);
                setOverCol(null);
              }}
              className={`w-64 md:w-72 shrink-0 rounded-xl bg-slate-100/70 border transition-colors ${
                isOver ? "border-emerald-400 bg-emerald-50" : "border-slate-200"
              }`}
            >
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-200">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: col.color }} />
                <span className="font-medium text-sm text-slate-700">{col.label}</span>
                <span className="text-xs text-slate-400 bg-slate-200 rounded-full px-1.5">{lista.length}</span>
              </div>

              <div className="p-2 flex flex-col gap-2 min-h-[60px] max-h-[calc(100vh-320px)] overflow-y-auto thin-scroll">
                {lista.map((t) => {
                  const atrasada = !t.done && t.dueDate.slice(0, 10) < hoje;
                  const venceHoje = !t.done && t.dueDate.slice(0, 10) === hoje;
                  const corCard = atrasada
                    ? "border-red-300 bg-red-50 hover:bg-red-100/70"
                    : venceHoje
                    ? "border-amber-300 bg-amber-50 hover:bg-amber-100/70"
                    : "border-slate-200 bg-white hover:bg-slate-50";
                  return (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", t.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDraggingId(t.id);
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setOverCol(null);
                      }}
                      onClick={() => openDetail(t)}
                      className={`group rounded-lg border p-2.5 cursor-pointer active:cursor-grabbing hover:shadow-sm transition-all ${corCard}`}
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={t.done}
                          onChange={(e) => { e.stopPropagation(); toggleDone(t); }}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-0.5 accent-emerald-500 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-medium ${t.done ? "text-slate-400 line-through" : "text-slate-700"}`}>{t.title}</p>
                          <div className="flex items-center gap-1.5 flex-wrap mt-1">
                            {t.tipo && (
                              <span className="text-[10px] font-medium rounded-full px-1.5 py-0.5 text-white shrink-0" style={{ backgroundColor: t.tipo.color }}>
                                {t.tipo.emoji ? `${t.tipo.emoji} ` : ""}{t.tipo.name}
                              </span>
                            )}
                            {atrasada && (
                              <span className="text-[10px] font-medium rounded-full px-1.5 py-0.5 bg-red-600 text-white shrink-0">Atrasada</span>
                            )}
                            {venceHoje && (
                              <span className="text-[10px] font-medium rounded-full px-1.5 py-0.5 bg-amber-500 text-white shrink-0">Hoje</span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 mt-1">
                            {t.contact ? (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setOpenContactId(t.contact.id); }}
                                className="font-medium text-emerald-600 hover:text-emerald-700 hover:underline"
                              >
                                {t.contact.name || "Sem nome"}
                              </button>
                            ) : (
                              "—"
                            )}
                            {" "}· {new Date(t.dueDate).toLocaleDateString("pt-BR")} {new Date(t.dueDate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                          {t.notes && <p className="text-xs text-slate-400 truncate">{t.notes}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 justify-end mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => { e.stopPropagation(); remove(t.id); }} title="Excluir" className="text-xs text-red-400 hover:text-red-600">×</button>
                      </div>
                    </div>
                  );
                })}
                {lista.length === 0 && <p className="text-center text-xs text-slate-400 py-6">Nenhuma tarefa.</p>}
              </div>
            </div>
          );
        })}
      </div>

      {openContactId && (
        <ContactModal
          contactId={openContactId}
          onClose={() => setOpenContactId(null)}
          onChanged={load}
        />
      )}

      {/* Modal de detalhes/edição da tarefa — abre ao clicar num card */}
      {detailTask && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={() => setDetailTask(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-3.5 max-h-[88vh] overflow-y-auto thin-scroll" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-slate-800">Detalhes da tarefa</h3>
              <button onClick={() => setDetailTask(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <label className="block">
              <span className="text-xs text-slate-400">Título</span>
              <input
                value={detailTask.title}
                onChange={(e) => setDetailTask((d) => ({ ...d, title: e.target.value }))}
                className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400"
              />
            </label>
            {detailTask.contactName && (
              <p className="text-xs text-slate-400">
                Lead: <span className="font-medium text-slate-600">{detailTask.contactName}</span>
              </p>
            )}
            <label className="block">
              <span className="text-xs text-slate-400">Tipo</span>
              <select
                value={detailTask.tipoId}
                onChange={(e) => setDetailTask((d) => ({ ...d, tipoId: e.target.value }))}
                className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-emerald-400"
              >
                <option value="">— Sem tipo —</option>
                {tipos.map((t) => (
                  <option key={t.id} value={t.id}>{t.emoji ? `${t.emoji} ` : ""}{t.name}</option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <label className="block flex-1">
                <span className="text-xs text-slate-400">Data</span>
                <input
                  type="date"
                  value={detailTask.dueDate}
                  onChange={(e) => setDetailTask((d) => ({ ...d, dueDate: e.target.value }))}
                  className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400"
                />
              </label>
              <label className="block w-28">
                <span className="text-xs text-slate-400">Horário</span>
                <input
                  type="time"
                  value={detailTask.dueTime}
                  onChange={(e) => setDetailTask((d) => ({ ...d, dueTime: e.target.value }))}
                  className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400"
                />
              </label>
            </div>
            <label className="block">
              <span className="text-xs text-slate-400">Observações / descrição</span>
              <textarea
                value={detailTask.notes}
                onChange={(e) => setDetailTask((d) => ({ ...d, notes: e.target.value }))}
                rows={3}
                placeholder="Detalhes da tarefa…"
                className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400 resize-none"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={detailTask.done}
                onChange={(e) => setDetailTask((d) => ({ ...d, done: e.target.checked }))}
                className="accent-emerald-500"
              />
              Concluída
            </label>
            <div className="flex gap-2 pt-1">
              <button
                onClick={saveDetailTask}
                disabled={saving}
                className="flex-1 bg-emerald-500 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 transition-colors"
              >
                {saving ? "Salvando…" : "Salvar"}
              </button>
              <button
                onClick={() => { remove(detailTask.id); }}
                className="px-4 text-sm text-red-500 hover:text-red-600"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
