"use client";

import { useEffect, useRef } from "react";

const INTERVALO = 30000; // manda um heartbeat a cada 30s
// Só conta se mexeu em algo nos últimos 5 min. Era 60 s: ler uma conversa longa, esperar o cliente responder ou conferir um comprovante
// sem tocar na tela por mais de 1 minuto parava de contar — no Arthur, a jornada no sistema tinha 10–13 h e só 3–7 h eram contadas.
const JANELA_ATIVO = 5 * 60000;

// Chamada em andamento na própria página (vídeo chamada, ligação interna): está trabalhando mesmo sem mexer no mouse/teclado.
function emChamada() {
  return [...document.querySelectorAll("video, audio")].some((m) => !m.paused && !m.ended && (m.srcObject || m.currentTime > 0));
}

// Tempo de uso do sistema por colaborador — não é "tempo com a aba aberta",
// é tempo de fato mexendo (mouse, teclado, clique, scroll). Aba em segundo
// plano ou mouse parado não soma nada.
export default function UsoAtivoTracker() {
  const ultimaAtividade = useRef(Date.now());

  useEffect(() => {
    const marcar = () => { ultimaAtividade.current = Date.now(); };
    // "scroll" não sobe até a janela: rolar o chat, o funil ou uma lista (que rolam dentro de um painel, não a página) não contava
    // como uso — no celular, ler e rolar conversas era quase todo o trabalho e ficava de fora. Escuta na fase de captura e também o
    // arrastar do dedo e a rodinha do mouse.
    const eventos = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "touchmove", "wheel", "pointerdown", "input"];
    eventos.forEach((ev) => window.addEventListener(ev, marcar, { passive: true, capture: true }));

    const t = setInterval(() => {
      const ativo = Date.now() - ultimaAtividade.current < JANELA_ATIVO || emChamada();
      if (ativo && document.visibilityState === "visible") {
        fetch("/api/uso/heartbeat", { method: "POST" }).catch(() => {});
      }
    }, INTERVALO);

    return () => {
      eventos.forEach((ev) => window.removeEventListener(ev, marcar, { capture: true }));
      clearInterval(t);
    };
  }, []);

  return null;
}
