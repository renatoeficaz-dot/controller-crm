"use client";

import { Children, useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Seção de relatório em formato de "quadrado": mostra o nome e uma miniatura do gráfico/tabela; clicar abre tudo
// num modal com zoom rápido. `aberta` mantém a seção inline (usado no Resumo). O pai precisa ser flex-wrap.
// Ordem alfabética dos quadrados: a grade usa CSS `order`, calculada pelas 6 primeiras letras do nome (sem acento).
function ordemPorNome(nome) {
  const t = String(nome || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  let k = 0;
  for (let i = 0; i < 6; i++) {
    const c = t[i];
    k = k * 28 + (c ? (c >= "a" ? c.charCodeAt(0) - 96 : 27) : 0);
  }
  return k + 1;
}

export default function Secao({ aberta = false, titulo = "", className = "", children, ...resto }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (aberta) return <section {...resto} className={className}>{children}</section>;

  const partes = Children.toArray(children);
  const corpo = partes.length > 1 ? partes.slice(1) : partes; // 1º filho = cabeçalho (o nome já vai no quadrado)

  return (
    <>
      <div
        data-tile
        style={{ order: ordemPorNome(titulo) }}
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); } }}
        className="group relative min-w-0 cursor-pointer overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-900 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-400/70 hover:shadow-[0_0_22px_rgba(34,211,238,0.25)] focus:outline-none focus-visible:border-cyan-400"
      >
        <div className="flex items-center justify-between gap-2 border-l-4 border-cyan-400 bg-slate-800/80 px-3 py-2.5">
          <span className="text-[15px] font-bold leading-tight tracking-tight text-white">{titulo || "Relatório"}</span>
          <span className="shrink-0 text-[10px] text-cyan-400/80 opacity-0 transition-opacity group-hover:opacity-100">abrir ⤢</span>
        </div>
        <div className="relative mx-2 my-2 h-28 overflow-hidden rounded-lg bg-white" aria-hidden="true">
          <div className="pointer-events-none select-none origin-top-left bg-white p-4" style={{ width: "400%", transform: "scale(0.25)" }}>
            {corpo}
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white/90 to-transparent" />
        </div>
      </div>

      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[45] flex items-stretch sm:items-center justify-center p-0 sm:p-6 modal-tech-fundo" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="modal-tech relative flex h-[100dvh] w-full max-w-6xl flex-col overflow-hidden rounded-none sm:h-auto sm:max-h-[92vh] sm:rounded-2xl border border-cyan-400/40 bg-slate-50 shadow-[0_0_0_1px_rgba(34,211,238,0.25),0_0_60px_rgba(34,211,238,0.22)]"
          >
            <span className="pointer-events-none absolute left-0 top-0 h-4 w-4 rounded-tl-2xl border-l-2 border-t-2 border-cyan-400" />
            <span className="pointer-events-none absolute right-0 top-0 h-4 w-4 rounded-tr-2xl border-r-2 border-t-2 border-cyan-400" />
            <span className="pointer-events-none absolute bottom-0 left-0 h-4 w-4 rounded-bl-2xl border-b-2 border-l-2 border-cyan-400" />
            <span className="pointer-events-none absolute bottom-0 right-0 h-4 w-4 rounded-br-2xl border-b-2 border-r-2 border-cyan-400" />
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-2.5">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
                {titulo || "Relatório"}
              </span>
              <button type="button" onClick={() => setOpen(false)} className="rounded-md px-2 text-xl leading-none text-slate-400 hover:bg-slate-800 hover:text-white" title="Fechar (Esc)">×</button>
            </div>
            <section {...resto} className={`${className} min-h-0 flex-1 overflow-y-auto thin-scroll p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:p-5`}>
              {children}
            </section>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
