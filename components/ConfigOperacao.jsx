"use client";

import { useCallback, useEffect, useState } from "react";
import Icone from "@/components/Icones";

function Cabecalho({ icone, titulo, subtitulo }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
        <Icone nome={icone} className="w-4.5 h-4.5" />
      </span>
      <div className="min-w-0">
        <h2 className="font-semibold text-slate-800">{titulo}</h2>
        {subtitulo && <p className="text-xs text-slate-400">{subtitulo}</p>}
      </div>
    </div>
  );
}

function Campo({ label, hint, ...props }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-500">{label}</span>
      <input {...props} className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400" />
      {hint && <span className="block text-[10px] text-slate-400 mt-0.5">{hint}</span>}
    </label>
  );
}

/* ---------------- Motivos de perda (item 13) ---------------- */
export function MotivosPerdaConfig() {
  const [lista, setLista] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [novo, setNovo] = useState("");

  const load = useCallback(() => {
    fetch("/api/motivos-perda").then((r) => r.json()).then(setLista).catch(() => {});
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    fetch("/api/templates?todos=1").then((r) => r.json()).then(setTemplates).catch(() => {});
  }, []);

  async function adicionar(e) {
    e.preventDefault();
    if (!novo.trim()) return;
    const res = await fetch("/api/motivos-perda", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: novo.trim() }),
    });
    if (res.ok) { setNovo(""); load(); }
  }
  async function remover(id) {
    await fetch(`/api/motivos-perda/${id}`, { method: "DELETE" });
    load();
  }
  async function mudarTemplate(id, templateId) {
    setLista((ls) => ls.map((m) => (m.id === id ? { ...m, templateId, template: templates.find((t) => t.id === templateId) || null } : m)));
    await fetch(`/api/motivos-perda/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateId: templateId || null }),
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 space-y-4 max-w-lg">
      <Cabecalho icone="proibido" titulo="Motivos de perda" subtitulo='Aparecem ao mover um lead para "Venda perdida" — sem escolher um, o sistema não deixa mover.' />
      <form onSubmit={adicionar} className="flex gap-2">
        <input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Ex.: Preço alto" className="flex-1 text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400" />
        <button className="text-sm bg-emerald-500 text-white rounded-lg px-3.5 hover:bg-emerald-600">+</button>
      </form>
      <ul className="divide-y divide-slate-50">
        {lista.map((m) => (
          <li key={m.id} className="py-2 text-sm text-slate-700 space-y-1.5">
            <div className="flex items-center justify-between">
              {m.nome}
              <button onClick={() => remover(m.id)} className="text-slate-300 hover:text-red-500 text-xs">Remover</button>
            </div>
            <select
              value={m.templateId || ""}
              onChange={(e) => mudarTemplate(m.id, e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-emerald-400 text-slate-500"
            >
              <option value="">Sem mensagem automática</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </li>
        ))}
        {lista.length === 0 && <li className="text-xs text-slate-400 py-2">Nenhum motivo cadastrado ainda.</li>}
      </ul>
    </div>
  );
}

/* ---------------- Links úteis ---------------- */
const LINK_VAZIO = { titulo: "", url: "", login: "", senha: "", observacao: "" };

export function LinksUteisConfig() {
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState(LINK_VAZIO);
  const [editId, setEditId] = useState(null);
  const [verSenhaForm, setVerSenhaForm] = useState(false);
  const [senhasVisiveis, setSenhasVisiveis] = useState({}); // id -> mostrando a senha na lista
  const [copiado, setCopiado] = useState("");
  const [erro, setErro] = useState("");
  const editando = editId !== null;

  const load = useCallback(() => {
    fetch("/api/links-uteis").then((r) => r.json()).then((d) => setLista(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);
  useEffect(load, [load]);

  function cancelar() { setEditId(null); setForm(LINK_VAZIO); setVerSenhaForm(false); setErro(""); }
  function iniciarEdicao(l) {
    setEditId(l.id);
    setErro("");
    setForm({ titulo: l.titulo || "", url: l.url || "", login: l.login || "", senha: l.senha || "", observacao: l.observacao || "" });
  }

  async function salvar(e) {
    e.preventDefault();
    if (!form.titulo.trim() || !form.url.trim()) return;
    setErro("");
    const res = await fetch(editando ? `/api/links-uteis/${editId}` : "/api/links-uteis", {
      method: editando ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    if (!res.ok) { setErro((await res.json().catch(() => ({}))).error || "Não foi possível salvar."); return; }
    cancelar();
    load();
  }
  async function remover(id) {
    if (!confirm("Remover este link?")) return;
    if (id === editId) cancelar();
    await fetch(`/api/links-uteis/${id}`, { method: "DELETE" });
    load();
  }
  async function copiar(chave, valor) {
    try { await navigator.clipboard.writeText(valor); setCopiado(chave); setTimeout(() => setCopiado(""), 1200); } catch {}
  }

  const input = "text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400";

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 space-y-4 max-w-lg">
      <Cabecalho icone="link" titulo="Links úteis" subtitulo="Atalhos que a equipe usa no dia a dia — painel da Evolution, planilha, banco etc. Pode guardar login, senha e observação de cada um." />
      <form onSubmit={salvar} className="flex flex-col gap-2">
        <input value={form.titulo} onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} placeholder="Título (ex.: Painel Evolution)" className={input} />
        <input value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://..." className={input} />
        <div className="grid grid-cols-2 gap-2">
          <input value={form.login} onChange={(e) => setForm((f) => ({ ...f, login: e.target.value }))} placeholder="Login (opcional)" autoComplete="off" className={input} />
          <div className="relative">
            <input
              type={verSenhaForm ? "text" : "password"}
              value={form.senha}
              onChange={(e) => setForm((f) => ({ ...f, senha: e.target.value }))}
              placeholder="Senha (opcional)"
              autoComplete="new-password"
              className={`${input} w-full pr-9`}
            />
            <button type="button" onClick={() => setVerSenhaForm((v) => !v)} title={verSenhaForm ? "Ocultar senha" : "Mostrar senha"} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <Icone nome={verSenhaForm ? "olho-fechado" : "olho"} className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <textarea value={form.observacao} onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))} rows={2} placeholder="Observação (opcional)" className={`${input} resize-none`} />
        {erro && <p className="text-xs text-red-500">{erro}</p>}
        <div className="flex gap-2">
          <button className="flex-1 text-sm bg-emerald-500 text-white rounded-lg py-2 hover:bg-emerald-600">{editando ? "Salvar alterações" : "Adicionar link"}</button>
          {editando && <button type="button" onClick={cancelar} className="px-3 text-sm text-slate-500 hover:text-slate-700">Cancelar</button>}
        </div>
      </form>
      <ul className="divide-y divide-slate-50">
        {lista.map((l) => (
          <li key={l.id} className={`py-2 text-sm ${editId === l.id ? "bg-emerald-50/60 -mx-2 px-2 rounded" : ""}`}>
            <div className="flex items-center justify-between gap-2">
              <a href={l.url} target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline truncate">
                {l.titulo}
              </a>
              <span className="shrink-0 flex items-center gap-3">
                <button onClick={() => iniciarEdicao(l)} className="text-slate-400 hover:text-emerald-600 text-xs">Editar</button>
                <button onClick={() => remover(l.id)} className="text-slate-300 hover:text-red-500 text-xs">Remover</button>
              </span>
            </div>
            {(l.login || l.senha) && (
              <div className="mt-1 text-xs text-slate-500 space-y-0.5">
                {l.login && (
                  <p className="flex items-center gap-2">
                    <span className="text-slate-400 w-10 shrink-0">Login</span>
                    <span className="truncate">{l.login}</span>
                    <button type="button" onClick={() => copiar(`l${l.id}`, l.login)} className="text-[10px] text-emerald-600 hover:text-emerald-700 shrink-0">{copiado === `l${l.id}` ? "copiado ✓" : "copiar"}</button>
                  </p>
                )}
                {l.senha && (
                  <p className="flex items-center gap-2">
                    <span className="text-slate-400 w-10 shrink-0">Senha</span>
                    <span className="truncate font-mono">{senhasVisiveis[l.id] ? l.senha : "••••••••"}</span>
                    <button type="button" onClick={() => setSenhasVisiveis((v) => ({ ...v, [l.id]: !v[l.id] }))} className="text-[10px] text-slate-400 hover:text-slate-600 shrink-0">{senhasVisiveis[l.id] ? "ocultar" : "mostrar"}</button>
                    <button type="button" onClick={() => copiar(`s${l.id}`, l.senha)} className="text-[10px] text-emerald-600 hover:text-emerald-700 shrink-0">{copiado === `s${l.id}` ? "copiado ✓" : "copiar"}</button>
                  </p>
                )}
              </div>
            )}
            {l.observacao && <p className="mt-1 text-xs text-slate-400 whitespace-pre-wrap">{l.observacao}</p>}
          </li>
        ))}
        {lista.length === 0 && <li className="text-xs text-slate-400 py-2">Nenhum link cadastrado ainda.</li>}
      </ul>
    </div>
  );
}

/* ---------------- SLA de resposta, aviso de acúmulo, Pix (itens 1/58/20) ---------------- */
export function OperacaoConfig() {
  const [c, setC] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then(setC).catch(() => {});
  }, []);

  async function salvar(e) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slaPrimeiraRespostaMin: c.slaPrimeiraRespostaMin === "" ? null : c.slaPrimeiraRespostaMin,
        avisoAcumuloLimite: c.avisoAcumuloLimite === "" ? null : c.avisoAcumuloLimite,
        pixChave: c.pixChave || null,
        pixNomeRecebedor: c.pixNomeRecebedor || null,
        pixCidade: c.pixCidade || null,
        pixAdimplentesAtivo: !!c.pixAdimplentesAtivo,
        pixAdimplentesDiasAntes: c.pixAdimplentesDiasAntes,
        pixAdimplentesHora: c.pixAdimplentesHora || "08:00",
        pixBanco: c.pixBanco || "Infinitepay",
      }),
    });
    setC(await res.json());
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  if (!c) return <p className="text-sm text-slate-400">Carregando…</p>;
  const set = (k) => (e) => setC((p) => ({ ...p, [k]: e.target.value }));

  return (
    <form onSubmit={salvar} className="space-y-6 max-w-2xl">
      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 space-y-4">
        <Cabecalho icone="alerta" titulo="SLA de primeira resposta" subtitulo="Avisa no card do funil quando um lead novo fica tempo demais sem nenhuma mensagem nossa." />
        <Campo label="Minutos sem resposta pra avisar" type="number" min="1" value={c.slaPrimeiraRespostaMin ?? ""} onChange={set("slaPrimeiraRespostaMin")} placeholder="vazio = desligado" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 space-y-4">
        <Cabecalho icone="alerta" titulo="Aviso de acúmulo" subtitulo="Mostra um selo na coluna do funil quando ela passa desse número de leads." />
        <Campo label="Limite de leads por coluna" type="number" min="1" value={c.avisoAcumuloLimite ?? ""} onChange={set("avisoAcumuloLimite")} placeholder="vazio = desligado" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 space-y-4">
        <Cabecalho icone="dinheiro" titulo="Pix por parcela" subtitulo="Sem isso preenchido, o botão de gerar Pix não aparece na cobrança." />
        <div className="grid sm:grid-cols-2 gap-3">
          <Campo label="Chave Pix" value={c.pixChave || ""} onChange={set("pixChave")} placeholder="CPF, e-mail, telefone ou aleatória" />
          <Campo label="Nome do recebedor" value={c.pixNomeRecebedor || ""} onChange={set("pixNomeRecebedor")} maxLength={25} />
          <Campo label="Cidade" value={c.pixCidade || ""} onChange={set("pixCidade")} maxLength={15} />
          <Campo label="Banco" value={c.pixBanco || ""} onChange={set("pixBanco")} maxLength={30} />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <Cabecalho
            icone="dinheiro"
            titulo="Mandar Pix sozinho pra quem está em dia"
            subtitulo='Todo dia, quem NÃO tem nenhuma parcela atrasada recebe o Pix da parcela que vence automaticamente. Atrasado fica de fora — isso é trabalho do cobrador.'
          />
          <button
            type="button"
            onClick={() => setC((p) => ({ ...p, pixAdimplentesAtivo: !p.pixAdimplentesAtivo }))}
            className={`relative shrink-0 w-9 h-5 rounded-full transition-colors ${c.pixAdimplentesAtivo ? "bg-emerald-500" : "bg-slate-200"}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${c.pixAdimplentesAtivo ? "translate-x-4" : ""}`} />
          </button>
        </div>
        {c.pixAdimplentesAtivo && (
          <>
            <div className="grid sm:grid-cols-2 gap-3">
              <Campo
                label="Manda com quantos dias de antecedência"
                type="number" min="0" max="5"
                value={c.pixAdimplentesDiasAntes ?? 0}
                onChange={set("pixAdimplentesDiasAntes")}
                hint="0 = só no dia do vencimento"
              />
              <Campo label="Horário do envio" type="time" value={c.pixAdimplentesHora || "08:00"} onChange={set("pixAdimplentesHora")} />
            </div>
            <div>
              <span className="text-xs text-slate-500">Mensagem que sai (padrão fixo — não editável)</span>
              <pre className="mt-0.5 text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 whitespace-pre-wrap font-sans text-slate-700">{[c.pixChave || "(chave Pix)", "Segue a chave Pix", (c.pixNomeRecebedor || "(recebedor)").replace(/\.$/, "") + ".", "Banco " + (c.pixBanco || "Infinitepay")].join("\n")}</pre>
              <span className="block text-[10px] text-slate-400 mt-0.5">A chave, o recebedor e o banco vêm dos campos de cima. O texto não pode ser digitado à mão para a chave nunca sair errada.</span>
            </div>
            {!c.pixChave && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                Cadastre a chave Pix acima antes de ativar — sem ela, nada é enviado.
              </p>
            )}
          </>
        )}
      </div>

      <button disabled={saving} className="bg-emerald-500 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50">
        {saving ? "Salvando…" : saved ? "Salvo ✓" : "Salvar"}
      </button>
    </form>
  );
}
