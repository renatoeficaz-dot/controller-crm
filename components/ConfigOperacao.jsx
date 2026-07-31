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

      <button disabled={saving} className="bg-emerald-500 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50">
        {saving ? "Salvando…" : saved ? "Salvo ✓" : "Salvar"}
      </button>
    </form>
  );
}
