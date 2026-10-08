"use client";
import { useEffect, useState } from "react";

export default function SnoopConfiguracao() {
  const [chave, setChave] = useState("");
  const [configurada, setConfigurada] = useState(false);
  const [ativo, setAtivo] = useState(false);
  const [carregado, setCarregado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  useEffect(() => {
    fetch("/api/config").then(async (r) => {
      if (!r.ok) throw new Error();
      const d = await r.json();
      setConfigurada(!!d.snoopApiKey); setAtivo(!!d.snoopAtivo); setErro(d.snoopErro || ""); setCarregado(true);
    }).catch(() => setErro("Não foi possível carregar a configuração."));
  }, []);
  async function salvar(e) {
    e.preventDefault(); setOcupado(true); setMensagem(""); setErro("");
    try {
      const r = await fetch("/api/config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snoopAtivo: ativo, ...(chave.trim() ? { snoopApiKey: chave.trim() } : {}) }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Não foi possível salvar.");
      setConfigurada(!!d.snoopApiKey); setChave(""); setMensagem(d.snoopAtivo ? "Chave salva. Consultas automáticas ativadas." : "Chave salva. Você já pode consultar pelo botão em Puxadas; o automático está desligado.");
    } catch (e) { setErro(e.message); }
    finally { setOcupado(false); }
  }
  return <form onSubmit={salvar} className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 max-w-lg space-y-3">
    <h2 className="font-semibold text-slate-800">SnoopIntelligence — Puxadas</h2>
    <p className="text-xs text-slate-500">Busca cadastro e telefones vinculados ao CPF do cliente. Nome, nascimento, endereços, e-mails e telefones disponíveis aparecem em Dados do contato → Puxadas. Cada tipo de consulta pode consumir créditos.</p>
    <label className="block text-xs text-slate-600">Chave da API
      <input type="password" autoComplete="new-password" value={chave} onChange={(e) => setChave(e.target.value)} placeholder={configurada ? "Chave cadastrada — preencha apenas para substituir" : "Cadastre a chave do SnoopIntelligence"} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
    </label>
    {configurada && <p className="text-xs text-emerald-600">Chave cadastrada</p>}
    <label className="flex items-start gap-2 text-sm text-slate-600"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="mt-1" />Consultar cadastro e telefones automaticamente pelo CPF</label>
    <p className="text-[11px] text-slate-400">Ao ativar, os CPFs já cadastrados também serão consultados em lotes. Resultados concluídos são reaproveitados. Com o automático desligado, use o botão da ficha.</p>
    {erro && <p role="alert" className="text-xs text-amber-700">{erro}</p>}
    {mensagem && <p role="status" className="text-xs text-emerald-600">{mensagem}</p>}
    <button disabled={!carregado || ocupado || (ativo && !configurada && !chave.trim())} className="bg-emerald-500 text-white rounded-lg px-4 py-2 text-sm hover:bg-emerald-600 disabled:opacity-50">{ocupado ? "Salvando…" : "Salvar SnoopIntelligence"}</button>
  </form>;
}
