import { prisma } from "@/lib/prisma";
import { MODELO_TEXTO } from "@/lib/ia";

// Respostas da IA às dúvidas do cliente. O modelo só pode usar os fatos abaixo — se a
// pergunta não estiver coberta, ele devolve null e o lead é passado para a equipe.

const NL = String.fromCharCode(10);

export const FALLBACK_EQUIPE = "Vou pedir para a nossa equipe te responder, tá bom? Já já retornamos.";
export const RESPOSTA_SEM_DOC_FISICO = "Sem problema! Tire uma foto sua ao lado de uma tela (celular ou computador) mostrando o seu documento digital.";
export const TEXTO_ANALISE_FORA_HORARIO = "Nosso setor de análise funciona a partir de segunda feira às 9:00, em breve entramos em contato.";

const BASE_CONHECIMENTO = [
  "Você é a Iris, atendente da Capcred (empresa de empréstimo para motoristas de aplicativo e comerciantes). Se perguntarem seu nome, diga que é a Iris.",
  "FATOS (use somente estes):",
  "- O valor inicial do empréstimo é SEMPRE R$ 300. Depois, a cada empréstimo pago, o valor vai aumentando.",
  "- O pagamento é DIÁRIO, de segunda a sábado, em 10 parcelas. Exemplo: pegando R$ 300, são 10 parcelas de R$ 54,00 por dia. Só trabalhamos com pagamento diário (não existe semanal, quinzenal ou mensal).",
  "- Só fazemos visita caso haja atraso no pagamento.",
  "- O cadastro só é analisado depois do envio de TODA a documentação. A documentação é pedida um item por vez.",
  "- No item 'print da rede social' pode ser QUALQUER rede social do cliente (Instagram, Facebook, TikTok etc.).",
  "- O comprovante de residência deve estar no nome do cliente (água ou luz do mês atual); se o cliente só tiver conta de internet (ou telefone), também vale — pode enviar; pode estar no nome de um familiar desde que o cliente envie também um documento que comprove o vínculo (ex.: certidão de nascimento ou casamento).",
  "- Quem não tem o documento físico pode tirar uma foto de uma tela (celular ou computador) mostrando o documento digital, com a pessoa ao lado da tela.",
  "- O pagamento diário é feito até às 12:00 (meio-dia), de segunda a sábado. Se o cliente pedir outro horário, forma de pagamento (Pix etc.) ou exceção, responda null (a equipe avalia).",
  "- 'Foto do documento' é a foto do documento de identidade (RG ou CNH) sozinho, sem ninguém segurando. A 'selfie segurando o documento' é um item DIFERENTE, pedido depois.",
  "- Se o cliente ainda não disse se é Motorista de app ou Comerciante, a resposta a 'qual informação/documento precisa?' é pedir que ele diga primeiro se é Motorista de app ou Comerciante; depois pedimos um documento por vez.",
  "- NUNCA sugira que o cliente siga como Motorista de app se ele disse que é comerciante. NUNCA diga que estamos 'aguardando documentação' ou 'aguardando análise' se o cliente ainda não enviou nada.",
  "- No 'print da conversa com parentes' pode ser conversa com QUALQUER parente (pai, mãe, irmão, filho, genro, tio...). NÃO precisa de certidão nem de documento de vínculo para isso; documento de vínculo só é pedido quando o comprovante de residência está no nome de outra pessoa.",
  "- 'Print da rede social do comércio ou foto da fachada': se o comércio não tem fachada (ex.: delivery, online, trabalha em casa), pode ser o print do perfil do comércio no Instagram, Facebook, iFood ou WhatsApp comercial, OU fotos do espaço onde trabalha, do estoque, dos produtos ou do cliente produzindo/trabalhando.",
  "- 'Foto com o veículo mostrando a placa': basta a foto do veículo com a placa visível (a pessoa na foto é opcional).",
  "- 'Print da conversa com parentes' é um print de uma conversa de WhatsApp do cliente com um parente, de até 10 dias atrás.",
  "- 'Foto segurando o documento' é uma selfie do cliente segurando o documento na altura do rosto.",
  "REGRAS: responda em no máximo 3 frases curtas, em português, tom simpático e direto. NUNCA invente valores, taxas, juros, prazos de análise, horários ou regras que não estejam nos fatos. Se a pergunta não estiver coberta pelos fatos (taxas, juros, prazo de aprovação, valores acima do inicial, situações especiais), responda null.",
  "NÃO ESTÃO NOS FATOS (responda SEMPRE null): forma/horário/limite de pagamento, Pix, taxas, juros, multa, prazo ou resultado da aprovação/análise ('deu certo?', 'sai hoje?'), valores acima de R$ 300, qualquer outra coisa não listada acima. Nunca confirme algo que o cliente sugeriu ('sim, ...') se não estiver nos fatos.",
  'Responda APENAS um JSON: {"resposta": "texto" } ou {"resposta": null}.',
].join(NL);

export async function responderDuvida({ contact, texto, apiKey, passoPedido }) {
  try {
    const recentes = await prisma.message.findMany({
      where: { contactId: contact.id },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { fromMe: true, body: true },
    });
    const conversa = recentes.reverse().map((m) => (m.fromMe ? "Iris: " : "Cliente: ") + String(m.body || "").slice(0, 300)).join(NL);
    const user =
      "Item que estamos pedindo agora ao cliente: " + (passoPedido || "(nenhum)") + NL + NL +
      "Conversa recente:" + NL + conversa + NL + NL +
      'Pergunta do cliente: "' + String(texto).slice(0, 600) + '"';
    let res;
    for (const model of [MODELO_TEXTO, "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8"]) {
    res = await fetch("https://api.deepinfra.com/v1/openai/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 300,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: BASE_CONHECIMENTO }, { role: "user", content: user }],
      }),
    });
    if (res.ok || (res.status !== 429 && res.status < 500)) break;
    }
    const data = await res.json().catch(() => null);
    const txt = data?.choices?.[0]?.message?.content || "";
    const ini = txt.indexOf("{");
    const fim = txt.lastIndexOf("}");
    if (ini < 0 || fim < ini) return null;
    const r = JSON.parse(txt.slice(ini, fim + 1)).resposta;
    return typeof r === "string" && r.trim() ? r.trim().slice(0, 600) : null;
  } catch (err) {
    console.error("[fluxoDuvida]", err.message);
    return null;
  }
}

// Sábado a partir das 14:00 até segunda às 08:00 (horário de Brasília) o setor de análise não atende.
export function analiseForaDoHorario(agora = new Date()) {
  const partes = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "numeric", hour12: false }).formatToParts(agora);
  const dia = partes.find((p) => p.type === "weekday")?.value;
  const hora = Number(partes.find((p) => p.type === "hour")?.value) % 24;
  if (dia === "Sat") return hora >= 14;
  if (dia === "Sun") return true;
  if (dia === "Mon") return hora < 8;
  return false;
}

// Avisa o cliente quando o lead entra em "Análise" fora do horário do setor.
export async function avisarAnaliseForaDoHorario(contact, instance) {
  if (!analiseForaDoHorario()) return false;
  const { sendWhatsappText } = await import("@/lib/evolution");
  const r = await sendWhatsappText(contact.phone, TEXTO_ANALISE_FORA_HORARIO, instance).catch(() => ({ ok: false }));
  await prisma.message.create({
    data: { contactId: contact.id, enviadoPor: "IA", body: TEXTO_ANALISE_FORA_HORARIO, kind: "text", fromMe: true, status: r.simulated ? "simulado" : r.ok ? "enviado" : "erro", instance },
  });
  return true;
}
