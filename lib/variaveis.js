// Variáveis que podem ser usadas em mensagens prontas — {{chave}} é trocado
// pelo valor real do contato/dia no momento do envio.
export const VARIAVEIS_DISPONIVEIS = [
  { key: "nome", label: "Nome do cliente" },
  { key: "telefone", label: "Telefone" },
  { key: "valor_capital", label: "Valor do capital" },
  { key: "data_hoje", label: "Data de hoje" },
];

function moneyBr(n) {
  return "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Troca {{chave}} pelo valor real. Chaves desconhecidas ficam como estão
// (não apaga o texto por engano se o autor digitar algo errado).
export function interpolarVariaveis(texto, contact) {
  if (!texto) return texto;
  const valores = {
    nome: contact?.name || "",
    telefone: contact?.phone || "",
    valor_capital: contact?.valorCapital != null ? moneyBr(contact.valorCapital) : "",
    data_hoje: new Date().toLocaleDateString("pt-BR"),
  };
  return texto.replace(/\{\{\s*(\w+)\s*\}\}/g, (full, key) => (key in valores ? valores[key] : full));
}
