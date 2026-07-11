"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import ContactModal from "./ContactModal";

const money = (n) =>
  "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function inicioMesStr() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString("en-CA");
}
function hojeStr() {
  return new Date().toLocaleDateString("en-CA");
}

const EMPTY_FORM = { type: "entrada", amount: "", description: "", date: hojeStr(), categoriaId: "", bancoId: "", contactId: "" };

const PIE_COLORS = ["#10b981", "#f59e0b", "#6366f1", "#ef4444", "#3b82f6", "#ec4899", "#8b5cf6", "#14b8a6"];

function PieChart({ data, title }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <p className="text-xs text-slate-400 text-center py-4">Sem dados</p>;
  let angle = 0;
  const slices = data.map((d, i) => {
    const pct = d.value / total;
    const start = angle;
    angle += pct * 360;
    return { ...d, pct, start, end: angle, color: PIE_COLORS[i % PIE_COLORS.length] };
  });
  function arc(cx, cy, r, startDeg, endDeg) {
    const s = ((startDeg - 90) * Math.PI) / 180;
    const e = ((endDeg - 90) * Math.PI) / 180;
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${cx + r * Math.cos(s)} ${cy + r * Math.sin(s)} A ${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(e)} ${cy + r * Math.sin(e)} Z`;
  }
  return (
    <div>
      <h3 className="text-xs font-semibold text-slate-700 mb-2 text-center">{title}</h3>
      <svg viewBox="0 0 200 200" className="w-40 h-40 mx-auto">
        {slices.map((s, i) =>
          s.pct >= 0.999 ? (
            <circle key={i} cx={100} cy={100} r={80} fill={s.color} />
          ) : (
            <path key={i} d={arc(100, 100, 80, s.start, s.end)} fill={s.color} />
          )
        )}
      </svg>
      <ul className="mt-2 space-y-0.5">
        {slices.map((s, i) => (
          <li key={i} className="flex items-center gap-2 text-[11px]">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
            <span className="text-slate-600 truncate">{s.name}</span>
            <span className="ml-auto text-slate-500">{(s.pct * 100).toFixed(0)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}


export default function LancamentosView() {
  const [lancamentos, setLancamentos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [bancos, setBancos] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Filtros da listagem
  const [fType, setFType] = useState("");
  const [fCat, setFCat] = useState("");
  const [fBanco, setFBanco] = useState("");
  const [fIni, setFIni] = useState(inicioMesStr());
  const [fFim, setFFim] = useState(hojeStr());
  const [buscaLanc, setBuscaLanc] = useState("");

  // Cadastro rápido de categoria / banco
  const [newCat, setNewCat] = useState({ name: "", type: "entrada" });
  const [newBanco, setNewBanco] = useState("");
  const [saldoAtual, setSaldoAtual] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [config, setConfig] = useState(null);
  const [openContactId, setOpenContactId] = useState(null);

  const loadConfig = useCallback(async () => {
    const data = await fetch("/api/config").then((r) => r.json()).catch(() => null);
    setConfig(data);
  }, []);

  async function setContaEspecial(campo, bancoId) {
    // clicar de novo no mesmo banco desmarca (volta pra "nenhuma")
    const novoValor = config?.[campo] === bancoId ? "" : bancoId;
    const res = await fetch("/api/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [campo]: novoValor }),
    });
    setConfig(await res.json());
  }

  const loadSaldo = useCallback(async () => {
    const data = await fetch("/api/lancamentos/saldo").then((r) => r.json()).catch(() => null);
    setSaldoAtual(data);
  }, []);

  const loadLanc = useCallback(async () => {
    const q = new URLSearchParams();
    if (fType) q.set("type", fType);
    if (fCat) q.set("categoriaId", fCat);
    if (fBanco) q.set("bancoId", fBanco);
    if (fIni) q.set("ini", fIni);
    if (fFim) q.set("fim", fFim);
    const data = await fetch(`/api/lancamentos?${q}`).then((r) => r.json()).catch(() => []);
    setLancamentos(Array.isArray(data) ? data : []);
  }, [fType, fCat, fBanco, fIni, fFim]);

  const loadMeta = useCallback(async () => {
    const [cats, bks] = await Promise.all([
      fetch("/api/lancamentos/categorias").then((r) => r.json()).catch(() => []),
      fetch("/api/lancamentos/bancos").then((r) => r.json()).catch(() => []),
    ]);
    setCategorias(cats);
    setBancos(bks);
  }, []);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { loadLanc(); }, [loadLanc]);
  useEffect(() => { loadSaldo(); }, [loadSaldo]);
  useEffect(() => { loadConfig(); }, [loadConfig]);
  useEffect(() => {
    fetch("/api/stages").then((r) => r.json()).then((s) => {
      const stgs = s || [];
      setContacts(stgs.flatMap((st) => (st.contacts || []).map((c) => ({ id: c.id, name: c.name }))));
    }).catch(() => {});
  }, []);

  // Resumo
  const resumo = useMemo(() => {
    let entradas = 0, saidas = 0;
    for (const l of lancamentos) {
      if (l.type === "entrada") entradas += l.amount;
      else saidas += l.amount;
    }
    return { entradas, saidas, saldo: entradas - saidas };
  }, [lancamentos]);

  const lancamentosFiltrados = useMemo(() => {
    const q = buscaLanc.trim().toLowerCase();
    if (!q) return lancamentos;
    return lancamentos.filter((l) =>
      (l.description || "").toLowerCase().includes(q) ||
      (l.categoria?.name || "").toLowerCase().includes(q) ||
      (l.banco?.name || "").toLowerCase().includes(q) ||
      (l.contact?.name || "").toLowerCase().includes(q)
    );
  }, [lancamentos, buscaLanc]);

  function exportarCsv() {
    const linhas = [["Data", "Tipo", "Descrição", "Categoria", "Banco", "Lead", "Valor"]];
    for (const l of lancamentosFiltrados) {
      linhas.push([
        new Date(l.date).toLocaleDateString("pt-BR"),
        l.type === "entrada" ? "Entrada" : "Saída",
        l.description || "",
        l.categoria?.name || "",
        l.banco?.name || "",
        l.contact?.name || "",
        String(l.amount).replace(".", ","),
      ]);
    }
    const csv = linhas.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lancamentos_${hojeStr()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Agrupamento por categoria (para gráficos de pizza)
  const porCategoria = useMemo(() => {
    const map = {};
    for (const l of lancamentos) {
      const cat = l.categoria?.name || "Sem categoria";
      const key = `${l.type}:${cat}`;
      map[key] = (map[key] || 0) + l.amount;
    }
    const entradas = [], saidas = [];
    for (const [k, v] of Object.entries(map)) {
      const [type, cat] = [k.split(":")[0], k.slice(k.indexOf(":") + 1)];
      (type === "entrada" ? entradas : saidas).push({ name: cat, value: v });
    }
    return { entradas, saidas };
  }, [lancamentos]);

  async function createLanc(e) {
    e.preventDefault();
    setError("");
    if (!form.amount || Number(form.amount) <= 0) { setError("Valor obrigatório."); return; }
    setSaving(true);
    const url = editingId ? `/api/lancamentos/${editingId}` : "/api/lancamentos";
    const res = await fetch(url, {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, amount: Number(form.amount) }),
    });
    setSaving(false);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error || "Erro."); return; }
    setForm(EMPTY_FORM);
    setEditingId(null);
    loadLanc();
    loadSaldo();
  }

  function startEdit(l) {
    setEditingId(l.id);
    setForm({
      type: l.type,
      amount: String(l.amount),
      description: l.description || "",
      date: new Date(l.date).toLocaleDateString("en-CA"),
      categoriaId: l.categoriaId || "",
      bancoId: l.bancoId || "",
      contactId: l.contactId || "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
  }

  async function removeLanc(id) {
    if (!confirm("Excluir este lançamento?")) return;
    await fetch(`/api/lancamentos/${id}`, { method: "DELETE" });
    if (editingId === id) cancelEdit();
    loadLanc();
    loadSaldo();
  }

  async function addCat(e) {
    e.preventDefault();
    if (!newCat.name.trim()) return;
    await fetch("/api/lancamentos/categorias", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newCat) });
    setNewCat({ name: "", type: "entrada" });
    loadMeta();
  }

  async function removeCat(id) {
    await fetch(`/api/lancamentos/categorias/${id}`, { method: "DELETE" });
    loadMeta();
  }

  async function addBanco(e) {
    e.preventDefault();
    if (!newBanco.trim()) return;
    await fetch("/api/lancamentos/bancos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newBanco }) });
    setNewBanco("");
    loadMeta();
  }

  async function removeBanco(id) {
    await fetch(`/api/lancamentos/bancos/${id}`, { method: "DELETE" });
    loadMeta();
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const catsDoTipo = categorias.filter((c) => c.type === form.type);

  return (
    <div className="flex-1 overflow-y-auto thin-scroll p-3 md:p-6 max-w-6xl space-y-4 md:space-y-6">
      <h1 className="text-lg font-semibold text-slate-800">Lançamentos</h1>

      {/* Saldo atual real da conta — soma de TODOS os lançamentos, não muda com os filtros abaixo */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <p className="text-xs text-slate-400">Saldo atual da conta</p>
        <p className={`text-2xl font-bold ${(saldoAtual?.saldo ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
          {saldoAtual ? money(saldoAtual.saldo) : "—"}
        </p>
      </div>

      {/* Cards de resumo (do período filtrado abaixo) */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-400">Entradas</p>
          <p className="text-lg font-semibold text-emerald-600">{money(resumo.entradas)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-400">Saídas</p>
          <p className="text-lg font-semibold text-red-600">{money(resumo.saidas)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-400">Saldo do período</p>
          <p className={`text-lg font-semibold ${resumo.saldo >= 0 ? "text-emerald-600" : "text-red-600"}`}>{money(resumo.saldo)}</p>
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <PieChart data={porCategoria.entradas} title="Entradas por categoria" />
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <PieChart data={porCategoria.saidas} title="Saídas por categoria" />
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Formulário de lançamento */}
        <form onSubmit={createLanc} className="bg-white rounded-xl border border-slate-200 p-5 space-y-3 h-fit lg:col-span-1">
          <h2 className="font-medium text-slate-800">{editingId ? "Editar lançamento" : "Novo lançamento"}</h2>
          <label className="block">
            <span className="text-xs text-slate-400">Tipo</span>
            <select value={form.type} onChange={set("type")} className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 bg-white outline-none focus:border-emerald-400">
              <option value="entrada">Entrada</option>
              <option value="saida">Saída</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Valor (R$)</span>
            <input type="number" step="0.01" value={form.amount} onChange={set("amount")} className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-emerald-400" />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Descrição</span>
            <input value={form.description} onChange={set("description")} placeholder="Ex.: Pagamento fornecedor" className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-emerald-400" />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Data</span>
            <input type="date" value={form.date} onChange={set("date")} className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-emerald-400" />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Categoria</span>
            <select value={form.categoriaId} onChange={set("categoriaId")} className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 bg-white outline-none focus:border-emerald-400">
              <option value="">— Sem categoria —</option>
              {catsDoTipo.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Banco</span>
            <select value={form.bancoId} onChange={set("bancoId")} className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 bg-white outline-none focus:border-emerald-400">
              <option value="">— Sem banco —</option>
              {bancos.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Lead (opcional)</span>
            <div className="flex gap-1.5 mt-0.5">
              <select value={form.contactId} onChange={set("contactId")} className="flex-1 text-sm border border-slate-200 rounded px-2 py-1.5 bg-white outline-none focus:border-emerald-400">
                <option value="">— Nenhum —</option>
                {contacts.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
              {form.contactId && (
                <button
                  type="button"
                  onClick={() => setOpenContactId(form.contactId)}
                  title="Ver conversa deste lead"
                  className="shrink-0 text-sm border border-slate-200 rounded px-2 py-1.5 text-slate-500 hover:bg-slate-50"
                >
                  💬
                </button>
              )}
            </div>
          </label>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button disabled={saving} className="w-full bg-emerald-500 text-white rounded-lg py-2 text-sm hover:bg-emerald-600 disabled:opacity-50">
            {saving ? "Salvando…" : editingId ? "Salvar alterações" : "Lançar"}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit} className="w-full text-xs text-slate-400 hover:text-slate-600">
              Cancelar edição
            </button>
          )}
        </form>

        {/* Listagem + filtros */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-wrap items-end gap-3 bg-white rounded-xl border border-slate-200 p-4">
            <label className="block">
              <span className="text-xs text-slate-400">Tipo</span>
              <select value={fType} onChange={(e) => setFType(e.target.value)} className="mt-0.5 w-full text-xs border border-slate-200 rounded px-2 py-1.5 bg-white outline-none">
                <option value="">Todos</option>
                <option value="entrada">Entradas</option>
                <option value="saida">Saídas</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">Categoria</span>
              <select value={fCat} onChange={(e) => setFCat(e.target.value)} className="mt-0.5 w-full text-xs border border-slate-200 rounded px-2 py-1.5 bg-white outline-none">
                <option value="">Todas</option>
                {categorias.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">Banco</span>
              <select value={fBanco} onChange={(e) => setFBanco(e.target.value)} className="mt-0.5 w-full text-xs border border-slate-200 rounded px-2 py-1.5 bg-white outline-none">
                <option value="">Todos</option>
                {bancos.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">De</span>
              <input type="date" value={fIni} onChange={(e) => setFIni(e.target.value)} className="mt-0.5 text-xs border border-slate-200 rounded px-2 py-1.5 outline-none" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">Até</span>
              <input type="date" value={fFim} onChange={(e) => setFFim(e.target.value)} className="mt-0.5 text-xs border border-slate-200 rounded px-2 py-1.5 outline-none" />
            </label>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
            <div className="flex items-center justify-between gap-3 p-3 border-b border-slate-100">
              <div className="relative flex-1 max-w-xs">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300 text-xs">🔍</span>
                <input
                  value={buscaLanc}
                  onChange={(e) => setBuscaLanc(e.target.value)}
                  placeholder="Buscar descrição, categoria, responsável…"
                  className="w-full text-xs border border-slate-200 rounded-lg pl-7 pr-2 py-1.5 outline-none focus:border-emerald-400 transition-shadow"
                />
              </div>
              <button
                type="button"
                onClick={exportarCsv}
                className="flex items-center gap-1.5 text-xs font-medium border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-50 shrink-0"
              >
                ⬇ Exportar
              </button>
            </div>
            <table className="w-full text-sm min-w-[600px]">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="text-left px-4 py-2">Data</th>
                  <th className="text-left px-4 py-2">Tipo</th>
                  <th className="text-left px-4 py-2">Descrição</th>
                  <th className="text-left px-4 py-2">Categoria</th>
                  <th className="text-left px-4 py-2">Banco</th>
                  <th className="text-left px-4 py-2">Lead</th>
                  <th className="text-right px-4 py-2">Valor</th>
                  <th className="px-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lancamentosFiltrados.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 text-xs text-slate-500">{new Date(l.date).toLocaleDateString("pt-BR")}</td>
                    <td className="px-4 py-2">
                      <span className={`text-[10px] font-semibold uppercase rounded-full px-2 py-0.5 ${l.type === "entrada" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                        {l.type === "entrada" ? "Entrada" : "Saída"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-700 max-w-[200px] truncate">{l.description || "—"}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">{l.categoria?.name || "—"}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">{l.banco?.name || "—"}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">
                      {l.contact ? (
                        <button
                          onClick={() => setOpenContactId(l.contactId)}
                          title="Ver conversa deste lead"
                          className="text-emerald-600 hover:text-emerald-700 hover:underline"
                        >
                          {l.contact.name}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={`px-4 py-2 text-right font-medium ${l.type === "entrada" ? "text-emerald-600" : "text-red-600"}`}>
                      {l.type === "saida" ? "- " : ""}{money(l.amount)}
                    </td>
                    <td className="px-2">
                      <div className="flex items-center gap-2">
                        <button onClick={() => startEdit(l)} title="Editar" className="text-xs text-slate-400 hover:text-emerald-600">✎</button>
                        <button onClick={() => removeLanc(l.id)} title="Excluir" className="text-xs text-red-400 hover:text-red-600">×</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {lancamentosFiltrados.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    {lancamentos.length === 0 ? "Nenhum lançamento no período." : "Nenhum lançamento encontrado."}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Cadastro de categorias e bancos */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
          <h2 className="font-medium text-slate-800">Categorias</h2>
          <form onSubmit={addCat} className="flex gap-2">
            <input value={newCat.name} onChange={(e) => setNewCat((f) => ({ ...f, name: e.target.value }))} placeholder="Nova categoria" className="flex-1 text-sm border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-emerald-400" />
            <select value={newCat.type} onChange={(e) => setNewCat((f) => ({ ...f, type: e.target.value }))} className="text-sm border border-slate-200 rounded px-2 py-1.5 bg-white outline-none">
              <option value="entrada">Entrada</option>
              <option value="saida">Saída</option>
            </select>
            <button className="bg-emerald-500 text-white text-sm rounded px-3 py-1.5 hover:bg-emerald-600">+</button>
          </form>
          <ul className="divide-y divide-slate-100 text-sm">
            {categorias.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-1.5">
                <span className="text-slate-700">{c.name} <span className={`text-[10px] ml-1 ${c.type === "entrada" ? "text-emerald-500" : "text-red-500"}`}>{c.type}</span></span>
                <button onClick={() => removeCat(c.id)} className="text-xs text-red-400 hover:text-red-600">×</button>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
          <h2 className="font-medium text-slate-800">Bancos / Contas</h2>
          <form onSubmit={addBanco} className="flex gap-2">
            <input value={newBanco} onChange={(e) => setNewBanco(e.target.value)} placeholder="Novo banco" className="flex-1 text-sm border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-emerald-400" />
            <button className="bg-emerald-500 text-white text-sm rounded px-3 py-1.5 hover:bg-emerald-600">+</button>
          </form>
          <p className="text-[11px] text-slate-400">
            Marque qual conta recebe o débito automático ao liberar capital e qual recebe o
            crédito automático das parcelas pagas.
          </p>
          <ul className="divide-y divide-slate-100 text-sm">
            {bancos.map((b) => {
              const isLiberacao = config?.contaLiberacaoId === b.id;
              const isRecebimento = config?.contaRecebimentoId === b.id;
              return (
                <li key={b.id} className="flex items-center justify-between py-1.5 gap-2">
                  <span className="text-slate-700 truncate">{b.name}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setContaEspecial("contaLiberacaoId", b.id)}
                      title="Conta de liberação (débito automático ao liberar capital)"
                      className={`text-[10px] rounded px-1.5 py-0.5 border ${
                        isLiberacao
                          ? "bg-red-500 text-white border-red-500"
                          : "text-slate-400 border-slate-200 hover:border-red-300 hover:text-red-500"
                      }`}
                    >
                      Liberação
                    </button>
                    <button
                      onClick={() => setContaEspecial("contaRecebimentoId", b.id)}
                      title="Conta de recebimento (crédito automático das parcelas pagas)"
                      className={`text-[10px] rounded px-1.5 py-0.5 border ${
                        isRecebimento
                          ? "bg-emerald-500 text-white border-emerald-500"
                          : "text-slate-400 border-slate-200 hover:border-emerald-300 hover:text-emerald-500"
                      }`}
                    >
                      Recebimento
                    </button>
                    <button onClick={() => removeBanco(b.id)} className="text-xs text-red-400 hover:text-red-600">×</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {openContactId && (
        <ContactModal
          contactId={openContactId}
          onClose={() => setOpenContactId(null)}
          onChanged={() => {}}
        />
      )}
    </div>
  );
}
