import KanbanBoard from "@/components/KanbanBoard";

// Título, busca, filtros e ações agora vivem todos numa linha só dentro do
// KanbanBoard — nada de header separado aqui, pra não gastar altura à toa.
export default function ContatosPage() {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <KanbanBoard />
    </div>
  );
}
