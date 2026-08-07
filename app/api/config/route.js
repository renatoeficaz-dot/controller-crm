import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";

// Garante que a linha única de config exista
async function getConfig() {
  return prisma.config.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

// Chaves de API não podem sair daqui pra quem não é admin: as telas comuns só
// precisam de honorários/multa/horário, mas a resposta inteira ia junto e
// entregava a API key da Evolution pra qualquer usuário logado.
const CAMPOS_SECRETOS = [
  "evolutionApiKey", "wahaApiKey", "deepinfraApiKey",
  "fishAudioApiKey", "elevenLabsApiKey",
  // O token do webhook entra aqui também: se vazasse pra qualquer usuário
  // logado, a trava do webhook viraria enfeite — bastaria ler o token e
  // continuar injetando mensagem falsa.
  "webhookToken",
];

export async function GET() {
  const cfg = await getConfig();
  const user = await getCurrentUser().catch(() => null);
  if (isAdmin(user)) return NextResponse.json(cfg);

  const seguro = { ...cfg };
  for (const campo of CAMPOS_SECRETOS) {
    // Mantém a informação de "está configurado ou não" (a tela usa isso),
    // sem devolver o segredo em si.
    if (seguro[campo]) seguro[campo] = "***";
  }
  return NextResponse.json(seguro);
}

// Atualiza configurações globais (ex.: % de honorários)
export async function PATCH(req) {
  const body = await req.json();
  await getConfig();
  const data = {};
  if ("honorariosPct" in body) data.honorariosPct = Number(body.honorariosPct) || 0;
  if ("multaPct" in body) data.multaPct = Number(body.multaPct) || 0;
  if ("pagamentoHoraLimite" in body) data.pagamentoHoraLimite = (body.pagamentoHoraLimite || "").trim() || null;
  if ("evolutionUrl" in body) data.evolutionUrl = (body.evolutionUrl || "").trim() || null;
  if ("evolutionApiKey" in body) data.evolutionApiKey = (body.evolutionApiKey || "").trim() || null;
  if ("wahaUrl" in body) data.wahaUrl = (body.wahaUrl || "").trim() || null;
  if ("wahaApiKey" in body) data.wahaApiKey = (body.wahaApiKey || "").trim() || null;
  if ("webhookToken" in body) data.webhookToken = (body.webhookToken || "").trim() || null;
  if ("deepinfraApiKey" in body) data.deepinfraApiKey = (body.deepinfraApiKey || "").trim() || null;
  if ("fishAudioApiKey" in body) data.fishAudioApiKey = (body.fishAudioApiKey || "").trim() || null;
  if ("elevenLabsApiKey" in body) data.elevenLabsApiKey = (body.elevenLabsApiKey || "").trim() || null;
  if ("contaLiberacaoId" in body) data.contaLiberacaoId = body.contaLiberacaoId || null;
  if ("contaRecebimentoId" in body) data.contaRecebimentoId = body.contaRecebimentoId || null;
  if ("horarioComercialInicio" in body) data.horarioComercialInicio = (body.horarioComercialInicio || "").trim() || null;
  if ("horarioComercialFim" in body) data.horarioComercialFim = (body.horarioComercialFim || "").trim() || null;
  if ("metaPctRecebimentoMinima" in body) data.metaPctRecebimentoMinima = Math.min(100, Math.max(0, Number(body.metaPctRecebimentoMinima) || 0));
  if ("metaPctRecebimentoMedia" in body) data.metaPctRecebimentoMedia = Math.min(100, Math.max(0, Number(body.metaPctRecebimentoMedia) || 0));
  if ("metaPctRecebimento" in body) data.metaPctRecebimento = Math.min(100, Math.max(0, Number(body.metaPctRecebimento) || 0));
  if ("metaVendasMinima" in body) data.metaVendasMinima = Math.max(0, Number(body.metaVendasMinima) || 0);
  if ("metaVendasMedia" in body) data.metaVendasMedia = Math.max(0, Number(body.metaVendasMedia) || 0);
  if ("metaVendasDia" in body) data.metaVendasDia = Math.max(0, Number(body.metaVendasDia) || 0);
  if ("descontoAtivo" in body) data.descontoAtivo = !!body.descontoAtivo;
  if ("descontoPct" in body) data.descontoPct = Math.min(100, Math.max(0, Number(body.descontoPct) || 0));
  if ("descontoDiasMin" in body) data.descontoDiasMin = Math.max(0, Number(body.descontoDiasMin) || 0);
  if ("descontoMensagem" in body) data.descontoMensagem = (body.descontoMensagem || "").trim() || null;
  if ("alertaWhatsapp" in body) data.alertaWhatsapp = (body.alertaWhatsapp || "").replace(/\D/g, "") || null;
  if ("alertaResumoDiario" in body) data.alertaResumoDiario = !!body.alertaResumoDiario;
  if ("alertaHora" in body) data.alertaHora = (body.alertaHora || "").trim() || null;
  if ("alertaCriticos" in body) data.alertaCriticos = !!body.alertaCriticos;
  if ("alertaCapitalMin" in body) data.alertaCapitalMin = Math.max(0, Number(body.alertaCapitalMin) || 0);

  // Capital escalonado por ciclo. O teto aceita null ("sem teto"), então não
  // pode cair no `|| 0` — zeraria o limite e travaria tudo.
  if ("escalonamentoAtivo" in body) data.escalonamentoAtivo = !!body.escalonamentoAtivo;
  if ("escalonamentoBase" in body) data.escalonamentoBase = Math.max(0, Number(body.escalonamentoBase) || 0);
  if ("escalonamentoIncremento" in body) data.escalonamentoIncremento = Math.max(0, Number(body.escalonamentoIncremento) || 0);
  if ("escalonamentoTeto" in body) {
    data.escalonamentoTeto =
      body.escalonamentoTeto === null || body.escalonamentoTeto === "" ? null : Math.max(0, Number(body.escalonamentoTeto) || 0);
  }
  if ("bloqueioCpfAtivo" in body) data.bloqueioCpfAtivo = !!body.bloqueioCpfAtivo;
  // Dias null = escalonamento por atraso desligado.
  if ("escalonamentoAtrasoDias" in body) {
    data.escalonamentoAtrasoDias =
      body.escalonamentoAtrasoDias === null || body.escalonamentoAtrasoDias === ""
        ? null
        : Math.max(1, Number(body.escalonamentoAtrasoDias) || 1);
  }
  if ("escalonamentoAtrasoResponsavel" in body) {
    data.escalonamentoAtrasoResponsavel = (body.escalonamentoAtrasoResponsavel || "").trim() || null;
  }
  if ("capitalOciosoDias" in body) data.capitalOciosoDias = Math.max(0, Number(body.capitalOciosoDias) || 0);

  // Metas de valor (R$) — 0 significa "meta desligada", então não há mínimo.
  const rs = (v) => Math.max(0, Number(v) || 0);
  for (const c of [
    "metaValorVendasMinima", "metaValorVendasMedia", "metaValorVendasDia",
    "metaRecuperacaoMinima", "metaRecuperacaoMedia", "metaRecuperacaoDia",
  ]) {
    if (c in body) data[c] = rs(body[c]);
  }

  const pct = (v) => Math.min(100, Math.max(0, Number(v) || 0));
  if ("provisaoPct0a7" in body) data.provisaoPct0a7 = pct(body.provisaoPct0a7);
  if ("provisaoPct8a15" in body) data.provisaoPct8a15 = pct(body.provisaoPct8a15);
  if ("provisaoPct16a30" in body) data.provisaoPct16a30 = pct(body.provisaoPct16a30);
  if ("provisaoPct31mais" in body) data.provisaoPct31mais = pct(body.provisaoPct31mais);

  // SLA de 1ª resposta / aviso de acúmulo — null desliga.
  if ("slaPrimeiraRespostaMin" in body) {
    data.slaPrimeiraRespostaMin = body.slaPrimeiraRespostaMin === null || body.slaPrimeiraRespostaMin === "" ? null : Math.max(1, Number(body.slaPrimeiraRespostaMin) || 1);
  }
  if ("avisoAcumuloLimite" in body) {
    data.avisoAcumuloLimite = body.avisoAcumuloLimite === null || body.avisoAcumuloLimite === "" ? null : Math.max(1, Number(body.avisoAcumuloLimite) || 1);
  }

  // Pix pra gerar Copia-e-Cola/QR das parcelas.
  if ("pixChave" in body) data.pixChave = (body.pixChave || "").trim() || null;
  if ("pixNomeRecebedor" in body) data.pixNomeRecebedor = (body.pixNomeRecebedor || "").trim() || null;
  if ("pixCidade" in body) data.pixCidade = (body.pixCidade || "").trim() || null;

  // Mensagem automática de Pix pra adimplentes.
  if ("pixAdimplentesAtivo" in body) data.pixAdimplentesAtivo = !!body.pixAdimplentesAtivo;
  if ("pixAdimplentesDiasAntes" in body) data.pixAdimplentesDiasAntes = Math.max(0, Math.min(5, Number(body.pixAdimplentesDiasAntes) || 0));
  if ("pixAdimplentesHora" in body) data.pixAdimplentesHora = (body.pixAdimplentesHora || "08:00").trim();
  if ("pixAdimplentesMensagem" in body) data.pixAdimplentesMensagem = (body.pixAdimplentesMensagem || "").trim() || null;

  const config = await prisma.config.update({ where: { id: "singleton" }, data });
  return NextResponse.json(config);
}
