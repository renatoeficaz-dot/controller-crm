// Primeira mensagem típica de quem chegou por anúncio ("Olá! Posso ter mais informações sobre isso?", "Olá, como funciona?"...).
// Lead novo que escreve no número de Cobrança com um texto assim também recebe a mensagem inicial — a regra de só mandar
// no número de Vendas deixava dezenas de leads de anúncio sem nenhuma resposta.
export function pareceLeadDeAnuncio(texto) {
  const t = String(texto || "").toLowerCase();
  return /informa[cç][aãoõ]|como\s+funciona|empr[eé]stimo|emprestimo|cr[eé]dito|capital\s+de\s+giro|quero\s+(saber|dinheiro|um)|gostaria\s+de\s+(saber|solicitar|mais)|pode\s+me\s+passar/.test(t);
}
