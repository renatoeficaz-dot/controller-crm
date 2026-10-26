"use client";

import { useRef, useState } from "react";

const VELOCIDADES = [1, 1.5, 2];

// Player de áudio com velocidade (1x / 1,5x / 2x) e botão de baixar — o player nativo do navegador esconde as duas coisas quando é estreito.
export default function AudioPlayer({ src, nome, className = "" }) {
  const ref = useRef(null);
  const [vel, setVel] = useState(1);

  function trocarVelocidade() {
    const prox = VELOCIDADES[(VELOCIDADES.indexOf(vel) + 1) % VELOCIDADES.length];
    setVel(prox);
    if (ref.current) ref.current.playbackRate = prox;
  }

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <audio
        ref={ref}
        controls
        preload="metadata"
        src={src}
        onPlay={(e) => { e.currentTarget.playbackRate = vel; }}
        className="max-w-[200px] h-9"
      />
      <button
        type="button"
        onClick={trocarVelocidade}
        title="Velocidade do áudio"
        className="shrink-0 text-[11px] font-semibold rounded-full border border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700 px-2 py-1 min-w-[38px]"
      >
        {vel}x
      </button>
      <a
        href={src}
        download={nome || "audio"}
        title="Baixar o áudio"
        className="shrink-0 text-slate-400 hover:text-emerald-600 text-sm leading-none px-1"
      >
        ⬇
      </a>
    </div>
  );
}
