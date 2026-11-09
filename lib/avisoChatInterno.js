// Aviso no WhatsApp do dono quando chega mensagem no chat interno: só a palavra "Erro", pelo mesmo número (secretaria-gb)
// que manda o "Nova lead". Em segundo plano; falha nunca atrapalha quem enviou a mensagem.
const DESTINO = "5511930888128";
const INSTANCIA = "secretaria-gb";
const TEXTO = "Erro";

export function avisarChatInterno() {
  import("@/lib/evolution")
    .then((m) => m.sendWhatsappText(DESTINO, TEXTO, INSTANCIA))
    .catch((e) => console.error("[chat-interno] aviso no WhatsApp falhou:", e?.message));
}
