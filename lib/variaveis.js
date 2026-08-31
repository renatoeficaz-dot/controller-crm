import { valorEmAberto, dueStr, valorParcelaAtual, horaLimiteEfetiva } from "@/lib/finance";

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
  { key: "pix_copia_cola", label: "Código Pix (copia e cola) da mensagem automática" },
  { key: "horario_recebimento", label: "Horário limite de hoje (próprio do cliente, se tiver — senão o geral)" },
  { key: "valor_com_multa", label: "Valor da parcela mais antiga já com a multa por atraso" },
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
  // Desconta o que já entrou em baixa parcial — cobrar o valor cheio de quem
  // já pagou parte é erro grave: vai direto no texto enviado pro cliente.
  const valorAberto = abertas.reduce((acc, p) => acc + valorEmAberto(p), 0);

  let diasAtraso = null;
  let valorParcela = null;
  let valorComMulta = null;
  if (abertas.length) {
    const maisAntiga = abertas.slice().sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];
    valorParcela = valorEmAberto(maisAntiga);
    const hoje = new Date(new Date().toLocaleDateString("en-CA"));
    // Mesmo motivo do lembrete: no servidor dueDate é Date, e
    // String(Date).slice(0,10) dava "Thu Jul 09" — que o JS interpreta
    // como ano 2001, fazendo a mensagem sair com ~9000 dias de atraso.
    const venc = new Date(dueStr(maisAntiga));
    diasAtraso = Math.round((hoje - venc) / 86400000);
    // Valor JÁ com a multa por atraso (se ela já estiver valendo hoje) — pra
    // avisar o cliente "se passar de tal hora, o valor vira X" na própria
    // mensagem do lembrete, sem ele precisar abrir o sistema pra saber quanto.
    valorComMulta = valorParcelaAtual(maisAntiga, undefined, {
      multaPct: opts.cfg?.multaPct,
      horaLimite: horaLimiteEfetiva(contact, opts.cfg),
      agora: "23:59", // força considerar a multa JÁ aplicada, é o valor "se passar da hora"
    }) - (maisAntiga.valorPago || 0);
  }

  const pct = Number(opts.descontoPct ?? 0);
  const valorDesconto = valorAberto * (pct / 100);

  return {
    valorAberto,
    diasAtraso,
    valorParcela,
    valorComMulta,
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
    pix_copia_cola: opts.pixCopiaCola || "",
    horario_recebimento: horaLimiteEfetiva(contact, opts.cfg) || "",
    valor_com_multa: s.valorComMulta ? moneyBr(s.valorComMulta) : "",
  };
  return texto.replace(/\{\{\s*(\w+)\s*\}\}/g, (full, key) => (key in valores ? valores[key] : full));
}
