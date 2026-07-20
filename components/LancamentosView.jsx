"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import ContactModal from "./ContactModal";

const money = (n) =>
  "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function inicioMesStr() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString("en-CA");
}
function inicioSemanaStr() {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7; // 0 = segunda
  d.setDate(d.getDate() - dow);
  return d.toLocaleDateString("en-CA");
}
function hojeStr() {
  return new Date().toLocaleDateString("en-CA");
}

const EMPTY_FORM = { type: "entrada", amount: "", description: "", date: hojeStr(), categoriaId: "", bancoId: "", contactId: "" };
const EMPTY_FILTROS = {
  type: "", categoriaId: "", bancoId: "", responsavel: "", tagId: "",
  ini: inicioMesStr(), fim: hojeStr(), valorMin: "", valorMax: "", sort: "recentes",
};
const PAGE_SIZE = 10;

const PIE_COLORS = ["#10b981", "#f59e0b", "#6366f1", "#ef4444", "#3b82f6", "#ec4899", "#8b5cf6", "#14b8a6"];

function filtrarPorPeriodo(lancamentos, periodo) {
  if (periodo === "tudo") return lancamentos;
  const desde = periodo === "semana" ? inicioSemanaStr() : inicioMesStr();
  return lancamentos.filter((l) => new Date(l.date).toLocaleDateString("en-CA") >= desde);
}

