"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { formatarCPF, validarCPF } from "@/lib/cpf";

const rotulo = (chave) => ({ cpf: "CPF", rg: "RG", nome: "Nome", data_nascimento: "Nascimento", enderecos: "Endereços", telefones: "Telefones", emails: "E-mails", renda: "Renda", empregos: "Empregos" }[chave.toLowerCase()] || chave.replace(/_/g, " "));

function Dados({ valor }) {
  if (valor === null || valor === "") return <span className="text-slate-400">Não informado</span>;
  if (typeof valor === "boolean") return valor ? "Sim" : "Não";
  if (typeof valor !== "object") return <span className="whitespace-pre-wrap break-words">{String(valor)}</span>;
  if (Array.isArray(valor)) return valor.length ? <ul className="space-y-2">{valor.map((item, i) => <li key={i} className="border-l-2 border-slate-200 pl-2"><Dados valor={item} /></li>)}</ul> : <span className="text-slate-400">Nenhum registro</span>;
  return <dl className="space-y-2">{Object.entries(valor).map(([chave, item]) => <div key={chave}><dt className="text-[11px] text-slate-400 capitalize">{rotulo(chave)}</dt><dd className="text-xs text-slate-700"><Dados valor={item} /></dd></div>)}</dl>;
}

export default function PuxadasContato({ contactId, cpfSalvo, cpfDigitado }) {
  const painelId = useId();
  const [aberto, setAberto] = useState(false);
  const [estado, setEstado] = useState(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const normalizar = (v) => String(v || "").replace(/\D/g, "");
  const cpf = normalizar(estado?.cpf ?? cpfSalvo);
  const alterado = normalizar(cpfDigitado) !== normalizar(cpfSalvo);
  const atual = estado?.consultas?.find((c) => c.cpf === cpf);

  const carregar = useCallback(async (signal) => {
    const res = await fetch(`/api/contacts/${contactId}/puxadas`, { cache: "no-store", signal });
    const dados = await res.json();
    if (!res.ok) throw new Error(dados.error || "Não foi possível carregar as puxadas.");
    setEstado(dados);
  }, [contactId]);

  useEffect(() => {
    if (!aberto) return;
    const controle = new AbortController();
    const atualizar = () => carregar(controle.signal).catch((e) => { if (e.name !== "AbortError") setErro(e.message); });
    atualizar();
    const timer = setInterval(atualizar, 10000);
    return () => { controle.abort(); clearInterval(timer); };
  }, [aberto, carregar, cpfSalvo]);

  async function consultar() {
    setOcupado(true);
    setErro("");
    try {
      const res = await fetch(`/api/contacts/${contactId}/puxadas`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repetir: atual?.status === "erro" }) });
      const dados = await res.json();
      if (!res.ok) throw new Error(dados.error || "Falha ao consultar.");
      await carregar();
    } catch (e) { setErro(e.message); }
    finally { setOcupado(false); }
  }

  return <section className="rounded-xl border border-slate-200 bg-slate-50/60">
    <button type="button" aria-expanded={aberto} aria-controls={painelId} onClick={() => setAberto(!aberto)} className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-semibold text-slate-700">
      <span>Puxadas</span><span aria-hidden="true">{aberto ? "−" : "+"}</span>
    </button>
    {aberto && <div id={painelId} className="border-t border-slate-200 p-3 space-y-3">
      <p className="text-[11px] text-slate-500">Consultas do cliente · Fonte: DataAPI</p>
      {!estado && !erro && <p className="text-xs text-slate-400">Carregando…</p>}
      {estado && !estado.ativo && <p className="text-xs text-amber-700">Ative a DataAPI em Configurações → IA para consultar.</p>}
      {estado?.suspensao && <p role="status" className="text-xs text-amber-700">{estado.suspensao}</p>}
      {alterado && <p className="text-xs text-amber-700">Salve o CPF alterado antes de consultar.</p>}
      {!validarCPF(cpf) && <p className="text-xs text-slate-500">Preencha e salve um CPF válido na ficha.</p>}
      {erro && <p role="alert" className="text-xs text-red-600">{erro}</p>}
      {estado?.ativo && !estado.suspensao && atual?.status !== "concluida" && <button type="button" disabled={ocupado || alterado || !validarCPF(cpf) || (atual?.status === "consultando" && Date.now() - new Date(atual.atualizadoEm).getTime() < 120000)} onClick={consultar} className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs text-emerald-700 disabled:opacity-50">
        {ocupado ? "Consultando…" : atual?.status === "erro" ? "Tentar novamente (nova consulta)" : "Consultar CPF salvo"}
      </button>}
      {estado && !estado.consultas.length && <p className="text-xs text-slate-400">Nenhuma puxada registrada.</p>}
      {estado?.consultas?.map((consulta) => <div key={consulta.id} className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
        <p className="text-xs font-medium text-slate-700">CPF {formatarCPF(consulta.cpf)}{consulta.cpf !== cpf && <span className="ml-1 text-amber-700">· CPF anterior</span>}</p>
        <p className="text-[11px] text-slate-400">DataAPI · {new Date(consulta.atualizadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
        {consulta.status === "consultando" && <p role="status" className="text-xs text-slate-500">{Date.now() - new Date(consulta.atualizadoEm).getTime() > 120000 ? "Consulta interrompida. Clique em consultar para conferir o estado." : "Consulta em andamento…"}</p>}
        {consulta.erro && <p className="text-xs text-amber-700">{consulta.erro}</p>}
        {consulta.dados && <Dados valor={consulta.dados} />}
      </div>)}
    </div>}
  </section>;
}
