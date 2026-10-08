"use client";

// Dois marcadores por dado em "Dados pra conferência": verde = confere (OK), vermelho = divergente.
// Clicar de novo no marcador ativo desmarca. A equipe usa depois da análise.
export default function MarcadorConferencia({ valor, onChange }) {
  const botao = (tipo, ativo, classeAtiva, titulo, simbolo) => (
    <button
      type="button"
      title={titulo}
      aria-pressed={ativo}
      onClick={() => onChange(ativo ? null : tipo)}
      className={`w-5 h-5 rounded-full border text-[11px] leading-none flex items-center justify-center shrink-0 transition-colors ${ativo ? classeAtiva : "bg-white border-slate-300 text-slate-300 hover:border-slate-400"}`}
    >
      {simbolo}
    </button>
  );
  return (
    <span className="shrink-0 flex items-center gap-1">
      {botao("ok", valor === "ok", "bg-emerald-500 border-emerald-500 text-white", "Confere (OK)", "✓")}
      {botao("divergente", valor === "divergente", "bg-red-500 border-red-500 text-white", "Divergente", "✕")}
    </span>
  );
}
