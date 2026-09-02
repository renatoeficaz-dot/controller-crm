"use client";

import { useEffect, useMemo, useState } from "react";
import { TRILHAS, TOTAL_PASSOS } from "@/lib/manual";
import Icone from "@/components/Icones";

const STORAGE_KEY = "crm-manual-concluidos";

// Negrito e `código` no texto do manual — evita depender de uma lib de
// markdown só pra isso.
function Texto({ children }) {
  const partes = String(children).split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {partes.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**")) {
          return <strong key={i} className="font-semibold text-slate-700">{p.slice(2, -2)}</strong>;
        }
        if (p.startsWith("`") && p.endsWith("`")) {
          return (
            <code key={i} className="text-[11px] bg-slate-100 text-slate-700 rounded px-1 py-0.5 font-mono">
              {p.slice(1, -1)}
            </code>
          );
        }
        return p;
      })}
    </>
  );
}

export default function ManualView() {
  const [concluidos, setConcluidos] = useState([]);
  const [trilhaAtiva, setTrilhaAtiva] = useState(TRILHAS[0].id);
  const [aberto, setAberto] = useState(null); // "trilhaId:indice"

  // O progresso é por aparelho: cada pessoa da equipe faz o seu percurso.
  useEffect(() => {
    try {
      setConcluidos(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
    } catch {
      setConcluidos([]);
    }
  }, []);

  function alternar(chave) {
    setConcluidos((prev) => {
      const novo = prev.includes(chave) ? prev.filter((c) => c !== chave) : [...prev, chave];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(novo));
      return novo;
    });
  }

  const trilha = useMemo(() => TRILHAS.find((t) => t.id === trilhaAtiva) || TRILHAS[0], [trilhaAtiva]);
  const pct = TOTAL_PASSOS > 0 ? Math.round((concluidos.length / TOTAL_PASSOS) * 100) : 0;

  function concluidosDa(t) {
    return t.passos.filter((_, i) => concluidos.includes(`${t.id}:${i}`)).length;
  }

  return (
    <div className="flex-1 overflow-y-auto thin-scroll">
      <div className="max-w-5xl mx-auto p-4 md:p-8">
        <header className="mb-6">
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900 tracking-tight">Aprender a usar</h1>
          <p className="text-sm text-slate-500 mt-1">
            Um tópico para cada tela do sistema, na mesma ordem do menu. Marque os passos conforme fizer.
          </p>
          <div className="mt-4 max-w-md">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-500">Seu progresso</span>
              <span className="font-semibold text-emerald-600">{concluidos.length} de {TOTAL_PASSOS}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2">
              <div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </header>

        <div className="md:grid md:grid-cols-[240px_minmax(0,1fr)] md:gap-8 md:items-start">
          {/* Um tópico por módulo do menu */}
          <nav className="flex md:flex-col gap-1.5 mb-5 md:mb-0 overflow-x-auto pb-1 md:pb-0 md:sticky md:top-6">
            {TRILHAS.map((t) => {
              const feitos = concluidosDa(t);
              const completa = feitos === t.passos.length;
              const ativa = t.id === trilhaAtiva;
              return (
                <button
                  key={t.id}
                  onClick={() => { setTrilhaAtiva(t.id); setAberto(null); }}
                  className={`shrink-0 md:w-full text-left rounded-xl px-3 py-2.5 border transition-colors ${
                    ativa ? "bg-white border-slate-200 shadow-sm" : "border-transparent hover:bg-white/70"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={ativa ? "text-emerald-600" : "text-slate-400"}>
                      <Icone nome={t.icone} className="w-[18px] h-[18px]" />
                    </span>
                    <span className={`text-sm font-medium ${ativa ? "text-slate-900" : "text-slate-600"}`}>{t.titulo}</span>
                    {completa && (
                      <span className="text-emerald-500 ml-auto">
                        <Icone nome="check" className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                  <span className="block text-[11px] text-slate-400 mt-0.5 md:block hidden">
                    {feitos}/{t.passos.length} passos
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Passos do módulo */}
          <main className="min-w-0">
            <div className="mb-4">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                <span className="text-emerald-600"><Icone nome={trilha.icone} className="w-5 h-5" /></span>
                {trilha.titulo}
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">{trilha.resumo}</p>
            </div>

            <ol className="space-y-3">
              {trilha.passos.map((p, i) => {
                const chave = `${trilha.id}:${i}`;
                const feito = concluidos.includes(chave);
                const expandido = aberto === chave;
                return (
                  <li key={chave} className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
                    <div className="flex items-start gap-3 p-4">
                      <button
                        onClick={() => alternar(chave)}
                        title={feito ? "Marcar como não feito" : "Marcar como feito"}
                        className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                          feito ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300 text-transparent hover:border-emerald-400"
                        }`}
                      >
                        <Icone nome="check" className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setAberto(expandido ? null : chave)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className={`text-sm font-medium ${feito ? "text-slate-400 line-through" : "text-slate-800"}`}>
                          {i + 1}. {p.titulo}
                        </p>
                        <span className="flex items-center gap-1 text-[11px] text-sky-600 mt-0.5">
                          <Icone nome="local" className="w-3 h-3 shrink-0" />
                          {p.onde}
                        </span>
                      </button>
                      <button
                        onClick={() => setAberto(expandido ? null : chave)}
                        className="text-slate-400 hover:text-slate-600 shrink-0"
                        title={expandido ? "Fechar" : "Abrir"}
                      >
                        <Icone nome="seta" className={`w-4 h-4 transition-transform ${expandido ? "rotate-180" : ""}`} />
                      </button>
                    </div>

                    {expandido && (
                      <div className="px-4 pb-4 pl-13 space-y-2 border-t border-slate-100 pt-3">
                        {p.conteudo.map((linha, j) => (
                          <p key={j} className="text-sm text-slate-600 leading-relaxed">
                            <Texto>{linha}</Texto>
                          </p>
                        ))}
                        {p.atencao && (
                          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5 mt-2">
                            <strong>Atenção:</strong> <Texto>{p.atencao}</Texto>
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>

            {concluidosDa(trilha) === trilha.passos.length && (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center">
                <p className="text-sm font-medium text-emerald-700 flex items-center justify-center gap-2">
                  <Icone nome="trofeu" className="w-4 h-4" />
                  Tópico concluído!
                </p>
                <p className="text-xs text-emerald-600 mt-0.5">Escolha o próximo ao lado.</p>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
