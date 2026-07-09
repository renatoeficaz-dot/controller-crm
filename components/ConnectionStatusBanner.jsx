"use client";

import { useEffect, useState } from "react";

const UM_MINUTO = 60 * 1000;

// Aviso fixo no rodapé, visível em qualquer página, enquanto algum número do
// WhatsApp estiver desconectado da Evolution API. Some sozinho quando o
// número reconectar (ou for removido) — não precisa de nenhuma ação manual
// além de reconectar de verdade.
export default function ConnectionStatusBanner() {
  const [desconectados, setDesconectados] = useState([]);

  useEffect(() => {
    let cancelled = false;
    async function checar() {
      try {
        const res = await fetch("/api/numbers/status");
        if (!res.ok) return; // não logado, ou config ainda sem API — não mostra nada
        const data = await res.json();
        if (!cancelled && Array.isArray(data)) {
          setDesconectados(data.filter((n) => n.state !== "open"));
        }
      } catch {
        // rede fora, etc — mantém o último estado conhecido, não some nem trava
      }
    }
    checar();
    const t = setInterval(checar, UM_MINUTO);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (desconectados.length === 0) return null;

  return (
    <div className="shrink-0 bg-red-600 text-white text-xs px-4 py-2 flex items-center gap-2 flex-wrap">
      <span className="font-semibold">⚠️ WhatsApp desconectado:</span>
      {desconectados.map((n) => (
        <span key={n.id} className="bg-red-700/60 rounded-full px-2 py-0.5">
          {n.label} ({n.number})
        </span>
      ))}
      <span className="text-red-100">— reconecte em Configurações → Números</span>
    </div>
  );
}
