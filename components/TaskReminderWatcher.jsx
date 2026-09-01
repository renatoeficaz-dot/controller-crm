"use client";

import { useEffect, useRef, useState } from "react";
import Icone from "@/components/Icones";
import { tocarAlerta } from "@/lib/somAlerta";
import ContactModal from "@/components/ContactModal";

const INTERVALO = 15000; // checa a cada 15s
const JANELA_MS = 60000; // avisa quando falta <= 1min pro vencimento


const LS_AVISOS = "taskReminder_avisos"; // avisos ainda não resolvidos, sobrevive a reload/troca de página
const LS_VISTOS = "taskReminder_vistos"; // ids já avisados (evita repetir o mesmo aviso depois de dispensado)

function lerLS(chave, padrao) {
  try {
    const v = JSON.parse(localStorage.getItem(chave));
    return v ?? padrao;
  } catch {
    return padrao;
  }
}

// Lembrete visual + sonoro no rodapé direito quando falta ~1min pro
// vencimento de uma tarefa do usuário logado. Fica montado o app inteiro
// (ver app/layout.js), então avisa em qualquer tela, não só em Tarefas. Só
// some quando a pessoa resolve de verdade (Concluir), abre a lead, ou fecha
// no × — persistido em localStorage pra sobreviver a um F5/troca de aba.
export default function TaskReminderWatcher() {
  const [avisos, setAvisos] = useState(() => lerLS(LS_AVISOS, []));
  const [contatoAberto, setContatoAberto] = useState(null);
  const jaAvisados = useRef(new Set(lerLS(LS_VISTOS, [])));
  const nomeUsuario = useRef(null);

  useEffect(() => {
    try { localStorage.setItem(LS_AVISOS, JSON.stringify(avisos)); } catch {}
  }, [avisos]);

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
          novos.push({ id: t.id, contactId: t.contact?.id || null, title: t.title, contactName: t.contact?.name || "", dueDate: t.dueDate });
        }
      }
      if (novos.length) {
        try { localStorage.setItem(LS_VISTOS, JSON.stringify([...jaAvisados.current])); } catch {}
        setAvisos((atual) => [...atual, ...novos]);
        tocarAlerta();
      }
    }

    checar();
    const t = setInterval(checar, INTERVALO);
    return () => { cancelado = true; clearInterval(t); };
  }, []);

  function dispensar(id) {
    setAvisos((atual) => atual.filter((a) => a.id !== id));
  }

  async function concluir(id) {
    dispensar(id);
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: true }),
    }).catch(() => {});
  }

  function abrirLead(aviso) {
    // Só abre a lead — o aviso continua na tela até "Concluir" ou o × mesmo.
    if (!aviso.contactId) return;
    setContatoAberto(aviso.contactId);
  }

  return (
    <>
      {avisos.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[80] flex flex-col gap-2 max-w-xs">
          {avisos.map((a) => (
            <div key={a.id} className="bg-slate-800 text-white rounded-xl shadow-lg px-3.5 py-3 flex items-start gap-2.5">
              <Icone nome="alerta" className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <button
                type="button"
                onClick={() => abrirLead(a)}
                disabled={!a.contactId}
                className="min-w-0 flex-1 text-left"
                title={a.contactId ? "Abrir a lead" : undefined}
              >
                <p className="text-xs font-semibold text-amber-300">Falta 1 minuto</p>
                <p className="text-sm truncate">{a.title}</p>
                {a.contactName && <p className="text-xs text-slate-400 truncate">{a.contactName}</p>}
              </button>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <button onClick={() => dispensar(a.id)} title="Fechar" className="text-slate-400 hover:text-white text-lg leading-none">×</button>
                <button
                  onClick={() => concluir(a.id)}
                  className="text-xs font-medium text-emerald-400 hover:text-emerald-300 whitespace-nowrap"
                >
                  ✓ Concluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {contatoAberto && (
        <ContactModal contactId={contatoAberto} onClose={() => setContatoAberto(null)} onChanged={() => {}} />
      )}
    </>
  );
}
