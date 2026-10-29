import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { valorParcelaAtual, horaLimiteEfetiva } from "@/lib/finance";
import { aplicarBaixaParcial } from "@/lib/baixaParcial";
import { chamarVisao, serial } from "@/lib/fluxoDoc";

// Lead em "Recebimento" que manda imagem/PDF: a IA lê o comprovante (Pix/transferência) e dá a baixa pelo valor,
// do mesmo jeito da baixa manual em valor único (começa na 1ª parcela em aberto do ciclo e o que sobra vai
// para as seguintes). Só dá baixa sozinha quando TUDO confere (recebedor = o Pix cadastrado, pagamento concluído,
// data de hoje/ontem, valor dentro do que está em aberto, comprovante ainda não usado). Qualquer dúvida vira uma
// tarefa para a equipe conferir — nunca dá baixa na dúvida.
const ORIGEM = "Comprovante lido pela IA";
const TITULO_TAREFA = "Comprovante de pagamento recebido — conferir e dar baixa";

const PROMPT =
  "Esta imagem é um comprovante de pagamento ou transferência bancária (Pix, TED, DOC, boleto)? " +
  "Responda APENAS um JSON, sem texto fora dele, neste formato: " +
  '{"comprovante": true|false, "concluido": true|false, "valor": numero ou null, "data": "AAAA-MM-DD" ou null, "hora": "HH:MM" ou null, ' +
  '"pagador": texto ou null, "recebedor": texto ou null, "documento_ou_chave_recebedor": texto ou null, "id_transacao": texto ou null}. ' +
  '"comprovante" é true só se for um comprovante de pagamento/transferência (não vale foto de pessoa, documento, print de conversa, extrato de recebimentos). ' +
  '"concluido" é true se mostra pagamento realizado/efetivado (false se agendado, pendente, falhou). "valor" é o valor pago, em reais, como número (ex.: 54.5). ' +
  '"recebedor" é o nome de QUEM RECEBEU. "id_transacao" é o ID/código de autenticação/E2E da transação.';

const norm = (v) => String(v || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const soDig = (v) => String(v || "").replace(/\D/g, "");
const brl = (n) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);

