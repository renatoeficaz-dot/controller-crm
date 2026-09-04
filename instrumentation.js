// Roda uma vez quando o servidor Next sobe (não em cada request). Usado pra
// disparar o lembrete diário de cobrança sem precisar de cron externo/SSH.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { checarLembretesCobranca } = await import("@/lib/lembreteCobranca");
  const { checarFollowUp30min, checarMensagensSemResposta } = await import("@/lib/followUp");
  const { recalcularScoresComportamentais } = await import("@/lib/atualizarScoreComportamental");
  const { rodarBackup } = await import("@/lib/backup");
  const { checarResumoDiario, checarAlertasCriticos, checarCapitalOcioso, checarCravoParado } = await import("@/lib/alertas");
  const { estenderRecorrenciasIlimitadas } = await import("@/lib/contasPagar");
  const { escalonarAtrasos } = await import("@/lib/escalonamentoAtraso");
  const { checarLeadsParados } = await import("@/lib/autoVendaPerdida");
  const { registrarMetaDoDia } = await import("@/lib/metas");
  const { purgarExcluidos, purgarTentativasLogin } = await import("@/lib/purgaExcluidos");
  const { enviarMensagensAgendadas } = await import("@/lib/mensagemAgendada");
  const { processarCampanhasMassa } = await import("@/lib/campanhaMassa");
  const { fecharSemanaAnterior } = await import("@/lib/comissaoFechamento");
  const { enviarPixAdimplentes } = await import("@/lib/pixAdimplentes");
  const { gerarRelatoriosPagamentoSabado } = await import("@/lib/relatorioPagamentoSabado");
  const CINCO_MIN = 5 * 60 * 1000;

  // Roda uma tarefa e só volta depois dela terminar (ou falhar) — nunca lança.
  async function rodar(nome, fn) {
    try {
      const r = await fn();
      return r;
    } catch (err) {
      console.error(`[${nome}] erro:`, err.message);
      return undefined;
    }
  }

  // Rotinas de 1x por dia guardam aqui o dia da última execução — o intervalo
  // é de 5 min, então sem essa trava rodariam 288 vezes por dia.
  let ultimoDiaScores = null;
  let ultimoDiaBackup = null;
  let ultimoDiaPurga = null;
  let ultimaSemanaComissao = null; // guarda a segunda-feira da última semana já fechada
  let ultimoSabadoPagamento = null; // dia do último acerto de cobrador entregue

  // Grava o retrato do dia (metas vigentes + tamanho da carteira + resultado).
  // Roda logo ao subir e a cada 5 min, então a última gravação antes da
  // meia-noite é o fechamento daquele dia. Sem isso, a meta de recebimento de
  // um dia passado teria que ser recalculada sobre a carteira de hoje.
  rodar("metaDiaria", registrarMetaDoDia);

  // Todo o tick roda em SÉRIE, uma tarefa de cada vez — não em paralelo.
  //
  // Antes, as ~9 tarefas de 5 em 5 min (e mais ~6 quando o gatilho diário
  // também disparava, chegando a 15 de uma vez) eram todas fire-and-forget em
  // paralelo. O SQLite só aceita UM escritor por vez mesmo em modo WAL — a
  // rajada de escritores concorrentes, somada ao tráfego real (mensagem
  // chegando, IA respondendo, alguém movendo lead), enfileirava pedidos além
  // do timeout do Prisma e derrubava requisições com "socket timeout" (foi o
  // que aconteceu em 03/09 14:19: card de lead não abria, IA não respondia).
  // Rodando em série, o tick INTEIRO demora mais alguns segundos, mas nunca
  // multiplica sozinho a fila de escrita — o que sobra de contenção é só o
  // tráfego real, não o próprio sistema brigando com ele mesmo.
  setInterval(async () => {
    await rodar("metaDiaria", registrarMetaDoDia);
    await rodar("lembreteCobranca", checarLembretesCobranca);
    // Pix pra quem está em dia (item novo) — atrasado nunca entra aqui, isso é
    // trabalho do cobrador via fila de cobrança/régua.
    await rodar("pixAdimplentes", enviarPixAdimplentes);
    await rodar("followUp30min", checarFollowUp30min);
    // Lead parado demais em "Em conversa" (24h) ou "Documentação" (48h) cai
    // sozinho pra "Venda perdida" — precisa checar a cada 5 min, não 1x/dia,
    // senão passa o dia inteiro sem ninguém notar que sumiu.
    await rodar("leadsParados", checarLeadsParados);
    await rodar("mensagensSemResposta", checarMensagensSemResposta);
    await rodar("resumoDiario", checarResumoDiario);
    await rodar("alertasCriticos", checarAlertasCriticos);
    // Mensagem agendada (item 45) e campanha em massa (item 44) — paced, então
    // cada checagem só processa um lote, nunca tudo de uma vez.
    await rodar("mensagensAgendadas", enviarMensagensAgendadas);
    await rodar("campanhasMassa", processarCampanhasMassa);

    const hoje = new Date().toLocaleDateString("en-CA");
    if (ultimoDiaScores !== hoje) {
      ultimoDiaScores = hoje;
      await rodar("scoresComportamentais", recalcularScoresComportamentais);
    }
    if (ultimoDiaBackup !== hoje) {
      ultimoDiaBackup = hoje;
      const r = await rodar("backup", rodarBackup);
      if (r) console.log(`[backup] ${r.arquivo} (${r.bytes} bytes)`);
      // Conta recorrente "ilimitada" não pode gerar linhas infinitas de uma
      // vez: a janela de 12 meses é empurrada pra frente aqui, todo dia.
      const n1 = await rodar("contasPagar", estenderRecorrenciasIlimitadas);
      if (n1) console.log(`[contasPagar] ${n1} ocorrência(s) criada(s)`);
      // Cobrança velha troca de mão: passou do limite de dias, vai pro sênior.
      const n2 = await rodar("escalonamentoAtraso", escalonarAtrasos);
      if (n2) console.log(`[escalonamentoAtraso] ${n2} lead(s) reatribuído(s)`);
      // Dinheiro parado em caixa sem liberar capital não gira — avisa o dono.
      await rodar("capitalOcioso", checarCapitalOcioso);
      // Cravo não recebe régua automática (de propósito) — sem isso, um lead
      // podia ficar semanas parado sem ninguém notar.
      await rodar("cravoParado", checarCravoParado);
    }
    if (ultimoDiaPurga !== hoje) {
      ultimoDiaPurga = hoje;
      // Lead "excluído" há mais de 24h vira exclusão de verdade (item 53).
      const n3 = await rodar("purgaExcluidos", purgarExcluidos);
      if (n3) console.log(`[purgaExcluidos] ${n3} lead(s) apagado(s) definitivamente`);
      // Tentativa de login falha só serve pra contar as falhas dos últimos 15
      // min — sem limpeza a tabela cresce pra sempre (e um ataque de força
      // bruta é justamente o que faria ela inchar mais rápido).
      const n4 = await rodar("loginTentativas", purgarTentativasLogin);
      if (n4) console.log(`[loginTentativas] ${n4} registro(s) antigo(s) removido(s)`);
      // Logo depois da purga: os arquivos dos leads que acabaram de sair não
      // são apagados pelo banco (ficam no volume ocupando disco pra sempre).
      const r2 = await rodar("midiasOrfas", async () => (await import("@/lib/mediaStorage")).limparMidiasOrfas());
      if (r2?.apagados) console.log(`[midiasOrfas] ${r2.apagados} arquivo(s), ${(r2.bytes / 1048576).toFixed(1)} MB liberados`);
    }
    // Fecha a semana de comissão todo domingo (dia de folga, ninguém está
    // cobrando) — uma vez por semana, não uma vez por dia.
    // Dia da semana tem que sair da data LOCAL, igual o `hoje` acima: com
    // getUTCDay() num servidor em UTC-3, sábado às 21h já era "domingo" em UTC
    // e o fechamento cristalizava a semana ANTES dela terminar — baixa feita
    // no fim do sábado ficava fora da comissão pra sempre.
    // Acerto do cobrador: sábado a partir das 16h. A hora sai do relógio
    // LOCAL (o servidor roda em UTC), senão "16h" seria 13h no Brasil.
    // O tick é de 5 min, então a checagem é ">= 16h" + trava por dia — não
    // dá pra exigir 16:00 exato.
    const agora = new Date();
    const ehSabado = new Date(hoje + "T00:00:00.000Z").getUTCDay() === 6;
    const horaLocal = Number(String(agora.toLocaleTimeString("pt-BR", { hour: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" })).replace(/\D/g, ""));
    if (ehSabado && horaLocal >= 16 && ultimoSabadoPagamento !== hoje) {
      ultimoSabadoPagamento = hoje;
      const n5 = await rodar("pagamentoCobrador", gerarRelatoriosPagamentoSabado);
      if (n5) console.log(`[pagamentoCobrador] ${n5} acerto(s) da semana entregue(s)`);
    }

    const ehDomingo = new Date(hoje + "T00:00:00.000Z").getUTCDay() === 0;
    if (ehDomingo && ultimaSemanaComissao !== hoje) {
      ultimaSemanaComissao = hoje;
      const n6 = await rodar("comissaoFechamento", fecharSemanaAnterior);
      if (n6) console.log(`[comissaoFechamento] ${n6} fechamento(s) gerado(s)`);
    }
  }, CINCO_MIN);
}
