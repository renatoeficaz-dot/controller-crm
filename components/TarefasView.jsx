"use client";

import { useEffect, useState, useCallback } from "react";

function hojeStr() {
  return new Date().toLocaleDateString("en-CA");
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
  const [editingId, setEditingId] = useState(null);

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
    const editando = editingId !== null;
    const res = await fetch(editando ? `/api/tasks/${editingId}` : "/api/tasks", {
      method: editando ? "PATCH" : "POST",
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
    setEditingId(null);
    load();
  }

  function startEdit(t) {
    setEditingId(t.id);
    const d = new Date(t.dueDate);
    setForm({
      title: t.title || "",
      notes: t.notes || "",
      contactId: t.contactId || "",
      tipoId: t.tipoId || "",
      dueDate: d.toLocaleDateString("en-CA"),
      dueTime: d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
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
    if (editingId === id) cancelEdit();
    load();
  }

  const hoje = hojeStr();

  return (
    <div className="flex-1 overflow-y-auto thin-scroll p-3 md:p-6 max-w-4xl space-y-4 md:space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Tarefas</h1>
        <p className="text-sm text-slate-500 mt-0.5">Tarefas manuais dos leads (além das cobranças automáticas de parcela).</p>
      </div>

      <form onSubmit={create} className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-4 md:p-5 grid md:grid-cols-2 gap-3">
        <h2 className="font-medium text-slate-800 md:col-span-2">{editingId ? "Editar tarefa" : "Nova tarefa"}</h2>
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
            {saving ? "Salvando…" : editingId ? "Salvar alterações" : "Criar tarefa"}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit} className="px-4 text-sm text-slate-400 hover:text-slate-600">
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-2 mb-4">
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

        <ul className="divide-y divide-slate-100">
          {tasks.map((t) => {
            const atrasada = !t.done && t.dueDate.slice(0, 10) < hoje;
            return (
              <li key={t.id} className={`flex items-start gap-3 py-2.5 ${editingId === t.id ? "bg-emerald-50/50 -mx-2 px-2 rounded" : ""}`}>
                <input
                  type="checkbox"
                  checked={t.done}
                  onChange={() => toggleDone(t)}
                  className="mt-1 accent-emerald-500 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`text-sm font-medium ${t.done ? "text-slate-400 line-through" : "text-slate-700"}`}>{t.title}</p>
                    {t.tipo && (
                      <span className="text-[10px] font-medium rounded-full px-1.5 py-0.5 text-white shrink-0" style={{ backgroundColor: t.tipo.color }}>
                        {t.tipo.emoji ? `${t.tipo.emoji} ` : ""}{t.tipo.name}
                      </span>
                    )}
                    {atrasada && (
                      <span className="text-[10px] font-medium rounded-full px-1.5 py-0.5 bg-red-100 text-red-600 shrink-0">Atrasada</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    {t.contact?.name || "—"} · vence {new Date(t.dueDate).toLocaleDateString("pt-BR")} às {new Date(t.dueDate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    {t.notes ? ` · ${t.notes}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => startEdit(t)} title="Editar" className="text-xs text-emerald-600 hover:text-emerald-700">✎</button>
                  <button onClick={() => remove(t.id)} title="Excluir" className="text-xs text-red-400 hover:text-red-600">×</button>
                </div>
              </li>
            );
          })}
          {tasks.length === 0 && <li className="py-8 text-center text-sm text-slate-400">Nenhuma tarefa neste filtro.</li>}
        </ul>
      </div>
    </div>
  );
}
