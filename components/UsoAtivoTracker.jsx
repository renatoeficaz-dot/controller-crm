"use client";

import { useEffect, useRef } from "react";

const INTERVALO = 30000; // manda um heartbeat a cada 30s
const JANELA_ATIVO = 60000; // só conta se mexeu em algo nos últimos 60s

// Tempo de uso do sistema por colaborador — não é "tempo com a aba aberta",
// é tempo de fato mexendo (mouse, teclado, clique, scroll). Aba em segundo
// plano ou mouse parado não soma nada.
export default function UsoAtivoTracker() {
  const ultimaAtividade = useRef(Date.now());

  useEffect(() => {
    const marcar = () => { ultimaAtividade.current = Date.now(); };
    const eventos = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];
    eventos.forEach((ev) => window.addEventListener(ev, marcar, { passive: true }));

    const t = setInterval(() => {
      const ativo = Date.now() - ultimaAtividade.current < JANELA_ATIVO;
      if (ativo && document.visibilityState === "visible") {
        fetch("/api/uso/heartbeat", { method: "POST" }).catch(() => {});
      }
    }, INTERVALO);

    return () => {
      eventos.forEach((ev) => window.removeEventListener(ev, marcar));
      clearInterval(t);
    };
  }, []);

  return null;
}
