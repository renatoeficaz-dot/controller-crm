// Conciliação bancária por arquivo OFX (aba "Conciliação" de Lançamentos).
// Funções puras (sem banco) para poderem ser testadas: ler o OFX, casar cada movimento do extrato com um lançamento do sistema e
// fechar o caixa do período. Dia sempre pelo calendário de Brasília (UTC−3).
const BRT = 3 * 3600e3;
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const diaBRT = (t) => new Date(new Date(t).getTime() - BRT).toISOString().slice(0, 10);

// Bytes do arquivo -> texto. OFX antigo costuma vir em Windows-1252; o moderno em UTF-8.
export function decodificarOfx(bytes) {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

const tag = (bloco, nome) => {
  const m = new RegExp(`<${nome}>([^<\\r\\n]*)`, "i").exec(bloco);
  return m ? m[1].trim() : "";
};

// "20261108123000[-3:BRT]" | "20261108" | "20261108123000.000" -> Date. Sem hora vale meio-dia de Brasília (não vira outro dia);
// com hora e sem fuso informado, assume Brasília.
export function dataOfx(s) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2})?)?(?:\.\d+)?(?:\[([+-]?\d+(?:\.\d+)?)(?::[A-Za-z]+)?\])?/.exec(String(s || "").trim());
  if (!m) return null;
  const [, y, mo, d, hh, mi, ss, off] = m;
  const temHora = hh !== undefined;
  const offsetH = off !== undefined ? Number(off) : -3;
  const h = temHora ? Number(hh) : 12;
  const utc = Date.UTC(Number(y), Number(mo) - 1, Number(d), h, Number(mi || 0), Number(ss || 0)) - offsetH * 3600e3;
  const dt = new Date(utc);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

// "-1.234,56" | "-1234.56" | "1234,5" -> número.
export function valorOfx(s) {
  let t = String(s || "").trim().replace(/\s/g, "");
  if (!t) return NaN;
  const v = t.lastIndexOf(","), p = t.lastIndexOf(".");
  if (v > -1 && p > -1) t = v > p ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else if (v > -1) t = t.replace(",", ".");
  return Number(t);
}

// Lê o OFX (SGML da v1 ou XML da v2). Devolve { acctId, movimentos[], saldo, saldoData, de, ate }.
// movimento = { chave, fitid, data, valor (sempre positivo), tipo: "entrada"|"saida", descricao, trnType }.
export function lerOfx(texto) {
  const txt = String(texto || "");
  if (!/<OFX/i.test(txt) && !/<STMTTRN>/i.test(txt)) throw new Error("O arquivo não parece um OFX.");
  const acctId = tag(txt, "ACCTID");
  const blocos = txt.split(/<STMTTRN>/i).slice(1).map((b) => b.split(/<\/STMTTRN>|<\/BANKTRANLIST>/i)[0]);
  const vistos = new Map();
  const movimentos = [];
  for (const b of blocos) {
    const data = dataOfx(tag(b, "DTPOSTED"));
    const bruto = valorOfx(tag(b, "TRNAMT"));
    if (!data || !Number.isFinite(bruto) || bruto === 0) continue;
    const descricao = [tag(b, "NAME"), tag(b, "MEMO")].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(" — ");
    const fitid = tag(b, "FITID");
    // Sem FITID a identidade vira data+valor+texto, com contador para não fundir dois pagamentos iguais do mesmo dia.
    let base = fitid ? `${acctId}|${fitid}` : `${acctId}|${data.toISOString()}|${bruto}|${descricao}`;
    const n = (vistos.get(base) || 0) + 1;
    vistos.set(base, n);
    movimentos.push({
      chave: n > 1 ? `${base}#${n}` : base,
      fitid,
      data,
      valor: r2(Math.abs(bruto)),
      tipo: bruto > 0 ? "entrada" : "saida",
      descricao,
      trnType: tag(b, "TRNTYPE"),
    });
  }
  const bal = /<LEDGERBAL>([\s\S]*?)(?:<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>|$)/i.exec(txt);
  const saldo = bal ? valorOfx(tag(bal[1], "BALAMT")) : NaN;
  const saldoData = bal ? dataOfx(tag(bal[1], "DTASOF")) : null;
  const tempos = movimentos.map((m) => m.data.getTime());
  const ini = dataOfx(tag(txt, "DTSTART"));
  const fim = dataOfx(tag(txt, "DTEND"));
  const de = ini || (tempos.length ? new Date(Math.min(...tempos)) : null);
  const ate = fim || (tempos.length ? new Date(Math.max(...tempos)) : null);
  return { acctId, movimentos, saldo: Number.isFinite(saldo) ? r2(saldo) : null, saldoData, de, ate };
}

