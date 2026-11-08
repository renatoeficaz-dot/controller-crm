// Regras do aviso de metas na tela (components/MetasAviso.jsx), sem React: as contas e as decisões (o que avisar, quando, uma vez só) ficam
// aqui para poderem ser testadas sem navegador. O componente só guarda estado, desenha e grava no localStorage.

export const LIMIARES = [50, 30, 10, 5]; // avisa quando faltar este % da meta que está sendo perseguida
export const VALOR_VENDA = 300;
export const NIVEIS = [
  { chave: "minima", nome: "a mínima", curto: "mínima", quase: "na mínima" },
  { chave: "media", nome: "a média", curto: "média", quase: "na média" },
  { chave: "meta", nome: "a meta cheia", curto: "meta cheia", quase: "na meta cheia" },
];
export const ORDEM_NIVEL = { abaixo: 0, minima: 1, media: 2, meta: 3 };
// Mesmos rótulos da tela de Metas.
export const ROTULO_NIVEL = { abaixo: "Abaixo da mínima", minima: "Bateu a mínima", media: "Bateu a média", meta: "Meta cheia batida!" };

// Espaço que não quebra a linha entre "R$" e o número: a legenda é estreita e "R$ / 300,00" em duas linhas fica feio.
export const money = (n) => "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// "≈ 1 venda de R$ 300,00". O 1e-9 evita que 300,00000000000006 vire "2 vendas".
export function vendasPara(faltam, porVenda = VALOR_VENDA) {
  const n = Math.max(1, Math.ceil(faltam / porVenda - 1e-9));
  return `≈ ${n} venda${n === 1 ? "" : "s"} de ${money(porVenda)}`;
}

// Próxima meta ainda não batida de uma métrica (mínima → média → meta cheia). null = bateu todas.
export function proximaMeta(atual, metas) {
  for (const n of NIVEIS) {
    const alvo = Number(metas[n.chave]) || 0;
    if (alvo > 0 && atual < alvo) return { ...n, alvo, faltam: Math.round((alvo - atual) * 100) / 100 };
  }
  return null;
}

// Nível atual: o que a API já calculou (a mesma conta da tela de Metas); sem isso, calcula aqui.
export function nivelDe(m) {
  if (m.nivel) return m.nivel;
  const { minima, media, meta } = m.metas;
  if (Number(meta) > 0 && m.atual >= meta) return "meta";
  if (Number(media) > 0 && m.atual >= media) return "media";
  if (Number(minima) > 0 && m.atual >= minima) return "minima";
  return "abaixo";
}

// Barra de progresso: escala até a meta cheia (ou até o que já foi feito, se passou), com um traço na mínima e outro na média.
export function geometriaDaBarra(atual, metas) {
  const meta = Number(metas.meta) || 0;
  const max = Math.max(meta, atual, 1);
  const pos = (v) => Math.min(100, Math.round(((Number(v) || 0) / max) * 1000) / 10);
  return {
    pct: pos(atual),
    marcos: [metas.minima, metas.media].filter((v) => Number(v) > 0 && Number(v) < max).map(pos),
  };
}

// As métricas do dia a partir do resumo leve da API. Dia sem meta (domingo sem parcelas a vencer) → lista vazia: não há o que perseguir.
export function metricasDe(r) {
  const niveis = r.niveis || {};
  return [
    { id: "receb", titulo: "Recebimentos", curto: "Receb.", atual: Number(r.recebimentosHoje) || 0, metas: { minima: r.metaRecebimentosMinima, media: r.metaRecebimentosMedia, meta: r.metaRecebimentosDia }, nivel: niveis.recebimentos || null },
    { id: "lib", titulo: "Liberação", curto: "Lib.", atual: Number(r.liberadoHoje) || 0, metas: { minima: r.metaLiberacaoMinima, media: r.metaLiberacaoMedia, meta: r.metaLiberacaoDia }, porVenda: VALOR_VENDA, nivel: niveis.liberacao || null },
  ]
    .filter((m) => [m.metas.minima, m.metas.media, m.metas.meta].some((v) => Number(v) > 0))
    .map((m) => {
      const base = { ...m, nivel: nivelDe(m), prox: proximaMeta(m.atual, m.metas) };
      return { ...base, ...geometriaDaBarra(m.atual, m.metas) };
    });
}

// Legenda embaixo da barra: "Bateu a mínima · próxima: média, R$ 4.328,22 · ≈ 1 venda de R$ 300,00".
export function legendaDaBarra(m) {
  if (!m.prox) return ROTULO_NIVEL.meta;
  const vendas = m.porVenda ? ` · ${vendasPara(m.prox.faltam, m.porVenda)}` : "";
  return `${ROTULO_NIVEL[m.nivel] || ROTULO_NIVEL.abaixo} · próxima: ${m.prox.curto}, ${money(m.prox.alvo)}${vendas}`;
}

