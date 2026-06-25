"use client";

import { useEffect, useState, useCallback } from "react";

// Estados do Brasil (UF)
const ESTADOS_BR = [
  "Acre", "Alagoas", "Amapá", "Amazonas", "Bahia", "Ceará", "Distrito Federal",
  "Espírito Santo", "Goiás", "Maranhão", "Mato Grosso", "Mato Grosso do Sul",
  "Minas Gerais", "Pará", "Paraíba", "Paraná", "Pernambuco", "Piauí",
  "Rio de Janeiro", "Rio Grande do Norte", "Rio Grande do Sul", "Rondônia",
  "Roraima", "Santa Catarina", "São Paulo", "Sergipe", "Tocantins",
];

export default function Configuracoes() {
  const [tab, setTab] = useState("ruta");

  return (
    <div className="p-4 md:p-6 max-w-4xl">
      <h1 className="text-lg font-semibold text-slate-800 mb-4">Configurações</h1>

      <div className="flex gap-2 mb-5 border-b border-slate-200">
        <TabBtn active={tab === "ruta"} onClick={() => setTab("ruta")}>
          Cadastro de Ruta
        </TabBtn>
        <TabBtn active={tab === "honorarios"} onClick={() => setTab("honorarios")}>
          % de honorários
        </TabBtn>
        <TabBtn active={tab === "usuarios"} onClick={() => setTab("usuarios")}>
          Usuários
        </TabBtn>
        <TabBtn active={tab === "numeros"} onClick={() => setTab("numeros")}>
          Números
        </TabBtn>
        <TabBtn active={tab === "mensagens"} onClick={() => setTab("mensagens")}>
          Mensagens prontas
        </TabBtn>
      </div>

      {tab === "ruta" && <CadastroRuta />}
      {tab === "honorarios" && <Honorarios />}
      {tab === "usuarios" && <Usuarios />}
      {tab === "numeros" && <Numeros />}
      {tab === "mensagens" && <MensagensProntas />}
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
        active
          ? "border-emerald-500 text-emerald-600"
          : "border-transparent text-slate-500 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

/* ---------------- Cadastro de Ruta (unidades) ---------------- */
function CadastroRuta() {
  const [units, setUnits] = useState([]);
  const [form, setForm] = useState({ name: "", cn: "/1/", location: "Brasil, São Paulo", caixaInicial: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setUnits(await fetch("/api/units").then((r) => r.json()));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function create(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    await fetch("/api/units", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, caixaInicial: Number(form.caixaInicial) || 0 }),
    });
    setForm({ name: "", cn: "/1/", location: "Brasil, São Paulo", caixaInicial: "" });
    setSaving(false);
    load();
  }

  async function remove(id) {
    if (!confirm("Excluir esta ruta/unidade?")) return;
    await fetch(`/api/units/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <form onSubmit={create} className="bg-white rounded-xl border border-slate-200 p-5 space-y-3 h-fit">
        <h2 className="font-medium text-slate-800">Nova Ruta</h2>
        <Field label="Nome da unidade" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Ex.: Crédito Express" />
        <Field label="CN" value={form.cn} onChange={(v) => setForm((f) => ({ ...f, cn: v }))} />
        <label className="block">
          <span className="text-xs text-slate-400">Capital inicial (R$)</span>
          <input
            type="number"
            step="0.01"
            value={form.caixaInicial}
            onChange={(e) => setForm((f) => ({ ...f, caixaInicial: e.target.value }))}
            placeholder="0,00"
            className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-emerald-400"
          />
        </label>
        <label className="block">
          <span className="text-xs text-slate-400">Localização (estado)</span>
          <select
            value={form.location}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 bg-white outline-none focus:border-emerald-400"
          >
            {ESTADOS_BR.map((uf) => (
              <option key={uf} value={`Brasil, ${uf}`}>
                {uf}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={saving}
          className="w-full bg-emerald-500 text-white rounded-lg py-2 text-sm hover:bg-emerald-600 disabled:opacity-50"
        >
          {saving ? "Salvando…" : "Cadastrar ruta"}
        </button>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-medium text-slate-800 mb-3">Rutas cadastradas ({units.length})</h2>
        <ul className="divide-y divide-slate-100">
          {units.map((u) => (
            <li key={u.id} className="flex items-center justify-between py-2.5">
              <div>
                <p className="text-sm font-medium text-slate-700">{u.number} - {u.name}</p>
                <p className="text-xs text-slate-400">
                  {u.cn} · {u.location} · Capital: R$ {Number(u.caixaInicial || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
              </div>
              <button onClick={() => remove(u.id)} className="text-xs text-red-400 hover:text-red-600">
                Excluir
              </button>
            </li>
          ))}
          {units.length === 0 && <li className="py-4 text-sm text-slate-400">Nenhuma ruta ainda.</li>}
        </ul>
      </div>
    </div>
  );
}

/* ---------------- % de honorários ---------------- */
function Honorarios() {
  const [pct, setPct] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((c) => setPct(String(c.honorariosPct)));
  }, []);

  async function save(e) {
    e.preventDefault();
    await fetch("/api/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ honorariosPct: Number(pct) }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <form onSubmit={save} className="bg-white rounded-xl border border-slate-200 p-5 max-w-md space-y-3">
      <h2 className="font-medium text-slate-800">% de honorários</h2>
      <p className="text-sm text-slate-500">
        Percentual cobrado sobre o <strong>Valor do capital</strong> de cada empréstimo. Usado
        para calcular as 10 parcelas na seção de Cobrança do contato.
      </p>
      <label className="block">
        <span className="text-xs text-slate-400">Percentual (%)</span>
        <div className="flex items-center gap-2 mt-0.5">
          <input
            type="number"
            step="0.01"
            value={pct}
            onChange={(e) => setPct(e.target.value)}
            className="w-32 text-sm border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-emerald-400"
          />
          <span className="text-slate-500">%</span>
        </div>
      </label>
      <button className="bg-emerald-500 text-white rounded-lg px-4 py-2 text-sm hover:bg-emerald-600">
        {saved ? "Salvo ✓" : "Salvar"}
      </button>
    </form>
  );
}

/* ---------------- Usuários ---------------- */
const EMPTY_USER = { name: "", login: "", password: "" };

function Usuarios() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(EMPTY_USER);
  const [editId, setEditId] = useState(null); // null = criando; id = editando
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const editando = editId !== null;

  const load = useCallback(async () => {
    setUsers(await fetch("/api/users").then((r) => r.json()));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  function startEdit(u) {
    setEditId(u.id);
    setForm({ name: u.name, login: u.login, password: "" });
    setError("");
  }

  function cancelEdit() {
    setEditId(null);
    setForm(EMPTY_USER);
    setError("");
  }

  async function save(e) {
    e.preventDefault();
    setError("");
    if (!form.name.trim() || !form.login.trim()) {
      setError("Preencha nome e login.");
      return;
    }
    if (!editando && !form.password) {
      setError("Defina uma senha para o novo usuário.");
      return;
    }
    setSaving(true);
    const res = await fetch(editando ? `/api/users/${editId}` : "/api/users", {
      method: editando ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Erro ao salvar usuário.");
      return;
    }
    cancelEdit();
    load();
  }

  async function remove(id) {
    if (!confirm("Excluir este usuário?")) return;
    if (editId === id) cancelEdit();
    await fetch(`/api/users/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <form onSubmit={save} className="bg-white rounded-xl border border-slate-200 p-5 space-y-3 h-fit">
        <h2 className="font-medium text-slate-800">
          {editando ? "Editar usuário" : "Novo usuário"}
        </h2>
        <Field label="Nome" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Ex.: Pedro Henrique" />
        <Field label="Login" value={form.login} onChange={(v) => setForm((f) => ({ ...f, login: v }))} placeholder="ex.: pedro" />
        <label className="block">
          <span className="text-xs text-slate-400">
            Senha {editando && <span className="text-slate-300">(deixe em branco para manter)</span>}
          </span>
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            placeholder={editando ? "••••••" : ""}
            className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-emerald-400"
          />
        </label>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex gap-2">
          <button
            disabled={saving}
            className="flex-1 bg-emerald-500 text-white rounded-lg py-2 text-sm hover:bg-emerald-600 disabled:opacity-50"
          >
            {saving ? "Salvando…" : editando ? "Salvar alterações" : "Cadastrar usuário"}
          </button>
          {editando && (
            <button type="button" onClick={cancelEdit} className="px-3 text-sm text-slate-400 hover:text-slate-600">
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-medium text-slate-800 mb-3">Usuários ({users.length})</h2>
        <ul className="divide-y divide-slate-100">
          {users.map((u) => (
            <li
              key={u.id}
              className={`flex items-center justify-between py-2.5 ${editId === u.id ? "bg-emerald-50/50 -mx-2 px-2 rounded" : ""}`}
            >
              <div>
                <p className="text-sm font-medium text-slate-700">{u.name}</p>
                <p className="text-xs text-slate-400">login: {u.login}</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => startEdit(u)} className="text-xs text-emerald-600 hover:text-emerald-700">
                  Editar
                </button>
                <button onClick={() => remove(u.id)} className="text-xs text-red-400 hover:text-red-600">
                  Excluir
                </button>
              </div>
            </li>
          ))}
          {users.length === 0 && <li className="py-4 text-sm text-slate-400">Nenhum usuário ainda.</li>}
        </ul>
      </div>
    </div>
  );
}

/* ---------------- Números (conexões de WhatsApp) ---------------- */
function Numeros() {
  const [numeros, setNumeros] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ label: "", number: "", instance: "", userId: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [evo, setEvo] = useState({ evolutionUrl: "", evolutionApiKey: "" });
  const [evoSaved, setEvoSaved] = useState(false);
  const [qr, setQr] = useState(null); // { id, label, image, connected, error }

  const load = useCallback(async () => {
    const [n, u, cfg] = await Promise.all([
      fetch("/api/numbers").then((r) => r.json()),
      fetch("/api/users").then((r) => r.json()),
      fetch("/api/config").then((r) => r.json()).catch(() => ({})),
    ]);
    setNumeros(n);
    setUsers(u);
    setEvo({ evolutionUrl: cfg?.evolutionUrl || "", evolutionApiKey: cfg?.evolutionApiKey || "" });
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // Enquanto o QR estiver aberto e não conectado, verifica o estado a cada 3s
  useEffect(() => {
    if (!qr || qr.connected) return;
    const t = setInterval(async () => {
      const s = await fetch(`/api/numbers/${qr.id}/state`).then((r) => r.json()).catch(() => ({}));
      if (s.state === "open") setQr((q) => (q ? { ...q, connected: true } : q));
    }, 3000);
    return () => clearInterval(t);
  }, [qr]);

  async function saveEvolution(e) {
    e.preventDefault();
    await fetch("/api/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(evo),
    });
    setEvoSaved(true);
    setTimeout(() => setEvoSaved(false), 1500);
  }

  async function create(e) {
    e.preventDefault();
    setError("");
    if (!form.label.trim() || !form.number.trim() || !form.instance.trim()) {
      setError("Preencha nome, número e instância.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/numbers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Erro ao cadastrar número.");
      return;
    }
    const novo = await res.json();
    setForm({ label: "", number: "", instance: "", userId: "" });
    load();
    conectar(novo); // já tenta gerar o QR do número recém-criado
  }

  // Conecta o número: pede o QR à Evolution e abre o modal
  async function conectar(n) {
    setQr({ id: n.id, label: n.label, loading: true });
    const res = await fetch(`/api/numbers/${n.id}/connect`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setQr({ id: n.id, label: n.label, error: d.error || "Falha ao conectar." });
      return;
    }
    if (d.connected) {
      setQr({ id: n.id, label: n.label, connected: true });
      return;
    }
    const image = d.qr?.startsWith("data:") ? d.qr : `data:image/png;base64,${d.qr}`;
    setQr({ id: n.id, label: n.label, image });
  }

  async function reassign(id, userId) {
    await fetch(`/api/numbers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    load();
  }

  async function remove(id) {
    if (!confirm("Remover este número?")) return;
    await fetch(`/api/numbers/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-6">
      {/* Servidor Evolution */}
      <form onSubmit={saveEvolution} className="bg-white rounded-xl border border-slate-200 p-5 grid md:grid-cols-3 gap-3 items-end">
        <Field label="URL do servidor Evolution" value={evo.evolutionUrl} onChange={(v) => setEvo((s) => ({ ...s, evolutionUrl: v }))} placeholder="https://evo.exemplo.com" />
        <label className="block">
          <span className="text-xs text-slate-400">API Key (global)</span>
          <input
            type="password"
            value={evo.evolutionApiKey}
            onChange={(e) => setEvo((s) => ({ ...s, evolutionApiKey: e.target.value }))}
            placeholder="sua-api-key"
            className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-emerald-400"
          />
        </label>
        <button className="bg-slate-800 text-white rounded-lg py-2 text-sm hover:bg-slate-700">
          {evoSaved ? "Salvo ✓" : "Salvar servidor"}
        </button>
      </form>

      <div className="grid md:grid-cols-2 gap-6">
        <form onSubmit={create} className="bg-white rounded-xl border border-slate-200 p-5 space-y-3 h-fit">
          <h2 className="font-medium text-slate-800">Conectar número</h2>
          <Field label="Nome da conexão" value={form.label} onChange={(v) => setForm((f) => ({ ...f, label: v }))} placeholder="Ex.: Comercial 1" />
          <Field label="Número (com DDI)" value={form.number} onChange={(v) => setForm((f) => ({ ...f, number: v }))} placeholder="5511999998888" />
          <Field label="Instância (Evolution)" value={form.instance} onChange={(v) => setForm((f) => ({ ...f, instance: v }))} placeholder="ex.: comercial1" />
          <label className="block">
            <span className="text-xs text-slate-400">Atribuir a um usuário</span>
            <select
              value={form.userId}
              onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
              className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 bg-white outline-none focus:border-emerald-400"
            >
              <option value="">— Sem responsável —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </label>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            disabled={saving}
            className="w-full bg-emerald-500 text-white rounded-lg py-2 text-sm hover:bg-emerald-600 disabled:opacity-50"
          >
            {saving ? "Conectando…" : "Conectar número (gera QR)"}
          </button>
        </form>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-medium text-slate-800 mb-3">Números conectados ({numeros.length})</h2>
          <ul className="divide-y divide-slate-100">
            {numeros.map((n) => (
              <li key={n.id} className="py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-700">{n.label}</p>
                    <p className="text-xs text-slate-400">{n.number} · instância: {n.instance}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => conectar(n)} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">
                      Conectar (QR)
                    </button>
                    <button onClick={() => remove(n.id)} className="text-xs text-red-400 hover:text-red-600">
                      Remover
                    </button>
                  </div>
                </div>
                <label className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-slate-400">Usuário:</span>
                  <select
                    value={n.userId || ""}
                    onChange={(e) => reassign(n.id, e.target.value)}
                    className="text-xs border border-slate-200 rounded px-2 py-1 bg-white outline-none focus:border-emerald-400"
                  >
                    <option value="">— Sem responsável —</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </label>
              </li>
            ))}
            {numeros.length === 0 && <li className="py-4 text-sm text-slate-400">Nenhum número conectado.</li>}
          </ul>
        </div>
      </div>

      {/* Modal do QR Code */}
      {qr && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={() => setQr(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-800">Conectar {qr.label}</h3>
              <button onClick={() => setQr(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>

            {qr.connected ? (
              <div className="py-8">
                <div className="text-4xl mb-2">✅</div>
                <p className="text-emerald-600 font-medium">Número conectado!</p>
              </div>
            ) : qr.error ? (
              <p className="text-sm text-red-500 py-6">{qr.error}</p>
            ) : qr.loading || !qr.image ? (
              <p className="text-sm text-slate-400 py-10">Gerando QR Code…</p>
            ) : (
              <>
                <img src={qr.image} alt="QR Code" className="mx-auto w-56 h-56 object-contain" />
                <p className="text-xs text-slate-500 mt-3">
                  Abra o WhatsApp → <strong>Aparelhos conectados</strong> → <strong>Conectar um aparelho</strong> e escaneie o código.
                </p>
                <p className="text-[11px] text-slate-400 mt-2">Aguardando leitura…</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Mensagens prontas (templates) ---------------- */
function MensagensProntas() {
  const [templates, setTemplates] = useState([]);
  const [form, setForm] = useState({ title: "", body: "" });
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const editando = editId !== null;

  const load = useCallback(async () => {
    setTemplates(await fetch("/api/templates").then((r) => r.json()));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  function startEdit(t) {
    setEditId(t.id);
    setForm({ title: t.title, body: t.body });
    setError("");
  }

  function cancelEdit() {
    setEditId(null);
    setForm({ title: "", body: "" });
    setError("");
  }

  async function save(e) {
    e.preventDefault();
    setError("");
    if (!form.title.trim() || !form.body.trim()) {
      setError("Preencha o título e a mensagem.");
      return;
    }
    setSaving(true);
    const res = await fetch(editando ? `/api/templates/${editId}` : "/api/templates", {
      method: editando ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Erro ao salvar a mensagem.");
      return;
    }
    cancelEdit();
    load();
  }

  async function remove(id) {
    if (!confirm("Excluir esta mensagem pronta?")) return;
    if (editId === id) cancelEdit();
    await fetch(`/api/templates/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <form onSubmit={save} className="bg-white rounded-xl border border-slate-200 p-5 space-y-3 h-fit">
        <h2 className="font-medium text-slate-800">
          {editando ? "Editar mensagem" : "Nova mensagem pronta"}
        </h2>
        <Field
          label="Título (aparece no seletor)"
          value={form.title}
          onChange={(v) => setForm((f) => ({ ...f, title: v }))}
          placeholder="Ex.: Saudação inicial"
        />
        <label className="block">
          <span className="text-xs text-slate-400">Mensagem</span>
          <textarea
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            rows={5}
            placeholder="Ex.: Olá! Tudo bem? Aqui é da Controller…"
            className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-emerald-400 resize-none"
          />
        </label>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex gap-2">
          <button
            disabled={saving}
            className="flex-1 bg-emerald-500 text-white rounded-lg py-2 text-sm hover:bg-emerald-600 disabled:opacity-50"
          >
            {saving ? "Salvando…" : editando ? "Salvar alterações" : "Cadastrar mensagem"}
          </button>
          {editando && (
            <button type="button" onClick={cancelEdit} className="px-3 text-sm text-slate-400 hover:text-slate-600">
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-medium text-slate-800 mb-3">Mensagens cadastradas ({templates.length})</h2>
        <ul className="divide-y divide-slate-100">
          {templates.map((t) => (
            <li
              key={t.id}
              className={`py-2.5 ${editId === t.id ? "bg-emerald-50/50 -mx-2 px-2 rounded" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700">{t.title}</p>
                  <p className="text-xs text-slate-400 whitespace-pre-wrap break-words line-clamp-3">{t.body}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button onClick={() => startEdit(t)} className="text-xs text-emerald-600 hover:text-emerald-700">
                    Editar
                  </button>
                  <button onClick={() => remove(t.id)} className="text-xs text-red-400 hover:text-red-600">
                    Excluir
                  </button>
                </div>
              </div>
            </li>
          ))}
          {templates.length === 0 && <li className="py-4 text-sm text-slate-400">Nenhuma mensagem ainda.</li>}
        </ul>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-400">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-emerald-400"
      />
    </label>
  );
}