const palavras = (s) =>
  new Set(
    String(s || "")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !["pix", "recebido", "enviado", "parcela", "pagamento", "transferencia", "liberacao", "capital"].includes(w)),
  );
const semelhanca = (a, b) => {
  const A = palavras(a), B = palavras(b);
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n;
};
const diasEntre = (a, b) => Math.abs(Math.round((new Date(diaBRT(a) + "T12:00:00Z") - new Date(diaBRT(b) + "T12:00:00Z")) / 86400e3));

// Chave para reconhecer o mesmo pagador/destino em extratos diferentes ("Pix recebido — MARILEIDE GONCALVES" ~ "Pix Marileide Gonçalves de Lima Silva — Recebido").
// Fica só com as palavras do nome (sem acento, sem números nem palavras do banco), em ordem alfabética.
export function chaveDescricao(desc) {
  const w = [...palavras(desc)].filter((x) => !/\d/.test(x) && !["silva", "ltda", "recebido", "enviado"].includes(x)).sort();
  return w.slice(0, 3).join(" ");
}

// Palavras que identificam o pagador/destino/estabelecimento ("99Food", "Cacique", "Henrique"): sem acento, só as que têm letra, sem as
// do banco nem sobrenomes comuns (senão todo "Silva" viraria a mesma coisa).
const COMUNS = new Set(["silva", "lima", "santos", "souza", "sousa", "oliveira", "pereira", "costa", "ferreira", "rodrigues", "almeida", "melo", "carvalho", "gomes", "ltda", "recebido", "enviado", "pagamento", "compra", "debito", "credito"]);
const chaves = (d) => [...palavras(d)].filter((w) => /[a-z]/.test(w) && w.length >= 4 && !COMUNS.has(w));

// Categoria usada antes para algo parecido: o movimento do histórico que mais compartilha palavras com este (mesmo tipo já filtrado por quem chama).
// Uma palavra em comum basta se for longa (>= 5 letras, ex.: "99food", "cacique"); com palavras curtas pedem-se duas. Empate: o mais recente (vem primeiro).
// historico: [{ descricao, categoriaId }] do mais recente para o mais antigo.
export function categoriaParecida(descricao, historico) {
  const mine = new Set(chaves(descricao));
  if (!mine.size) return null;
  let melhor = null, melhorN = 0;
  for (const h of historico) {
    const comuns = chaves(h.descricao).filter((w) => mine.has(w));
    const forte = comuns.some((w) => w.length >= 5);
    if (!comuns.length || (!forte && comuns.length < 2)) continue;
    if (comuns.length > melhorN) { melhorN = comuns.length; melhor = h.categoriaId; }
  }
  return melhor;
}

// Soma de pedaços: a IA divide UM Pix em vários lançamentos (baixa parcial + pagamento adiantado nas parcelas seguintes), então um movimento do
// extrato pode corresponder a vários lançamentos. Acha o subconjunto de `cands` que soma `valor` (em centavos, sem erro de ponto flutuante) e
// escolhe o melhor: menos clientes diferentes, menor intervalo de horário, menos itens. Devolve a lista de candidatos ou null.
function subconjunto(cands, valor, centro) {
  const alvo = Math.round(valor * 100);
  const itens = [...cands].sort((a, b) => b.cent - a.cent);
  const resto = itens.map((_, i) => itens.slice(i).reduce((s, x) => s + x.cent, 0));
  const solucoes = [];
  const atual = [];
  const dfs = (i, soma) => {
    if (solucoes.length >= 300) return;
    if (soma === alvo) { solucoes.push([...atual]); return; }
    if (i >= itens.length || soma > alvo || soma + resto[i] < alvo) return;
    atual.push(itens[i]); dfs(i + 1, soma + itens[i].cent); atual.pop();
    dfs(i + 1, soma);
  };
  dfs(0, 0);
  if (!solucoes.length) return null;
  const nota = (sol) => {
    const clientes = new Set(sol.map((x) => x.l.contactId || x.l.id)).size;
    const ts = sol.map((x) => new Date(x.l.data).getTime());
    const intervalo = Math.max(...ts) - Math.min(...ts);
    const dist = Math.abs(ts.reduce((s, t) => s + t, 0) / ts.length - centro);
    return clientes * 1e15 + intervalo * 1e3 + dist / 1e3 + sol.length;
  };
  return solucoes.sort((x, y) => nota(x) - nota(y))[0].map((x) => x.l);
}

