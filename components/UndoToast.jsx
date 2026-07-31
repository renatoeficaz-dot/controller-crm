"use client";

import { useRef, useState, useCallback } from "react";

// Item 147 (parcial): não dá pra desfazer QUALQUER ação do sistema, mas as
// exclusões mais comuns (tarefa, lançamento) agora funcionam assim — some sem
// popup bloqueante e fica alguns segundos com "Desfazer" antes de mandar pro
// servidor de verdade. Clicou errado, corrige na hora; se não clicar, roda
// exatamente como antes (com confirm()).
export function useUndoDelete(segundos = 5) {
  const [pendente, setPendente] = useState(null); // { label }
  const timerRef = useRef(null);

  const agendar = useCallback((label, executar) => {
    // Se já tinha uma exclusão pendente, ela é confirmada antes de agendar a nova.
    if (timerRef.current) { clearTimeout(timerRef.current.timer); timerRef.current.executar(); }
    const timer = setTimeout(() => {
      executar();
      setPendente(null);
      timerRef.current = null;
    }, segundos * 1000);
    timerRef.current = { timer, executar };
    setPendente({ label });
  }, [segundos]);

  const desfazer = useCallback(() => {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current.timer);
    timerRef.current = null;
    setPendente(null);
  }, []);

  return { pendente, agendar, desfazer };
}

export function UndoToast({ pendente, onDesfazer }) {
  if (!pendente) return null;
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[70] bg-slate-800 text-white text-sm rounded-xl shadow-lg px-4 py-2.5 flex items-center gap-3">
      <span>{pendente.label} excluído.</span>
      <button onClick={onDesfazer} className="text-emerald-300 font-medium hover:text-emerald-200">Desfazer</button>
    </div>
  );
}
