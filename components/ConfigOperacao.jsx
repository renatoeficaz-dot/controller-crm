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
  const [novo, setNovo] = useState("");

  const load = useCallback(() => {
    fetch("/api/motivos-perda").then((r) => r.json()).then(setLista).catch(() => {});
  }, []);
  useEffect(load, [load]);

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

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 space-y-4 max-w-lg">
      <Cabecalho icone="proibido" titulo="Motivos de perda" subtitulo='Aparecem ao mover um lead para "Venda perdida" — sem escolher um, o sistema não deixa mover.' />
      <form onSubmit={adicionar} className="flex gap-2">
        <input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Ex.: Preço alto" className="flex-1 text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400" />
        <button className="text-sm bg-emerald-500 text-white rounded-lg px-3.5 hover:bg-emerald-600">+</button>
      </form>
      <ul className="divide-y divide-slate-50">
        {lista.map((m) => (
          <li key={m.id} className="flex items-center justify-between py-2 text-sm text-slate-700">
            {m.nome}
            <button onClick={() => remover(m.id)} className="text-slate-300 hover:text-red-500 text-xs">Remover</button>
          </li>
        ))}
        {lista.length === 0 && <li className="text-xs text-slate-400 py-2">Nenhum motivo cadastrado ainda.</li>}
      </ul>
    </div>
  );
}

/* ---------------- Links úteis ---------------- */
export function LinksUteisConfig() {
  const [lista, setLista] = useState([]);
  const [titulo, setTitulo] = useState("");
  const [url, setUrl] = useState("");

  const load = useCallback(() => {
    fetch("/api/links-uteis").then((r) => r.json()).then(setLista).catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function adicionar(e) {
    e.preventDefault();
    if (!titulo.trim() || !url.trim()) return;
    const res = await fetch("/api/links-uteis", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ titulo: titulo.trim(), url: url.trim() }),
    });
    if (res.ok) { setTitulo(""); setUrl(""); load(); }
  }
  async function remover(id) {
    await fetch(`/api/links-uteis/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 space-y-4 max-w-lg">
      <Cabecalho icone="link" titulo="Links úteis" subtitulo="Atalhos que a equipe usa no dia a dia — painel da Evolution, planilha, banco etc." />
      <form onSubmit={adicionar} className="flex flex-col gap-2">
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título (ex.: Painel Evolution)" className="text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400" />
        <div className="flex gap-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." className="flex-1 text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400" />
          <button className="text-sm bg-emerald-500 text-white rounded-lg px-3.5 hover:bg-emerald-600">+</button>
        </div>
      </form>
      <ul className="divide-y divide-slate-50">
        {lista.map((l) => (
          <li key={l.id} className="flex items-center justify-between py-2 text-sm gap-2">
            <a href={l.url} target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline truncate">
              {l.titulo}
            </a>
            <button onClick={() => remover(l.id)} className="text-slate-300 hover:text-red-500 text-xs shrink-0">Remover</button>
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
        pixAdimplentesMensagem: c.pixAdimplentesMensagem || null,
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
            <label className="block">
              <span className="text-xs text-slate-500">Mensagem</span>
              <textarea
                rows={4}
                value={c.pixAdimplentesMensagem || ""}
                onChange={set("pixAdimplentesMensagem")}
                placeholder={"Oi {{nome}}! Sua parcela de {{valor_parcela}} vence hoje. Pra facilitar, aqui está o Pix:\n\n{{pix_copia_cola}}"}
                className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400 resize-y"
              />
              <span className="block text-[10px] text-slate-400 mt-0.5">
                Use <code className="bg-slate-100 rounded px-1">{"{{pix_copia_cola}}"}</code> onde o código Pix deve entrar. Vazio = usa a mensagem padrão.
              </span>
            </label>
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
