"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { VARIAVEIS_DISPONIVEIS } from "@/lib/variaveis";

// Corrige a digitação de um telefone BR (tira espaço/traço/parênteses, completa
// o DDI 55 se faltar) e valida o formato — retorna só dígitos (12 ou 13, com
// DDI) ou null se não bater com um celular/fixo BR válido.
function normalizeBrPhone(raw) {
  let digits = (raw || "").replace(/\D/g, "");
  if (!digits) return null;
  if (!digits.startsWith("55") || digits.length < 12) {
    // sem DDI (ex.: "11948528114", 11 dígitos) — completa com 55
    if (digits.length === 10 || digits.length === 11) digits = "55" + digits;
  }
  return digits.length === 12 || digits.length === 13 ? digits : null;
}

// Estados do Brasil (UF)
const ESTADOS_BR = [
  "Acre", "Alagoas", "Amapá", "Amazonas", "Bahia", "Ceará", "Distrito Federal",
  "Espírito Santo", "Goiás", "Maranhão", "Mato Grosso", "Mato Grosso do Sul",
  "Minas Gerais", "Pará", "Paraíba", "Paraná", "Pernambuco", "Piauí",
  "Rio de Janeiro", "Rio Grande do Norte", "Rio Grande do Sul", "Rondônia",
  "Roraima", "Santa Catarina", "São Paulo", "Sergipe", "Tocantins",
];

// Estados do Brasil com sigla (UF) — usado no seletor de cobrança por DDD,
// que precisa da sigla (bate com o mapa DDD->UF em lib/ddd.js).
const UF_LIST = [
  { uf: "AC", name: "Acre" }, { uf: "AL", name: "Alagoas" }, { uf: "AP", name: "Amapá" },
  { uf: "AM", name: "Amazonas" }, { uf: "BA", name: "Bahia" }, { uf: "CE", name: "Ceará" },
  { uf: "DF", name: "Distrito Federal" }, { uf: "ES", name: "Espírito Santo" }, { uf: "GO", name: "Goiás" },
  { uf: "MA", name: "Maranhão" }, { uf: "MT", name: "Mato Grosso" }, { uf: "MS", name: "Mato Grosso do Sul" },
  { uf: "MG", name: "Minas Gerais" }, { uf: "PA", name: "Pará" }, { uf: "PB", name: "Paraíba" },
  { uf: "PR", name: "Paraná" }, { uf: "PE", name: "Pernambuco" }, { uf: "PI", name: "Piauí" },
  { uf: "RJ", name: "Rio de Janeiro" }, { uf: "RN", name: "Rio Grande do Norte" }, { uf: "RS", name: "Rio Grande do Sul" },
  { uf: "RO", name: "Rondônia" }, { uf: "RR", name: "Roraima" }, { uf: "SC", name: "Santa Catarina" },
  { uf: "SP", name: "São Paulo" }, { uf: "SE", name: "Sergipe" }, { uf: "TO", name: "Tocantins" },
];

