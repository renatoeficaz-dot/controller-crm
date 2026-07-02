"use client";

import { useEffect, useState, useCallback, useRef } from "react";

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

  useEffect(() => {
    const onTab = (e) => setTab(e.detail);
    window.addEventListener("configuracoes:tab", onTab);
    return () => window.removeEventListener("configuracoes:tab", onTab);
  }, []);

  return (
    <div className="p-3 md:p-6 max-w-4xl">
      <h1 className="text-lg font-semibold text-slate-800 mb-4">Configurações</h1>

      <div className="flex gap-1 md:gap-2 mb-5 border-b border-slate-200 overflow-x-auto">
        <TabBtn active={tab === "ruta"} onClick={() => setTab("ruta")}>
          Cadastro de Ruta
        </TabBtn>
        <TabBtn active={tab === "honorarios"} onClick={() => setTab("honorarios")}>
          Honorários / Multa
        </TabBtn>
        <TabBtn active={tab === "usuarios"} onClick={() => setTab("usuarios")}>
          Usuários
        </TabBtn>
        <TabBtn active={tab === "numeros"} onClick={() => setTab("numeros")}>
          Números
        </TabBtn>
        <TabBtn active={tab === "tags"} onClick={() => setTab("tags")}>
          Tags / Auto-tag
        </TabBtn>
        <TabBtn active={tab === "mensagens"} onClick={() => setTab("mensagens")}>
          Mensagens prontas
        </TabBtn>
        <TabBtn active={tab === "automacao"} onClick={() => setTab("automacao")}>
          Automação
        </TabBtn>
        <TabBtn active={tab === "ia"} onClick={() => setTab("ia")}>
          IA
        </TabBtn>
      </div>

      {tab === "ruta" && <CadastroRuta />}
      {tab === "honorarios" && <Honorarios />}
      {tab === "usuarios" && <Usuarios />}
      {tab === "numeros" && <Numeros />}
      {tab === "tags" && <TagsConfig />}
      {tab === "mensagens" && <MensagensProntas />}
      {tab === "automacao" && <AutomacaoFunil />}
      {tab === "ia" && (
        <div className="space-y-6">
          <TokenDeepInfra />
          <AgentesIa />
        </div>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 md:px-4 py-2 text-xs md:text-sm font-medium -mb-px border-b-2 transition-colors whitespace-nowrap ${
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
const EMPTY_RUTA = { name: "", cn: "/1/", location: "Brasil, São Paulo", caixaInicial: "" };

function CadastroRuta() {
  const [units, setUnits] = useState([]);
  const [form, setForm] = useState(EMPTY_RUTA);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  const editando = editId !== null;

  const load = useCallback(async () => {
    setUnits(await fetch("/api/units").then((r) => r.json()));
  }, []);
  useEffect(() => { load(); }, [load]);

  function startEdit(u) {
    setEditId(u.id);
    setForm({
      name: u.name || "",
      cn: u.cn || "/1/",
      location: u.location || "Brasil, São Paulo",
      caixaInicial: String(u.caixaInicial ?? ""),
    });
  }

  function cancelEdit() {
    setEditId(null);
    setForm(EMPTY_RUTA);
  }

  async function save(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    await fetch(editando ? `/api/units/${editId}` : "/api/units", {
      method: editando ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, caixaInicial: Number(form.caixaInicial) || 0 }),
    });
    setSaving(false);
    cancelEdit();
    load();
  }

  async function remove(id) {
    if (!confirm("Excluir esta ruta/unidade?")) return;
    if (editId === id) cancelEdit();
    await fetch(`/api/units/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <form onSubmit={save} className="bg-white rounded-xl border border-slate-200 p-5 space-y-3 h-fit">
        <h2 className="font-medium text-slate-800">{editando ? "Editar Ruta" : "Nova Ruta"}</h2>
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
        <div className="flex gap-2">
          <button
            disabled={saving}
            className="flex-1 bg-emerald-500 text-white rounded-lg py-2 text-sm hover:bg-emerald-600 disabled:opacity-50"
          >
            {saving ? "Salvando…" : editando ? "Salvar alterações" : "Cadastrar ruta"}
          </button>
          {editando && (
            <button type="button" onClick={cancelEdit} className="px-3 text-sm text-slate-400 hover:text-slate-600">
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-medium text-slate-800 mb-3">Rutas cadastradas ({units.length})</h2>
        <ul className="divide-y divide-slate-100">
          {units.map((u) => (
            <li key={u.id} className={`flex items-center justify-between py-2.5 ${editId === u.id ? "bg-emerald-50/50 -mx-2 px-2 rounded" : ""}`}>
              <div>
                <p className="text-sm font-medium text-slate-700">{u.number} - {u.name}</p>
                <p className="text-xs text-slate-400">
                  {u.cn} · {u.location} · Capital: R$ {Number(u.caixaInicial || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
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
          {units.length === 0 && <li className="py-4 text-sm text-slate-400">Nenhuma ruta ainda.</li>}
        </ul>
      </div>
    </div>
  );
}

/* ---------------- % de honorários ---------------- */
function Honorarios() {
  const [form, setForm] = useState({ honorariosPct: "", multaPct: "", pagamentoHoraLimite: "" });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((c) =>
        setForm({
          honorariosPct: String(c.honorariosPct ?? ""),
          multaPct: String(c.multaPct ?? ""),
          pagamentoHoraLimite: c.pagamentoHoraLimite || "",
        })
      );
  }, []);

  async function save(e) {
    e.preventDefault();
    await fetch("/api/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        honorariosPct: Number(form.honorariosPct),
        multaPct: Number(form.multaPct),
        pagamentoHoraLimite: form.pagamentoHoraLimite,
      }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <form onSubmit={save} className="bg-white rounded-xl border border-slate-200 p-5 max-w-md space-y-4">
      <div>
        <h2 className="font-medium text-slate-800">% de honorários</h2>
        <p className="text-sm text-slate-500 mt-1">
          Percentual cobrado sobre o <strong>Valor do capital</strong> de cada empréstimo. Usado
          para calcular as 10 parcelas na seção de Cobrança do contato.
        </p>
        <label className="block mt-2">
          <span className="text-xs text-slate-400">Percentual (%)</span>
          <div className="flex items-center gap-2 mt-0.5">
            <input
              type="number"
              step="0.01"
              value={form.honorariosPct}
              onChange={set("honorariosPct")}
              className="w-32 text-sm border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-emerald-400"
            />
            <span className="text-slate-500">%</span>
          </div>
        </label>
      </div>

      <div className="border-t border-slate-100 pt-4">
        <h2 className="font-medium text-slate-800">Multa por atraso</h2>
        <p className="text-sm text-slate-500 mt-1">
          Percentual adicionado a uma parcela <strong>vencida e não paga</strong>. A parcela que vence
          hoje só passa a contar como atrasada depois do <strong>horário limite</strong> abaixo.
        </p>
        <div className="flex flex-wrap gap-4 mt-2">
          <label className="block">
            <span className="text-xs text-slate-400">Multa (%)</span>
            <div className="flex items-center gap-2 mt-0.5">
              <input
                type="number"
                step="0.01"
                value={form.multaPct}
                onChange={set("multaPct")}
                placeholder="50"
                className="w-28 text-sm border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-emerald-400"
              />
              <span className="text-slate-500">%</span>
            </div>
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Horário limite de pagamento</span>
            <input
              type="time"
              value={form.pagamentoHoraLimite}
              onChange={set("pagamentoHoraLimite")}
              className="mt-0.5 block w-32 text-sm border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-emerald-400"
            />
          </label>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">
          Deixe o horário em branco para a parcela só vencer na virada do dia.
        </p>
      </div>

      <button className="bg-emerald-500 text-white rounded-lg px-4 py-2 text-sm hover:bg-emerald-600">
        {saved ? "Salvo ✓" : "Salvar"}
      </button>
    </form>
  );
}

/* ---------------- Usuários ---------------- */
const EMPTY_USER = {
  name: "",
  login: "",
  password: "",
  role: "vendedor",
  verTodosLeads: false,
  kanbansVisiveis: [],
  numerosVisiveis: [],
};

const ROLE_LABEL = { admin: "Administrador", vendedor: "Vendedor", cobrador: "Cobrador" };

function Usuarios() {
  const [users, setUsers] = useState([]);
  const [stages, setStages] = useState([]);
  const [numeros, setNumeros] = useState([]);
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
    fetch("/api/stages").then((r) => r.json()).then((s) => setStages(Array.isArray(s) ? s : [])).catch(() => {});
    fetch("/api/numbers").then((r) => r.json()).then((n) => setNumeros(Array.isArray(n) ? n : [])).catch(() => {});
  }, [load]);

  function startEdit(u) {
    setEditId(u.id);
    setForm({
      name: u.name,
      login: u.login,
      password: "",
      role: u.role || "vendedor",
      verTodosLeads: !!u.verTodosLeads,
      kanbansVisiveis: (u.kanbansVisiveis || []).map((k) => k.id),
      numerosVisiveis: (u.numerosVisiveis || []).map((n) => n.id),
    });
    setError("");
  }

  function cancelEdit() {
    setEditId(null);
    setForm(EMPTY_USER);
    setError("");
  }

  function toggleArr(key, id) {
    setForm((f) => {
      const arr = f[key] || [];
      return { ...f, [key]: arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id] };
    });
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

  const isAdmin = form.role === "admin";

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

        <label className="block">
          <span className="text-xs text-slate-400">Nível</span>
          <select
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 bg-white outline-none focus:border-emerald-400"
          >
            <option value="admin">Administrador</option>
            <option value="vendedor">Vendedor</option>
            <option value="cobrador">Cobrador</option>
          </select>
        </label>

        {isAdmin ? (
          <p className="text-[11px] text-slate-400">
            Administrador vê tudo: todos os kanbans, todos os leads, todos os WhatsApp e o menu de Lançamentos/Configurações.
          </p>
        ) : (
          <>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.verTodosLeads}
                onChange={(e) => setForm((f) => ({ ...f, verTodosLeads: e.target.checked }))}
                className="accent-emerald-500"
              />
              <span className="text-xs text-slate-600">Pode ver leads de todos (desmarcado = só os dele)</span>
            </label>

            <div>
              <span className="text-xs text-slate-400">Kanbans que pode ver</span>
              <p className="text-[11px] text-slate-300 mb-1">Nenhum marcado = vê todas as colunas.</p>
              <div className="flex flex-wrap gap-1.5">
                {stages.map((s) => {
                  const on = form.kanbansVisiveis.includes(s.id);
                  return (
                    <button
                      type="button"
                      key={s.id}
                      onClick={() => toggleArr("kanbansVisiveis", s.id)}
                      className={`text-[11px] rounded-full px-2 py-0.5 border ${on ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-slate-500 border-slate-200"}`}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className="text-xs text-slate-400">WhatsApp cujas mensagens pode ver</span>
              <p className="text-[11px] text-slate-300 mb-1">Nenhum marcado = vê as mensagens de todos.</p>
              <div className="flex flex-wrap gap-1.5">
                {numeros.map((n) => {
                  const on = form.numerosVisiveis.includes(n.id);
                  return (
                    <button
                      type="button"
                      key={n.id}
                      onClick={() => toggleArr("numerosVisiveis", n.id)}
                      className={`text-[11px] rounded-full px-2 py-0.5 border ${on ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-slate-500 border-slate-200"}`}
                    >
                      {n.label}
                    </button>
                  );
                })}
                {numeros.length === 0 && <span className="text-[11px] text-slate-300">Nenhum número cadastrado.</span>}
              </div>
            </div>
          </>
        )}

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
                <p className="text-sm font-medium text-slate-700">
                  {u.name}
                  <span className="ml-2 text-[10px] uppercase tracking-wide text-emerald-600 bg-emerald-50 rounded px-1.5 py-0.5">
                    {ROLE_LABEL[u.role] || u.role}
                  </span>
                </p>
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
  const [units, setUnits] = useState([]);
  const [agents, setAgents] = useState([]);
  const [form, setForm] = useState({ label: "", number: "", instance: "", userId: "", unitId: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [evo, setEvo] = useState({ evolutionUrl: "", evolutionApiKey: "" });
  const [evoSaved, setEvoSaved] = useState(false);
  const [qr, setQr] = useState(null); // { id, label, image, connected, error }
  const [disconnecting, setDisconnecting] = useState(null); // id em andamento

  const load = useCallback(async () => {
    const [n, u, un, cfg, ag] = await Promise.all([
      fetch("/api/numbers").then((r) => r.json()),
      fetch("/api/users").then((r) => r.json()),
      fetch("/api/units").then((r) => r.json()).catch(() => []),
      fetch("/api/config").then((r) => r.json()).catch(() => ({})),
      fetch("/api/ia/agents").then((r) => r.json()).catch(() => []),
    ]);
    setNumeros(n);
    setUsers(u);
    setUnits(un);
    setEvo({ evolutionUrl: cfg?.evolutionUrl || "", evolutionApiKey: cfg?.evolutionApiKey || "" });
    setAgents(Array.isArray(ag) ? ag : []);
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
    setForm({ label: "", number: "", instance: "", userId: "", unitId: "" });
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

  async function reassignUnit(id, unitId) {
    await fetch(`/api/numbers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unitId }),
    });
    load();
  }

  async function setAgent(id, agentId) {
    setNumeros((prev) => prev.map((n) => (n.id === id ? { ...n, agentId } : n)));
    await fetch(`/api/numbers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId }),
    });
  }

  // Desconecta de verdade a sessão do WhatsApp na Evolution (logout).
  // Sem isso, a instância continua ativa e recebendo mensagens mesmo removida do CRM.
  async function disconnect(id) {
    setDisconnecting(id);
    const res = await fetch(`/api/numbers/${id}/disconnect`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setDisconnecting(null);
    if (!res.ok) {
      alert(d.error || "Falha ao desconectar.");
      return false;
    }
    return true;
  }

  async function remove(id) {
    if (!confirm("Remover este número? A sessão do WhatsApp também será desconectada.")) return;
    await disconnect(id); // best-effort: mesmo se falhar, segue removendo do CRM
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
          <label className="block">
            <span className="text-xs text-slate-400">Vincular a uma Ruta</span>
            <select
              value={form.unitId}
              onChange={(e) => setForm((f) => ({ ...f, unitId: e.target.value }))}
              className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 bg-white outline-none focus:border-emerald-400"
            >
              <option value="">— Sem ruta —</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.number} - {u.name}</option>
              ))}
            </select>
            <span className="text-[11px] text-slate-400 mt-1 block">
              Leads que entrarem por este número serão vinculados automaticamente a esta ruta.
            </span>
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
                    <button
                      onClick={async () => {
                        if (!confirm(`Desconectar ${n.label}? Encerra a sessão do WhatsApp (o número continua cadastrado).`)) return;
                        const ok = await disconnect(n.id);
                        if (ok) alert("Desconectado com sucesso.");
                      }}
                      disabled={disconnecting === n.id}
                      className="text-xs text-amber-600 hover:text-amber-700 disabled:opacity-50"
                    >
                      {disconnecting === n.id ? "Desconectando…" : "Desconectar"}
                    </button>
                    <button onClick={() => remove(n.id)} className="text-xs text-red-400 hover:text-red-600">
                      Remover
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2">
                  <label className="flex items-center gap-2">
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
                  <label className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Ruta:</span>
                    <select
                      value={n.unitId || ""}
                      onChange={(e) => reassignUnit(n.id, e.target.value)}
                      className="text-xs border border-slate-200 rounded px-2 py-1 bg-white outline-none focus:border-emerald-400"
                    >
                      <option value="">— Sem ruta —</option>
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>{u.number} - {u.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Agente de IA:</span>
                    <select
                      value={n.agentId || ""}
                      onChange={(e) => setAgent(n.id, e.target.value)}
                      className="text-xs border border-slate-200 rounded px-2 py-1 bg-white outline-none focus:border-emerald-400"
                    >
                      <option value="">— Sem IA —</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
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

/* ---------------- Tags / Etiquetas + regras de auto-tag ---------------- */
function TagsConfig() {
  const [tags, setTags] = useState([]);
  const [form, setForm] = useState({ name: "", color: "#6366f1" });
  const [ruleForm, setRuleForm] = useState({ match: "", tagId: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setTags(await fetch("/api/tags").then((r) => r.json()).catch(() => []));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function createTag(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    await fetch("/api/tags", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setForm({ name: "", color: "#6366f1" });
    setSaving(false);
    load();
  }

  async function removeTag(id) {
    if (!confirm("Excluir esta tag e suas regras?")) return;
    await fetch(`/api/tags/${id}`, { method: "DELETE" });
    load();
  }

  async function createRule(e) {
    e.preventDefault();
    if (!ruleForm.match.trim() || !ruleForm.tagId) return;
    await fetch("/api/tags/rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ruleForm) });
    setRuleForm({ match: "", tagId: "" });
    load();
  }

  async function removeRule(id) {
    await fetch(`/api/tags/rules/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-6">
      {/* Criar tag */}
      <div className="grid md:grid-cols-2 gap-6">
        <form onSubmit={createTag} className="bg-white rounded-xl border border-slate-200 p-5 space-y-3 h-fit">
          <h2 className="font-medium text-slate-800">Nova tag</h2>
          <div className="flex gap-2">
            <Field label="Nome" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Ex.: Indicação" />
            <label className="block shrink-0">
              <span className="text-xs text-slate-400">Cor</span>
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                className="mt-0.5 w-10 h-8 rounded cursor-pointer border border-slate-200"
              />
            </label>
          </div>
          <button disabled={saving} className="w-full bg-emerald-500 text-white rounded-lg py-2 text-sm hover:bg-emerald-600 disabled:opacity-50">
            {saving ? "Salvando…" : "Criar tag"}
          </button>
        </form>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-medium text-slate-800 mb-3">Tags cadastradas ({tags.length})</h2>
          <ul className="divide-y divide-slate-100">
            {tags.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                  <span className="text-sm text-slate-700">{t.name}</span>
                </div>
                <button onClick={() => removeTag(t.id)} className="text-xs text-red-400 hover:text-red-600">Excluir</button>
              </li>
            ))}
            {tags.length === 0 && <li className="py-4 text-sm text-slate-400">Nenhuma tag ainda.</li>}
          </ul>
        </div>
      </div>

      {/* Auto-tag */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <h2 className="font-medium text-slate-800">Auto-tag pela 1ª mensagem</h2>
        <p className="text-sm text-slate-500">
          Se a <strong>primeira mensagem</strong> que o cliente enviar contém o texto abaixo,
          o sistema atribui automaticamente a etiqueta à lead.
        </p>
        <form onSubmit={createRule} className="flex flex-wrap items-end gap-3">
          <label className="block flex-1 min-w-[180px]">
            <span className="text-xs text-slate-400">Se a mensagem contém...</span>
            <input
              value={ruleForm.match}
              onChange={(e) => setRuleForm((f) => ({ ...f, match: e.target.value }))}
              placeholder="Ex.: indicação, promoção, crédito..."
              className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-emerald-400"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Atribuir etiqueta</span>
            <select
              value={ruleForm.tagId}
              onChange={(e) => setRuleForm((f) => ({ ...f, tagId: e.target.value }))}
              className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 bg-white outline-none focus:border-emerald-400"
            >
              <option value="">— Escolher tag —</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
          <button className="bg-slate-800 text-white rounded-lg px-4 py-2 text-sm hover:bg-slate-700">
            Adicionar regra
          </button>
        </form>

        {tags.some((t) => (t.rules || []).length > 0) && (
          <ul className="divide-y divide-slate-100 mt-2">
            {tags.flatMap((t) =>
              (t.rules || []).map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2 text-xs">
                  <div>
                    <span className="text-slate-500">Se contém</span>{" "}
                    <span className="font-medium text-slate-700">"{r.match}"</span>{" "}
                    <span className="text-slate-500">→ atribui</span>{" "}
                    <span className="font-medium rounded-full px-1.5 py-0.5 text-white" style={{ backgroundColor: t.color }}>{t.name}</span>
                  </div>
                  <button onClick={() => removeRule(r.id)} className="text-red-400 hover:text-red-600">Remover</button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ---------------- Mensagens prontas (templates) ---------------- */
const MEDIA_TYPES = [
  { value: "text", label: "Texto" },
  { value: "image", label: "Imagem" },
  { value: "audio", label: "Áudio" },
  { value: "document", label: "Documento" },
  { value: "contact", label: "Contato" },
];

const MEDIA_LABELS = { text: "Texto", image: "Imagem", audio: "Áudio", document: "Documento", contact: "Contato" };

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function MensagensProntas() {
  const [templates, setTemplates] = useState([]);
  const emptyForm = { title: "", body: "", mediaType: "text", mediaBase64: null, mediaMimetype: null, mediaFileName: null, contactName: "", contactPhone: "" };
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  const editando = editId !== null;

  const load = useCallback(async () => {
    setTemplates(await fetch("/api/templates").then((r) => r.json()));
  }, []);
  useEffect(() => { load(); }, [load]);

  function startEdit(t) {
    setEditId(t.id);
    setForm({
      title: t.title,
      body: t.body || "",
      mediaType: t.mediaType || "text",
      mediaBase64: t.mediaBase64 || null,
      mediaMimetype: t.mediaMimetype || null,
      mediaFileName: t.mediaFileName || null,
      contactName: t.contactName || "",
      contactPhone: t.contactPhone || "",
    });
    setError("");
  }

  function cancelEdit() {
    setEditId(null);
    setForm(emptyForm);
    setError("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await fileToBase64(file);
    setForm((f) => ({ ...f, mediaBase64: base64, mediaMimetype: file.type, mediaFileName: file.name }));
  }

  async function save(e) {
    e.preventDefault();
    setError("");
    const mt = form.mediaType || "text";
    if (!form.title.trim()) { setError("Preencha o título."); return; }
    if (mt === "text" && !form.body.trim()) { setError("Preencha a mensagem."); return; }
    if ((mt === "image" || mt === "audio" || mt === "document") && !form.mediaBase64) {
      setError("Anexe um arquivo."); return;
    }
    if (mt === "contact" && (!form.contactName.trim() || !form.contactPhone.trim())) {
      setError("Preencha nome e telefone do contato."); return;
    }
    setSaving(true);
    const res = await fetch(editando ? `/api/templates/${editId}` : "/api/templates", {
      method: editando ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, mediaType: mt === "text" ? null : mt }),
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

  const mt = form.mediaType || "text";

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

        {/* Tipo */}
        <label className="block">
          <span className="text-xs text-slate-400">Tipo</span>
          <select
            value={mt}
            onChange={(e) => setForm((f) => ({ ...f, mediaType: e.target.value, mediaBase64: null, mediaMimetype: null, mediaFileName: null }))}
            className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 bg-white outline-none focus:border-emerald-400"
          >
            {MEDIA_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>

        {/* Texto */}
        {mt === "text" && (
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
        )}

        {/* Imagem / Áudio / Documento */}
        {(mt === "image" || mt === "audio" || mt === "document") && (
          <div className="space-y-2">
            <label className="block">
              <span className="text-xs text-slate-400">
                {mt === "image" ? "Arquivo de imagem" : mt === "audio" ? "Arquivo de áudio" : "Documento"}
              </span>
              <input
                ref={fileRef}
                type="file"
                accept={mt === "image" ? "image/*" : mt === "audio" ? "audio/*" : "*/*"}
                onChange={handleFile}
                className="mt-0.5 w-full text-sm text-slate-500 file:mr-3 file:text-xs file:border-0 file:rounded file:bg-emerald-50 file:text-emerald-700 file:px-2 file:py-1 cursor-pointer"
              />
            </label>
            {form.mediaFileName && (
              <p className="text-xs text-emerald-600 truncate">{form.mediaFileName}</p>
            )}
            <label className="block">
              <span className="text-xs text-slate-400">Legenda (opcional)</span>
              <input
                type="text"
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                placeholder="Legenda que acompanha o arquivo…"
                className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-emerald-400"
              />
            </label>
          </div>
        )}

        {/* Contato */}
        {mt === "contact" && (
          <div className="space-y-2">
            <Field
              label="Nome do contato"
              value={form.contactName}
              onChange={(v) => setForm((f) => ({ ...f, contactName: v }))}
              placeholder="Ex.: Suporte Controller"
            />
            <Field
              label="Telefone (ex.: 5511999998888)"
              value={form.contactPhone}
              onChange={(v) => setForm((f) => ({ ...f, contactPhone: v }))}
              placeholder="5511999998888"
            />
          </div>
        )}

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
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-700">{t.title}</p>
                    {t.mediaType && (
                      <span className="text-[10px] bg-slate-100 text-slate-500 rounded px-1.5 py-0.5 shrink-0">
                        {MEDIA_LABELS[t.mediaType] || t.mediaType}
                      </span>
                    )}
                  </div>
                  {t.mediaType === "contact" ? (
                    <p className="text-xs text-slate-400">{t.contactName} · {t.contactPhone}</p>
                  ) : t.mediaFileName ? (
                    <p className="text-xs text-slate-400 truncate">{t.mediaFileName}{t.body ? ` — ${t.body}` : ""}</p>
                  ) : (
                    <p className="text-xs text-slate-400 whitespace-pre-wrap break-words line-clamp-3">{t.body}</p>
                  )}
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

/* ---------------- Automação do funil (responsável por etapa) ---------------- */
function AutomacaoFunil() {
  const [stages, setStages] = useState([]);
  const [users, setUsers] = useState([]);
  const [savedId, setSavedId] = useState(null);

  const load = useCallback(async () => {
    const [s, u] = await Promise.all([
      fetch("/api/stages").then((r) => r.json()),
      fetch("/api/users").then((r) => r.json()),
    ]);
    setStages(Array.isArray(s) ? s : []);
    setUsers(Array.isArray(u) ? u : []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function setAuto(stageId, autoResponsavel) {
    setStages((prev) => prev.map((s) => (s.id === stageId ? { ...s, autoResponsavel } : s)));
    await fetch(`/api/stages/${stageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoResponsavel }),
    });
    setSavedId(stageId);
    setTimeout(() => setSavedId(null), 1200);
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 max-w-xl">
      <h2 className="font-medium text-slate-800 mb-1">Responsável automático por etapa</h2>
      <p className="text-xs text-slate-400 mb-4">
        Quando um lead entra numa etapa, ele é atribuído automaticamente ao usuário escolhido aqui (deixe em branco para não automatizar).
      </p>
      <ul className="divide-y divide-slate-100">
        {stages.map((s) => (
          <li key={s.id} className="py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
              <span className="text-sm text-slate-700 truncate">{s.name}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {savedId === s.id && <span className="text-xs text-emerald-600">salvo ✓</span>}
              <select
                value={s.autoResponsavel || ""}
                onChange={(e) => setAuto(s.id, e.target.value)}
                className="text-xs border border-slate-200 rounded px-2 py-1.5 bg-white outline-none focus:border-emerald-400"
              >
                <option value="">— Nenhum —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.name}>{u.name}</option>
                ))}
              </select>
            </div>
          </li>
        ))}
        {stages.length === 0 && <li className="py-4 text-sm text-slate-400">Nenhuma etapa cadastrada.</li>}
      </ul>
    </div>
  );
}

/* ---------------- IA (texto + geração de áudio) ---------------- */
// Modelos baratos disponíveis (preço aproximado por milhão de tokens/segundos de áudio,
// conferir sempre em https://deepinfra.com/models antes de usar em produção).
const TEXT_MODELS = [
  { value: "meta-llama/Meta-Llama-3.1-8B-Instruct", label: "8B Instruct (mais barato — não usa funções de forma confiável)" },
  { value: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo", label: "8B Instruct Turbo (recomendado — usa funções bem)" },
  { value: "meta-llama/Llama-3.3-70B-Instruct", label: "70B Instruct (mais forte, usa funções bem)" },
];
const TTS_MODELS = [
  { value: "ResembleAI/chatterbox-turbo", label: "Chatterbox Turbo (recomendado — fala português, rápido)" },
  { value: "ResembleAI/chatterbox-multilingual", label: "Chatterbox Multilingual (mais lento, ~18s)" },
  { value: "hexgrad/Kokoro-82M", label: "Kokoro 82M (mais barato, só inglês)" },
  { value: "canopylabs/orpheus-3b-0.1-ft", label: "Orpheus 3B" },
];
// Vozes do Kokoro (modelo majoritariamente treinado em inglês — a pronúncia em
// português pode sair com sotaque. Teste e troque se não gostar do resultado.)
const KOKORO_VOICES = [
  { value: "af_bella", label: "Bella (feminina)" },
  { value: "af_nicole", label: "Nicole (feminina)" },
  { value: "af_sarah", label: "Sarah (feminina)" },
  { value: "af_sky", label: "Sky (feminina)" },
  { value: "am_adam", label: "Adam (masculina)" },
  { value: "am_michael", label: "Michael (masculina)" },
  { value: "bf_emma", label: "Emma (feminina, sotaque britânico)" },
  { value: "bm_george", label: "George (masculina, sotaque britânico)" },
];

// Popup em tela grande pra escrever/editar o prompt da IA com mais espaço
function PromptModal({ value, onChange, onClose }) {
  const [draft, setDraft] = useState(value);

  function apply() {
    onChange(draft);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl w-full max-w-3xl h-[80vh] flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between shrink-0">
          <h3 className="font-medium text-slate-800">Prompt da IA</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          placeholder="Ex.: Você é a assistente virtual da Controller, uma empresa de microcrédito. Responda de forma educada e objetiva, tire dúvidas sobre empréstimos e parcelas, e nunca prometa valores ou prazos sem confirmar com um atendente humano…"
          className="flex-1 w-full text-sm px-5 py-4 outline-none resize-none"
        />
        <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5">
            Cancelar
          </button>
          <button
            onClick={apply}
            className="bg-emerald-500 text-white rounded-lg px-4 py-1.5 text-sm hover:bg-emerald-600"
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}

// Tokens dos provedores de IA (texto/transcrição na DeepInfra; voz opcionalmente
// em Fish Audio ou ElevenLabs — cada agente escolhe qual usar).
function TokenDeepInfra() {
  const [tokens, setTokens] = useState({ deepinfraApiKey: "", fishAudioApiKey: "", elevenLabsApiKey: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then((d) => {
      setTokens({
        deepinfraApiKey: d?.deepinfraApiKey || "",
        fishAudioApiKey: d?.fishAudioApiKey || "",
        elevenLabsApiKey: d?.elevenLabsApiKey || "",
      });
    }).catch(() => {});
  }, []);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tokens),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <form onSubmit={save} className="bg-white rounded-xl border border-slate-200 p-5 max-w-lg space-y-3">
      <h2 className="font-medium text-slate-800">Tokens</h2>
      <p className="text-xs text-slate-400">
        A primeira chave (<a href="https://deepinfra.com/dash" target="_blank" rel="noreferrer" className="underline text-emerald-600">gerar aqui</a>) dá
        acesso a texto e transcrição — sempre necessária. As outras duas são opcionais: cada agente escolhe qual usar pra gerar a voz.
      </p>
      <Field label="API Key — texto/transcrição" value={tokens.deepinfraApiKey} onChange={(v) => setTokens((t) => ({ ...t, deepinfraApiKey: v }))} placeholder="di_..." />
      <Field label="API Key — Fish Audio (voz, opcional)" value={tokens.fishAudioApiKey} onChange={(v) => setTokens((t) => ({ ...t, fishAudioApiKey: v }))} placeholder="fa-..." />
      <Field label="API Key — ElevenLabs (voz, opcional)" value={tokens.elevenLabsApiKey} onChange={(v) => setTokens((t) => ({ ...t, elevenLabsApiKey: v }))} placeholder="sk_..." />
      <button
        disabled={saving}
        className="bg-emerald-500 text-white rounded-lg px-4 py-2 text-sm hover:bg-emerald-600 disabled:opacity-50"
      >
        {saving ? "Salvando…" : saved ? "Salvo ✓" : "Salvar"}
      </button>
    </form>
  );
}

const TTS_PROVIDERS = [
  { value: "deepinfra", label: "DeepInfra (mesmo token de texto)" },
  { value: "fishaudio", label: "Fish Audio" },
  { value: "elevenlabs", label: "ElevenLabs" },
];

const emptyAgent = {
  name: "", prompt: "", textModel: TEXT_MODELS[1].value,
  ttsProvider: "deepinfra", ttsModel: TTS_MODELS[0].value, ttsVoice: KOKORO_VOICES[0].value,
  modoResposta: "espelho",
  toolSendContact: false, toolContactName: "", toolContactPhone: "",
  toolSendTemplate: false, toolMoveStage: false,
};

// Vários agentes de IA — cada um com prompt/modelos próprios. Cada número (aba
// Números) escolhe qual agente atende, ou nenhum.
function AgentesIa() {
  const [agents, setAgents] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(emptyAgent);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [newAgentModalOpen, setNewAgentModalOpen] = useState(false);

  const load = useCallback(async () => {
    const list = await fetch("/api/ia/agents").then((r) => r.json()).catch(() => []);
    setAgents(Array.isArray(list) ? list : []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function selectAgent(id) {
    setSelectedId(id);
    const a = await fetch(`/api/ia/agents/${id}`).then((r) => r.json());
    setForm({
      name: a.name || "",
      prompt: a.prompt || "",
      textModel: a.textModel || TEXT_MODELS[0].value,
      ttsProvider: a.ttsProvider || "deepinfra",
      ttsModel: a.ttsModel || TTS_MODELS[0].value,
      ttsVoice: a.ttsVoice || (a.ttsProvider === "deepinfra" || !a.ttsProvider ? KOKORO_VOICES[0].value : ""),
      modoResposta: a.modoResposta || "espelho",
      toolSendContact: !!a.toolSendContact,
      toolContactName: a.toolContactName || "",
      toolContactPhone: a.toolContactPhone || "",
      toolSendTemplate: !!a.toolSendTemplate,
      toolMoveStage: !!a.toolMoveStage,
    });
  }

  async function createAgent(name) {
    const a = await fetch("/api/ia/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).then((r) => r.json());
    await load();
    selectAgent(a.id);
  }

  async function removeAgent(id) {
    if (!confirm("Excluir este agente? Números que o usam ficarão sem IA.")) return;
    await fetch(`/api/ia/agents/${id}`, { method: "DELETE" });
    if (selectedId === id) { setSelectedId(null); setForm(emptyAgent); }
    load();
  }

  async function save(e) {
    e.preventDefault();
    if (!selectedId) return;
    setSaving(true);
    await fetch(`/api/ia/agents/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    load();
  }

  return (
    <div className="grid md:grid-cols-[220px_1fr] gap-6">
      <div className="bg-white rounded-xl border border-slate-200 p-3">
        <div className="flex items-center justify-between mb-2 px-1">
          <h2 className="font-medium text-slate-800 text-sm">Agentes</h2>
          <button onClick={() => setNewAgentModalOpen(true)} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">+ Novo</button>
        </div>
        <ul className="space-y-0.5">
          {agents.map((a) => (
            <li key={a.id}>
              <button
                onClick={() => selectAgent(a.id)}
                className={`w-full text-left px-2 py-2 rounded text-sm truncate ${selectedId === a.id ? "bg-emerald-50 text-emerald-700" : "text-slate-600 hover:bg-slate-50"}`}
              >
                {a.name}
              </button>
            </li>
          ))}
          {agents.length === 0 && <li className="text-xs text-slate-400 px-2 py-2">Nenhum agente ainda.</li>}
        </ul>
      </div>

      {selectedId ? (
        <form onSubmit={save} className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
          <Field label="Nome do agente" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Ex.: Atendimento comercial" />

          <label className="block">
            <span className="text-xs text-slate-400">Modelo Llama (texto)</span>
            <select
              value={form.textModel}
              onChange={(e) => setForm((f) => ({ ...f, textModel: e.target.value }))}
              className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 bg-white outline-none focus:border-emerald-400"
            >
              {TEXT_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-slate-400">Provedor de voz (TTS)</span>
            <select
              value={form.ttsProvider}
              onChange={(e) => setForm((f) => ({ ...f, ttsProvider: e.target.value, ttsVoice: "" }))}
              className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 bg-white outline-none focus:border-emerald-400"
            >
              {TTS_PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </label>

          {form.ttsProvider === "deepinfra" && (
            <>
              <label className="block">
                <span className="text-xs text-slate-400">Modelo de áudio/voz</span>
                <select
                  value={form.ttsModel}
                  onChange={(e) => setForm((f) => ({ ...f, ttsModel: e.target.value }))}
                  className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 bg-white outline-none focus:border-emerald-400"
                >
                  {TTS_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </label>

              {form.ttsModel === "hexgrad/Kokoro-82M" && (
                <label className="block">
                  <span className="text-xs text-slate-400">Voz</span>
                  <select
                    value={form.ttsVoice}
                    onChange={(e) => setForm((f) => ({ ...f, ttsVoice: e.target.value }))}
                    className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 bg-white outline-none focus:border-emerald-400"
                  >
                    {KOKORO_VOICES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                  </select>
                  <p className="text-xs text-slate-400 mt-1">
                    Esse modelo é majoritariamente treinado em inglês — em português a pronúncia pode sair com sotaque. Teste e troque a voz se não gostar.
                  </p>
                </label>
              )}
            </>
          )}

          {form.ttsProvider === "fishaudio" && (
            <Field
              label="ID da voz (reference_id)"
              value={form.ttsVoice}
              onChange={(v) => setForm((f) => ({ ...f, ttsVoice: v }))}
              placeholder="Copie da página do modelo de voz em fish.audio"
            />
          )}

          {form.ttsProvider === "elevenlabs" && (
            <Field
              label="Voice ID"
              value={form.ttsVoice}
              onChange={(v) => setForm((f) => ({ ...f, ttsVoice: v }))}
              placeholder="Copie da biblioteca de vozes em elevenlabs.io"
            />
          )}

          <label className="block">
            <span className="text-xs text-slate-400 flex items-center justify-between">
              Prompt (instruções de como este agente deve atender)
              <button
                type="button"
                onClick={() => setPromptModalOpen(true)}
                className="text-emerald-600 hover:text-emerald-700 font-medium normal-case"
              >
                ⤢ Expandir
              </button>
            </span>
            <textarea
              value={form.prompt}
              onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
              rows={6}
              placeholder="Ex.: Você é a assistente virtual da Controller, uma empresa de microcrédito. Responda de forma educada e objetiva…"
              className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-emerald-400 resize-none"
            />
          </label>

          {promptModalOpen && (
            <PromptModal
              value={form.prompt}
              onChange={(v) => setForm((f) => ({ ...f, prompt: v }))}
              onClose={() => setPromptModalOpen(false)}
            />
          )}

          <label className="block">
            <span className="text-xs text-slate-400">Formato da resposta</span>
            <select
              value={form.modoResposta}
              onChange={(e) => setForm((f) => ({ ...f, modoResposta: e.target.value }))}
              className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 bg-white outline-none focus:border-emerald-400"
            >
              <option value="espelho">Espelhar o cliente (áudio → áudio, texto → texto)</option>
              <option value="texto">Sempre responder por texto</option>
              <option value="audio">Sempre responder por áudio</option>
            </select>
          </label>

          <div className="border-t border-slate-100 pt-3 space-y-3">
            <h3 className="text-sm font-medium text-slate-700">Funções (a IA decide sozinha quando usar)</h3>
            {(form.toolSendContact || form.toolSendTemplate || form.toolMoveStage) && form.textModel === TEXT_MODELS[0].value && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1.5">
                ⚠️ O modelo "8B Instruct" (padrão) não chama funções de forma confiável — troque pro "8B Instruct Turbo" ou "70B Instruct" acima.
              </p>
            )}

            <div className="space-y-1.5">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.toolSendContact}
                  onChange={(e) => setForm((f) => ({ ...f, toolSendContact: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-sm text-slate-700">Enviar contato (vCard)</span>
              </label>
              {form.toolSendContact && (
                <div className="pl-6 grid grid-cols-2 gap-2">
                  <Field label="Nome do contato" value={form.toolContactName} onChange={(v) => setForm((f) => ({ ...f, toolContactName: v }))} placeholder="Ex.: Suporte" />
                  <Field label="Telefone" value={form.toolContactPhone} onChange={(v) => setForm((f) => ({ ...f, toolContactPhone: v }))} placeholder="5511999998888" />
                </div>
              )}
            </div>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.toolSendTemplate}
                onChange={(e) => setForm((f) => ({ ...f, toolSendTemplate: e.target.checked }))}
                className="rounded"
              />
              <span className="text-sm text-slate-700">Enviar mensagem pronta (inclui áudios pré-gravados)</span>
            </label>
            {form.toolSendTemplate && (
              <p className="text-xs text-slate-400 pl-6 -mt-1">
                A IA escolhe pelo título exato cadastrado em{" "}
                <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("configuracoes:tab", { detail: "mensagens" }))} className="underline text-emerald-600">
                  Mensagens prontas
                </button>. Dê títulos claros pra ela escolher certo (ex.: "Áudio explicando taxas").
              </p>
            )}

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.toolMoveStage}
                onChange={(e) => setForm((f) => ({ ...f, toolMoveStage: e.target.checked }))}
                className="rounded"
              />
              <span className="text-sm text-slate-700">Mudar a etapa do lead no funil (Kanban)</span>
            </label>
          </div>

          <p className="text-xs text-slate-400 border-t border-slate-100 pt-3">
            Escolha em quais números este (ou outro) agente vai atender na aba{" "}
            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("configuracoes:tab", { detail: "numeros" }))} className="underline text-emerald-600">
              Números
            </button>.
          </p>

          <div className="flex gap-2">
            <button
              disabled={saving}
              className="bg-emerald-500 text-white rounded-lg px-4 py-2 text-sm hover:bg-emerald-600 disabled:opacity-50"
            >
              {saving ? "Salvando…" : saved ? "Salvo ✓" : "Salvar"}
            </button>
            <button type="button" onClick={() => removeAgent(selectedId)} className="text-sm text-red-400 hover:text-red-600 px-3">
              Excluir agente
            </button>
          </div>
        </form>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center justify-center text-sm text-slate-400">
          Selecione ou crie um agente para editar
        </div>
      )}

      {newAgentModalOpen && (
        <NewAgentModal
          onCreate={(name) => { setNewAgentModalOpen(false); createAgent(name); }}
          onClose={() => setNewAgentModalOpen(false)}
        />
      )}
    </div>
  );
}

// Popup pra dar nome a um agente novo (em vez do prompt() nativo do navegador)
function NewAgentModal({ onCreate, onClose }) {
  const [name, setName] = useState("");

  function submit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        className="bg-white rounded-xl w-full max-w-sm shadow-xl p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-medium text-slate-800">Novo agente</h3>
        <label className="block">
          <span className="text-xs text-slate-400">Nome do agente</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            placeholder="Ex.: Atendimento comercial"
            className="mt-0.5 w-full text-sm border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-emerald-400"
          />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5">
            Cancelar
          </button>
          <button
            disabled={!name.trim()}
            className="bg-emerald-500 text-white rounded-lg px-4 py-1.5 text-sm hover:bg-emerald-600 disabled:opacity-50"
          >
            Criar
          </button>
        </div>
      </form>
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
