// Capital escalonado: o 1º empréstimo trava num valor baixo, e só sobe a cada
// ciclo pago (renovação) — reduz a exposição no ciclo mais arriscado, que é
// onde a carteira historicamente perde dinheiro.
export function limiteEscalonado(cicloAtual, cfg) {
  const ciclo = Math.max(1, cicloAtual || 1);
  let limite = cfg.escalonamentoBase + cfg.escalonamentoIncremento * (ciclo - 1);
  if (cfg.escalonamentoTeto != null) limite = Math.min(limite, cfg.escalonamentoTeto);
  return limite;
}
