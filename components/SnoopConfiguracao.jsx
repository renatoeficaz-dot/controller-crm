"use client";
import { useEffect, useState } from "react";
import { CONSULTAS_SNOOP, CAMPOS_SNOOP, lerOpcoesSnoop, PADRAO_SNOOP } from "@/lib/snoopOpcoes.mjs";

export default function SnoopConfiguracao() {
  const [chave, setChave] = useState("");
  const [configurada, setConfigurada] = useState(false);
  const [ativo, setAtivo] = useState(false);
  const [opcoes, setOpcoes] = useState(PADRAO_SNOOP);
  const [carregado, setCarregado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  useEffect(() => {
    fetch("/api/config").then(async (r) => {
      if (!r.ok) throw new Error();
      const d = await r.json();
      setOpcoes(lerOpcoesSnoop(d.snoopOpcoes));
      setConfigurada(!!d.snoopApiKey); setAtivo(!!d.snoopAtivo); setErro(d.snoopErro || ""); setCarregado(true);
    }).catch(() => setErro("Não foi possível carregar a configuração."));
  }, []);
  async function salvar(e) {
    e.preventDefault(); setOcupado(true); setMensagem(""); setErro("");
    try {
      const r = await fetch("/api/config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snoopAtivo: ativo, snoopOpcoes: opcoes, ...(chave.trim() ? { snoopApiKey: chave.trim() } : {}) }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Não foi possível salvar.");
      setConfigurada(!!d.snoopApiKey); setChave(""); setMensagem("Configuração salva. " + (!opcoes.consultas.length ? "Todas as consultas estão desativadas." : d.snoopAtivo ? "As consultas selecionadas serão executadas automaticamente." : "As consultas selecionadas serão executadas ao abrir Puxadas na ficha."));
    } catch (e) { setErro(e.message); }
    finally { setOcupado(false); }
  }
  function alternar(grupo, item) {
    setMensagem("");
    setOpcoes((atual) => ({ ...atual, [grupo]: atual[grupo].includes(item) ? atual[grupo].filter((v) => v !== item) : [...atual[grupo], item] }));
  }
  return <form onSubmit={salvar} className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 max-w-lg space-y-3">
    <h2 className="font-semibold text-slate-800">SnoopIntelligence — Puxadas</h2>
    <p className="text-xs text-slate-500">Escolha quais consultas do cliente executar e quais informações mostrar em Dados do contato → Puxadas. Cada consulta pode consumir créditos.</p>
    <fieldset disabled={!carregado || ocupado} className="space-y-2 rounded-xl border border-slate-200 p-3">
      <legend className="px-1 text-sm font-semibold text-slate-700">Consultas habilitadas</legend>
      {Object.entries(CONSULTAS_SNOOP).map(([id, nome]) => <label key={id} className="flex items-start gap-2 text-sm text-slate-600"><input type="checkbox" checked={opcoes.consultas.includes(id)} onChange={() => alternar("consultas", id)} className="mt-1" />{nome}</label>)}
      <p className="text-[11px] text-slate-500">Desmarcar impede novas consultas desse tipo e oculta seus resultados na ficha. O histórico salvo é preservado.</p>
    </fieldset>
    <fieldset disabled={!carregado || ocupado} className="space-y-2 rounded-xl border border-slate-200 p-3">
      <legend className="px-1 text-sm font-semibold text-slate-700">Campos exibidos no card</legend>
      <div className="grid grid-cols-2 gap-2">{Object.entries(CAMPOS_SNOOP).map(([id, nome]) => <label key={id} className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={opcoes.campos.includes(id)} onChange={() => alternar("campos", id)} />{nome}</label>)}</div>
      <p className="text-[11px] text-slate-500">Define somente a exibição dos resultados disponíveis, inclusive os já salvos. Não altera o conteúdo enviado pelo provedor nem o custo da consulta.</p>
    </fieldset>
    <label className="block text-xs text-slate-600">Chave da API
      <input type="password" autoComplete="new-password" value={chave} onChange={(e) => setChave(e.target.value)} placeholder={configurada ? "Chave cadastrada — preencha apenas para substituir" : "Cadastre a chave do SnoopIntelligence"} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
    </label>
    {configurada && <p className="text-xs text-emerald-600">Chave cadastrada</p>}
    <label className="block text-sm text-slate-600">Quando consultar
      <select value={ativo ? "automatico" : "manual"} onChange={(e) => setAtivo(e.target.value === "automatico")} disabled={!carregado || ocupado} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2">
        <option value="manual">Ao clicar em Puxadas</option>
        <option value="automatico">Automaticamente pelo CPF salvo</option>
      </select>
    </label>
    <p className="text-[11px] text-slate-400">Ao ativar, os CPFs já cadastrados também serão consultados em lotes. Resultados concluídos são reaproveitados. Com o automático desligado, use o botão da ficha.</p>
    {!opcoes.consultas.length && <p role="status" className="text-xs text-amber-700">Nenhuma consulta selecionada. Ao salvar, as puxadas ficarão desativadas.</p>}
    {opcoes.consultas.length > 0 && !opcoes.campos.length && <p role="status" className="text-xs text-amber-700">Nenhum campo selecionado. As consultas continuam habilitadas, mas seus dados ficarão ocultos no card.</p>}
    <p className="text-xs text-slate-500">Falhas da conta aparecem aqui. Resultados e erros de cada consulta aparecem em Puxadas na ficha do cliente.</p>
    {erro && <p role="alert" className="text-xs text-amber-700">{erro}</p>}
    {mensagem && <p role="status" className="text-xs text-emerald-600">{mensagem}</p>}
    <button disabled={!carregado || ocupado || (ativo && !configurada && !chave.trim())} className="bg-emerald-500 text-white rounded-lg px-4 py-2 text-sm hover:bg-emerald-600 disabled:opacity-50">{ocupado ? "Salvando…" : "Salvar SnoopIntelligence"}</button>
  </form>;
}
