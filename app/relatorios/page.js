import Relatorios from "@/components/Relatorios";

export default function RelatoriosPage() {
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