// Ícones de linha, minimalistas (sem depender de lib externa) — 20x20, stroke atual.
const ICONS = {
  honorarios: (
    <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" strokeLinecap="round" strokeLinejoin="round" />
  ),
  usuarios: (
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  numeros: (
    <path
      d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  tags: (
    <>
      <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7" cy="7" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  mensagens: (
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round" />
  ),
  automacao: (
    <path d="M13 2 3 14h7l-1 8 10-12h-7z" strokeLinecap="round" strokeLinejoin="round" />
  ),
  ia: (
    <>
      <path d="M12 3v3M12 18v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M3 12h3M18 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" strokeLinecap="round" />
      <circle cx="12" cy="12" r="3.2" />
    </>
  ),
};

function Icon({ name, className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      {ICONS[name]}
    </svg>
  );
}

const TABS = [
  { key: "honorarios", label: "Honorários / Multa", desc: "Percentuais e regras de cobrança" },
  { key: "usuarios", label: "Usuários", desc: "Acessos e permissões da equipe" },
  { key: "numeros", label: "Números", desc: "WhatsApp conectados e cobrança automática" },
  { key: "tags", label: "Tags / Auto-tag", desc: "Etiquetas e regras automáticas" },
  { key: "mensagens", label: "Mensagens prontas", desc: "Modelos de texto, mídia e contato" },
  { key: "automacao", label: "Automação", desc: "Responsáveis automáticos por etapa" },
  { key: "ia", label: "IA", desc: "Agentes, modelos e chaves de API" },
];

export default function Configuracoes() {
  const [tab, setTab] = useState("honorarios");

  useEffect(() => {
    const onTab = (e) => setTab(e.detail);
    window.addEventListener("configuracoes:tab", onTab);
    return () => window.removeEventListener("configuracoes:tab", onTab);
  }, []);

  const atual = TABS.find((t) => t.key === tab);

  return (
    <div className="flex-1 overflow-y-auto thin-scroll bg-slate-50/60">
      <div className="max-w-5xl mx-auto p-4 md:p-8">
        <header className="mb-6 md:mb-8">
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900 tracking-tight">Configurações</h1>
          <p className="text-sm text-slate-500 mt-1">Gerencie usuários, números, automações e integrações do sistema.</p>
        </header>

        {/* Navegação: pills horizontais roláveis no mobile, sidebar vertical no desktop */}
        <nav className="flex md:hidden gap-1.5 mb-5 overflow-x-auto pb-1 -mx-4 px-4">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium border transition-colors ${
                tab === t.key
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-600 border-slate-200"
              }`}
            >
              <Icon name={t.key} className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </nav>

        <div className="md:grid md:grid-cols-[220px_1fr] md:gap-8 md:items-start">
          <nav className="hidden md:flex flex-col gap-0.5 sticky top-6">
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`group flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors ${
                    active ? "bg-white shadow-sm ring-1 ring-slate-200" : "hover:bg-white/70"
                  }`}
                >
                  <Icon
                    name={t.key}
                    className={`w-4 h-4 mt-0.5 shrink-0 transition-colors ${
                      active ? "text-emerald-600" : "text-slate-400 group-hover:text-slate-500"
                    }`}
                  />
                  <span>
                    <span className={`block text-sm font-medium ${active ? "text-slate-900" : "text-slate-600"}`}>
                      {t.label}
                    </span>
                    <span className="block text-[11px] text-slate-400 leading-tight mt-0.5">{t.desc}</span>
                  </span>
                </button>
              );
            })}
          </nav>

          <main className="min-w-0">
            <div className="md:hidden mb-4">
              <h2 className="text-sm font-semibold text-slate-700">{atual?.label}</h2>
              <p className="text-xs text-slate-400 mt-0.5">{atual?.desc}</p>
            </div>

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
          </main>
        </div>
      </div>
    </div>
  );
}


// Card de seção reutilizável: título + descrição em tom neutro + conteúdo.
// Dá consistência visual entre as várias sub-telas de Configurações.
function SectionCard({ title, desc, children }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5">
      <h2 className="font-semibold text-slate-800">{title}</h2>
      {desc && <p className="text-sm text-slate-500 mt-1 leading-relaxed max-w-lg">{desc}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

// Input numérico com sufixo de unidade (%, R$, etc.) alinhado.
function NumberField({ label, value, onChange, suffix, placeholder, width = "w-28" }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <div className={`relative mt-1 ${width}`}>
        <input
          type="number"
          step="0.01"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="w-full text-sm border border-slate-200 rounded-lg pl-2.5 pr-7 py-2 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-shadow"
        />
        {suffix && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </label>
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
    <form onSubmit={save} className="max-w-xl space-y-5">
      <SectionCard
        title="% de honorários"
        desc={<>Percentual cobrado sobre o <strong className="text-slate-600">Valor do capital</strong> de cada empréstimo. Usado para calcular as 10 parcelas na seção de Cobrança do contato.</>}
      >
        <NumberField label="Percentual" value={form.honorariosPct} onChange={set("honorariosPct")} suffix="%" width="w-28" />
      </SectionCard>

      <SectionCard
        title="Multa por atraso"
        desc={<>Percentual adicionado a uma parcela <strong className="text-slate-600">vencida e não paga</strong>. A parcela que vence hoje só passa a contar como atrasada depois do horário limite abaixo.</>}
      >
        <div className="flex flex-wrap gap-4">
          <NumberField label="Multa" value={form.multaPct} onChange={set("multaPct")} suffix="%" placeholder="50" width="w-24" />
          <label className="block">
            <span className="text-xs font-medium text-slate-500">Horário limite de pagamento</span>
            <input
              type="time"
              value={form.pagamentoHoraLimite}
              onChange={set("pagamentoHoraLimite")}
              className="mt-1 block w-36 text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-shadow"
            />
          </label>
        </div>
        <p className="text-[11px] text-slate-400 mt-3">
          Deixe o horário em branco para a parcela só vencer na virada do dia.
        </p>
      </SectionCard>

      <div className="flex items-center gap-3 rounded-xl bg-sky-50/60 border border-sky-100 px-4 py-3">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 text-sky-500 shrink-0">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 16v-4M12 8h.01" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="text-xs text-sky-700">
          A conta de liberação e a conta de recebimento agora são marcadas direto na lista de
          Bancos/Contas, em Lançamentos.
        </p>
      </div>

      <button className="bg-emerald-500 text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-emerald-600 transition-colors shadow-sm">
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
const ROLE_OPTIONS = [
  { value: "admin", label: "Administrador", icon: "🛡️" },
  { value: "vendedor", label: "Vendedor", icon: "🧑‍💼" },
  { value: "cobrador", label: "Cobrador", icon: "💰" },
];

function initials(name) {
  return (name || "?").trim().slice(0, 1).toUpperCase();
}

function Usuarios() {
  const [users, setUsers] = useState([]);
  const [stages, setStages] = useState([]);
  const [numeros, setNumeros] = useState([]);
  const [form, setForm] = useState(EMPTY_USER);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editId, setEditId] = useState(null); // null = criando; id = editando
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtroNivel, setFiltroNivel] = useState("");

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
    setShowPassword(false);
    setPanelOpen(true);
  }

  function startNew() {
    setEditId(null);
    setForm(EMPTY_USER);
    setError("");
    setShowPassword(false);
    setPanelOpen(true);
  }

  function closePanel() {
    setPanelOpen(false);
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
    closePanel();
    load();
  }

  async function remove(id) {
    if (!confirm("Excluir este usuário?")) return;
    if (editId === id) closePanel();
    await fetch(`/api/users/${id}`, { method: "DELETE" });
    load();
  }

  const isAdmin = form.role === "admin";

  const stats = useMemo(() => ({
    total: users.length,
    admins: users.filter((u) => u.role === "admin").length,
    vendedores: users.filter((u) => u.role === "vendedor").length,
    cobradores: users.filter((u) => u.role === "cobrador").length,
  }), [users]);

  const usersFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return users.filter((u) => {
      if (filtroNivel && u.role !== filtroNivel) return false;
      if (q && !u.name.toLowerCase().includes(q) && !u.login.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [users, busca, filtroNivel]);

  return (
    <div className="space-y-5">
      {/* Cards de resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon="👥" value={stats.total} label="Total de usuários" hint="Todos os usuários cadastrados" />
        <StatCard icon="🛡️" value={stats.admins} label="Administradores" hint="Acesso total ao sistema" tint="violet" />
        <StatCard icon="🧑‍💼" value={stats.vendedores} label="Vendedores" hint="Acesso limitado" tint="sky" />
        <StatCard icon="💰" value={stats.cobradores} label="Cobradores" hint="Cobrança e recebimento" tint="amber" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
        {/* Cabeçalho: título + botão novo */}
        <div className="flex items-center justify-between px-5 pt-5 pb-1">
          <h2 className="font-semibold text-slate-800">Usuários</h2>
          <button
            onClick={startNew}
            className="flex items-center gap-1.5 bg-emerald-500 text-white rounded-lg px-3.5 py-2 text-sm font-medium hover:bg-emerald-600 transition-colors shadow-sm"
          >
            <span className="text-base leading-none">+</span> Novo usuário
          </button>
        </div>

        {/* Busca + filtro */}
        <div className="flex flex-wrap items-center gap-2.5 px-5 py-4">
          <div className="relative flex-1 min-w-[180px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-sm">🔍</span>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar usuário…"
              className="w-full text-sm border border-slate-200 rounded-lg pl-8 pr-3 py-2 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-shadow"
            />
          </div>
          <select
            value={filtroNivel}
            onChange={(e) => setFiltroNivel(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-emerald-400 transition-shadow"
          >
            <option value="">Todos os níveis</option>
            {ROLE_OPTIONS.map((r) => (<option key={r.value} value={r.value}>{r.label}</option>))}
          </select>
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-xs text-slate-400 border-y border-slate-100 bg-slate-50/60">
                <th className="text-left font-medium px-5 py-2.5">Usuário</th>
                <th className="text-left font-medium px-3 py-2.5">Login</th>
                <th className="px-5 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {usersFiltrados.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => startEdit(u)}
                  className={`border-b border-slate-50 last:border-0 cursor-pointer transition-colors hover:bg-slate-50 ${editId === u.id && panelOpen ? "bg-emerald-50/60" : ""}`}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold flex items-center justify-center shrink-0">
                        {initials(u.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-700 truncate">{u.name}</p>
                        <span className="text-[10px] uppercase tracking-wide text-slate-400">{ROLE_LABEL[u.role] || u.role}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-500">{u.login}</td>
                  <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => startEdit(u)} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium mr-3">
                      Editar
                    </button>
                    <button onClick={() => remove(u.id)} className="text-xs text-red-400 hover:text-red-600">
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
              {usersFiltrados.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-sm text-slate-400">
                    {users.length === 0 ? "Nenhum usuário ainda." : "Nenhum usuário encontrado."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="px-5 py-3 text-[11px] text-slate-400 border-t border-slate-100">
          Mostrando {usersFiltrados.length} de {users.length} usuário(s)
        </p>
      </div>

      {/* Painel lateral de detalhes/edição */}
      {panelOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/30" onClick={closePanel} />
          <form
            onSubmit={save}
            className="relative w-full max-w-sm bg-white h-full shadow-2xl flex flex-col animate-[slideIn_.18s_ease-out]"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <h3 className="font-semibold text-slate-800">
                {editando ? "Detalhes do usuário" : "Novo usuário"}
              </h3>
              <button type="button" onClick={closePanel} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>

            <div className="flex-1 overflow-y-auto thin-scroll px-5 py-4 space-y-4">
              <Field label="Nome completo" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Ex.: Pedro Henrique" />
              <Field label="Login" value={form.login} onChange={(v) => setForm((f) => ({ ...f, login: v }))} placeholder="ex.: pedro" />

              <label className="block">
                <span className="text-xs text-slate-400">
                  Senha {editando && <span className="text-slate-300">(deixe em branco para manter)</span>}
                </span>
                <div className="relative mt-0.5">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder={editando ? "••••••" : ""}
                    className="w-full text-sm border border-slate-200 rounded-lg pl-2.5 pr-9 py-2 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-shadow"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 text-xs"
                    tabIndex={-1}
                  >
                    {showPassword ? "🙈" : "👁️"}
                  </button>
                </div>
              </label>

              <div>
                <span className="text-xs text-slate-400">Nível de acesso</span>
                <div className="grid grid-cols-3 gap-1.5 mt-1">
                  {ROLE_OPTIONS.map((r) => {
                    const on = form.role === r.value;
                    return (
                      <button
                        type="button"
                        key={r.value}
                        onClick={() => setForm((f) => ({ ...f, role: r.value }))}
                        className={`text-xs rounded-lg py-2 px-1.5 border font-medium transition-colors ${
                          on ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <span className="block text-sm mb-0.5">{r.icon}</span>
                        {r.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {isAdmin ? (
                <p className="text-[11px] text-slate-400 bg-slate-50 rounded-lg p-2.5">
                  Administrador vê tudo: todos os kanbans, todos os leads, todos os WhatsApp e o menu de Lançamentos/Configurações.
                </p>
              ) : (
                <>
                  <label className="flex items-center justify-between gap-2 py-1">
                    <span className="text-xs text-slate-600">Pode ver leads de todos <span className="text-slate-400">(desmarcado = só os dele)</span></span>
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, verTodosLeads: !f.verTodosLeads }))}
                      className={`relative shrink-0 w-9 h-5 rounded-full transition-colors ${form.verTodosLeads ? "bg-emerald-500" : "bg-slate-200"}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.verTodosLeads ? "translate-x-4" : ""}`} />
                    </button>
                  </label>

                  <div>
                    <span className="text-xs text-slate-400">Kanbans que pode ver</span>
                    <p className="text-[11px] text-slate-300 mb-1.5">Nenhum marcado = vê todas as colunas.</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {stages.map((s) => {
                        const on = form.kanbansVisiveis.includes(s.id);
                        return (
                          <label key={s.id} className="flex items-center gap-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg px-2 py-1.5 cursor-pointer hover:bg-slate-50">
                            <input type="checkbox" checked={on} onChange={() => toggleArr("kanbansVisiveis", s.id)} className="accent-emerald-500 shrink-0" />
                            <span className="truncate">{s.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <span className="text-xs text-slate-400">WhatsApp cujas mensagens pode ver</span>
                    <p className="text-[11px] text-slate-300 mb-1.5">Nenhum marcado = vê as mensagens de todos.</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {numeros.map((n) => {
                        const on = form.numerosVisiveis.includes(n.id);
                        return (
                          <label key={n.id} className="flex items-center gap-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg px-2 py-1.5 cursor-pointer hover:bg-slate-50">
                            <input type="checkbox" checked={on} onChange={() => toggleArr("numerosVisiveis", n.id)} className="accent-emerald-500 shrink-0" />
                            <span className="truncate">{n.label}</span>
                          </label>
                        );
                      })}
                      {numeros.length === 0 && <span className="text-[11px] text-slate-300 col-span-2">Nenhum número cadastrado.</span>}
                    </div>
                  </div>
                </>
              )}

              {error && <p className="text-xs text-red-500">{error}</p>}
            </div>

            <div className="flex gap-2 px-5 py-4 border-t border-slate-100 shrink-0">
              <button type="button" onClick={closePanel} className="flex-1 border border-slate-200 text-slate-600 rounded-lg py-2 text-sm font-medium hover:bg-slate-50 transition-colors">
                Cancelar
              </button>
              <button
                disabled={saving}
                className="flex-1 bg-emerald-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 transition-colors"
              >
                {saving ? "Salvando…" : editando ? "Salvar alterações" : "Cadastrar usuário"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, value, label, hint, tint = "emerald" }) {
  const tints = {
    emerald: "bg-emerald-50 text-emerald-600",
    violet: "bg-violet-50 text-violet-600",
    sky: "bg-sky-50 text-sky-600",
    amber: "bg-amber-50 text-amber-600",
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-4">
      <div className="flex items-center gap-3">
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 ${tints[tint]}`}>{icon}</span>
        <span className="text-xl font-semibold text-slate-800">{value}</span>
      </div>
      <p className="text-xs font-medium text-slate-600 mt-2">{label}</p>
      <p className="text-[11px] text-slate-400">{hint}</p>
    </div>
  );
}

/* ---------------- Números (conexões de WhatsApp) ---------------- */
function Numeros() {
  const [numeros, setNumeros] = useState([]);
  const [users, setUsers] = useState([]);
  const [agents, setAgents] = useState([]);
  const [form, setForm] = useState({ ddi: "55", label: "", number: "", instance: "", userId: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [evo, setEvo] = useState({ evolutionUrl: "", evolutionApiKey: "" });
  const [evoSaved, setEvoSaved] = useState(false);
  const [editingEvo, setEditingEvo] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { ok, error, totalInstances }
  const [qr, setQr] = useState(null); // { id, label, image, connected, error }
  const [disconnecting, setDisconnecting] = useState(null); // id em andamento
  const [status, setStatus] = useState([]); // [{ id, label, number, state }] — estado real na Evolution
  const [configuringId, setConfiguringId] = useState(null); // número aberto no modal de configuração
  const [menuId, setMenuId] = useState(null); // número com o menu de ações (⋮) aberto
  const [history, setHistory] = useState(null); // array de logs quando o painel de histórico está aberto

  const load = useCallback(async () => {
    const [n, u, cfg, ag] = await Promise.all([
      fetch("/api/numbers").then((r) => r.json()),
      fetch("/api/users").then((r) => r.json()),
      fetch("/api/config").then((r) => r.json()).catch(() => ({})),
      fetch("/api/ia/agents").then((r) => r.json()).catch(() => []),
    ]);
    setNumeros(n);
    setUsers(u);
    setEvo({ evolutionUrl: cfg?.evolutionUrl || "", evolutionApiKey: cfg?.evolutionApiKey || "" });
    setAgents(Array.isArray(ag) ? ag : []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // Estado de conexão (verde = conectado, vermelho = desconectado) de cada
  // número — atualiza sozinho pra refletir quando reconecta ou cai.
  const loadStatus = useCallback(async () => {
    const s = await fetch("/api/numbers/status").then((r) => r.json()).catch(() => []);
    setStatus(Array.isArray(s) ? s : []);
  }, []);
  useEffect(() => {
    loadStatus();
    const t = setInterval(loadStatus, 10000);
    return () => clearInterval(t);
  }, [loadStatus]);

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
    setTestResult(null);
    setTimeout(() => setEvoSaved(false), 1500);
    setEditingEvo(false);
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    const r = await fetch("/api/config/test-connection", { method: "POST" }).then((r) => r.json()).catch((e) => ({ ok: false, error: e.message }));
    setTesting(false);
    setTestResult(r);
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
      body: JSON.stringify({ ...form, number: onlyDigits(form.ddi + form.number) }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Erro ao cadastrar número.");
      return;
    }
    const novo = await res.json();
    setForm({ ddi: "55", label: "", number: "", instance: "", userId: "" });
    load();
    conectar(novo); // já tenta gerar o QR do número recém-criado
  }

  function onlyDigits(s) {
    return (s || "").replace(/\D/g, "");
  }

  async function setPadrao(id, padrao) {
    setNumeros((prev) => prev.map((n) => ({ ...n, padrao: n.id === id ? padrao : padrao ? false : n.padrao })));
    await fetch(`/api/numbers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ padrao }),
    });
    load();
  }

  async function openHistory() {
    const logs = await fetch("/api/numbers/history").then((r) => r.json()).catch(() => []);
    setHistory(Array.isArray(logs) ? logs : []);
  }

  function fmtData(d) {
    if (!d) return null;
    return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
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

  async function setAgent(id, agentId) {
    setNumeros((prev) => prev.map((n) => (n.id === id ? { ...n, agentId } : n)));
    await fetch(`/api/numbers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId }),
    });
  }

  async function setCobranca(id, campo, valor) {
    setNumeros((prev) => prev.map((n) => (n.id === id ? { ...n, [campo]: valor } : n)));
    await fetch(`/api/numbers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [campo]: valor }),
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
      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5">
        {!editingEvo ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionHeader
              icon="🔗"
              title="Servidor Evolution"
              subtitle={evo.evolutionUrl ? "URL e API Key configurados e ativos" : "Nenhum servidor configurado ainda"}
            />
            <div className="flex items-center gap-2 shrink-0">
              <div className="text-right mr-2">
                <p className="text-[11px] text-slate-400">Status do servidor</p>
                <p className={`text-xs font-medium flex items-center gap-1.5 justify-end ${testResult?.ok ? "text-emerald-600" : evo.evolutionUrl ? "text-slate-500" : "text-red-500"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${testResult?.ok ? "bg-emerald-500" : evo.evolutionUrl ? "bg-slate-300" : "bg-red-500"}`} />
                  {testResult?.ok ? "Online" : evo.evolutionUrl ? "Não testado" : "Sem servidor"}
                </p>
              </div>
              <button type="button" onClick={() => setEditingEvo(true)} className="text-xs font-medium border border-slate-200 rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-50 transition-colors">
                Editar servidor
              </button>
              <button type="button" onClick={testConnection} disabled={testing} className="text-xs font-medium border border-slate-200 rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50">
                {testing ? "Testando…" : "📶 Testar conexão"}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={saveEvolution}>
            <SectionHeader icon="🔗" title="URL do servidor Evolution" subtitle="Informe a URL e a API Key do seu servidor Evolution para integração." />
            <div className="grid md:grid-cols-3 gap-3 items-end mt-4">
              <Field label="URL do servidor Evolution" value={evo.evolutionUrl} onChange={(v) => setEvo((s) => ({ ...s, evolutionUrl: v }))} placeholder="https://evo.exemplo.com" />
              <label className="block">
                <span className="text-xs text-slate-400">API Key (global)</span>
                <input
                  type="password"
                  value={evo.evolutionApiKey}
                  onChange={(e) => setEvo((s) => ({ ...s, evolutionApiKey: e.target.value }))}
                  placeholder="sua-api-key"
                  className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-shadow"
                />
              </label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setEditingEvo(false)} className="flex-1 border border-slate-200 text-slate-600 rounded-lg py-2.5 text-sm font-medium hover:bg-slate-50 transition-colors">
                  Cancelar
                </button>
                <button className="flex-1 bg-slate-800 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-slate-700 transition-colors">
                  {evoSaved ? "Salvo ✓" : "Salvar"}
                </button>
              </div>
            </div>
          </form>
        )}
        {testResult && (
          <p className={`mt-3 text-xs rounded-lg p-2.5 ${testResult.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
            {testResult.ok
              ? `✓ Conectado com sucesso${testResult.totalInstances != null ? ` — ${testResult.totalInstances} instância(s) na conta` : ""}.`
              : `✗ ${testResult.error || "Falha ao conectar."}`}
          </p>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6 items-start">
        <form onSubmit={create} className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 space-y-3.5">
          <SectionHeader icon="📞" title="Conectar novo número" subtitle="Informe os dados do número WhatsApp para conectar ao sistema." />
          <Field label="Nome da conexão" value={form.label} onChange={(v) => setForm((f) => ({ ...f, label: v }))} placeholder="Ex.: Comercial 1" />
          <div>
            <span className="text-xs text-slate-400">Número (com DDI)</span>
            <div className="flex gap-2 mt-0.5">
              <select
                value={form.ddi}
                onChange={(e) => setForm((f) => ({ ...f, ddi: e.target.value }))}
                className="w-20 text-sm border border-slate-200 rounded-lg px-2 py-2 bg-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-shadow shrink-0"
              >
                <option value="55">🇧🇷 55</option>
                <option value="1">🇺🇸 1</option>
                <option value="351">🇵🇹 351</option>
              </select>
              <input
                value={form.number}
                onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
                placeholder="11 99999-8888"
                className="flex-1 text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-shadow"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Inclua o DDD. Ex.: 11 99999-8888</p>
          </div>
          <div>
            <Field label="Instância (Evolution)" value={form.instance} onChange={(v) => setForm((f) => ({ ...f, instance: v }))} placeholder="ex.: comercial1" />
            <p className="text-[11px] text-slate-400 mt-1">Informe a instância criada no servidor Evolution.</p>
          </div>
          <label className="block">
            <span className="text-xs text-slate-400">Atribuir a um usuário</span>
            <select
              value={form.userId}
              onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
              className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-shadow"
            >
              <option value="">— Sem responsável —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 mt-1">O número ficará disponível para toda a equipe.</p>
          </label>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-emerald-500 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 transition-colors"
          >
            <span>💬</span> {saving ? "Conectando…" : "Conectar número (gera QR)"}
          </button>
          <p className="flex items-start gap-2 text-[11px] text-sky-700 bg-sky-50 rounded-lg p-2.5">
            <span>ℹ️</span> Após conectar, um QR Code será gerado para autenticação do número no WhatsApp.
          </p>
        </form>

        <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5">
          <SectionHeader icon="📶" title={`Números conectados (${numeros.length})`} subtitle="Gerencie os números já conectados ao sistema." />
          <ul className="mt-4 space-y-2">
            {numeros.map((n) => {
              const conectado = status.find((s) => s.id === n.id)?.state === "open";
              const quando = conectado ? fmtData(n.conectadoEm) : fmtData(n.desconectadoEm);
              return (
                <li key={n.id} className="relative">
                  <button
                    type="button"
                    onClick={() => setConfiguringId(n.id)}
                    className="w-full flex items-center gap-3 p-3 text-left rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-colors"
                  >
                    <span className="w-9 h-9 rounded-full bg-emerald-500 text-white flex items-center justify-center text-base shrink-0">💬</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-700 truncate flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${conectado ? "bg-emerald-500" : "bg-red-500"}`} />
                        {n.label}
                        {n.padrao && (
                          <span className="text-[10px] font-medium bg-violet-50 text-violet-600 rounded-full px-1.5 py-0.5">Padrão</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-400 truncate">{n.number}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span
                        className={`inline-block text-[11px] font-medium rounded-full px-2 py-1 ${
                          conectado ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"
                        }`}
                      >
                        {conectado ? "Online" : "Offline"}
                      </span>
                      {quando && (
                        <p className="text-[10px] text-slate-400 mt-1">
                          {conectado ? "Conectado em " : "Desconectado em "}{quando}
                        </p>
                      )}
                    </div>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); setMenuId((m) => (m === n.id ? null : n.id)); }}
                      className="shrink-0 text-slate-400 hover:text-slate-600 px-1.5 py-1 rounded hover:bg-slate-100"
                    >
                      ⋮
                    </span>
                    <span className="text-slate-300 shrink-0">›</span>
                  </button>

                  {menuId === n.id && (
                    <div
                      className="absolute right-10 top-14 z-10 bg-white border border-slate-200 rounded-xl shadow-lg py-1 w-44 text-sm"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button onClick={() => { setMenuId(null); conectar(n); }} className="w-full text-left px-3 py-2 text-emerald-600 hover:bg-slate-50">Conectar (QR)</button>
                      <button
                        onClick={async () => {
                          setMenuId(null);
                          if (!confirm(`Desconectar ${n.label}?`)) return;
                          const ok = await disconnect(n.id);
                          if (ok) load();
                        }}
                        className="w-full text-left px-3 py-2 text-amber-600 hover:bg-slate-50"
                      >
                        Desconectar
                      </button>
                      <button onClick={() => { setMenuId(null); setPadrao(n.id, !n.padrao); }} className="w-full text-left px-3 py-2 text-slate-600 hover:bg-slate-50">
                        {n.padrao ? "Remover como padrão" : "Marcar como padrão"}
                      </button>
                      <button onClick={() => { setMenuId(null); remove(n.id); }} className="w-full text-left px-3 py-2 text-red-500 hover:bg-slate-50">Remover</button>
                    </div>
                  )}
                </li>
              );
            })}
            {numeros.length === 0 && <li className="py-4 text-sm text-slate-400">Nenhum número conectado.</li>}
          </ul>
          <button
            type="button"
            onClick={openHistory}
            className="w-full flex items-center justify-between text-xs text-slate-500 hover:text-slate-700 border-t border-slate-100 mt-4 pt-3"
          >
            <span className="flex items-center gap-1.5">🕓 Ver histórico de conexões</span>
            <span>›</span>
          </button>
        </div>
      </div>

      {/* Painel de histórico de conexões */}
      {history && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={() => setHistory(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] overflow-y-auto thin-scroll" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
              <h3 className="font-semibold text-slate-800">Histórico de conexões</h3>
              <button onClick={() => setHistory(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <ul className="p-3 divide-y divide-slate-50">
              {history.map((h) => (
                <li key={h.id} className="flex items-center gap-3 py-2.5 px-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${h.evento === "conectado" ? "bg-emerald-500" : "bg-red-500"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-700 truncate">
                      {h.numero?.label || "Número removido"} <span className="text-slate-400">{h.evento === "conectado" ? "conectou" : "desconectou"}</span>
                    </p>
                    <p className="text-[11px] text-slate-400">{fmtData(h.createdAt)}</p>
                  </div>
                </li>
              ))}
              {history.length === 0 && <li className="py-8 text-center text-sm text-slate-400">Nenhum evento registrado ainda.</li>}
            </ul>
          </div>
        </div>
      )}

      {/* Modal de configuração do número */}
      {configuringId && (() => {
        const n = numeros.find((x) => x.id === configuringId);
        if (!n) return null;
        const conectado = status.find((s) => s.id === n.id)?.state === "open";
        return (
          <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={() => setConfiguringId(null)}>
            <div
              className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto thin-scroll"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${conectado ? "bg-emerald-500" : "bg-red-500"}`}
                    title={conectado ? "Conectado" : "Desconectado"}
                  />
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-800 truncate">{n.label}</h3>
                    <p className="text-xs text-slate-400 truncate">{n.number} · instância: {n.instance}</p>
                  </div>
                </div>
                <button onClick={() => setConfiguringId(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none shrink-0 pl-3">×</button>
              </div>

              <div className="p-5 space-y-5">
                <div className="flex items-center gap-4 text-xs">
                  <button onClick={() => conectar(n)} className="text-emerald-600 hover:text-emerald-700 font-medium">
                    Conectar (QR)
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm(`Desconectar ${n.label}? Encerra a sessão do WhatsApp (o número continua cadastrado).`)) return;
                      const ok = await disconnect(n.id);
                      if (ok) alert("Desconectado com sucesso.");
                    }}
                    disabled={disconnecting === n.id}
                    className="text-amber-600 hover:text-amber-700 disabled:opacity-50"
                  >
                    {disconnecting === n.id ? "Desconectando…" : "Desconectar"}
                  </button>
                  <button
                    onClick={() => { remove(n.id); setConfiguringId(null); }}
                    className="text-red-400 hover:text-red-600"
                  >
                    Remover
                  </button>
                </div>

                <div className="grid gap-3">
                  <label className="block">
                    <span className="text-xs text-slate-400">Usuário responsável</span>
                    <select
                      value={n.userId || ""}
                      onChange={(e) => reassign(n.id, e.target.value)}
                      className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-shadow"
                    >
                      <option value="">— Sem responsável —</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs text-slate-400">Agente de IA</span>
                    <select
                      value={n.agentId || ""}
                      onChange={(e) => setAgent(n.id, e.target.value)}
                      className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-shadow"
                    >
                      <option value="">— Sem IA —</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="bg-slate-50 rounded-xl p-3.5 space-y-3">
                  <p className="text-xs font-medium text-slate-500">
                    Cobrança automática — lembrete diário 1h30 antes do horário limite
                  </p>
                  <label className="block">
                    <span className="text-xs text-slate-400">Estados (UF) que atende</span>
                    <EstadosSeletor
                      value={n.estadosCobranca || ""}
                      onChange={(v) => setCobranca(n.id, "estadosCobranca", v)}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-slate-400">Mensagem de cobrança</span>
                    <textarea
                      defaultValue={n.mensagemCobranca || ""}
                      onBlur={(e) => setCobranca(n.id, "mensagemCobranca", e.target.value)}
                      placeholder="Ex.: Oi! Passando pra lembrar que sua parcela de hoje vence às 10h. Já pode fazer o pagamento?"
                      rows={2}
                      className="mt-0.5 w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-shadow"
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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
        <form onSubmit={createTag} className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 space-y-3 h-fit">
          <h2 className="font-semibold text-slate-800">Nova tag</h2>
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

        <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5">
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
      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 space-y-3">
        <h2 className="font-semibold text-slate-800">Auto-tag pela 1ª mensagem</h2>
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
              className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-shadow"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Atribuir etiqueta</span>
            <select
              value={ruleForm.tagId}
              onChange={(e) => setRuleForm((f) => ({ ...f, tagId: e.target.value }))}
              className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-shadow"
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
  const [busca, setBusca] = useState("");
  const [menuId, setMenuId] = useState(null);
  const [showVariaveis, setShowVariaveis] = useState(false);
  const fileRef = useRef(null);
  const bodyRef = useRef(null);

  const editando = editId !== null;
  const templatesFiltrados = templates.filter((t) => !busca.trim() || t.title.toLowerCase().includes(busca.trim().toLowerCase()));

  // Insere no textarea da mensagem na posição do cursor (ou envolve o texto
  // selecionado, pro caso de negrito/itálico), mantendo o foco.
  function inserirNoTexto(before, after = "") {
    const el = bodyRef.current;
    if (!el) return;
    const start = el.selectionStart ?? form.body.length;
    const end = el.selectionEnd ?? form.body.length;
    const selecionado = form.body.slice(start, end);
    const novo = form.body.slice(0, start) + before + selecionado + after + form.body.slice(end);
    setForm((f) => ({ ...f, body: novo }));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + before.length + selecionado.length + after.length;
      el.setSelectionRange(pos, pos);
    });
  }

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
      mediaBase64: t.mediaUrl || null,
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
    let contactPhone = form.contactPhone;
    if (mt === "contact") {
      // Corrige a digitação sozinho (tira espaço/traço/parênteses, completa o
      // DDI 55 se faltar) — evita contato do cobrador salvo com número quebrado.
      const normalized = normalizeBrPhone(form.contactPhone);
      if (!normalized) {
        setError('Telefone do contato inválido — use DDD + número (ex.: 11948528114 ou 5511948528114).');
        return;
      }
      contactPhone = normalized;
    }
    setSaving(true);
    const res = await fetch(editando ? `/api/templates/${editId}` : "/api/templates", {
      method: editando ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, contactPhone, mediaType: mt === "text" ? null : mt }),
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
      <form onSubmit={save} className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 space-y-3 h-fit">
        <SectionHeader icon="💬" title={editando ? "Editar mensagem" : "Nova mensagem pronta"} />
        <label className="block">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Título (aparece no seletor)</span>
            <span className="text-[11px] text-slate-300">{form.title.length}/80</span>
          </div>
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value.slice(0, 80) }))}
            placeholder="Ex.: Saudação inicial"
            className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-shadow"
          />
        </label>

        {/* Tipo */}
        <label className="block">
          <span className="text-xs text-slate-400">Tipo</span>
          <select
            value={mt}
            onChange={(e) => setForm((f) => ({ ...f, mediaType: e.target.value, mediaBase64: null, mediaMimetype: null, mediaFileName: null }))}
            className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-shadow"
          >
            {MEDIA_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>

        {/* Texto */}
        {mt === "text" && (
          <div>
            <span className="text-xs text-slate-400">Mensagem</span>
            <div className="mt-0.5 border border-slate-200 rounded-lg overflow-hidden focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-100 transition-shadow">
              <div className="flex items-center gap-1 px-2 py-1.5 border-b border-slate-100 bg-slate-50/60">
                <button type="button" title="Negrito" onClick={() => inserirNoTexto("*", "*")} className="w-7 h-7 rounded hover:bg-slate-200/60 text-sm font-bold text-slate-500">B</button>
                <button type="button" title="Itálico" onClick={() => inserirNoTexto("_", "_")} className="w-7 h-7 rounded hover:bg-slate-200/60 text-sm italic text-slate-500">I</button>
                <span className="w-px h-4 bg-slate-200 mx-0.5" />
                <button type="button" title="Lista com marcadores" onClick={() => inserirNoTexto("\n- ")} className="w-7 h-7 rounded hover:bg-slate-200/60 text-sm text-slate-500">☰</button>
                <button type="button" title="Lista numerada" onClick={() => inserirNoTexto("\n1. ")} className="w-7 h-7 rounded hover:bg-slate-200/60 text-xs text-slate-500">1.</button>
                <span className="w-px h-4 bg-slate-200 mx-0.5" />
                <button type="button" title="Link" onClick={() => inserirNoTexto("", " (https://)")} className="w-7 h-7 rounded hover:bg-slate-200/60 text-sm text-slate-500">🔗</button>
                <button type="button" title="Emoji" onClick={() => inserirNoTexto("🙂")} className="w-7 h-7 rounded hover:bg-slate-200/60 text-sm text-slate-500">🙂</button>
                <div className="relative ml-auto">
                  <button type="button" onClick={() => setShowVariaveis((v) => !v)} className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 px-1.5">
                    Variáveis <span className="text-[9px]">▾</span>
                  </button>
                  {showVariaveis && (
                    <div className="absolute right-0 mt-1 z-20 bg-white border border-slate-200 rounded-lg shadow-lg py-1 w-56 text-sm">
                      {VARIAVEIS_DISPONIVEIS.map((v) => (
                        <button
                          key={v.key}
                          type="button"
                          onClick={() => { inserirNoTexto(`{{${v.key}}}`); setShowVariaveis(false); }}
                          className="w-full text-left px-3 py-1.5 hover:bg-slate-50"
                        >
                          <span className="text-emerald-600 font-mono text-xs">{"{{" + v.key + "}}"}</span>
                          <span className="text-slate-400 text-xs ml-1.5">{v.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <textarea
                ref={bodyRef}
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                rows={5}
                placeholder="Ex.: Olá! Tudo bem? Aqui é da Controller…"
                className="w-full text-sm px-2.5 py-2 outline-none resize-none"
              />
            </div>
          </div>
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
                className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-shadow"
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

      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <SectionHeader icon="🗂️" title={`Mensagens cadastradas (${templates.length})`} />
          <div className="relative w-44 shrink-0">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300 text-xs">🔍</span>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar mensagens…"
              className="w-full text-xs border border-slate-200 rounded-lg pl-7 pr-2 py-1.5 outline-none focus:border-emerald-400 transition-shadow"
            />
          </div>
        </div>
        <ul className="divide-y divide-slate-100">
          {templatesFiltrados.map((t) => (
            <li
              key={t.id}
              className={`relative py-2.5 ${editId === t.id ? "bg-emerald-50/50 -mx-2 px-2 rounded" : ""}`}
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
                  <button
                    onClick={() => setMenuId((m) => (m === t.id ? null : t.id))}
                    className="text-slate-400 hover:text-slate-600 px-1 rounded hover:bg-slate-100"
                  >
                    ⋮
                  </button>
                </div>
              </div>
              {menuId === t.id && (
                <div className="absolute right-2 top-9 z-10 bg-white border border-slate-200 rounded-xl shadow-lg py-1 w-40 text-sm">
                  <button onClick={() => { setMenuId(null); startEdit(t); }} className="w-full text-left px-3 py-1.5 text-slate-600 hover:bg-slate-50">Editar</button>
                  <button
                    onClick={async () => {
                      setMenuId(null);
                      await fetch("/api/templates", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ ...t, title: t.title + " (cópia)" }),
                      });
                      load();
                    }}
                    className="w-full text-left px-3 py-1.5 text-slate-600 hover:bg-slate-50"
                  >
                    Duplicar
                  </button>
                  <button onClick={() => { setMenuId(null); remove(t.id); }} className="w-full text-left px-3 py-1.5 text-red-500 hover:bg-slate-50">Excluir</button>
                </div>
              )}
            </li>
          ))}
          {templatesFiltrados.length === 0 && (
            <li className="py-4 text-sm text-slate-400">
              {templates.length === 0 ? "Nenhuma mensagem ainda." : "Nenhuma mensagem encontrada."}
            </li>
          )}
        </ul>
      </div>

      <div className="md:col-span-2 flex items-center justify-between gap-3 text-xs text-slate-500 bg-sky-50 rounded-xl p-3">
        <span className="flex items-center gap-1.5">ℹ️ Dica: use variáveis para personalizar suas mensagens automaticamente.</span>
        <button type="button" onClick={() => setShowVariaveis((v) => !v)} className="border border-slate-200 bg-white rounded-lg px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-50 shrink-0">
          {"</>"} Ver variáveis disponíveis
        </button>
      </div>
    </div>
  );
}

/* ---------------- Automação do funil (responsável por etapa) ---------------- */
// Ícone por etapa (só estética — cai num ícone genérico se o nome não bater).
const STAGE_ICON = {
  "novo": "✨", "em conversa": "💬", "documentação": "📄", "análise": "📈",
  "liberação pagamento": "💲", "recebimento": "✅", "pago": "🏦",
  "cravo": "⛔", "venda perdida": "⛔", "aguardando cobrador": "⏳",
};
function iconeEtapa(nome) {
  return STAGE_ICON[(nome || "").toLowerCase()] || "🔹";
}

function AutomacaoFunil() {
  const [stages, setStages] = useState([]);
  const [users, setUsers] = useState([]);
  const [savedId, setSavedId] = useState(null);
  const [horario, setHorario] = useState({ horarioComercialInicio: "", horarioComercialFim: "" });
  const [showHorario, setShowHorario] = useState(false);
  const [savingHorario, setSavingHorario] = useState(false);
  const [history, setHistory] = useState(null);

  const load = useCallback(async () => {
    const [s, u, cfg] = await Promise.all([
      fetch("/api/stages").then((r) => r.json()),
      fetch("/api/users").then((r) => r.json()),
      fetch("/api/config").then((r) => r.json()).catch(() => ({})),
    ]);
    setStages(Array.isArray(s) ? s : []);
    setUsers(Array.isArray(u) ? u : []);
    setHorario({
      horarioComercialInicio: cfg?.horarioComercialInicio || "",
      horarioComercialFim: cfg?.horarioComercialFim || "",
    });
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

  async function salvarHorario() {
    setSavingHorario(true);
    await fetch("/api/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(horario),
    });
    setSavingHorario(false);
    setShowHorario(false);
  }

  async function openHistory() {
    const logs = await fetch("/api/automacao/historico").then((r) => r.json()).catch(() => []);
    setHistory(Array.isArray(logs) ? logs : []);
  }

  function fmtData(d) {
    return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="grid lg:grid-cols-3 gap-6 items-start">
      <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="font-semibold text-slate-800">Configure responsáveis automáticos por etapa</h2>
            <p className="text-xs text-slate-400 mt-1 max-w-md">
              Quando um lead entra numa etapa, ele é atribuído automaticamente ao usuário escolhido aqui (pode ser levado em conta também o horário comercial).
            </p>
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-x-4 text-[11px] font-medium text-slate-400 uppercase tracking-wide px-1 pb-2 border-b border-slate-100">
          <span>Etapas do funil</span>
          <span>Responsável automático</span>
        </div>
        <ul className="divide-y divide-slate-100">
          {stages.map((s) => (
            <li key={s.id} className="py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-base shrink-0">{iconeEtapa(s.name)}</span>
                <span className="text-sm text-slate-700 truncate">{s.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {savedId === s.id && <span className="text-xs text-emerald-600">salvo ✓</span>}
                <select
                  value={s.autoResponsavel || ""}
                  onChange={(e) => setAuto(s.id, e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-shadow"
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

      <div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-5">
        <span className="w-10 h-10 rounded-xl bg-white text-emerald-600 flex items-center justify-center text-lg shadow-sm">🛡️</span>
        <h3 className="font-semibold text-slate-800 mt-3">Como funciona?</h3>
        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
          O responsável será atribuído automaticamente sempre que um lead entrar na etapa correspondente.
        </p>
        <p className="text-xs text-slate-500 mt-2 leading-relaxed">
          Considere o horário comercial configurado para aplicar as regras de automação com precisão.
          {horario.horarioComercialInicio && horario.horarioComercialFim && (
            <span className="block mt-1 font-medium text-emerald-700">
              Ativo das {horario.horarioComercialInicio} às {horario.horarioComercialFim}
            </span>
          )}
        </p>

        <button
          type="button"
          onClick={() => setShowHorario(true)}
          className="w-full flex items-center justify-center gap-1.5 bg-white border border-emerald-200 text-emerald-700 rounded-lg py-2 text-sm font-medium mt-4 hover:bg-emerald-50 transition-colors"
        >
          🕓 Configurar horário comercial
        </button>
        <button
          type="button"
          onClick={openHistory}
          className="w-full flex items-center justify-between text-xs text-slate-500 hover:text-slate-700 mt-3 pt-3 border-t border-emerald-100"
        >
          <span className="flex items-center gap-1.5">ℹ️ Ver histórico de atribuições</span>
          <span>›</span>
        </button>
      </div>

      {/* Modal: horário comercial */}
      {showHorario && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={() => setShowHorario(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-800 mb-1">Horário comercial da automação</h3>
            <p className="text-xs text-slate-400 mb-4">
              Fora dessa janela, o lead entra na etapa mas não é atribuído automaticamente. Deixe em branco para a automação ficar sempre ativa.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-slate-400">Início</span>
                <input
                  type="time"
                  value={horario.horarioComercialInicio}
                  onChange={(e) => setHorario((h) => ({ ...h, horarioComercialInicio: e.target.value }))}
                  className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-shadow"
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-400">Fim</span>
                <input
                  type="time"
                  value={horario.horarioComercialFim}
                  onChange={(e) => setHorario((h) => ({ ...h, horarioComercialFim: e.target.value }))}
                  className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-shadow"
                />
              </label>
            </div>
            <div className="flex gap-2 mt-5">
              <button type="button" onClick={() => setShowHorario(false)} className="flex-1 border border-slate-200 text-slate-600 rounded-lg py-2 text-sm font-medium hover:bg-slate-50 transition-colors">
                Cancelar
              </button>
              <button type="button" onClick={salvarHorario} disabled={savingHorario} className="flex-1 bg-emerald-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 transition-colors">
                {savingHorario ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Painel: histórico de atribuições */}
      {history && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={() => setHistory(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] overflow-y-auto thin-scroll" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
              <h3 className="font-semibold text-slate-800">Histórico de atribuições</h3>
              <button onClick={() => setHistory(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <ul className="p-3 divide-y divide-slate-50">
              {history.map((h) => (
                <li key={h.id} className="py-2.5 px-2">
                  <p className="text-sm text-slate-700">
                    <span className="font-medium">{h.contactName}</span> entrou em <span className="font-medium">{h.stageName}</span> → atribuído a <span className="text-emerald-600">{h.responsavel}</span>
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{fmtData(h.createdAt)}</p>
                </li>
              ))}
              {history.length === 0 && <li className="py-8 text-center text-sm text-slate-400">Nenhuma atribuição registrada ainda.</li>}
            </ul>
          </div>
        </div>
      )}
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
  { value: "anthropic/claude-haiku-4-5", label: "Claude Haiku 4.5 (Anthropic, ~25x mais caro que o Llama 70B)" },
  { value: "deepseek-ai/DeepSeek-V3", label: "DeepSeek V3" },
  { value: "deepseek-ai/DeepSeek-V3-0324", label: "DeepSeek V3 (0324)" },
  { value: "deepseek-ai/DeepSeek-V3.1", label: "DeepSeek V3.1" },
  { value: "deepseek-ai/DeepSeek-V3.1-Terminus", label: "DeepSeek V3.1 Terminus" },
  { value: "deepseek-ai/DeepSeek-V3.2", label: "DeepSeek V3.2 (mais recente da linha V3)" },
  { value: "deepseek-ai/DeepSeek-V4-Flash", label: "DeepSeek V4 Flash (rápido e barato)" },
  { value: "deepseek-ai/DeepSeek-V4-Pro", label: "DeepSeek V4 Pro (mais forte da linha)" },
  { value: "deepseek-ai/DeepSeek-R1-0528", label: "DeepSeek R1 (raciocínio, mais lento)" },
  { value: "google/gemini-1.5-flash-8b", label: "Gemini 1.5 Flash 8B (mais barato da linha Gemini)" },
  { value: "google/gemini-1.5-flash", label: "Gemini 1.5 Flash" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { value: "google/gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite" },
  { value: "google/gemini-3.1-pro", label: "Gemini 3.1 Pro (mais forte da linha Gemini)" },
  { value: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash (mais recente)" },
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
          <h3 className="font-semibold text-slate-800">Prompt da IA</h3>
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
    <form onSubmit={save} className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 max-w-lg space-y-3">
      <h2 className="font-semibold text-slate-800">Tokens</h2>
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
  toolSendTemplate: false, toolMoveStage: false, stopAtStageId: "",
};

// Vários agentes de IA — cada um com prompt/modelos próprios. Cada número (aba
// Números) escolhe qual agente atende, ou nenhum.
function AgentesIa() {
  const [agents, setAgents] = useState([]);
  const [stages, setStages] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(emptyAgent);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [agentError, setAgentError] = useState("");
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [newAgentModalOpen, setNewAgentModalOpen] = useState(false);

  const load = useCallback(async () => {
    const [list, st] = await Promise.all([
      fetch("/api/ia/agents").then((r) => r.json()).catch(() => []),
      fetch("/api/stages").then((r) => r.json()).catch(() => []),
    ]);
    setAgents(Array.isArray(list) ? list : []);
    setStages(Array.isArray(st) ? st.map((s) => ({ id: s.id, name: s.name })) : []);
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
      stopAtStageId: a.stopAtStageId || "",
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
    setAgentError("");
    let body = form;
    if (form.toolSendContact && form.toolContactPhone.trim()) {
      // Corrige a digitação sozinho, igual às mensagens prontas de contato.
      const normalized = normalizeBrPhone(form.toolContactPhone);
      if (!normalized) {
        setAgentError('Telefone do contato inválido — use DDD + número (ex.: 11948528114 ou 5511948528114).');
        return;
      }
      body = { ...form, toolContactPhone: normalized };
    }
    setSaving(true);
    await fetch(`/api/ia/agents/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    load();
  }

  return (
    <div className="grid md:grid-cols-[220px_1fr] gap-6">
      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-3">
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
        <form onSubmit={save} className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 space-y-3">
          <Field label="Nome do agente" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Ex.: Atendimento comercial" />

          <label className="block">
            <span className="text-xs text-slate-400">Modelo Llama (texto)</span>
            <select
              value={form.textModel}
              onChange={(e) => setForm((f) => ({ ...f, textModel: e.target.value }))}
              className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-shadow"
            >
              {TEXT_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-slate-400">Provedor de voz (TTS)</span>
            <select
              value={form.ttsProvider}
              onChange={(e) => setForm((f) => ({ ...f, ttsProvider: e.target.value, ttsVoice: "" }))}
              className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-shadow"
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
                  className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-shadow"
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
                    className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-shadow"
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
              className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-shadow"
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

            <label className="block">
              <span className="text-xs text-slate-400">Parar de responder a partir de qual etapa</span>
              <select
                value={form.stopAtStageId}
                onChange={(e) => setForm((f) => ({ ...f, stopAtStageId: e.target.value }))}
                className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-shadow"
              >
                <option value="">— Nunca parar (sempre responde) —</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">
                Quando o lead entrar nesta etapa (ou qualquer etapa depois dela no funil), a IA para de responder — o atendimento vira 100% humano a partir daí.
              </p>
            </label>
          </div>

          <p className="text-xs text-slate-400 border-t border-slate-100 pt-3">
            Escolha em quais números este (ou outro) agente vai atender na aba{" "}
            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("configuracoes:tab", { detail: "numeros" }))} className="underline text-emerald-600">
              Números
            </button>.
          </p>

          {agentError && <p className="text-xs text-red-500">{agentError}</p>}
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
        <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 flex items-center justify-center text-sm text-slate-400">
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
        <h3 className="font-semibold text-slate-800">Novo agente</h3>
        <label className="block">
          <span className="text-xs text-slate-400">Nome do agente</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            placeholder="Ex.: Atendimento comercial"
            className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-shadow"
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

// Cabeçalho padrão de card: ícone em caixa colorida + título + subtítulo
function SectionHeader({ icon, title, subtitle }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-base shrink-0">
        {icon}
      </span>
      <div className="min-w-0">
        <h2 className="font-semibold text-slate-800 truncate">{title}</h2>
        {subtitle && <p className="text-xs text-slate-400 truncate">{subtitle}</p>}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-shadow"
      />
    </label>
  );
}

// Seletor com todos os estados do Brasil (checkbox múltiplo, pra um número
// poder atender mais de um estado). Armazena/recebe como string "SP,MG".
function EstadosSeletor({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const saveTimer = useRef(null);
  // Estado local (não só derivado de `value`): cliques em sequência rápida
  // não podem se basear na prop antiga, senão o clique seguinte sobrescreve
  // o anterior antes do componente pai re-renderizar.
  const [selecionados, setSelecionados] = useState(() =>
    (value || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
  );

  useEffect(() => {
    setSelecionados((value || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean));
  }, [value]);

  useEffect(() => {
    if (!open) return;
    function onClickFora(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickFora);
    return () => document.removeEventListener("mousedown", onClickFora);
  }, [open]);

  // Debounce: cliques rápidos em sequência só disparam 1 PATCH no final —
  // evita que 2 requisições concorrentes cheguem fora de ordem e uma
  // sobrescreva a outra no banco.
  function toggle(uf) {
    setSelecionados((atual) => {
      const novo = atual.includes(uf) ? atual.filter((s) => s !== uf) : [...atual, uf];
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => onChange(novo.join(",")), 500);
      return novo;
    });
  }

  return (
    <div className="relative mt-0.5" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-xs text-left border border-slate-200 rounded px-2 py-1 bg-white outline-none focus:border-emerald-400 truncate"
      >
        {selecionados.length ? selecionados.join(", ") : <span className="text-slate-400">Selecionar estados…</span>}
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-56 max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg p-1.5 grid grid-cols-2 gap-x-2">
          {UF_LIST.map(({ uf, name }) => (
            <label key={uf} className="flex items-center gap-1.5 text-xs py-0.5 cursor-pointer hover:bg-slate-50 rounded px-1">
              <input
                type="checkbox"
                checked={selecionados.includes(uf)}
                onChange={() => toggle(uf)}
                className="accent-emerald-500"
              />
              <span className="truncate" title={name}>{uf}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
