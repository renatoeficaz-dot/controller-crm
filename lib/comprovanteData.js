// Regra de data do comprovante lido pela IA: só vale o de HOJE (horário de Brasília). Sem data visível vale o dia em que chegou no chat.
export const dataBR = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);

export function motivoDataInvalida(dataLida, agora = new Date()) {
  const hoje = dataBR(agora);
  if (!dataLida || dataLida === hoje) return null;
  return `o comprovante é de ${String(dataLida).split("-").reverse().join("/")}, não de hoje — pode ser um comprovante antigo reenviado`;
}
