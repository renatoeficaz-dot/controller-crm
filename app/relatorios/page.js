import Relatorios from "@/components/Relatorios";
import { getCurrentUser, podeAcessarPagina } from "@/lib/session";

export default async function RelatoriosPage() {
  const user = await getCurrentUser();
  if (!podeAcessarPagina(user, "relatorios")) {
    return <div className="p-6 text-sm text-slate-500">Você não tem acesso a esta página.</div>;
  }
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-6 pt-4">
        <h1 className="font-semibold text-slate-800">Relatórios</h1>
        <p className="text-xs text-slate-400">Cobrança, recebimentos e inadimplência.</p>
      </div>
      <Relatorios />
    </div>
  );
}
