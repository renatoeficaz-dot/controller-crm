"use client";

// Data (YYYY-MM-DD) no fuso de Brasília, com deslocamento em dias.
export function diaBR(somaDias = 0) {
  const d = new Date(Date.now() + somaDias * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

// Valor inicial de uma nova tarefa: hoje às 19:00.
export function tarefaPadrao(extra = {}) {
  return { title: "", tipoId: "", dueDate: diaBR(0), dueTime: "19:00", ...extra };
}

const TIPOS = [
  { chave: "ligacao", rotulo: "Ligação", re: /liga/i },
  { chave: "cobranca", rotulo: "Cobrança", re: /cobran/i },
];
const DIAS = [{ rotulo: "hoje", soma: 0 }, { rotulo: "amanhã", soma: 1 }];
const HORAS = ["09:00", "19:00"];

// 8 atalhos: Ligação/Cobrança × hoje/amanhã × 09:00/19:00.
export default function TarefaAtalhos({ taskTypes = [], setTaskForm, compacto = false }) {
  function aplicar(tipo, dia, hora) {
    const t = taskTypes.find((x) => tipo.re.test(x.name || ""));
    setTaskForm((f) => ({
      ...f,
      tipoId: t ? t.id : f.tipoId,
      title: t ? f.title : f.title || tipo.rotulo,
      dueDate: diaBR(dia.soma),
      dueTime: hora,
    }));
  }
  return (
    <div className="grid grid-cols-2 gap-1">
      {TIPOS.flatMap((tipo) =>
        DIAS.flatMap((dia) =>
          HORAS.map((hora) => (
            <button
              key={`${tipo.chave}-${dia.soma}-${hora}`}
              type="button"
              onClick={() => aplicar(tipo, dia, hora)}
              className={`border border-slate-200 rounded-lg text-slate-600 hover:border-emerald-400 hover:text-emerald-700 hover:bg-emerald-50 ${compacto ? "text-[10px] px-1.5 py-1" : "text-xs px-2 py-1.5"}`}
            >
              {tipo.rotulo} · {dia.rotulo} {hora.slice(0, 2)}h
            </button>
          ))
        )
      )}
    </div>
  );
}
