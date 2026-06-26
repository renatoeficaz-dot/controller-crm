"use client";

import { useEffect, useState, useCallback, useMemo } from "react";

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

  // Cadastro rápido de categoria / banco
  const [newCat, setNewCat] = useState({ name: "", type: "entrada" });
  const [newBanco, setNewBanco] = useState("");

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
  useEffect(() => {
    fetch("/api/stages").then((r) => r.json()).then((s) => {
      setContacts((s || []).flatMap((st) => (st.contacts || []).map((c) => ({ id: c.id, name: c.name }))));
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

  async function createLanc(e) {
    e.preventDefault();
    setError("");
    if (!form.amount || Number(form.amount) <= 0) { setError("Valor obrigatório."); return; }
    setSaving(true);
    const res = await fetch("/api/lancamentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, amount: Number(form.amount) }),
    });
    setSaving(false);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error || "Erro."); return; }
    setForm(EMPTY_FORM);
    loadLanc();
  }

  async function removeLanc(id) {
    if (!confirm("Excluir este lançamento?")) return;
    await fetch(`/api/lancamentos/${id}`, { method: "DELETE" });
    loadLanc();
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
    <div className="flex-1 overflow-y-auto thin-scroll p-4 md:p-6 max-w-6xl space-y-6">
      <h1 className="text-lg font-semibold text-slate-800">Lançamentos</h1>

      {/* Cards de resumo */}
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
          <p className="text-xs text-slate-400">Saldo</p>
          <p className={`text-lg font-semibold ${resumo.saldo >= 0 ? "text-emerald-600" : "text-red-600"}`}>{money(resumo.saldo)}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Formulário de lançamento */}
        <form onSubmit={createLanc} className="bg-white rounded-xl border border-slate-200 p-5 space-y-3 h-fit lg:col-span-1">
          <h2 className="font-medium text-slate-800">Novo lançamento</h2>
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
            <select value={form.contactId} onChange={set("contactId")} className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 bg-white outline-none focus:border-emerald-400">
              <option value="">— Nenhum —</option>
              {contacts.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          </label>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button disabled={saving} className="w-full bg-emerald-500 text-white rounded-lg py-2 text-sm hover:bg-emerald-600 disabled:opacity-50">
            {saving ? "Salvando…" : "Lançar"}
          </button>
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

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
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
                {lancamentos.map((l) => (
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
                    <td className="px-4 py-2 text-xs text-slate-500">{l.contact?.name || "—"}</td>
                    <td className={`px-4 py-2 text-right font-medium ${l.type === "entrada" ? "text-emerald-600" : "text-red-600"}`}>
                      {l.type === "saida" ? "- " : ""}{money(l.amount)}
                    </td>
                    <td className="px-2">
                      <button onClick={() => removeLanc(l.id)} className="text-xs text-red-400 hover:text-red-600">×</button>
                    </td>
                  </tr>
                ))}
                {lancamentos.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Nenhum lançamento no período.</td></tr>
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
          <ul className="divide-y divide-slate-100 text-sm">
            {bancos.map((b) => (
              <li key={b.id} className="flex items-center justify-between py-1.5">
                <span className="text-slate-700">{b.name}</span>
                <button onClick={() => removeBanco(b.id)} className="text-xs text-red-400 hover:text-red-600">×</button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