function PieChart({ data, title, periodo, onPeriodo }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  let slices = [];
  if (total) {
    let angle = 0;
    slices = data.map((d, i) => {
      const pct = d.value / total;
      const start = angle;
      angle += pct * 360;
      return { ...d, pct, start, end: angle, color: PIE_COLORS[i % PIE_COLORS.length] };
    });
  }
  function arc(cx, cy, r, startDeg, endDeg) {
    const s = ((startDeg - 90) * Math.PI) / 180;
    const e = ((endDeg - 90) * Math.PI) / 180;
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${cx + r * Math.cos(s)} ${cy + r * Math.sin(s)} A ${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(e)} ${cy + r * Math.sin(e)} Z`;
  }
  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-slate-700">{title}</h3>
        <select
          value={periodo}
          onChange={(e) => onPeriodo(e.target.value)}
          className="text-[11px] border border-slate-200 rounded-lg px-2 py-1 bg-white outline-none focus:border-emerald-400"
        >
          <option value="mes">Este mês</option>
          <option value="semana">Esta semana</option>
          <option value="tudo">Tudo</option>
        </select>
      </div>
      {!total ? (
        <p className="text-xs text-slate-400 text-center py-10">Sem dados</p>
      ) : (
        <>
          <svg viewBox="0 0 200 200" className="w-36 h-36 mx-auto">
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
        </>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color, onEdit }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-4 flex items-center gap-3 relative">
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center text-base shrink-0 ${color}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-slate-400 truncate">{label}</p>
        <p className="text-lg font-semibold text-slate-800 truncate">{value}</p>
      </div>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          title="Editar saldo"
          className="absolute top-2 right-2 text-slate-300 hover:text-emerald-600 text-xs"
        >
          ✎
        </button>
      )}
    </div>
  );
}

export default function LancamentosView() {
  const [lancamentos, setLancamentos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [bancos, setBancos] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [users, setUsers] = useState([]);
  const [tags, setTags] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Filtros aplicados (o que a API realmente usa) vs. rascunho (o que o usuário está mexendo)
  const [filtros, setFiltros] = useState(EMPTY_FILTROS);
  const [draft, setDraft] = useState(EMPTY_FILTROS);
  const [filtrosAbertos, setFiltrosAbertos] = useState(true);
  const [buscaLanc, setBuscaLanc] = useState("");
  const [page, setPage] = useState(1);

  const [periodoEntradas, setPeriodoEntradas] = useState("mes");
  const [periodoSaidas, setPeriodoSaidas] = useState("mes");

  const [catAberta, setCatAberta] = useState(null);
  const [bancoAberto, setBancoAberto] = useState(null);
  const [newCat, setNewCat] = useState({ name: "", type: "entrada" });
  const [newBanco, setNewBanco] = useState("");
  const [saldoAtual, setSaldoAtual] = useState(null);
  const [editandoSaldo, setEditandoSaldo] = useState(null); // { novoSaldo, motivo } | null
  const [config, setConfig] = useState(null);
  const [openContactId, setOpenContactId] = useState(null);

  const loadConfig = useCallback(async () => {
    const data = await fetch("/api/config").then((r) => r.json()).catch(() => null);
    setConfig(data);
  }, []);

  async function setContaEspecial(campo, bancoId) {
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

  // Editar o saldo não muda um número guardado — cria um lançamento de ajuste
  // (entrada ou saída) pela diferença, então continua tudo auditável na lista
  // e no motivo, igual o resto do financeiro.
  async function confirmarAjusteSaldo() {
    if (!editandoSaldo) return;
    const novoSaldo = Number(editandoSaldo.novoSaldo);
    if (Number.isNaN(novoSaldo)) return;
    const motivo = editandoSaldo.motivo.trim();
    const atual = saldoAtual?.saldo ?? 0;
    const diff = Math.round((novoSaldo - atual) * 100) / 100;
    if (diff === 0) {
      setEditandoSaldo(null);
      return;
    }
    if (!motivo) return;
    await fetch("/api/lancamentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: diff > 0 ? "entrada" : "saida",
        amount: Math.abs(diff),
        description: `Ajuste de saldo: ${motivo}`,
        date: hojeStr(),
      }),
    });
    setEditandoSaldo(null);
    loadSaldo();
    loadLanc();
  }

  const loadLanc = useCallback(async () => {
    const q = new URLSearchParams();
    if (filtros.type) q.set("type", filtros.type);
    if (filtros.categoriaId) q.set("categoriaId", filtros.categoriaId);
    if (filtros.bancoId) q.set("bancoId", filtros.bancoId);
    if (filtros.responsavel) q.set("responsavel", filtros.responsavel);
    if (filtros.tagId) q.set("tagId", filtros.tagId);
    if (filtros.ini) q.set("ini", filtros.ini);
    if (filtros.fim) q.set("fim", filtros.fim);
    if (filtros.valorMin) q.set("valorMin", filtros.valorMin);
    if (filtros.valorMax) q.set("valorMax", filtros.valorMax);
    if (filtros.sort) q.set("sort", filtros.sort);
    const data = await fetch(`/api/lancamentos?${q}`).then((r) => r.json()).catch(() => []);
    setLancamentos(Array.isArray(data) ? data : []);
    setPage(1);
  }, [filtros]);

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
    fetch("/api/users").then((r) => r.json()).then((u) => setUsers(Array.isArray(u) ? u : [])).catch(() => {});
    fetch("/api/tags").then((r) => r.json()).then((t) => setTags(Array.isArray(t) ? t : [])).catch(() => {});
    fetch("/api/stages").then((r) => r.json()).then((s) => {
      const stgs = s || [];
      setContacts(stgs.flatMap((st) => (st.contacts || []).map((c) => ({ id: c.id, name: c.name }))));
    }).catch(() => {});
  }, []);

  function aplicarFiltros() {
    setFiltros(draft);
  }
  function limparFiltros() {
    setDraft(EMPTY_FILTROS);
    setFiltros(EMPTY_FILTROS);
  }

  // Resumo (sobre o período/filtros já aplicados)
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
      (l.contact?.name || "").toLowerCase().includes(q) ||
      (l.contact?.responsavel || "").toLowerCase().includes(q)
    );
  }, [lancamentos, buscaLanc]);

  const totalPaginas = Math.max(1, Math.ceil(lancamentosFiltrados.length / PAGE_SIZE));
  const pagina = Math.min(page, totalPaginas);
  const lancamentosPagina = lancamentosFiltrados.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE);

  function exportarCsv() {
    const linhas = [["Data", "Tipo", "Descrição", "Categoria", "Banco", "Responsável", "Lead", "Valor"]];
    for (const l of lancamentosFiltrados) {
      linhas.push([
        new Date(l.date).toLocaleDateString("pt-BR"),
        l.type === "entrada" ? "Entrada" : "Saída",
        l.description || "",
        l.categoria?.name || "",
        l.banco?.name || "",
        l.contact?.responsavel || "",
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

  // Agrupamento por categoria (para os gráficos de pizza), cada um com seu próprio período
  function agrupar(periodo, tipo) {
    const base = filtrarPorPeriodo(lancamentos, periodo).filter((l) => l.type === tipo);
    const map = {};
    for (const l of base) {
      const cat = l.categoria?.name || "Sem categoria";
      map[cat] = (map[cat] || 0) + l.amount;
    }
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }
  const dadosEntradas = useMemo(() => agrupar(periodoEntradas, "entrada"), [lancamentos, periodoEntradas]);
  const dadosSaidas = useMemo(() => agrupar(periodoSaidas, "saida"), [lancamentos, periodoSaidas]);

  function abrirNovo() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
    setFormOpen(true);
  }

  function abrirEdicao(l) {
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
    setError("");
    setFormOpen(true);
  }

  async function salvarLanc(e) {
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
    setFormOpen(false);
    setForm(EMPTY_FORM);
    setEditingId(null);
    loadLanc();
    loadSaldo();
  }

  async function removeLanc(id) {
    if (!confirm("Excluir este lançamento?")) return;
    await fetch(`/api/lancamentos/${id}`, { method: "DELETE" });
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
  async function renameCat(id, name) {
    if (!name.trim()) return;
    await fetch(`/api/lancamentos/categorias/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
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
  async function renameBanco(id, name) {
    if (!name.trim()) return;
    await fetch(`/api/lancamentos/bancos/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    loadMeta();
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setD = (k) => (e) => setDraft((f) => ({ ...f, [k]: e.target.value }));
  const catsDoTipo = categorias.filter((c) => c.type === form.type);

  return (
    <div className="flex-1 overflow-y-auto thin-scroll p-3 md:p-6">
      <div className="flex items-start justify-between gap-3 mb-4 md:mb-6">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Lançamentos</h1>
          <p className="text-sm text-slate-400 mt-0.5">Acompanhe entradas, saídas e o saldo financeiro da sua operação.</p>
        </div>
        <button
          onClick={abrirNovo}
          className="shrink-0 flex items-center gap-1.5 bg-emerald-500 text-white text-sm font-medium rounded-lg px-3.5 py-2 hover:bg-emerald-600 transition-colors"
        >
          + Novo lançamento
        </button>
      </div>

      <div className="grid lg:grid-cols-[300px_1fr] gap-4 md:gap-6 items-start">
        {/* -------- Sidebar: filtros + categorias + bancos -------- */}
        <div className="space-y-4 md:space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-4">
            <button type="button" onClick={() => setFiltrosAbertos((v) => !v)} className="w-full flex items-center justify-between mb-1">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">🔽 Filtros</span>
              <span className="text-slate-400 text-xs">{filtrosAbertos ? "▲" : "▼"}</span>
            </button>
            {filtrosAbertos && (
              <div className="space-y-3 mt-3">
                <label className="block">
                  <span className="text-xs text-slate-400">Tipo</span>
                  <select value={draft.type} onChange={setD("type")} className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-emerald-400">
                    <option value="">Todos</option>
                    <option value="entrada">Entradas</option>
                    <option value="saida">Saídas</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-slate-400">Categoria</span>
                  <select value={draft.categoriaId} onChange={setD("categoriaId")} className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-emerald-400">
                    <option value="">Todas</option>
                    {categorias.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-slate-400">Banco / Conta</span>
                  <select value={draft.bancoId} onChange={setD("bancoId")} className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-emerald-400">
                    <option value="">Todos</option>
                    {bancos.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-slate-400">Responsável</span>
                  <select value={draft.responsavel} onChange={setD("responsavel")} className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-emerald-400">
                    <option value="">Todos</option>
                    {users.map((u) => (<option key={u.id} value={u.name}>{u.name}</option>))}
                  </select>
                </label>
                <div>
                  <span className="text-xs text-slate-400">Período</span>
                  <div className="grid grid-cols-2 gap-2 mt-0.5">
                    <input type="date" value={draft.ini} onChange={setD("ini")} className="text-sm border border-slate-200 rounded-lg px-2 py-2 outline-none focus:border-emerald-400" />
                    <input type="date" value={draft.fim} onChange={setD("fim")} className="text-sm border border-slate-200 rounded-lg px-2 py-2 outline-none focus:border-emerald-400" />
                  </div>
                </div>
                <div>
                  <span className="text-xs text-slate-400">Valor (R$)</span>
                  <div className="grid grid-cols-2 gap-2 mt-0.5">
                    <input type="number" placeholder="Mínimo" value={draft.valorMin} onChange={setD("valorMin")} className="text-sm border border-slate-200 rounded-lg px-2 py-2 outline-none focus:border-emerald-400" />
                    <input type="number" placeholder="Máximo" value={draft.valorMax} onChange={setD("valorMax")} className="text-sm border border-slate-200 rounded-lg px-2 py-2 outline-none focus:border-emerald-400" />
                  </div>
                </div>
                {tags.length > 0 && (
                  <label className="block">
                    <span className="text-xs text-slate-400">Tag (do lead)</span>
                    <select value={draft.tagId} onChange={setD("tagId")} className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-emerald-400">
                      <option value="">Todas</option>
                      {tags.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
                    </select>
                  </label>
                )}
                <label className="block">
                  <span className="text-xs text-slate-400">Ordenar por</span>
                  <select value={draft.sort} onChange={setD("sort")} className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-emerald-400">
                    <option value="recentes">Mais recentes</option>
                    <option value="antigos">Mais antigos</option>
                    <option value="maior_valor">Maior valor</option>
                    <option value="menor_valor">Menor valor</option>
                  </select>
                </label>
                <button onClick={aplicarFiltros} className="w-full bg-emerald-500 text-white text-sm font-medium rounded-lg py-2 hover:bg-emerald-600 transition-colors">
                  Aplicar filtros
                </button>
                <button onClick={limparFiltros} className="w-full border border-slate-200 text-slate-500 text-sm rounded-lg py-2 hover:bg-slate-50 transition-colors">
                  Limpar filtros
                </button>
              </div>
            )}
          </div>

          {/* Categorias */}
          <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-slate-800">Categorias</h2>
              <span className="text-xs text-emerald-600">+ Nova categoria</span>
            </div>
            <form onSubmit={addCat} className="flex gap-2 mb-2">
              <input value={newCat.name} onChange={(e) => setNewCat((f) => ({ ...f, name: e.target.value }))} placeholder="Nome da categoria" className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-emerald-400" />
              <select value={newCat.type} onChange={(e) => setNewCat((f) => ({ ...f, type: e.target.value }))} className="text-xs border border-slate-200 rounded-lg px-1.5 py-1.5 bg-white outline-none">
                <option value="entrada">Entrada</option>
                <option value="saida">Saída</option>
              </select>
              <button className="bg-emerald-500 text-white text-xs rounded-lg px-2.5 hover:bg-emerald-600">+</button>
            </form>
            <ul className="divide-y divide-slate-100 text-sm">
              {categorias.map((c) => (
                <li key={c.id} className="py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.type === "entrada" ? "bg-emerald-500" : "bg-red-500"}`} />
                      <span className="text-slate-700 truncate text-xs">{c.name}</span>
                      <span className={`text-[9px] uppercase shrink-0 ${c.type === "entrada" ? "text-emerald-500" : "text-red-500"}`}>{c.type}</span>
                    </span>
                    <button onClick={() => setCatAberta((v) => (v === c.id ? null : c.id))} className="text-slate-300 hover:text-slate-500 shrink-0">
                      {catAberta === c.id ? "︿" : "›"}
                    </button>
                  </div>
                  {catAberta === c.id && (
                    <div className="flex items-center gap-2 mt-1.5 pl-3">
                      <input
                        defaultValue={c.name}
                        onBlur={(e) => e.target.value !== c.name && renameCat(c.id, e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
                        className="flex-1 text-xs border border-slate-200 rounded px-2 py-1 outline-none focus:border-emerald-400"
                      />
                      <button onClick={() => removeCat(c.id)} className="text-xs text-red-400 hover:text-red-600 shrink-0">Excluir</button>
                    </div>
                  )}
                </li>
              ))}
              {categorias.length === 0 && <li className="py-3 text-xs text-slate-400">Nenhuma categoria ainda.</li>}
            </ul>
          </div>

          {/* Bancos / Contas */}
          <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-slate-800">Bancos / Contas</h2>
            </div>
            <form onSubmit={addBanco} className="flex gap-2 mb-2">
              <input value={newBanco} onChange={(e) => setNewBanco(e.target.value)} placeholder="Nome do banco/conta" className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-emerald-400" />
              <button className="bg-emerald-500 text-white text-xs rounded-lg px-2.5 hover:bg-emerald-600">+</button>
            </form>
            <ul className="divide-y divide-slate-100 text-sm">
              {bancos.map((b) => {
                const isLiberacao = config?.contaLiberacaoId === b.id;
                const isRecebimento = config?.contaRecebimentoId === b.id;
                return (
                  <li key={b.id} className="py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-700 truncate text-xs">{b.name}</span>
                      <button onClick={() => setBancoAberto((v) => (v === b.id ? null : b.id))} className="text-slate-300 hover:text-slate-500 shrink-0">
                        {bancoAberto === b.id ? "︿" : "›"}
                      </button>
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      {isLiberacao && <span className="text-[9px] font-medium bg-red-50 text-red-600 rounded-full px-1.5 py-0.5">Liberação</span>}
                      {isRecebimento && <span className="text-[9px] font-medium bg-emerald-50 text-emerald-600 rounded-full px-1.5 py-0.5">Recebimento</span>}
                    </div>
                    {bancoAberto === b.id && (
                      <div className="space-y-1.5 mt-1.5 pl-1">
                        <input
                          defaultValue={b.name}
                          onBlur={(e) => e.target.value !== b.name && renameBanco(b.id, e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
                          className="w-full text-xs border border-slate-200 rounded px-2 py-1 outline-none focus:border-emerald-400"
                        />
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setContaEspecial("contaLiberacaoId", b.id)}
                            className={`text-[10px] rounded px-1.5 py-0.5 border ${isLiberacao ? "bg-red-500 text-white border-red-500" : "text-slate-400 border-slate-200 hover:border-red-300 hover:text-red-500"}`}
                          >
                            Liberação
                          </button>
                          <button
                            onClick={() => setContaEspecial("contaRecebimentoId", b.id)}
                            className={`text-[10px] rounded px-1.5 py-0.5 border ${isRecebimento ? "bg-emerald-500 text-white border-emerald-500" : "text-slate-400 border-slate-200 hover:border-emerald-300 hover:text-emerald-500"}`}
                          >
                            Recebimento
                          </button>
                          <button onClick={() => removeBanco(b.id)} className="text-[10px] text-red-400 hover:text-red-600 ml-auto">Excluir</button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
              {bancos.length === 0 && <li className="py-3 text-xs text-slate-400">Nenhuma conta cadastrada.</li>}
            </ul>
            <p className="text-[10px] text-slate-400 mt-2">
              Clique em ›  numa conta pra marcar qual recebe o débito de liberação e qual recebe o crédito de recebimento.
            </p>
          </div>
        </div>

        {/* -------- Conteúdo principal -------- */}
        <div className="space-y-4 md:space-y-6 min-w-0">
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
              icon="👛"
              label="Saldo atual da conta"
              value={saldoAtual ? money(saldoAtual.saldo) : "—"}
              color="bg-slate-100"
              onEdit={() => setEditandoSaldo({ novoSaldo: String((saldoAtual?.saldo ?? 0).toFixed(2)), motivo: "" })}
            />
            <StatCard icon="↑" label="Entradas" value={money(resumo.entradas)} color="bg-emerald-50 text-emerald-600" />
            <StatCard icon="↓" label="Saídas" value={money(resumo.saidas)} color="bg-red-50 text-red-600" />
            <StatCard icon="📅" label="Saldo do período" value={money(resumo.saldo)} color="bg-sky-50 text-sky-600" />
          </div>

          <div className="grid sm:grid-cols-2 gap-4 md:gap-6">
            <PieChart data={dadosEntradas} title="Entradas por categoria" periodo={periodoEntradas} onPeriodo={setPeriodoEntradas} />
            <PieChart data={dadosSaidas} title="Saídas por categoria" periodo={periodoSaidas} onPeriodo={setPeriodoSaidas} />
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800">Lançamentos</h2>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300 text-xs">🔍</span>
                  <input
                    value={buscaLanc}
                    onChange={(e) => { setBuscaLanc(e.target.value); setPage(1); }}
                    placeholder="Buscar descrição, categoria, responsável…"
                    className="text-xs border border-slate-200 rounded-lg pl-7 pr-2 py-1.5 outline-none focus:border-emerald-400 transition-shadow w-56"
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
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-2">Data</th>
                    <th className="text-left px-4 py-2">Tipo</th>
                    <th className="text-left px-4 py-2">Descrição</th>
                    <th className="text-left px-4 py-2">Categoria</th>
                    <th className="text-left px-4 py-2">Banco / Conta</th>
                    <th className="text-left px-4 py-2">Responsável</th>
                    <th className="text-left px-4 py-2">Cliente</th>
                    <th className="text-right px-4 py-2">Valor</th>
                    <th className="px-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lancamentosPagina.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 text-xs text-slate-500 whitespace-nowrap">{new Date(l.date).toLocaleDateString("pt-BR")}</td>
                      <td className="px-4 py-2">
                        <span className={`text-[10px] font-semibold uppercase rounded-full px-2 py-0.5 ${l.type === "entrada" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                          {l.type === "entrada" ? "Entrada" : "Saída"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-700 max-w-[200px] truncate">{l.description || "—"}</td>
                      <td className="px-4 py-2 text-xs text-slate-500">{l.categoria?.name || "—"}</td>
                      <td className="px-4 py-2 text-xs text-slate-500">{l.banco?.name || "—"}</td>
                      <td className="px-4 py-2 text-xs text-slate-500">{l.contact?.responsavel || "—"}</td>
                      <td className="px-4 py-2 text-xs text-slate-500">
                        {l.contact ? (
                          <button onClick={() => setOpenContactId(l.contactId)} title="Ver card deste lead" className="text-emerald-600 hover:text-emerald-700 hover:underline">
                            {l.contact.name}
                          </button>
                        ) : "—"}
                      </td>
                      <td className={`px-4 py-2 text-right font-medium whitespace-nowrap ${l.type === "entrada" ? "text-emerald-600" : "text-red-600"}`}>
                        {l.type === "saida" ? "- " : ""}{money(l.amount)}
                      </td>
                      <td className="px-2">
                        <div className="flex items-center gap-2">
                          <button onClick={() => abrirEdicao(l)} title="Editar" className="text-xs text-slate-400 hover:text-emerald-600">✎</button>
                          <button onClick={() => removeLanc(l.id)} title="Excluir" className="text-xs text-red-400 hover:text-red-600">×</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {lancamentosPagina.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                      {lancamentos.length === 0 ? "Nenhum lançamento no período." : "Nenhum lançamento encontrado."}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {lancamentosFiltrados.length > 0 && (
              <div className="flex items-center justify-between gap-3 p-3 border-t border-slate-100 text-xs text-slate-500">
                <span>
                  Mostrando {(pagina - 1) * PAGE_SIZE + 1} a {Math.min(pagina * PAGE_SIZE, lancamentosFiltrados.length)} de {lancamentosFiltrados.length} lançamentos
                </span>
                <div className="flex items-center gap-1">
                  <button disabled={pagina <= 1} onClick={() => setPage((p) => p - 1)} className="w-7 h-7 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50">‹</button>
                  <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-medium">{pagina}</span>
                  <button disabled={pagina >= totalPaginas} onClick={() => setPage((p) => p + 1)} className="w-7 h-7 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50">›</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de novo lançamento / edição */}
      {formOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={() => setFormOpen(false)}>
          <form onSubmit={salvarLanc} onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold text-slate-800">{editingId ? "Editar lançamento" : "Novo lançamento"}</h2>
              <button type="button" onClick={() => setFormOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <label className="block">
              <span className="text-xs text-slate-400">Tipo</span>
              <select value={form.type} onChange={set("type")} className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-emerald-400">
                <option value="entrada">Entrada</option>
                <option value="saida">Saída</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">Valor (R$)</span>
              <input type="number" step="0.01" value={form.amount} onChange={set("amount")} className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">Descrição</span>
              <input value={form.description} onChange={set("description")} placeholder="Ex.: Pagamento fornecedor" className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">Data</span>
              <input type="date" value={form.date} onChange={set("date")} className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">Categoria</span>
              <select value={form.categoriaId} onChange={set("categoriaId")} className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-emerald-400">
                <option value="">— Sem categoria —</option>
                {catsDoTipo.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">Banco</span>
              <select value={form.bancoId} onChange={set("bancoId")} className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-emerald-400">
                <option value="">— Sem banco —</option>
                {bancos.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">Lead (opcional)</span>
              <div className="flex gap-1.5 mt-0.5">
                <select value={form.contactId} onChange={set("contactId")} className="flex-1 text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-emerald-400">
                  <option value="">— Nenhum —</option>
                  {contacts.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                </select>
                {form.contactId && (
                  <button type="button" onClick={() => setOpenContactId(form.contactId)} title="Ver conversa deste lead" className="shrink-0 text-sm border border-slate-200 rounded-lg px-2 text-slate-500 hover:bg-slate-50">
                    💬
                  </button>
                )}
              </div>
            </label>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button disabled={saving} className="w-full bg-emerald-500 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 transition-colors">
              {saving ? "Salvando…" : editingId ? "Salvar alterações" : "Lançar"}
            </button>
          </form>
        </div>
      )}

      {openContactId && (
        <ContactModal
          contactId={openContactId}
          onClose={() => setOpenContactId(null)}
          onChanged={() => {}}
        />
      )}

      {/* Editar saldo — cria um lançamento de ajuste pela diferença, com motivo */}
      {editandoSaldo && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={() => setEditandoSaldo(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-800">Editar saldo da conta</h3>
            <p className="text-xs text-slate-400">
              Saldo atual: <span className="font-medium text-slate-600">{money(saldoAtual?.saldo ?? 0)}</span>. Ao confirmar, é criado um
              lançamento de ajuste (entrada ou saída) pela diferença — fica registrado na lista, não é um número solto.
            </p>
            <label className="block">
              <span className="text-xs text-slate-400">Novo saldo</span>
              <input
                type="number"
                step="0.01"
                value={editandoSaldo.novoSaldo}
                onChange={(e) => setEditandoSaldo((d) => ({ ...d, novoSaldo: e.target.value }))}
                className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400"
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">Motivo do ajuste</span>
              <textarea
                value={editandoSaldo.motivo}
                onChange={(e) => setEditandoSaldo((d) => ({ ...d, motivo: e.target.value }))}
                rows={3}
                placeholder="Ex.: saldo inicial ao começar a usar o sistema, diferença encontrada na conferência…"
                className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400 resize-none"
              />
            </label>
            <div className="flex gap-2 pt-1">
              <button
                onClick={confirmarAjusteSaldo}
                disabled={!editandoSaldo.motivo.trim() || editandoSaldo.novoSaldo === ""}
                className="flex-1 bg-emerald-500 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 transition-colors"
              >
                Confirmar
              </button>
              <button onClick={() => setEditandoSaldo(null)} className="px-4 text-sm text-slate-400 hover:text-slate-600">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
