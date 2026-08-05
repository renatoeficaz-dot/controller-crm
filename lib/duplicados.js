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

  // Logs de "já mandei hoje" (régua e Pix) têm chave única por contato+dia:
  // migrar direto estoura a constraint quando os dois cadastros receberam no
  // mesmo dia. Descarta só os dias que o principal já tem — perder essa marca
  // faria o cliente receber a MESMA cobrança duas vezes no dia.
  for (const modelo of ["lembreteCobrancaLog", "pixAdimplenteLog"]) {
    const jaTem = await prisma[modelo].findMany({ where: { contactId: principalId }, select: { dia: true } });
    const dias = new Set(jaTem.map((r) => r.dia.getTime()));
    const doOutro = await prisma[modelo].findMany({ where: { contactId: outroId }, select: { id: true, dia: true } });
    const colidem = doOutro.filter((r) => dias.has(r.dia.getTime())).map((r) => r.id);
    if (colidem.length) await prisma[modelo].deleteMany({ where: { id: { in: colidem } } });
  }

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
    // Estes faltavam e eram apagados junto com o cadastro duplicado (Cascade):
    // os contatos de familiar/referência, o histórico de quem foi responsável,
    // o log de atribuição e as marcas de envio automático do dia.
    prisma.contatoReferencia.updateMany({ where: { contactId: outroId }, data: { contactId: principalId } }),
    prisma.responsavelLog.updateMany({ where: { contactId: outroId }, data: { contactId: principalId } }),
    prisma.atribuicaoLog.updateMany({ where: { contactId: outroId }, data: { contactId: principalId } }),
    prisma.lembreteCobrancaLog.updateMany({ where: { contactId: outroId }, data: { contactId: principalId } }),
    prisma.pixAdimplenteLog.updateMany({ where: { contactId: outroId }, data: { contactId: principalId } }),
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
