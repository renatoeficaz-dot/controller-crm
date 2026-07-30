// Variáveis que podem ser usadas em mensagens prontas — {{chave}} é trocado
// pelo valor real do contato/dia no momento do envio.
export const VARIAVEIS_DISPONIVEIS = [
  { key: "nome", label: "Nome do cliente" },
  { key: "telefone", label: "Telefone" },
  { key: "valor_capital", label: "Valor do capital" },
  { key: "data_hoje", label: "Data de hoje" },
  { key: "valor_aberto", label: "Total em aberto" },
  { key: "dias_atraso", label: "Dias de atraso" },
  { key: "valor_parcela", label: "Valor da parcela mais antiga em aberto" },
  { key: "pct_desconto", label: "% de desconto (quitação)" },
  { key: "valor_desconto", label: "Valor do desconto (quitação)" },
  { key: "valor_quitacao", label: "Valor pra quitar à vista" },
];

function moneyBr(n) {
  return "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Situação de cobrança do contato — base das variáveis de valor e da oferta de
// quitação. Depende de `contact.parcelas` vir carregado; quando não vem, as
// variáveis correspondentes ficam vazias em vez de quebrar a mensagem.
export function situacaoCobranca(contact, opts = {}) {
  const parcelas = contact?.parcelas || [];
  // Parcela renegociada saiu do plano original: o valor dela virou as parcelas
  // do acordo, então contá-la aqui dobraria a dívida do cliente.
  const abertas = parcelas.filter((p) => !p.paid && !p.renegociada);
  const valorAberto = abertas.reduce((acc, p) => acc + p.amount, 0);

  let diasAtraso = null;
  let valorParcela = null;
  if (abertas.length) {
    const maisAntiga = abertas.slice().sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];
    valorParcela = maisAntiga.amount;
    const hoje = new Date(new Date().toLocaleDateString("en-CA"));
    const venc = new Date(String(maisAntiga.dueDate).slice(0, 10));
    diasAtraso = Math.round((hoje - venc) / 86400000);
  }

  const pct = Number(opts.descontoPct ?? 0);
  const valorDesconto = valorAberto * (pct / 100);

  return {
    valorAberto,
    diasAtraso,
    valorParcela,
    pctDesconto: pct,
    valorDesconto,
    valorQuitacao: valorAberto - valorDesconto,
  };
}

// Troca {{chave}} pelo valor real. Chaves desconhecidas ficam como estão
// (não apaga o texto por engano se o autor digitar algo errado).
export function interpolarVariaveis(texto, contact, opts = {}) {
  if (!texto) return texto;
  const s = situacaoCobranca(contact, opts);
  const valores = {
    nome: contact?.name || "",
    telefone: contact?.phone || "",
    valor_capital: contact?.valorCapital != null ? moneyBr(contact.valorCapital) : "",
    data_hoje: new Date().toLocaleDateString("pt-BR"),
    valor_aberto: s.valorAberto ? moneyBr(s.valorAberto) : "",
    dias_atraso: s.diasAtraso != null ? String(s.diasAtraso) : "",
    valor_parcela: s.valorParcela != null ? moneyBr(s.valorParcela) : "",
    pct_desconto: s.pctDesconto ? `${s.pctDesconto}%` : "",
    valor_desconto: s.valorDesconto ? moneyBr(s.valorDesconto) : "",
    valor_quitacao: s.valorQuitacao ? moneyBr(s.valorQuitacao) : "",
  };
  return texto.replace(/\{\{\s*(\w+)\s*\}\}/g, (full, key) => (key in valores ? valores[key] : full));
}
