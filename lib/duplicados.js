import { prisma } from "@/lib/prisma";

// Mesmo telefone ou mesmo CPF (quando preenchido) em cadastro diferente —
// os dois jeitos mais comuns de um cliente virar dois leads sem querer.
export async function encontrarDuplicados(contact) {
  if (!contact) return [];
  const ors = [];
  if (contact.phone) ors.push({ phone: contact.phone });
  if (contact.cpf) ors.push({ cpf: contact.cpf });
  if (!ors.length) return [];

  return prisma.contact.findMany({
    where: { OR: ors, id: { not: contact.id }, excluidoEm: null },
    select: { id: true, name: true, phone: true, cpf: true, createdAt: true, stage: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
}

// Move tudo de `outroId` pra `principalId` e apaga o cadastro duplicado.
// Campos vazios no principal são preenchidos com o que existir no duplicado
// (o principal nunca perde dado que já tinha).
export async function mesclarContatos(principalId, outroId, usuario) {
  const [principal, outro] = await Promise.all([
    prisma.contact.findUnique({ where: { id: principalId }, include: { tags: true } }),
    prisma.contact.findUnique({ where: { id: outroId }, include: { tags: true } }),
  ]);
  if (!principal || !outro) throw new Error("Cadastro não encontrado.");
  if (principalId === outroId) throw new Error("Não é possível mesclar um cadastro com ele mesmo.");

  const CAMPOS_PREENCHE_SE_VAZIO = [
    "phone", "estado", "genero", "tipoCliente", "cpf", "notes",
    "valorCapital", "pagamentoCapital", "responsavel",
  ];
  const patch = {};
  for (const campo of CAMPOS_PREENCHE_SE_VAZIO) {
    if ((principal[campo] === null || principal[campo] === undefined) && outro[campo] != null) {
      patch[campo] = outro[campo];
    }
  }
  const tagIdsNovas = outro.tags.map((t) => t.id).filter((id) => !principal.tags.some((t) => t.id === id));

  await prisma.$transaction([
    prisma.message.updateMany({ where: { contactId: outroId }, data: { contactId: principalId } }),
    prisma.parcela.updateMany({ where: { contactId: outroId }, data: { contactId: principalId } }),
    prisma.task.updateMany({ where: { contactId: outroId }, data: { contactId: principalId } }),
    prisma.lancamento.updateMany({ where: { contactId: outroId }, data: { contactId: principalId } }),
    prisma.tentativaContato.updateMany({ where: { contactId: outroId }, data: { contactId: principalId } }),
    prisma.negociacao.updateMany({ where: { contactId: outroId }, data: { contactId: principalId } }),
    prisma.documento.updateMany({ where: { contactId: outroId }, data: { contactId: principalId } }),
    prisma.etapaLog.updateMany({ where: { contactId: outroId }, data: { contactId: principalId } }),
    prisma.mensagemAgendada.updateMany({ where: { contactId: outroId }, data: { contactId: principalId } }),
    prisma.contact.update({
      where: { id: principalId },
      data: { ...patch, tags: { connect: tagIdsNovas.map((id) => ({ id })) } },
    }),
    prisma.contact.delete({ where: { id: outroId } }),
    prisma.auditLog.create({
      data: {
        usuario,
        acao: "mesclar_contatos",
        entidade: "Contact",
        entidadeId: principalId,
        detalhe: `Mesclou "${outro.name}" (${outro.phone || "sem telefone"}) neste cadastro.`,
      },
    }),
  ]);

  return prisma.contact.findUnique({ where: { id: principalId } });
}
