import KanbanBoard from "@/components/KanbanBoard";
import { getCurrentUser, podeAcessarPagina } from "@/lib/session";

// Título, busca, filtros e ações agora vivem todos numa linha só dentro do
// KanbanBoard — nada de header separado aqui, pra não gastar altura à toa.
export default async function ContatosPage() {
  const user = await getCurrentUser();
  if (!podeAcessarPagina(user, "contatos")) {
    return <div className="p-6 text-sm text-slate-500">Você não tem acesso a esta página.</div>;
  }
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <KanbanBoard />
    </div>
  );
}
