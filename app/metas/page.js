import MetasView from "@/components/MetasView";
import { getCurrentUser, podeAcessarPagina } from "@/lib/session";

export default async function MetasPage() {
  const user = await getCurrentUser();
  if (!podeAcessarPagina(user, "metas")) {
    return <div className="p-6 text-sm text-slate-500">Você não tem acesso a esta página.</div>;
  }
  return <MetasView />;
}
