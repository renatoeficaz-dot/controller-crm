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

// Casa movimentos do extrato com lançamentos do sistema, um para um: mesmo tipo, mesmo valor (centavo) e no máximo 1 dia de diferença
// (Pix de madrugada, baixa feita no dia seguinte). Entre vários candidatos vale o mesmo dia, depois nome parecido, depois horário mais próximo.
// movs: [{ id, data, valor, tipo, descricao }]   lancs: [{ id, data, amount, type, description }]
// Devolve { pares: [{ movId, lancId }], movsSemLanc: [id], lancsSemMov: [id] }.
export function conciliar(movs, lancs, { toleranciaDias = 1 } = {}) {
  const usados = new Set();
  const pares = [];
  const ordenados = [...movs].sort((a, b) => new Date(a.data) - new Date(b.data));
  // Quem tem menos candidatos escolhe primeiro: evita que um movimento "roube" o único lançamento possível de outro.
  const candidatos = (m) =>
    lancs.filter((l) => l.type === m.tipo && Math.abs(l.amount - m.valor) < 0.005 && diasEntre(l.data, m.data) <= toleranciaDias);
  const fila = ordenados.map((m) => ({ m, n: candidatos(m).length })).sort((a, b) => a.n - b.n || new Date(a.m.data) - new Date(b.m.data));
  for (const { m } of fila) {
    const livres = candidatos(m).filter((l) => !usados.has(l.id));
    if (!livres.length) continue;
    livres.sort((x, y) => {
      const dx = diasEntre(x.data, m.data), dy = diasEntre(y.data, m.data);
      if (dx !== dy) return dx - dy;
      const sx = semelhanca(m.descricao, x.description), sy = semelhanca(m.descricao, y.description);
      if (sx !== sy) return sy - sx;
      return Math.abs(new Date(x.data) - new Date(m.data)) - Math.abs(new Date(y.data) - new Date(m.data));
    });
    usados.add(livres[0].id);
    pares.push({ movId: m.id, lancId: livres[0].id });
  }
  const movCasados = new Set(pares.map((p) => p.movId));
  return {
    pares,
    movsSemLanc: movs.filter((m) => !movCasados.has(m.id)).map((m) => m.id),
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
