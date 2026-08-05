// Regras que valem pra QUALQUER mensagem automática (régua de cobrança, Pix
// pra adimplente, follow-up da IA, campanha em massa, mensagem agendada).
//
// Cada rotina tinha sua própria combinação de filtros, e por isso cada uma
// deixava passar um caso: a régua mandava cobrança pra lead já excluído, o
// follow-up ignorava o "não perturbar", a campanha em massa também. Centralizar
// aqui garante que ligar uma trava nova cubra todos os envios de uma vez.
//
// Atendimento MANUAL não passa por aqui — quem está conversando com o cliente
// continua podendo escrever normalmente.

// Fragmento de `where` do Prisma pra usar direto nas consultas de contatos.
//
// É FUNÇÃO, não constante: como constante o `new Date()` era avaliado uma única
// vez, quando o módulo carregava (subida do servidor). O "não perturbar" era
// comparado pra sempre contra o horário do boot, então um silêncio de 1 dia
// nunca expirava — o lead parava de receber cobrança automática até alguém
// reiniciar o processo.
export function ondePodeReceberAutomatico() {
  return {
    excluidoEm: null,
    OR: [{ naoPerturbarAte: null }, { naoPerturbarAte: { lte: new Date() } }],
  };
}

// Versão em memória, pra quando o contato já foi carregado.
export function podeReceberAutomatico(contact) {
  if (!contact) return false;
  if (contact.excluidoEm) return false;
  if (contact.naoPerturbarAte && new Date(contact.naoPerturbarAte) > new Date()) return false;
  return true;
}