// Casa movimentos do extrato com lançamentos do sistema.
// 1º passe, um para um: mesmo tipo, mesmo valor (centavo) e no máximo 1 dia de diferença; entre vários candidatos vale o mesmo dia, depois
// nome parecido, depois horário mais próximo. 2º passe, soma de pedaços do MESMO cliente (±1 dia). 3º passe, soma de pedaços de qualquer cliente
// no mesmo horário (±40 min do Pix; um Pix que pagou dois clientes).
// movs: [{ id, data, valor, tipo, descricao }]   lancs: [{ id, data, amount, type, description, contactId }]
// Devolve { pares: [{ movId, lancId, soma? }] (um movimento pode ter vários pares), movsSemLanc: [id], lancsSemMov: [id] }.
export function conciliar(movs, lancs, { toleranciaDias = 1, janelaMin = 40 } = {}) {
  const usados = new Set();
  const pares = [];
  const casado = new Set();
  const ordenados = [...movs].sort((a, b) => new Date(a.data) - new Date(b.data));
  const livres = () => lancs.filter((l) => !usados.has(l.id));
  const candidatos = (m) =>
    livres().filter((l) => l.type === m.tipo && Math.abs(l.amount - m.valor) < 0.005 && diasEntre(l.data, m.data) <= toleranciaDias);
  // Quem tem menos candidatos escolhe primeiro: evita que um movimento "roube" o único lançamento possível de outro.
  const fila = ordenados.map((m) => ({ m, n: candidatos(m).length })).sort((a, b) => a.n - b.n || new Date(a.m.data) - new Date(b.m.data));
  for (const { m } of fila) {
    const cs = candidatos(m);
    if (!cs.length) continue;
    cs.sort((x, y) => {
      const dx = diasEntre(x.data, m.data), dy = diasEntre(y.data, m.data);
      if (dx !== dy) return dx - dy;
      const sx = semelhanca(m.descricao, x.description), sy = semelhanca(m.descricao, y.description);
      if (sx !== sy) return sy - sx;
      return Math.abs(new Date(x.data) - new Date(m.data)) - Math.abs(new Date(y.data) - new Date(m.data));
    });
    usados.add(cs[0].id);
    pares.push({ movId: m.id, lancId: cs[0].id });
    casado.add(m.id);
  }
  const aplicar = (m, grupo) => {
    for (const l of grupo) { usados.add(l.id); pares.push({ movId: m.id, lancId: l.id, soma: true }); }
    casado.add(m.id);
  };
  const cand = (l) => ({ l, cent: Math.round(l.amount * 100) });
  // 2º passe: pedaços do mesmo cliente.
  for (const m of ordenados) {
    if (casado.has(m.id)) continue;
    const porCliente = new Map();
    for (const l of livres()) {
      if (l.type !== m.tipo || !l.contactId || l.amount > m.valor + 0.005 || diasEntre(l.data, m.data) > toleranciaDias) continue;
      if (!porCliente.has(l.contactId)) porCliente.set(l.contactId, []);
      porCliente.get(l.contactId).push(l);
    }
    let melhor = null, melhorNota = Infinity;
    for (const lista of porCliente.values()) {
      if (lista.length < 2 || lista.length > 20) continue;
      const g = subconjunto(lista.map(cand), m.valor, new Date(m.data).getTime());
      if (!g || g.length < 2) continue;
      const nota = Math.abs(g.reduce((s, l) => s + new Date(l.data).getTime(), 0) / g.length - new Date(m.data).getTime());
      if (nota < melhorNota) { melhorNota = nota; melhor = g; }
    }
    if (melhor) aplicar(m, melhor);
  }
  // 3º passe: pedaços de clientes diferentes no mesmo horário.
  for (const m of ordenados) {
    if (casado.has(m.id)) continue;
    const t = new Date(m.data).getTime();
    const perto = livres()
      .filter((l) => l.type === m.tipo && l.amount <= m.valor + 0.005 && Math.abs(new Date(l.data).getTime() - t) <= janelaMin * 60e3)
      .sort((a, b) => Math.abs(new Date(a.data) - t) - Math.abs(new Date(b.data) - t))
      .slice(0, 16);
    if (perto.length < 2) continue;
    const g = subconjunto(perto.map(cand), m.valor, t);
    if (g && g.length >= 2) aplicar(m, g);
  }
  return {
    pares,
    movsSemLanc: movs.filter((m) => !casado.has(m.id)).map((m) => m.id),
    lancsSemMov: lancs.filter((l) => !usados.has(l.id)).map((l) => l.id),
  };
}

