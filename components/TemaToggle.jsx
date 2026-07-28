"use client";

import { useEffect, useState } from "react";

export const TEMA_STORAGE_KEY = "crm-tema";

// Aplica o tema no <html>. "sistema" segue a preferência do SO, então também
// é o modo que reage se o usuário trocar o tema do aparelho com o CRM aberto.
export function aplicarTema(tema) {
  const escuro =
    tema === "escuro" ||
    (tema === "sistema" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", escuro);
}

const OPCOES = [
  { valor: "claro", label: "Claro", icone: "☀️" },
  { valor: "escuro", label: "Escuro", icone: "🌙" },
  { valor: "sistema", label: "Do sistema", icone: "🖥️" },
];

export default function TemaToggle() {
  const [tema, setTema] = useState("claro");

  useEffect(() => {
    setTema(localStorage.getItem(TEMA_STORAGE_KEY) || "claro");
  }, []);

  // No modo "sistema", acompanha a troca de tema do SO em tempo real.
  useEffect(() => {
    if (tema !== "sistema") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => aplicarTema("sistema");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [tema]);

  function escolher(valor) {
    setTema(valor);
    localStorage.setItem(TEMA_STORAGE_KEY, valor);
    aplicarTema(valor);
  }

  return (
    <div className="grid grid-cols-3 gap-2 max-w-md">
      {OPCOES.map((o) => {
        const ativo = tema === o.valor;
        return (
          <button
            key={o.valor}
            type="button"
            onClick={() => escolher(o.valor)}
            className={`rounded-xl border px-3 py-4 text-sm font-medium transition-colors ${
              ativo
                ? "bg-emerald-500 text-white border-emerald-500"
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
            }`}
          >
            <span className="block text-xl mb-1">{o.icone}</span>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