const pctTexto = (pct) => pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

function alertaFalta(m, agora) {
  const pct = (m.prox.faltam / m.prox.alvo) * 100;
  return {
    id: `falta-${m.id}-${m.prox.chave}-${agora}`,
    tipo: "falta",
    metrica: m.id,
    titulo: m.titulo,
    alvoChave: m.prox.chave,
    quase: m.prox.quase,
    atual: m.atual,
    alvo: m.prox.alvo,
    faltam: m.prox.faltam,
    pctFalta: pctTexto(pct),
    avanco: Math.max(0, Math.min(100, (m.atual / m.prox.alvo) * 100)),
    vendas: m.porVenda ? vendasPara(m.prox.faltam, m.porVenda) : null,
  };
}

function alertaBateu(m, nivel, agora) {
  const alcancado = NIVEIS.find((n) => n.chave === nivel);
  const detalhe = m.prox
    ? `${money(m.atual)} · próxima: ${m.prox.curto}, faltam ${money(m.prox.faltam)}${m.porVenda ? ` (${vendasPara(m.prox.faltam, m.porVenda)})` : ""}`
    : `${money(m.atual)} · todas as metas de ${m.titulo.toLowerCase()} batidas`;
  return { id: `bateu-${m.id}-${nivel}-${agora}`, tipo: "bateu", metrica: m.id, titulo: m.titulo, nivel, nomeNivel: alcancado ? alcancado.nome : "a meta", detalhe };
}

// O que avisar neste momento.
//   feitos       { dia, chaves } — limiares "falta pouco" já avisados hoje
//   niveisVistos { dia, niveis: { receb, lib } } — último nível conhecido de cada métrica hoje
//   visivel      false = aba escondida: ninguém veria o aviso, então ele NÃO é gasto (sai quando a aba voltar)
// Devolve { alertas, feitos, niveisVistos } — os dois últimos são o que deve ser gravado.
export function avisosDoMomento({ ms, dia, feitos, niveisVistos, visivel = true, agora = Date.now() }) {
  const chaves = new Set(feitos && feitos.dia === dia && Array.isArray(feitos.chaves) ? feitos.chaves : []);
  const base = niveisVistos && niveisVistos.dia === dia && niveisVistos.niveis ? niveisVistos.niveis : null;
  const niveis = base ? { ...base } : {};
  const alertas = [];

  for (const m of ms) {
    // 1) Bateu um nível agora: aviso verde. Na primeira leitura do dia só registra o ponto de partida (abrir o sistema à tarde, com a
    //    mínima já batida de manhã, não pode comemorar de novo); se o nível cair (baixa estornada), só atualiza o ponto de partida.
    const nivel = m.nivel || nivelDe(m);
    const antes = base ? base[m.id] : undefined;
    let comemorou = false;
    if (antes === undefined) {
      niveis[m.id] = nivel;
    } else if (ORDEM_NIVEL[nivel] > ORDEM_NIVEL[antes]) {
      if (visivel) {
        niveis[m.id] = nivel;
        comemorou = true;
        alertas.push(alertaBateu(m, nivel, agora));
      }
    } else if (ORDEM_NIVEL[nivel] < ORDEM_NIVEL[antes]) {
      niveis[m.id] = nivel;
    }

    // 2) "Falta pouco": faltam 50% / 30% / 10% / 5% da meta perseguida. Cruzar vários de uma vez avisa uma vez só; cada faixa só avisa uma
    //    vez por dia e por meta.
    if (!m.prox) continue;
    const pctFalta = (m.prox.faltam / m.prox.alvo) * 100;
    const cruzados = LIMIARES.filter((l) => pctFalta <= l);
    if (!cruzados.length) continue;
    const marcar = cruzados.map((l) => `${m.id}:${m.prox.chave}:${l}`);
    if (marcar.every((k) => chaves.has(k))) continue;
    if (!visivel) continue;
    marcar.forEach((k) => chaves.add(k));
    if (comemorou) continue; // o aviso verde já diz quanto falta para a próxima
    alertas.push(alertaFalta(m, agora));
  }

  return { alertas, feitos: { dia, chaves: [...chaves] }, niveisVistos: { dia, niveis } };
}

// Junta avisos novos aos que já estão na tela: o mais novo de cada métrica e tipo substitui o anterior, e "bateu" tira o "falta pouco" da
// mesma métrica (esse já não vale).
export function juntarAlertas(atuais, novos) {
  let lista = atuais;
  for (const n of novos) {
    lista = lista.filter((x) => !(x.metrica === n.metrica && (x.tipo === n.tipo || n.tipo === "bateu")));
    lista = [...lista, n];
  }
  return lista;
}
