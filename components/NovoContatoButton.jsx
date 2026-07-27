"use client";

// Botão "+ Novo contato" que mora no cabeçalho da página (alinhado com os
// cards de Metas), mas quem sabe abrir o form é o KanbanBoard — dispara um
// evento global em vez de levantar o estado (evita reestruturar o board todo).
export default function NovoContatoButton() {
  return (
    <button
      onClick={() => window.dispatchEvent(new Event("kanban:novo-contato"))}
      className="flex items-center gap-1.5 bg-emerald-500 text-white text-sm font-medium rounded-lg px-3.5 py-2 hover:bg-emerald-600 transition-colors"
    >
      + Novo contato
    </button>
  );
}
