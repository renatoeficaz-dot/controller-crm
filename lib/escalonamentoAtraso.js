import { prisma } from "@/lib/prisma";
import { hojeStr, dueStr, parcelaAtrasada } from "@/lib/finance";
import { registrarAuditoria } from "@/lib/auditoria";

// Passou de X dias de atraso, o lead muda de responsável automaticamente pro
// cobrador sênior configurado — cobrança que ninguém consegue destravar precisa
// trocar de mão em vez de envelhecer na mesma fila.
export async function escalonarAtrasos() {
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" } });
  const dias = cfg?.escalonamentoAtrasoDias;
  const destino = (cfg?.escalonamentoAtrasoResponsavel || "").trim();
  if (!dias || dias < 1 || !destino) return 0;

  const stages = await prisma.stage.findMany({
    where: { name: { in: ["Recebimento", "Cravo"] } },
    select: { id: true },
  });
  if (!stages.length) return 0;

  const contatos = await prisma.contact.findMany({
    where: {
      stageId: { in: stages.map((s) => s.id) },
      excluidoEm: null, // lead excluído não muda de dono nem polui a auditoria
      // Já está com o sênior: nada a fazer.
      NOT: { responsavel: destino },
    },
    include: { parcelas: true },
  });

  const hoje = hojeStr();
  let movidos = 0;

  for (const c of contatos) {
    const atrasadas = (c.parcelas || []).filter((p) => !p.renegociada && parcelaAtrasada(p, hoje));
    if (!atrasadas.length) continue;
    const maisAntiga = atrasadas.slice().sort((a, b) => dueStr(a).localeCompare(dueStr(b)))[0];
    const diasAtraso = Math.round((new Date(hoje) - new Date(dueStr(maisAntiga))) / 86400000);
    if (diasAtraso < dias) continue;

    const anterior = c.responsavel || "sem responsável";
    await prisma.contact.update({ where: { id: c.id }, data: { responsavel: destino } });
    await registrarAuditoria({
      acao: "escalonamento_atraso",
      entidade: "Contact",
      entidadeId: c.id,
      detalhe: `${c.name}: ${diasAtraso} dias de atraso — responsável mudou de "${anterior}" para "${destino}"`,
    });
    movidos++;
  }

  return movidos;
}