function lerJson(txt) {
  const m = String(txt || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function numero(v) {
  if (typeof v === "number") return v;
  const s = String(v || "").replace(/[^\d.,]/g, "");
  if (!s) return null;
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
  return Number.isFinite(n) ? n : null;
}

async function criarTarefaConferir(contact, motivo, notasExtras) {
  const ja = await prisma.task.count({ where: { contactId: contact.id, title: TITULO_TAREFA, done: false } });
  if (ja) return;
  await prisma.task.create({
    data: { contactId: contact.id, title: TITULO_TAREFA, notes: [motivo, notasExtras].filter(Boolean).join("\n"), dueDate: new Date(), responsavel: contact.responsavel || null },
  }).catch(() => {});
}

// Devolve true quando tratou o comprovante (deu a baixa); false para seguir o fluxo normal.
export function tratarComprovantePagamento({ contact, saved, instance }) {
  return serial(contact.id, () => tratar({ contact, saved, instance }));
}

async function tratar({ contact, saved, instance }) {
  const mime = String(saved.mimeType || "");
  const ehImagem = saved.kind === "image" || (saved.kind === "document" && mime.startsWith("image/"));
  const ehPdf = saved.kind === "document" && mime === "application/pdf";
  if (!(ehImagem || ehPdf) || !saved.mediaUrl || !contact?.stageId) return false;
  const etapa = await prisma.stage.findUnique({ where: { id: contact.stageId }, select: { name: true } });
  if (etapa?.name !== "Recebimento") return false;

  const cfg = await prisma.config.findUnique({ where: { id: "singleton" } });
  if (!cfg?.deepinfraApiKey) return false;
  const parcelas = await prisma.parcela.findMany({ where: { contactId: contact.id, paid: false, renegociada: false }, orderBy: [{ ciclo: "asc" }, { number: "asc" }] });
  if (!parcelas.length) return false;

  const { readMediaAsBase64 } = await import("@/lib/mediaStorage");
  let base64 = await readMediaAsBase64(saved.mediaUrl).catch(() => null);
  if (!base64) return false;
  const sha = createHash("sha1").update(Buffer.from(base64, "base64")).digest("hex").slice(0, 12);
  let mimetype = mime || "image/jpeg";
  if (ehPdf) {
    if (Buffer.from(base64, "base64").subarray(0, 200000).toString("latin1").includes("/Encrypt")) return false;
    const { pdfPrimeiraPaginaComoImagem } = await import("@/lib/pdfPreview");
    const conv = await pdfPrimeiraPaginaComoImagem(base64).catch(() => null);
    if (!conv) return false;
    base64 = conv.base64;
    mimetype = conv.mimetype;
  }

  const data = await chamarVisao(cfg.deepinfraApiKey, {
    model: "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8",
    temperature: 0,
    max_tokens: 400,
    messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, { type: "image_url", image_url: { url: "data:" + mimetype + ";base64," + base64 } }] }],
  });
  const lido = lerJson(data?.choices?.[0]?.message?.content);
  if (!lido || lido.comprovante !== true) return false; // não é comprovante: segue o fluxo normal

  const valor = numero(lido.valor);
  const resumo = `Lido: ${valor != null ? brl(valor) : "valor não identificado"} · recebedor ${lido.recebedor || "?"} · ${lido.data || "sem data"} ${lido.hora || ""} · ID ${lido.id_transacao || "—"}`;

  // --- conferências: qualquer falha = tarefa para a equipe, sem baixa ---
  const falhas = [];
  if (lido.concluido !== true) falhas.push("o comprovante não mostra pagamento concluído");
  if (!(valor > 0)) falhas.push("não consegui ler o valor");

  // Recebedor tem que ser o Pix cadastrado em Configurações → Gestão (nome ou chave).
  const nomeCfg = norm(cfg.pixNomeRecebedor).split(" ").filter((t) => t.length > 2 && !["de", "da", "do", "das", "dos"].includes(t));
  const recebedor = norm(lido.recebedor);
  const bateNome = nomeCfg.length >= 2 && nomeCfg.slice(0, 2).every((t) => recebedor.includes(t));
  const chaveCfg = String(cfg.pixChave || "").trim().toLowerCase();
  const docLido = String(lido.documento_ou_chave_recebedor || "").trim().toLowerCase();
  const bateChave = !!chaveCfg && !!docLido && (docLido === chaveCfg || (soDig(chaveCfg).length >= 8 && soDig(docLido) === soDig(chaveCfg)));
  if (!bateNome && !bateChave) falhas.push("o recebedor do comprovante não confere com o Pix cadastrado");

  // Data de hoje ou de ontem (horário de Brasília): comprovante antigo não vale.
  const hoje = dataBR(new Date());
  const ontem = dataBR(new Date(Date.now() - 24 * 3600e3));
  if (!lido.data || (lido.data !== hoje && lido.data !== ontem)) falhas.push("a data do comprovante não é de hoje/ontem");

  // Não usar o mesmo comprovante duas vezes.
  const refs = [`[comp:${sha}]`, lido.id_transacao ? `[tx:${String(lido.id_transacao).replace(/\s+/g, "").slice(0, 40)}]` : null].filter(Boolean);
  const usado = await prisma.lancamento.findFirst({ where: { OR: refs.map((r) => ({ description: { contains: r } })) }, select: { id: true } });
  if (usado) return true; // já foi dado baixa com este comprovante: não repete

  // Valor dentro do que está em aberto no ciclo atual (com multa/juros, igual à tela).
  const cicloAtual = parcelas[parcelas.length - 1].ciclo;
  const doCiclo = parcelas.filter((p) => p.ciclo === cicloAtual);
  const hl = horaLimiteEfetiva({ tipoCliente: contact.tipoCliente, horarioRecebimento: contact.horarioRecebimento }, cfg);
  const totalAberto = doCiclo.reduce((s, p) => s + Math.max(0, valorParcelaAtual(p, undefined, { multaPct: cfg.multaPct, horaLimite: hl }) - (p.valorPago || 0)), 0);
  if (valor > 0 && valor > totalAberto + 1) falhas.push(`o valor (${brl(valor)}) é maior que o que está em aberto (${brl(totalAberto)})`);

  if (falhas.length) {
    await criarTarefaConferir(contact, "Cliente mandou um comprovante e a IA não deu a baixa: " + falhas.join("; ") + ".", resumo);
    return false;
  }

  const origem = `${ORIGEM} ${refs.join(" ")}`;
  const r = await aplicarBaixaParcial({ id: doCiclo[0].id, valor, formaPagamento: "pix", usuarioNome: "IA", origem, semJuros: true });
  if (r.erro) {
    await criarTarefaConferir(contact, "Cliente mandou um comprovante e a baixa automática falhou: " + r.erro, resumo);
    return false;
  }

  // Confirma pro cliente (número de cobrança nunca usa emoji).
  const faltam = r.completou ? 0 : r.faltam;
  const corpo = `Pagamento de ${brl(valor)} recebido, obrigado!` + (faltam > 0 ? ` Ainda falta ${brl(faltam)} desta parcela.` : "");
  try {
    const { sendWhatsappText, semEmoji } = await import("@/lib/evolution");
    const body = semEmoji(corpo);
    const env = await sendWhatsappText(contact.phone, body, instance).catch(() => ({ ok: false }));
    await prisma.message.create({ data: { contactId: contact.id, enviadoPor: "IA", body, kind: "text", fromMe: true, status: env.simulated ? "simulado" : env.ok ? "enviado" : "erro", instance } });
  } catch {}
  return true;
}
