"use client";

import { useEffect, useRef, useState } from "react";
import Icone from "@/components/Icones";

const INTERVALO = 15000; // checa a cada 15s
const JANELA_MS = 60000; // avisa quando falta <= 1min pro vencimento

// Toca um bipe curto de duas notas via Web Audio API — sem precisar de
// arquivo de áudio. AudioContext pode nascer "suspended" até o navegador ver
// alguma interação do usuário na página; como o CRM já exige login (clique),
// resume() aqui sempre destrava.
function tocarAlerta() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const tocarNota = (freq, inicio, duracao) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + inicio);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + inicio + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + inicio + duracao);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + inicio);
      osc.stop(ctx.currentTime + inicio + duracao + 0.05);
    };
    tocarNota(880, 0, 0.18);
    tocarNota(1175, 0.2, 0.22);
    setTimeout(() => ctx.close().catch(() => {}), 700);
  } catch {
    // navegador sem suporte a Web Audio — só não toca som, o toast ainda aparece
  }
}

// Lembrete visual + sonoro no rodapé direito quando falta ~1min pro
// vencimento de uma tarefa do usuário logado. Fica montado o app inteiro
// (ver app/layout.js), então avisa em qualquer tela, não só em Tarefas.
export default function TaskReminderWatcher() {
  const [avisos, setAvisos] = useState([]); // [{ id, title, contactName, dueDate }]
  const jaAvisados = useRef(new Set());
  const nomeUsuario = useRef(null);

  useEffect(() => {
    let cancelado = false;

    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => { if (!cancelado) nomeUsuario.current = u?.name || null; })
      .catch(() => {});

    async function checar() {
      if (!nomeUsuario.current) return;
      const params = new URLSearchParams({ done: "false", responsavel: nomeUsuario.current });
      const tasks = await fetch(`/api/tasks?${params}`).then((r) => r.json()).catch(() => []);
      if (!Array.isArray(tasks) || cancelado) return;

      const agora = Date.now();
      const novos = [];
      for (const t of tasks) {
        if (jaAvisados.current.has(t.id)) continue;
        const venc = new Date(t.dueDate).getTime();
        const faltam = venc - agora;
        if (faltam > 0 && faltam <= JANELA_MS) {
          jaAvisados.current.add(t.id);
          novos.push({ id: t.id, title: t.title, contactName: t.contact?.name || "", dueDate: t.dueDate });
        }
      }
      if (novos.length) {
        setAvisos((atual) => [...atual, ...novos]);
        tocarAlerta();
        novos.forEach((aviso) => {
          setTimeout(() => {
            setAvisos((atual) => atual.filter((a) => a.id !== aviso.id));
          }, 20000);
        });
      }
    }

    checar();
    const t = setInterval(checar, INTERVALO);
    return () => { cancelado = true; clearInterval(t); };
  }, []);

  function dispensar(id) {
    setAvisos((atual) => atual.filter((a) => a.id !== id));
  }

  if (!avisos.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[80] flex flex-col gap-2 max-w-xs">
      {avisos.map((a) => (
        <div key={a.id} className="bg-slate-800 text-white rounded-xl shadow-lg px-3.5 py-3 flex items-start gap-2.5">
          <Icone nome="alerta" className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-amber-300">Falta 1 minuto</p>
            <p className="text-sm truncate">{a.title}</p>
            {a.contactName && <p className="text-xs text-slate-400 truncate">{a.contactName}</p>}
          </div>
          <button onClick={() => dispensar(a.id)} className="text-slate-400 hover:text-white shrink-0 text-lg leading-none">×</button>
        </div>
      ))}
    </div>
  );
}
