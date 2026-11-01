import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/auditoria";

// Quando a última parcela do ciclo atual é paga, o lead vai sozinho para a coluna "Pago" (vinha de Recebimento ou Cravo).
// Parcela substituída por acordo (renegociada) não conta — mesma regra da renovação.
export async function moverParaPagoSeQuitado(contactId, usuario) {
  try {
    const c = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, name: true, cicloAtual: true, stage: { select: { name: true } }, parcelas: { select: { ciclo: true, paid: true, renegociada: true } } },
    });
    if (!c || !["Recebimento", "Cravo"].includes(c.stage?.name)) return false;
    const doCiclo = c.parcelas.filter((p) => (p.ciclo || 1) === (c.cicloAtual || 1) && !p.renegociada);
    if (doCiclo.length === 0 || doCiclo.some((p) => !p.paid)) return false;
    const pago = await prisma.stage.findFirst({ where: { name: "Pago" } });
    if (!pago) return false;
    const ultimo = await prisma.contact.findFirst({ where: { stageId: pago.id }, orderBy: { order: "desc" }, select: { order: true } });
    await prisma.contact.update({ where: { id: c.id }, data: { stageId: pago.id, order: (ultimo?.order ?? -1) + 1, entrouEtapaEm: new Date() } });
    await prisma.etapaLog.create({ data: { contactId: c.id, deEtapa: c.stage.name, paraEtapa: "Pago", usuario: usuario || null } }).catch(() => {});
    registrarAuditoria({ usuario, acao: "auto_mover_pago", entidade: "Contact", entidadeId: c.id, detalhe: `${c.name}: todas as parcelas do ciclo ${c.cicloAtual || 1} pagas — movido de "${c.stage.name}" para "Pago"` });
    return true;
  } catch (e) {
    console.error("[cicloQuitado]", e.message);
    return false;
  }
}
