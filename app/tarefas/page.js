import TarefasView from "@/components/TarefasView";
import { getCurrentUser, podeAcessarPagina } from "@/lib/session";

export default async function TarefasPage() {
  const user = await getCurrentUser();
  if (!podeAcessarPagina(user, "tarefas")) {
    return <div className="p-6 text-sm text-slate-500">Você não tem acesso a esta página.</div>;
  }
  return <TarefasView />;
}
