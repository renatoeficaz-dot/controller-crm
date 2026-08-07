import { prisma } from "@/lib/prisma";

// O webhook precisa ficar público (a Evolution/WAHA chama de fora, sem sessão),
// mas ficava aberto pra QUALQUER um: quem descobrisse a URL conseguia injetar
// mensagem falsa numa conversa real, criar lead fantasma e disparar resposta da
// IA — que custa crédito por chamada.
//
// A trava é OPT-IN de propósito: esse webhook recebe mensagem de cliente de
// verdade 24h por dia, então exigir token de imediato derrubaria a entrada de
// mensagens até a Evolution/WAHA ser reconfigurada. Enquanto `webhookToken`
// estiver vazio, o comportamento é o de hoje.
//
// Pra ligar: gere um token em Configurações e troque a URL do webhook na
// Evolution/WAHA para  <dominio>/api/webhook/evolution?t=SEU_TOKEN
export async function webhookAutorizado(req) {
  const cfg = await prisma.config.findUnique({
    where: { id: "singleton" },
    select: { webhookToken: true },
  });
  const esperado = (cfg?.webhookToken || "").trim();
  if (!esperado) return true; // não configurado = aberto, como sempre foi

  const url = new URL(req.url);
  const recebido = (url.searchParams.get("t") || req.headers.get("x-webhook-token") || "").trim();
  return recebido === esperado;
}
