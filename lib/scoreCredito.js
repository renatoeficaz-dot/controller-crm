// Score de crédito interno, calculado a partir da MESMA consulta que gera o
// PDF da puxada — o dado já é comprado, só não era aproveitado.
//
// É consultivo: aparece no card do lead pra apoiar a decisão de quanto (ou se)
// liberar. Não bloqueia nada automaticamente.
//
// Os pesos abaixo são um ponto de partida, calibrados pra uma operação de
// ticket ~R$300. Conforme a carteira amadurecer e o relatório "inadimplência
// por faixa de ticket" mostrar o comportamento real, vale ajustar.

const PESOS = {
  ccf: 30, // cheque sem fundo é o sinal mais forte de inadimplência
  porEmprestimoAtivo: 10, // cada dívida ativa em outro banco compete com a sua
  maxEmprestimos: 40,
  porProcesso: 5,
  maxProcessos: 15,
  rendaBaixa: 15, // renda < R$1.500
  rendaMedia: 5, // renda entre R$1.500 e R$2.500
  classeDE: 10,
  classeC: 5,
};

// Tetos de capital por faixa de risco (R$). O limite final também é limitado a
// 25% da renda mensal — emprestar mais que isso é convidar o atraso.
const TETO_POR_RISCO = { baixo: 500, medio: 300, alto: 150, bloqueio: 0 };

function parseMoeda(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  const limpo = String(v).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

// Extrai só o que o score usa da resposta bruta da API do Detetive Forense.
export function extrairDadosPuxada(resultado) {
  const consulta = resultado?.consulta || {};
  const cad = consulta.cadastral || {};

  const emprestimos = Array.isArray(consulta.emprestimos) ? consulta.emprestimos : [];
  // `quitado` vem como 0/1 — só interessa o que ainda está em aberto.
  const emprestimosAtivos = emprestimos.filter((e) => !e.quitado).length;

  return {
    renda: parseMoeda(cad.renda),
    classe: cad.classeSocial || null,
    emprestimos: emprestimosAtivos,
    ccf: Array.isArray(consulta.ccf) ? consulta.ccf.length : 0,
    processos: Array.isArray(resultado?.processosCache?.content) ? resultado.processosCache.content.length : 0,
    obito: Boolean(cad.flagObito2),
  };
}

export function calcularScore(dados) {
  const motivos = [];

  // Óbito na base da Receita é bloqueio, não pontuação — provavelmente é
  // fraude ou CPF de terceiro.
  if (dados.obito) {
    return {
      score: 0,
      risco: "bloqueio",
      limite: 0,
      motivos: ["Óbito registrado na base da Receita — não liberar"],
    };
  }

  let score = 100;

  if (dados.ccf > 0) {
    score -= PESOS.ccf;
    motivos.push(`${dados.ccf} registro(s) de cheque sem fundo`);
  }

  if (dados.emprestimos > 0) {
    const desconto = Math.min(dados.emprestimos * PESOS.porEmprestimoAtivo, PESOS.maxEmprestimos);
    score -= desconto;
    motivos.push(`${dados.emprestimos} empréstimo(s) ativo(s) em outros bancos`);
  }

  if (dados.processos > 0) {
    const desconto = Math.min(dados.processos * PESOS.porProcesso, PESOS.maxProcessos);
    score -= desconto;
    motivos.push(`${dados.processos} processo(s) judicial(is)`);
  }

  if (dados.renda != null) {
    if (dados.renda < 1500) {
      score -= PESOS.rendaBaixa;
      motivos.push(`Renda presumida baixa (R$ ${dados.renda.toFixed(2)})`);
    } else if (dados.renda < 2500) {
      score -= PESOS.rendaMedia;
    }
  }

  if (dados.classe === "D" || dados.classe === "E") {
    score -= PESOS.classeDE;
    motivos.push(`Classe social ${dados.classe}`);
  } else if (dados.classe === "C") {
    score -= PESOS.classeC;
  }

  score = Math.max(0, Math.min(100, score));
  const risco = score >= 70 ? "baixo" : score >= 40 ? "medio" : "alto";

  // Limite = menor entre o teto da faixa e 25% da renda, arredondado pra baixo
  // em múltiplos de R$50 (valores quebrados não fazem sentido na operação).
  let limite = TETO_POR_RISCO[risco];
  if (dados.renda != null && dados.renda > 0) {
    limite = Math.min(limite, Math.floor((dados.renda * 0.25) / 50) * 50);
  }

  if (!motivos.length) motivos.push("Nenhuma restrição encontrada na consulta");

  return { score, risco, limite, motivos };
}

export const RISCO_LABEL = {
  baixo: "Risco baixo",
  medio: "Risco médio",
  alto: "Risco alto",
  bloqueio: "Não liberar",
};
