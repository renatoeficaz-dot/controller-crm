"use client";

import { useEffect, useRef, useState } from "react";
import Icone from "@/components/Icones";
import { tocarAlerta } from "@/lib/somAlerta";

const INTERVALO = 12000; // checa a cada 12s
const SOME_EM = 20000; // o aviso some sozinho depois disso
const MAX_VISIVEIS = 4; // teto pra uma rajada de mensagens não cobrir a tela

// Aviso sonoro + visual no rodapé direito quando chega mensagem nova no chat
// interno. Fica montado no app inteiro (ver app/layout.js), então avisa em
// qualquer tela — que é o ponto: o time não fica com o chat aberto o dia todo.
export default function ChatInternoWatcher() {
  const [avisos, setAvisos] = useState([]);
  // Quantas não lidas cada conversa tinha na última checagem. Sem esse
  // retrato, a primeira checagem dispararia aviso pra tudo que já estava
  // acumulado (a pessoa acabou de abrir o sistema, não chegou nada agora).
  const anterior = useRef(null);

  useEffect(() => {
    let cancelado = false;

    async function checar() {
      // Fora do ar / deslogado: a rota devolve erro e o Array.isArray abaixo
      // segura — não adianta avisar quem nem está logado.
      const lista = await fetch("/api/chat-interno").then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (!Array.isArray(lista) || cancelado) return;

      const agora = new Map(lista.map((c) => [c.id, c]));

      // Primeira rodada: só guarda o retrato, sem avisar nada.
      if (anterior.current === null) {
        anterior.current = new Map(lista.map((c) => [c.id, c.naoLidas || 0]));
        return;
      }

      const novos = [];
      for (const [id, c] of agora) {
        const antes = anterior.current.get(id) ?? 0;
        const naoLidas = c.naoLidas || 0;
        // Só avisa quando SUBIU. Se a pessoa abriu a conversa, o contador cai
        // e nada dispara; se continuar igual, também não repete o aviso.
        if (naoLidas > antes) {
          novos.push({
            id: `${id}-${Date.now()}`,
            conversaId: id,
            titulo: c.titulo,
            grupo: c.grupo,
            autor: c.ultimaMensagem?.autor || "",
            texto: c.ultimaMensagem?.body || "",
            mencao: (c.mencoes || 0) > 0,
          });
        }
      }
      anterior.current = new Map(lista.map((c) => [c.id, c.naoLidas || 0]));

      if (novos.length) {
        setAvisos((atual) => [...atual, ...novos].slice(-MAX_VISIVEIS));
        tocarAlerta();
        for (const n of novos) {
          setTimeout(() => setAvisos((atual) => atual.filter((a) => a.id !== n.id)), SOME_EM);
        }
      }
    }

    checar();
    const t = setInterval(checar, INTERVALO);
    return () => {
      cancelado = true;
      clearInterval(t);
    };
  }, []);

  if (!avisos.length) return null;

  return (
    // bottom-20 (e não bottom-4) pra não empilhar em cima do aviso de tarefa,
    // que já ocupa o canto inferior direito.
    <div className="fixed bottom-20 right-4 z-[80] flex flex-col gap-2 max-w-xs">
      {avisos.map((a) => (
        <div key={a.id} className="bg-slate-800 text-white rounded-xl shadow-lg px-3.5 py-3 flex items-start gap-2.5">
          <Icone nome={a.mencao ? "alerta" : "chat"} className={`w-4 h-4 shrink-0 mt-0.5 ${a.mencao ? "text-sky-400" : "text-emerald-400"}`} />
          <a href="/chat-interno" className="min-w-0 flex-1" title="Abrir o chat interno">
            <p className={`text-xs font-semibold ${a.mencao ? "text-sky-300" : "text-emerald-300"}`}>
              {a.mencao ? "Te marcaram" : "Nova mensagem"} · {a.titulo}
            </p>
            {a.autor && a.grupo && <p className="text-xs text-slate-400 truncate">{a.autor}</p>}
            <p className="text-sm truncate">{a.texto || "(anexo)"}</p>
          </a>
          <button
            onClick={() => setAvisos((atual) => atual.filter((x) => x.id !== a.id))}
            title="Fechar"
            className="shrink-0 text-slate-400 hover:text-white text-lg leading-none"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
