"use client";

import { useEffect, useState } from "react";

const CINCO_MINUTOS = 5 * 60 * 1000;
const LIMITE_SALDO = 1; // US$ — abaixo disso, avisa

// Aviso fixo no rodapé, visível em qualquer página, enquanto o saldo da
// DeepInfra (usada pela IA pra texto/transcrição/voz) estiver baixo. Some
// sozinho quando recarregar o saldo — igual o aviso de WhatsApp desconectado.
export default function DeepInfraBalanceBanner() {
  const [saldo, setSaldo] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function checar() {
      try {
        const res = await fetch("/api/config/deepinfra-saldo");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setSaldo(data);
      } catch {
        // rede fora, etc — mantém o último estado conhecido
      }
    }
    checar();
    const t = setInterval(checar, CINCO_MINUTOS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (!saldo?.ok || saldo.saldo > LIMITE_SALDO) return null;

  return (
    <div className="shrink-0 bg-red-600 text-white text-xs px-4 py-2 flex items-center gap-2 flex-wrap">
      <span className="font-semibold">⚠️ Saldo da DeepInfra baixo:</span>
      <span className="bg-red-700/60 rounded-full px-2 py-0.5">US$ {saldo.saldo.toFixed(2)}</span>
      <span className="text-red-100">— a IA pode parar de responder. Adicione crédito em deepinfra.com/dash</span>
    </div>
  );
}
