import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/auditoria";
import { criarServicoPuxadas } from "./puxadasServico.mjs";

export const { consultarContato: consultarPuxadaDoContato } = criarServicoPuxadas({ prisma, auditar: registrarAuditoria });

// O fluxo de documentos e o salvamento manual não ficam esperando a consulta externa.
export function agendarPuxada(contactId) {
  consultarPuxadaDoContato(contactId).catch(() => console.error("[puxadas] Falha ao processar consulta; verifique a ficha."));
}

let cursor = null;
let rodando = false;
export async function varrerPuxadasPendentes() {
  if (rodando) return;
  rodando = true;
  try {
    const cfg = await prisma.config.findUnique({ where: { id: "singleton" }, select: { dataApiAtivo: true, dataApiKey: true, dataApiErro: true } });
    if (!cfg?.dataApiAtivo || !cfg?.dataApiKey || cfg.dataApiErro) return;
    // Página limitada e cursor por ID evitam prender a varredura nos primeiros leads.
    const contatos = await prisma.contact.findMany({ where: { excluidoEm: null, cpf: { not: null }, ...(cursor ? { id: { gt: cursor } } : {}) }, select: { id: true }, orderBy: { id: "asc" }, take: 50 });
    let feitas = 0;
    for (const contato of contatos) {
      cursor = contato.id;
      const resultado = await consultarPuxadaDoContato(contato.id);
      if (resultado.suspensa) break;
      if (resultado.consultou && ++feitas >= 5) return;
    }
    if (contatos.length < 50) cursor = null;
  } finally {
    rodando = false;
  }
}
