import KanbanBoard from "@/components/KanbanBoard";
import MetasMini from "@/components/MetasMini";

export default function ContatosPage() {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-3 md:px-6 pt-3 md:pt-4 flex flex-col sm:grid sm:grid-cols-[1fr_auto_1fr] items-start gap-2 sm:gap-3">
        <div>
          <h1 className="font-semibold text-slate-800 text-sm md:text-base">Funil de contatos</h1>
          <p className="text-xs text-slate-400 hidden md:block">Arraste os cartões entre as colunas. Clique para abrir o chat.</p>
        </div>
        <div className="w-full sm:w-auto sm:justify-self-center">
          <MetasMini />
        </div>
        <div className="hidden sm:block" />
      </div>
      <KanbanBoard />
    </div>
  );
}
