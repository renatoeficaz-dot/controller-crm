// Roda uma vez quando o servidor Next sobe (não em cada request). Usado pra
// disparar o lembrete diário de cobrança sem precisar de cron externo/SSH.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { checarLembretesCobranca } = await import("@/lib/lembreteCobranca");
  const { checarFollowUp30min, checarMensagensSemResposta } = await import("@/lib/followUp");
  const CINCO_MIN = 5 * 60 * 1000;
  setInterval(() => {
    checarLembretesCobranca().catch((err) => console.error("[lembreteCobranca] erro:", err.message));
    checarFollowUp30min().catch((err) => console.error("[followUp30min] erro:", err.message));
    checarMensagensSemResposta().catch((err) => console.error("[mensagensSemResposta] erro:", err.message));
  }, CINCO_MIN);
}
