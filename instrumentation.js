// Roda uma vez quando o servidor Next sobe (não em cada request). Usado pra
// disparar o lembrete diário de cobrança sem precisar de cron externo/SSH.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { checarLembretesCobranca } = await import("@/lib/lembreteCobranca");
  const CINCO_MIN = 5 * 60 * 1000;
  setInterval(() => {
    checarLembretesCobranca().catch((err) => console.error("[lembreteCobranca] erro:", err.message));
  }, CINCO_MIN);
}