// Fecha o caixa do período: o que o extrato diz x o que o sistema registrou, e o saldo final dos dois.
export function fecharCaixa({ movs, lancs, saldoExtrato, saldoSistema }) {
  const soma = (xs, f) => r2(xs.reduce((s, x) => s + f(x), 0));
  const extEnt = soma(movs.filter((m) => m.tipo === "entrada"), (m) => m.valor);
  const extSai = soma(movs.filter((m) => m.tipo === "saida"), (m) => m.valor);
  const sisEnt = soma(lancs.filter((l) => l.type === "entrada"), (l) => l.amount);
  const sisSai = soma(lancs.filter((l) => l.type === "saida"), (l) => l.amount);
  const difPeriodo = r2(extEnt - extSai - (sisEnt - sisSai));
  const difSaldo = saldoExtrato != null && saldoSistema != null ? r2(saldoExtrato - saldoSistema) : null;
  return { extEnt, extSai, sisEnt, sisSai, difEntradas: r2(extEnt - sisEnt), difSaidas: r2(extSai - sisSai), difPeriodo, difSaldo, bate: Math.abs(difPeriodo) < 0.01 };
}

// Baixa a partir do extrato: dado o valor do Pix e as parcelas escolhidas (em ordem de vencimento), diz quanto vai em cada uma.
// parcelas: [{ id, amount, valorPago, devido }]  (devido = valor atual com multa). Mesma regra da leitura de comprovante:
// se o Pix fecha com a soma dos valores SEM multa, quita todas sem multa; senão distribui com multa em ordem e a última pode ficar parcial.
// Devolve { itens: [{ id, valor, semJuros }], sobra } — sobra > 0 = o Pix é maior que as parcelas marcadas (falta marcar mais).
export function planoBaixa(parcelas, valor) {
  const base = parcelas.map((p) => r2(p.amount - (p.valorPago || 0)));
  const cheio = parcelas.map((p) => r2((p.devido ?? p.amount) - (p.valorPago || 0)));
  const somaBase = r2(base.reduce((s, x) => s + x, 0));
  if (parcelas.length && Math.abs(somaBase - valor) <= 0.5) {
    return { itens: parcelas.map((p, i) => ({ id: p.id, valor: base[i], semJuros: true })).filter((i) => i.valor > 0.005), sobra: 0 };
  }
  let resto = r2(valor);
  const itens = [];
  parcelas.forEach((p, i) => {
    const v = r2(Math.min(resto, cheio[i]));
    if (v > 0.005) { itens.push({ id: p.id, valor: v, semJuros: false }); resto = r2(resto - v); }
  });
  return { itens, sobra: resto > 0.005 ? resto : 0 };
}

// Sugere quais parcelas (em ordem de vencimento, a partir da mais antiga) o Pix pagou: as primeiras k cuja soma fecha com o valor.
export function sugerirParcelas(parcelas, valor) {
  let sb = 0, sc = 0;
  for (let k = 0; k < parcelas.length; k++) {
    sb += r2(parcelas[k].amount - (parcelas[k].valorPago || 0));
    sc += r2((parcelas[k].devido ?? parcelas[k].amount) - (parcelas[k].valorPago || 0));
    if (Math.abs(sb - valor) <= 0.5 || Math.abs(sc - valor) <= Math.max(2, sc * 0.04 / (k + 1) * (k + 1))) return parcelas.slice(0, k + 1).map((p) => p.id);
  }
  return [];
}
