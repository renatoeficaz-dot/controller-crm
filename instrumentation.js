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
  const CINCO_MIN = 5 * 60 * 1000;

  // Rotinas de 1x por dia guardam aqui o dia da última execução — o intervalo
  // é de 5 min, então sem essa trava rodariam 288 vezes por dia.
  let ultimoDiaScores = null;
  let ultimoDiaBackup = null;
  let ultimoDiaPurga = null;
  let ultimaSemanaComissao = null; // guarda a segunda-feira da última semana já fechada

  // Grava o retrato do dia (metas vigentes + tamanho da carteira + resultado).
  // Roda logo ao subir e a cada 5 min, então a última gravação antes da
  // meia-noite é o fechamento daquele dia. Sem isso, a meta de recebimento de
  // um dia passado teria que ser recalculada sobre a carteira de hoje.
  registrarMetaDoDia().catch((err) => console.error("[metaDiaria] erro:", err.message));

  setInterval(() => {
    registrarMetaDoDia().catch((err) => console.error("[metaDiaria] erro:", err.message));
    checarLembretesCobranca().catch((err) => console.error("[lembreteCobranca] erro:", err.message));
    // Pix pra quem está em dia (item novo) — atrasado nunca entra aqui, isso é
    // trabalho do cobrador via fila de cobrança/régua.
    enviarPixAdimplentes().catch((err) => console.error("[pixAdimplentes] erro:", err.message));
    checarFollowUp30min().catch((err) => console.error("[followUp30min] erro:", err.message));
    // Lead parado demais em "Em conversa" (24h) ou "Documentação" (48h) cai
    // sozinho pra "Venda perdida" — precisa checar a cada 5 min, não 1x/dia,
    // senão passa o dia inteiro sem ninguém notar que sumiu.
    checarLeadsParados().catch((err) => console.error("[leadsParados] erro:", err.message));
    checarMensagensSemResposta().catch((err) => console.error("[mensagensSemResposta] erro:", err.message));
    checarResumoDiario().catch((err) => console.error("[resumoDiario] erro:", err.message));
    checarAlertasCriticos().catch((err) => console.error("[alertasCriticos] erro:", err.message));
    // Mensagem agendada (item 45) e campanha em massa (item 44) — paced, então
    // cada checagem só processa um lote, nunca tudo de uma vez.
    enviarMensagensAgendadas().catch((err) => console.error("[mensagensAgendadas] erro:", err.message));
    processarCampanhasMassa().catch((err) => console.error("[campanhasMassa] erro:", err.message));

    const hoje = new Date().toLocaleDateString("en-CA");
    if (ultimoDiaScores !== hoje) {
      ultimoDiaScores = hoje;
      recalcularScoresComportamentais().catch((err) =>
        console.error("[scoresComportamentais] erro:", err.message)
      );
    }
    if (ultimoDiaBackup !== hoje) {
      ultimoDiaBackup = hoje;
      rodarBackup()
        .then((r) => console.log(`[backup] ${r.arquivo} (${r.bytes} bytes)`))
        .catch((err) => console.error("[backup] erro:", err.message));
      // Conta recorrente "ilimitada" não pode gerar linhas infinitas de uma
      // vez: a janela de 12 meses é empurrada pra frente aqui, todo dia.
      estenderRecorrenciasIlimitadas()
        .then((n) => n && console.log(`[contasPagar] ${n} ocorrência(s) criada(s)`))
        .catch((err) => console.error("[contasPagar] erro:", err.message));
      // Cobrança velha troca de mão: passou do limite de dias, vai pro sênior.
      escalonarAtrasos()
        .then((n) => n && console.log(`[escalonamentoAtraso] ${n} lead(s) reatribuído(s)`))
        .catch((err) => console.error("[escalonamentoAtraso] erro:", err.message));
      // Dinheiro parado em caixa sem liberar capital não gira — avisa o dono.
      checarCapitalOcioso().catch((err) => console.error("[capitalOcioso] erro:", err.message));
      // Cravo não recebe régua automática (de propósito) — sem isso, um lead
      // podia ficar semanas parado sem ninguém notar.
      checarCravoParado().catch((err) => console.error("[cravoParado] erro:", err.message));
    }
    if (ultimoDiaPurga !== hoje) {
      ultimoDiaPurga = hoje;
      // Lead "excluído" há mais de 24h vira exclusão de verdade (item 53).
      purgarExcluidos()
        .then((n) => n && console.log(`[purgaExcluidos] ${n} lead(s) apagado(s) definitivamente`))
        .catch((err) => console.error("[purgaExcluidos] erro:", err.message));
      // Tentativa de login falha só serve pra contar as falhas dos últimos 15
      // min — sem limpeza a tabela cresce pra sempre (e um ataque de força
      // bruta é justamente o que faria ela inchar mais rápido).
      purgarTentativasLogin()
        .then((n) => n && console.log(`[loginTentativas] ${n} registro(s) antigo(s) removido(s)`))
        .catch((err) => console.error("[loginTentativas] erro:", err.message));
      // Logo depois da purga: os arquivos dos leads que acabaram de sair não
      // são apagados pelo banco (ficam no volume ocupando disco pra sempre).
      import("@/lib/mediaStorage")
        .then((m) => m.limparMidiasOrfas())
        .then((r) => r?.apagados && console.log(`[midiasOrfas] ${r.apagados} arquivo(s), ${(r.bytes / 1048576).toFixed(1)} MB liberados`))
        .catch((err) => console.error("[midiasOrfas] erro:", err.message));
    }
    // Fecha a semana de comissão todo domingo (dia de folga, ninguém está
    // cobrando) — uma vez por semana, não uma vez por dia.
    // Dia da semana tem que sair da data LOCAL, igual o `hoje` acima: com
    // getUTCDay() num servidor em UTC-3, sábado às 21h já era "domingo" em UTC
    // e o fechamento cristalizava a semana ANTES dela terminar — baixa feita
    // no fim do sábado ficava fora da comissão pra sempre.
    const ehDomingo = new Date(hoje + "T00:00:00.000Z").getUTCDay() === 0;
    if (ehDomingo && ultimaSemanaComissao !== hoje) {
      ultimaSemanaComissao = hoje;
      fecharSemanaAnterior()
        .then((n) => n && console.log(`[comissaoFechamento] ${n} fechamento(s) gerado(s)`))
        .catch((err) => console.error("[comissaoFechamento] erro:", err.message));
    }
  }, CINCO_MIN);
}
