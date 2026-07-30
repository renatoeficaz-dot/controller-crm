import { prisma } from "@/lib/prisma";

// Registra uma ação sensível (mudar etapa, excluir, dar/desfazer baixa,
// alterar permissão). Nunca derruba a operação principal: erro de auditoria
// é logado no console e ignorado, não vira erro 500 pro usuário.
export async function registrarAuditoria({ usuario, acao, entidade, entidadeId, detalhe }) {
  try {
    await prisma.auditLog.create({
      data: { usuario: usuario || null, acao, entidade, entidadeId: entidadeId || null, detalhe: detalhe || null },
    });
  } catch (err) {
    console.error("[auditoria] erro ao registrar:", err.message);
  }
}
