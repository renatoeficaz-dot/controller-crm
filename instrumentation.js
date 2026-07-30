// Roda uma vez quando o servidor Next sobe (não em cada request). Usado pra
// disparar o lembrete diário de cobrança sem precisar de cron externo/SSH.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { checarLembretesCobranca } = await import("@/lib/lembreteCobranca");
  const { checarFollowUp30min, checarMensagensSemResposta } = await import("@/lib/followUp");
  const { recalcularScoresComportamentais } = await import("@/lib/atualizarScoreComportamental");
  const { rodarBackup } = await import("@/lib/backup");
  const { checarResumoDiario, checarAlertasCriticos, checarCapitalOcioso } = await import("@/lib/alertas");
  const { estenderRecorrenciasIlimitadas } = await import("@/lib/contasPagar");
  const { escalonarAtrasos } = await import("@/lib/escalonamentoAtraso");
  const CINCO_MIN = 5 * 60 * 1000;

  // Rotinas de 1x por dia guardam aqui o dia da última execução — o intervalo
  // é de 5 min, então sem essa trava rodariam 288 vezes por dia.
  let ultimoDiaScores = null;
  let ultimoDiaBackup = null;

  setInterval(() => {
    checarLembretesCobranca().catch((err) => console.error("[lembreteCobranca] erro:", err.message));
    checarFollowUp30min().catch((err) => console.error("[followUp30min] erro:", err.message));
    checarMensagensSemResposta().catch((err) => console.error("[mensagensSemResposta] erro:", err.message));
    checarResumoDiario().catch((err) => console.error("[resumoDiario] erro:", err.message));
    checarAlertasCriticos().catch((err) => console.error("[alertasCriticos] erro:", err.message));

    const hoje = new Date().toLocaleDateString("en-CA");
    if (ultimoDiaScores !== hoje) {
      ultimoDiaScores = hoje;
      recalcularScoresComportamentais().catch((err) =>
        console.error("[scoresComportamentais] erro:", err.message)
      );
    }
    if (ultimoDiaBackup !== hoje) {
      ultimoDiaBackup = hoje;
      rodarBackup()
        .then((r) => console.log(`[backup] ${r.arquivo} (${r.bytes} bytes)`))
        .catch((err) => console.error("[backup] erro:", err.message));
      // Conta recorrente "ilimitada" não pode gerar linhas infinitas de uma
      // vez: a janela de 12 meses é empurrada pra frente aqui, todo dia.
      estenderRecorrenciasIlimitadas()
        .then((n) => n && console.log(`[contasPagar] ${n} ocorrência(s) criada(s)`))
        .catch((err) => console.error("[contasPagar] erro:", err.message));
      // Cobrança velha troca de mão: passou do limite de dias, vai pro sênior.
      escalonarAtrasos()
        .then((n) => n && console.log(`[escalonamentoAtraso] ${n} lead(s) reatribuído(s)`))
        .catch((err) => console.error("[escalonamentoAtraso] erro:", err.message));
      // Dinheiro parado em caixa sem liberar capital não gira — avisa o dono.
      checarCapitalOcioso().catch((err) => console.error("[capitalOcioso] erro:", err.message));
    }
  }, CINCO_MIN);
}
