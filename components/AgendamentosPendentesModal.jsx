"use client";

import { useEffect, useState } from "react";
import Icone from "@/components/Icones";

function fmt(d) {
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// Item 281: ver e cancelar mensagens agendadas que ainda não saíram.
export default function AgendamentosPendentesModal({ contactId, onClose }) {
  const [lista, setLista] = useState(null);

  const load = () => {
    fetch(`/api/mensagens-agendadas?contactId=${contactId}`)
      .then((r) => r.json())
      .then((d) => setLista((Array.isArray(d) ? d : []).filter((m) => !m.enviado)))
      .catch(() => setLista([]));
  };
  useEffect(load, [contactId]);

  async function cancelar(id) {
    if (!confirm("Cancelar esse agendamento?")) return;
    await fetch(`/api/mensagens-agendadas/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[70vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <h3 className="font-semibold text-slate-800 flex items-center gap-1.5"><Icone nome="relogio" className="w-4 h-4" /> Mensagens agendadas</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <div className="overflow-y-auto thin-scroll">
          {lista === null ? (
            <p className="text-xs text-slate-400 p-5 text-center">Carregando…</p>
          ) : lista.length === 0 ? (
            <p className="text-xs text-slate-400 p-5 text-center">Nenhum agendamento pendente pra esse lead.</p>
          ) : (
            <ul className="divide-y divide-slate-50">
              {lista.map((m) => (
                <li key={m.id} className="px-5 py-3">
                  <p className="text-xs text-slate-500 mb-0.5">{fmt(m.dataHora)}</p>
                  <p className="text-sm text-slate-700 truncate">{m.template?.title || m.corpo || "(mídia)"}</p>
                  <button onClick={() => cancelar(m.id)} className="text-xs text-red-500 hover:text-red-600 mt-1">Cancelar agendamento</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
