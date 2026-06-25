import KanbanBoard from "@/components/KanbanBoard";

export default function ContatosPage() {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-6 pt-4">
        <h1 className="font-semibold text-slate-800">Funil de contatos</h1>
        <p className="text-xs text-slate-400">Arraste os cartões entre as colunas. Clique para abrir o chat.</p>
      </div>
      <KanbanBoard />
    </div>
  );
}
