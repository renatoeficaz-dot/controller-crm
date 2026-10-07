"use client";

import { useState } from "react";

// Dados do CNPJ do comerciante vindos da CNPJá (situação cadastral, atividade, endereço, sócios). Consulta quando o
// usuário quiser (botão) — e o sistema também consulta sozinho quando o lead entra em Análise.
export default function CnpjCard({ contactId, cnpj, dadosIniciais, onPreencher }) {
  const [dados, setDados] = useState(() => {
    try { return dadosIniciais ? JSON.parse(dadosIniciais) : null; } catch { return null; }
  });
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  async function consultar(forcar) {
    setCarregando(true);
    setErro("");
    const res = await fetch(`/api/contacts/${contactId}/cnpj`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cnpj, forcar }),
    });
    const d = await res.json().catch(() => ({}));
    setCarregando(false);
    if (!res.ok) { setErro(d.error || "Não foi possível consultar."); return; }
    setDados(d.dados);
    onPreencher?.({ razaoSocial: d.razaoSocial, enderecoComercial: d.enderecoComercial });
  }

  const ativa = dados?.situacao && /ativa/i.test(dados.situacao);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-slate-600">Consulta do CNPJ (Receita)</span>
        <button
          type="button"
          disabled={carregando || !cnpj}
          onClick={() => consultar(!!dados)}
          className="text-[11px] rounded-full px-2.5 py-0.5 border border-sky-300 text-sky-700 hover:bg-sky-50 disabled:opacity-50"
          title={cnpj ? "Busca situação cadastral, atividade, endereço e sócios" : "Preencha o CNPJ primeiro"}
        >
          {carregando ? "Consultando…" : dados ? "Atualizar" : "Consultar CNPJ"}
        </button>
      </div>
      {erro && <p className="text-[11px] text-red-500">{erro}</p>}
      {dados && (
        <div className="text-[11px] text-slate-600 space-y-1">
          <p>
            <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${ativa ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
              {dados.situacao || "Situação desconhecida"}
            </span>
            {dados.situacaoDesde && <span className="text-slate-400"> desde {new Date(dados.situacaoDesde).toLocaleDateString("pt-BR")}</span>}
            {dados.abertura && <span className="text-slate-400"> · aberta em {new Date(dados.abertura).toLocaleDateString("pt-BR")}</span>}
          </p>
          <p><strong>{dados.razaoSocial}</strong>{dados.fantasia ? ` (${dados.fantasia})` : ""}</p>
          {dados.atividadePrincipal && <p><span className="text-slate-400">Atividade:</span> {dados.atividadePrincipal}</p>}
          {dados.endereco && <p><span className="text-slate-400">Endereço:</span> {dados.endereco}</p>}
          {(dados.natureza || dados.porte) && <p className="text-slate-400">{[dados.natureza, dados.porte, dados.mei ? "MEI" : null].filter(Boolean).join(" · ")}</p>}
          {dados.socios?.length > 0 && (
            <div>
              <span className="text-slate-400">Sócios{dados.totalSocios > dados.socios.length ? ` (${dados.socios.length} de ${dados.totalSocios})` : ""}:</span>
              <ul className="ml-3 list-disc">
                {dados.socios.map((s, i) => (
                  <li key={i}>{s.nome}{s.cargo ? ` — ${s.cargo}` : ""}{s.documento ? ` · ${s.documento}` : ""}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
