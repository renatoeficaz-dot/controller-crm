// Aviso no WhatsApp do dono quando chega mensagem no chat interno: só a palavra "Erro", pelo mesmo número (secretaria-gb)
// que manda o "Nova lead". Em segundo plano; falha nunca atrapalha quem enviou a mensagem.
// Um aviso só por conversa: várias mensagens seguidas na mesma conversa não repetem o "Erro".
// Só avisa quando o dono RECEBE: mensagem de outra pessoa numa conversa em que ele (login "gestor") está.
// O que ele mesmo escreve, ou conversa entre outros, não gera aviso.
const DESTINO = "5511930888128";
const INSTANCIA = "secretaria-gb";
const TEXTO = "Erro";
export const LOGIN_DONO = "gestor";
const INTERVALO_MS = 10 * 60 * 1000;

const ultimoAviso = new Map(); // conversaId -> timestamp do último aviso

export function deveAvisar({ autorLogin, membrosLogins }) {
  return autorLogin !== LOGIN_DONO && (membrosLogins || []).includes(LOGIN_DONO);
}

export function avisarChatInterno(conversaId = "geral", { autorLogin, membrosLogins } = {}) {
  if (!deveAvisar({ autorLogin, membrosLogins })) return;
  const agora = Date.now();
  if (agora - (ultimoAviso.get(conversaId) || 0) < INTERVALO_MS) return;
  ultimoAviso.set(conversaId, agora);
  if (ultimoAviso.size > 500) {
    for (const [k, t] of ultimoAviso) if (agora - t >= INTERVALO_MS) ultimoAviso.delete(k);
  }
  import("@/lib/evolution")
    .then((m) => m.sendWhatsappText(DESTINO, TEXTO, INSTANCIA))
    .catch((e) => console.error("[chat-interno] aviso no WhatsApp falhou:", e?.message));
}
