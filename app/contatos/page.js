import KanbanBoard from "@/components/KanbanBoard";
import NovoContatoButton from "@/components/NovoContatoButton";

export default function ContatosPage() {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Só título + botão aqui — nada mais entre o título e a busca/filtros
          do KanbanBoard logo abaixo (os mini-cards de meta saíram daqui;
          continuam disponíveis inteiros na aba Metas). */}
      <div className="px-3 md:px-6 pt-3 md:pt-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-semibold text-slate-800 text-sm md:text-base">Funil de contatos</h1>
          <p className="text-xs text-slate-400 hidden md:block">Arraste os cartões entre as colunas. Clique para abrir o chat.</p>
        </div>
        <div className="hidden sm:flex shrink-0">
          <NovoContatoButton />
        </div>
      </div>
      <KanbanBoard />
    </div>
  );
}
