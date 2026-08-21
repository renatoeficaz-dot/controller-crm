import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { registrarAuditoria } from "@/lib/auditoria";
import { lerCorpo, texto } from "@/lib/corpo";

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
  // As URLs dos gateways de WhatsApp também: a do WAHA é o IP cru da VPS numa
  // porta sem TLS. Entregar isso pra qualquer usuário logado é dar o endereço
  // de um serviço interno que não fica atrás do mesmo login do CRM.
  "evolutionUrl", "wahaUrl",
];

// Mudar isso aqui muda dinheiro (honorários, multa) ou credenciais de
// integração — mesmo só admin conseguindo (o middleware já trava isso),
// não tinha NENHUM registro de quem mudou o quê. Com 2+ admins, "os
// honorários foram de 30% pra 1%" ficava sem rastro nenhum de autoria.
const CAMPOS_AUDITADOS = ["honorariosPct", "multaPct", ...CAMPOS_SECRETOS];

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
  const body = await lerCorpo(req);
  await getConfig();
  const data = {};
  // Estes dois definem TODO o dinheiro do sistema (parcela = capital x
  // (1 + honorários/100); atraso = valor x (1 + multa/100)) e eram os únicos
  // percentuais sem faixa: `Number(x) || 0` aceitava -50 (inverte a conta e a
  // empresa passa a pagar pra emprestar) e 1e9 (parcela astronômica em toda a
  // carteira). Os outros percentuais da tela já usavam Math.min/Math.max.
  // O teto é folgado de propósito — 80% é o valor real de uso, 1000% é só pra
  // barrar o absurdo e o erro de digitação, não pra limitar a operação.
  const pctFinanceiro = (v) => Math.min(1000, Math.max(0, Number(v) || 0));
  // Campos inteiros (Int no schema) sem teto máximo aceitavam qualquer valor
  // — um número acima do limite de 32 bits (ex.: 999999999999) não dava erro
  // na hora, mas CORROMPIA a linha: toda leitura/escrita seguinte de Config
  // (GET e PATCH, usados o tempo todo pelo app) passava a quebrar com 500,
  // até alguém consertar direto no banco. Teto bem folgado (nenhum desses
  // campos é "dias" ou "quantidade" de verdade acima disso), só pra nunca
  // mais estourar o tipo da coluna.
  const inteiro = (v, min = 0) => Math.min(1000000, Math.max(min, Math.round(Number(v)) || min));
  if ("honorariosPct" in body) data.honorariosPct = pctFinanceiro(body.honorariosPct);
  if ("multaPct" in body) data.multaPct = pctFinanceiro(body.multaPct);
  if ("pagamentoHoraLimite" in body) data.pagamentoHoraLimite = texto(body.pagamentoHoraLimite) || null;
  if ("evolutionUrl" in body) data.evolutionUrl = texto(body.evolutionUrl) || null;
  if ("evolutionApiKey" in body) data.evolutionApiKey = texto(body.evolutionApiKey) || null;
  if ("wahaUrl" in body) data.wahaUrl = texto(body.wahaUrl) || null;
  if ("wahaApiKey" in body) data.wahaApiKey = texto(body.wahaApiKey) || null;
  if ("webhookToken" in body) data.webhookToken = texto(body.webhookToken) || null;
  if ("deepinfraApiKey" in body) data.deepinfraApiKey = texto(body.deepinfraApiKey) || null;
  if ("fishAudioApiKey" in body) data.fishAudioApiKey = texto(body.fishAudioApiKey) || null;
  if ("elevenLabsApiKey" in body) data.elevenLabsApiKey = texto(body.elevenLabsApiKey) || null;
  if ("contaLiberacaoId" in body) data.contaLiberacaoId = body.contaLiberacaoId || null;
  if ("contaRecebimentoId" in body) data.contaRecebimentoId = body.contaRecebimentoId || null;
  if ("horarioComercialInicio" in body) data.horarioComercialInicio = texto(body.horarioComercialInicio) || null;
  if ("horarioComercialFim" in body) data.horarioComercialFim = texto(body.horarioComercialFim) || null;
  if ("metaPctRecebimentoMinima" in body) data.metaPctRecebimentoMinima = Math.min(100, Math.max(0, Number(body.metaPctRecebimentoMinima) || 0));
  if ("metaPctRecebimentoMedia" in body) data.metaPctRecebimentoMedia = Math.min(100, Math.max(0, Number(body.metaPctRecebimentoMedia) || 0));
  if ("metaPctRecebimento" in body) data.metaPctRecebimento = Math.min(100, Math.max(0, Number(body.metaPctRecebimento) || 0));
  if ("metaVendasMinima" in body) data.metaVendasMinima = inteiro(body.metaVendasMinima);
  if ("metaVendasMedia" in body) data.metaVendasMedia = inteiro(body.metaVendasMedia);
  if ("metaVendasDia" in body) data.metaVendasDia = inteiro(body.metaVendasDia);
  if ("descontoAtivo" in body) data.descontoAtivo = !!body.descontoAtivo;
  if ("descontoPct" in body) data.descontoPct = Math.min(100, Math.max(0, Number(body.descontoPct) || 0));
  if ("descontoDiasMin" in body) data.descontoDiasMin = inteiro(body.descontoDiasMin);
  if ("descontoMensagem" in body) data.descontoMensagem = texto(body.descontoMensagem) || null;
  if ("alertaWhatsapp" in body) data.alertaWhatsapp = texto(body.alertaWhatsapp).replace(/\D/g, "") || null;
  if ("alertaResumoDiario" in body) data.alertaResumoDiario = !!body.alertaResumoDiario;
  if ("alertaHora" in body) data.alertaHora = texto(body.alertaHora) || null;
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
        : inteiro(body.escalonamentoAtrasoDias, 1);
  }
  if ("escalonamentoAtrasoResponsavel" in body) {
    data.escalonamentoAtrasoResponsavel = texto(body.escalonamentoAtrasoResponsavel) || null;
  }
  if ("capitalOciosoDias" in body) data.capitalOciosoDias = inteiro(body.capitalOciosoDias);

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
    data.slaPrimeiraRespostaMin = body.slaPrimeiraRespostaMin === null || body.slaPrimeiraRespostaMin === "" ? null : inteiro(body.slaPrimeiraRespostaMin, 1);
  }
  if ("avisoAcumuloLimite" in body) {
    data.avisoAcumuloLimite = body.avisoAcumuloLimite === null || body.avisoAcumuloLimite === "" ? null : inteiro(body.avisoAcumuloLimite, 1);
  }

  // Pix pra gerar Copia-e-Cola/QR das parcelas.
  if ("pixChave" in body) data.pixChave = texto(body.pixChave) || null;
  if ("pixNomeRecebedor" in body) data.pixNomeRecebedor = texto(body.pixNomeRecebedor) || null;
  if ("pixCidade" in body) data.pixCidade = texto(body.pixCidade) || null;

  // Mensagem automática de Pix pra adimplentes.
  if ("pixAdimplentesAtivo" in body) data.pixAdimplentesAtivo = !!body.pixAdimplentesAtivo;
  if ("pixAdimplentesDiasAntes" in body) data.pixAdimplentesDiasAntes = Math.max(0, Math.min(5, Number(body.pixAdimplentesDiasAntes) || 0));
  if ("pixAdimplentesHora" in body) data.pixAdimplentesHora = (body.pixAdimplentesHora || "08:00").trim();
  if ("pixAdimplentesMensagem" in body) data.pixAdimplentesMensagem = texto(body.pixAdimplentesMensagem) || null;

  const mudouSensivel = CAMPOS_AUDITADOS.some((c) => c in data);
  const antes = mudouSensivel ? await prisma.config.findUnique({ where: { id: "singleton" } }) : null;

  const config = await prisma.config.update({ where: { id: "singleton" }, data });

  if (mudouSensivel) {
    const user = await getCurrentUser().catch(() => null);
    const mudancas = CAMPOS_AUDITADOS.filter((c) => c in data && antes?.[c] !== config[c]);
    if (mudancas.length) {
      const detalhe = mudancas
        .map((c) => {
          // Chave de API/token: nunca loga o valor, só que mudou — o log de
          // auditoria não pode virar um segundo lugar pra vazar credencial.
          if (CAMPOS_SECRETOS.includes(c)) return `${c} alterado`;
          return `${c}: ${antes[c]} → ${config[c]}`;
        })
        .join("; ");
      registrarAuditoria({
        usuario: user?.name,
        acao: "alterar_config",
        entidade: "Config",
        entidadeId: "singleton",
        detalhe,
      });
    }
  }

  return NextResponse.json(config);
}
