// Bipe curto de duas notas via Web Audio API — sem precisar de arquivo de
// áudio. Usado pelo aviso de tarefa e pelo aviso de mensagem no chat interno
// (estava duplicado em TaskReminderWatcher; mexer no som num lugar deixava o
// outro diferente).
//
// AudioContext pode nascer "suspended" até o navegador ver alguma interação
// do usuário na página; como o CRM já exige login (clique), o resume() aqui
// sempre destrava.
export function tocarAlerta() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const tocarNota = (freq, inicio, duracao) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + inicio);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + inicio + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + inicio + duracao);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + inicio);
      osc.stop(ctx.currentTime + inicio + duracao + 0.05);
    };
    tocarNota(880, 0, 0.18);
    tocarNota(1175, 0.2, 0.22);
    setTimeout(() => ctx.close().catch(() => {}), 700);
  } catch {
    // navegador sem suporte a Web Audio — só não toca som, o aviso na tela
    // continua aparecendo
  }
}
