"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { aReceber, totalRecebido, inadimplenciaCravo, fimSemanaStr, fimMesStr } from "@/lib/relatorios";
import { hojeStr, parcelaAtrasada, dueStr, NUM_PARCELAS } from "@/lib/finance";
import ContactModal from "@/components/ContactModal";
import { baixarCsv, numeroCsv } from "@/lib/exportar";

const money = (n) =>
  "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// "YYYY-MM-DD" do 1º dia do mês corrente
function inicioMesStr() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString("en-CA");
}
// "YYYY-MM-DD" da segunda-feira desta semana
function inicioSemanaStr() {
  const d = new Date();
  const dowSegBase = (d.getDay() + 6) % 7; // 0 = segunda
  d.setDate(d.getDate() - dowSegBase);
  return d.toLocaleDateString("en-CA");
}

const PRESETS = [
  { key: "hoje", label: "Hoje", range: () => [hojeStr(), hojeStr()] },
  { key: "semana", label: "Esta semana", range: () => [inicioSemanaStr(), fimSemanaStr()] },
  { key: "mes", label: "Este mês", range: () => [inicioMesStr(), fimMesStr()] },
  { key: "tudo", label: "Todo período", range: () => ["2000-01-01", hojeStr()] },
];

export default function Relatorios() {
  const [stages, setStages] = useState([]);
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState("mes");
  const [ini, setIni] = useState(inicioMesStr());
  const [fim, setFim] = useState(hojeStr());
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [etapaFiltro, setEtapaFiltro] = useState("");
  const [generoFiltroRel, setGeneroFiltroRel] = useState("");
  const [tipoClienteFiltroRel, setTipoClienteFiltroRel] = useState("");
  const [criacaoIni, setCriacaoIni] = useState("");
  const [criacaoFim, setCriacaoFim] = useState("");
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [openContactId, setOpenContactId] = useState(null);

  const load = useCallback(async () => {
    const data = await fetch("/api/stages").then((r) => r.json()).catch(() => []);
    setStages(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then(setCfg).catch(() => {});
  }, []);

  // Parâmetros de multa por atraso (vindos da config) para o cálculo "a receber".
  const multaOpts = useMemo(
    () => ({ multaPct: cfg?.multaPct, horaLimite: cfg?.pagamentoHoraLimite }),
    [cfg]
  );
  const multaPct = cfg?.multaPct ?? 50;

  // Filtros do modal (estado, etapa, gênero, tipo de cliente, data de criação)
  // — combinados, afetam todas as métricas abaixo. Reaproveita a mesma lógica
  // que já existia só pra estado, sem precisar duplicar nada nos indicadores.
  const filtrosAtivosCount =
    (estadoFiltro ? 1 : 0) +
    (etapaFiltro ? 1 : 0) +
    (generoFiltroRel ? 1 : 0) +
    (tipoClienteFiltroRel ? 1 : 0) +
    (criacaoIni ? 1 : 0) +
    (criacaoFim ? 1 : 0);

  const stagesFiltrados = useMemo(() => {
    if (filtrosAtivosCount === 0) return stages;
    return stages.map((s) => ({
      ...s,
      contacts: (s.contacts || []).filter((c) => {
        if (estadoFiltro && c.estado !== estadoFiltro) return false;
        if (etapaFiltro && s.id !== etapaFiltro) return false;
        if (generoFiltroRel && c.genero !== generoFiltroRel) return false;
        if (tipoClienteFiltroRel && c.tipoCliente !== tipoClienteFiltroRel) return false;
        if (criacaoIni || criacaoFim) {
          if (!c.createdAt) return false;
          const d = new Date(c.createdAt).toLocaleDateString("en-CA");
          if (criacaoIni && d < criacaoIni) return false;
          if (criacaoFim && d > criacaoFim) return false;
        }
        return true;
      }),
    }));
  }, [stages, estadoFiltro, etapaFiltro, generoFiltroRel, tipoClienteFiltroRel, criacaoIni, criacaoFim, filtrosAtivosCount]);

  // Leads filtrados, pra listar embaixo da tabela de resumo por estado —
  // clicar num deles abre o mesmo modal de contato usado no Kanban/Chat.
  const leadsDoEstadoFiltro = useMemo(() => {
    if (filtrosAtivosCount === 0) return [];
    const hoje = hojeStr();
    const out = [];
    for (const s of stagesFiltrados) {
      for (const c of s.contacts || []) {
        let situacao = "sem-cobranca";
        if (c.parcelas && c.parcelas.length > 0) {
          situacao = c.parcelas.some((p) => parcelaAtrasada(p, hoje)) ? "inadimplente" : "adimplente";
        }
        out.push({ id: c.id, name: c.name, phone: c.phone, stageName: s.name, situacao });
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [stagesFiltrados, filtrosAtivosCount]);

  // Adimplência agrupada por um campo do contato (gênero ou tipo de cliente) —
  // reaproveitado pros dois gráficos abaixo, um donut por valor do grupo.
  function agruparAdimplencia(campo, rotulos) {
    const hoje = hojeStr();
    const map = new Map();
    for (const s of stages) {
      for (const c of s.contacts || []) {
        if (!c.parcelas || c.parcelas.length === 0) continue; // só quem tem empréstimo ativo
        const chave = c[campo] || "outros";
        if (!map.has(chave)) map.set(chave, { chave, adimplentes: 0, inadimplentes: 0 });
        const row = map.get(chave);
        const temAtrasada = c.parcelas.some((p) => parcelaAtrasada(p, hoje));
        if (temAtrasada) row.inadimplentes++; else row.adimplentes++;
      }
    }
    return Array.from(map.values())
      .map((r) => ({ ...r, label: rotulos[r.chave] || r.chave }))
      .sort((a, b) => (b.adimplentes + b.inadimplentes) - (a.adimplentes + a.inadimplentes));
  }

  const GENERO_LABEL = { masculino: "Masculino", feminino: "Feminino", outros: "Não identificado" };
  const TIPO_CLIENTE_LABEL = { motoboy: "Motoboy", uber: "Uber", comerciante: "Comerciante", outros: "Não identificado" };

  const adimplenciaPorGenero = useMemo(() => agruparAdimplencia("genero", GENERO_LABEL), [stages]);
  const adimplenciaPorTipoCliente = useMemo(() => agruparAdimplencia("tipoCliente", TIPO_CLIENTE_LABEL), [stages]);

  // Lucro real por perfil: recebido - emprestado, não só % de inadimplência —
  // um perfil que atrasa mas recupera o capital é mais lucrativo que um que
  // some cedo, e só olhar inadimplência não mostra essa diferença.
  function agruparLucro(campo, rotulos) {
    const map = new Map();
    for (const s of stagesFiltrados) {
      for (const c of s.contacts || []) {
        if (!c.valorCapital || c.valorCapital <= 0) continue;
        const chave = c[campo] || "outros";
        if (!map.has(chave)) map.set(chave, { chave, emprestado: 0, recebido: 0, clientes: 0 });
        const row = map.get(chave);
        row.emprestado += c.valorCapital;
        row.recebido += (c.parcelas || [])
          .filter((p) => p.paid)
          .reduce((acc, p) => acc + (p.amountPago ?? p.amount), 0);
        row.clientes++;
      }
    }
    return Array.from(map.values())
      .filter((r) => r.emprestado > 0)
      .map((r) => {
        const lucro = r.recebido - r.emprestado;
        const label = rotulos ? rotulos[r.chave] || r.chave : r.chave === "outros" ? "Não identificado" : r.chave;
        return { label, value: lucro, color: lucro >= 0 ? "#059669" : "#ef4444", ...r };
      })
      .sort((a, b) => b.value - a.value);
  }

  const lucroPorGenero = useMemo(() => agruparLucro("genero", GENERO_LABEL), [stagesFiltrados]);
  const lucroPorTipoCliente = useMemo(() => agruparLucro("tipoCliente", TIPO_CLIENTE_LABEL), [stagesFiltrados]);
  const lucroPorEstado = useMemo(() => agruparLucro("estado", null), [stagesFiltrados]);

  // Curva de safra: agrupa clientes pelo mês em que o capital foi liberado —
  // mostra se a carteira está melhorando ou piorando ao longo do tempo (uma
  // safra recente recuperando menos que a anterior, no mesmo prazo, é sinal
  // de alerta antes de virar inadimplência de verdade).
  const safras = useMemo(() => {
    const map = new Map();
    for (const s of stagesFiltrados) {
      for (const c of s.contacts || []) {
        if (!c.valorCapital || !c.pagamentoCapital) continue;
        const mes = String(c.pagamentoCapital).slice(0, 7); // "YYYY-MM"
        if (!map.has(mes)) map.set(mes, { mes, clientes: 0, emprestado: 0, recuperado: 0, temposPayback: [] });
        const row = map.get(mes);
        row.clientes++;
        row.emprestado += c.valorCapital;

        const pagas = (c.parcelas || [])
          .filter((p) => p.paid && p.paidAt)
          .slice()
          .sort((a, b) => new Date(a.paidAt) - new Date(b.paidAt));
        let acumulado = 0;
        const inicio = new Date(c.pagamentoCapital);
        for (const p of pagas) {
          const valor = p.amountPago ?? p.amount;
          acumulado += valor;
          row.recuperado += valor;
          if (acumulado >= c.valorCapital && row.temposPayback.length < row.clientes) {
            row.temposPayback.push(Math.max(0, Math.round((new Date(p.paidAt) - inicio) / 86400000)));
          }
        }
      }
    }
    return Array.from(map.values())
      .map((r) => ({
        mes: r.mes,
        clientes: r.clientes,
        emprestado: r.emprestado,
        recuperado: r.recuperado,
        pctRecuperado: r.emprestado > 0 ? Math.round((r.recuperado / r.emprestado) * 100) : 0,
        diasMedios: r.temposPayback.length
          ? Math.round(r.temposPayback.reduce((acc, d) => acc + d, 0) / r.temposPayback.length)
          : null,
      }))
      .sort((a, b) => b.mes.localeCompare(a.mes))
      .slice(0, 6);
  }, [stagesFiltrados]);

  // Todos os contatos do filtro, achatados — várias métricas abaixo só precisam
  // da lista de leads, não da estrutura de etapas.
  const contatosFiltrados = useMemo(
    () => stagesFiltrados.flatMap((s) => (s.contacts || []).map((c) => ({ ...c, _stage: s.name }))),
    [stagesFiltrados]
  );

  // Soma do que já foi pago por um contato.
  function recebidoDe(c) {
    return (c.parcelas || []).filter((p) => p.paid).reduce((acc, p) => acc + (p.amountPago ?? p.amount), 0);
  }

  // Dias entre a liberação do capital e a parcela que fechou o payback (null
  // se o cliente ainda não devolveu o capital emprestado).
  function diasPaybackDe(c) {
    if (!c.valorCapital || !c.pagamentoCapital) return null;
    const pagas = (c.parcelas || [])
      .filter((p) => p.paid && p.paidAt)
      .slice()
      .sort((a, b) => new Date(a.paidAt) - new Date(b.paidAt));
    let acumulado = 0;
    const inicio = new Date(String(c.pagamentoCapital).slice(0, 10));
    for (const p of pagas) {
      acumulado += p.amountPago ?? p.amount;
      if (acumulado >= c.valorCapital) {
        return Math.max(0, Math.round((new Date(String(p.paidAt).slice(0, 10)) - inicio) / 86400000));
      }
    }
    return null;
  }

  // 1. Aging: o valor em aberto separado por HÁ QUANTO TEMPO está vencido —
  // R$ atrasado há 3 dias é fluxo de caixa, há 40 dias é quase perda.
  const agingData = useMemo(() => {
    const hoje = new Date(hojeStr());
    const faixas = [
      { label: "1-7 dias", max: 7, color: "#fbbf24" },
      { label: "8-15 dias", max: 15, color: "#f59e0b" },
      { label: "16-30 dias", max: 30, color: "#ef4444" },
      { label: "+30 dias", max: Infinity, color: "#991b1b" },
    ].map((f) => ({ ...f, value: 0, parcelas: 0, clientes: new Set() }));

    for (const c of contatosFiltrados) {
      for (const p of c.parcelas || []) {
        if (p.paid) continue;
        const dias = Math.round((hoje - new Date(dueStr(p))) / 86400000);
        if (dias < 1) continue;
        const faixa = faixas.find((f) => dias <= f.max);
        if (!faixa) continue;
        faixa.value += p.amount;
        faixa.parcelas++;
        faixa.clientes.add(c.id);
      }
    }
    return faixas.map((f) => ({ ...f, clientes: f.clientes.size }));
  }, [contatosFiltrados]);

  // 2. Conversão etapa a etapa: onde o lead morre no funil. "Cravo" e
  // "Aguardando Cobrador" já passaram por Recebimento; "Venda perdida" fica de
  // fora porque não dá pra saber em que etapa o lead parou.
  const conversaoFunil = useMemo(() => {
    const SEQUENCIA = ["Novo", "Em conversa", "Documentação", "Análise", "Liberação pagamento", "Recebimento", "Pago"];
    const idxRecebimento = SEQUENCIA.indexOf("Recebimento");
    const indices = [];
    for (const c of contatosFiltrados) {
      if (c._stage === "Venda perdida") continue;
      let idx = SEQUENCIA.indexOf(c._stage);
      if (idx === -1) {
        if (c._stage === "Cravo" || c._stage === "Aguardando Cobrador") idx = idxRecebimento;
        else continue;
      }
      indices.push(idx);
    }
    const topo = indices.length;
    return SEQUENCIA.map((nome, i) => {
      const chegaram = indices.filter((idx) => idx >= i).length;
      return { etapa: nome, chegaram, pctTopo: topo > 0 ? Math.round((chegaram / topo) * 100) : 0 };
    }).map((r, i, arr) => {
      const anterior = i > 0 ? arr[i - 1].chegaram : null;
      return { ...r, pctAnterior: anterior > 0 ? Math.round((r.chegaram / anterior) * 100) : null };
    });
  }, [contatosFiltrados]);

  // 3. Tempo do primeiro contato até o dinheiro sair — reduzir isso faz o
  // capital girar mais vezes no mês sem precisar de mais dinheiro.
  const tempoAteLiberacao = useMemo(() => {
    const dias = [];
    for (const c of contatosFiltrados) {
      if (!c.createdAt || !c.pagamentoCapital) continue;
      const d = Math.round(
        (new Date(String(c.pagamentoCapital).slice(0, 10)) - new Date(String(c.createdAt).slice(0, 10))) / 86400000
      );
      if (d >= 0) dias.push(d);
    }
    return {
      media: dias.length > 0 ? Math.round(dias.reduce((a, b) => a + b, 0) / dias.length) : null,
      clientes: dias.length,
    };
  }, [contatosFiltrados]);

  // 4. Giro: quantas vezes o mesmo dinheiro rodou no período. É o que traduz
  // "80% de honorários" no retorno mensal real.
  const giroCapital = useMemo(() => {
    let capitalNaRua = 0;
    let emprestadoNoPeriodo = 0;
    for (const c of contatosFiltrados) {
      if (!c.valorCapital) continue;
      if ((c.parcelas || []).some((p) => !p.paid)) capitalNaRua += c.valorCapital;
      if (c.pagamentoCapital) {
        const d = String(c.pagamentoCapital).slice(0, 10);
        if (d >= ini && d <= fim) emprestadoNoPeriodo += c.valorCapital;
      }
    }
    return {
      capitalNaRua,
      emprestadoNoPeriodo,
      giro: capitalNaRua > 0 ? Math.round((emprestadoNoPeriodo / capitalNaRua) * 10) / 10 : 0,
    };
  }, [contatosFiltrados, ini, fim]);

  // 5. Faixa de ticket: acima de certo valor o calote costuma disparar — é o
  // dado que define o limite de crédito, hoje decidido no feeling.
  const porFaixaTicket = useMemo(() => {
    const hoje = hojeStr();
    const faixas = [
      { label: "Até R$300", max: 300 },
      { label: "R$301–500", max: 500 },
      { label: "R$501–1.000", max: 1000 },
      { label: "Acima de R$1.000", max: Infinity },
    ].map((f) => ({ ...f, clientes: 0, emprestado: 0, recebido: 0, comParcelas: 0, inadimplentes: 0 }));

    for (const c of contatosFiltrados) {
      if (!c.valorCapital || c.valorCapital <= 0) continue;
      const faixa = faixas.find((f) => c.valorCapital <= f.max);
      if (!faixa) continue;
      faixa.clientes++;
      faixa.emprestado += c.valorCapital;
      faixa.recebido += recebidoDe(c);
      if ((c.parcelas || []).length > 0) {
        faixa.comParcelas++;
        if (c.parcelas.some((p) => parcelaAtrasada(p, hoje))) faixa.inadimplentes++;
      }
    }
    return faixas
      .filter((f) => f.clientes > 0)
      .map((f) => ({
        ...f,
        lucro: f.recebido - f.emprestado,
        pctInad: f.comParcelas > 0 ? Math.round((f.inadimplentes / f.comParcelas) * 100) : 0,
      }));
  }, [contatosFiltrados]);

  // 6. Ciclo: se o renovado paga muito melhor que o primeiro empréstimo, vale
  // mais renovar quem já provou que paga do que captar lead novo.
  const porCiclo = useMemo(() => {
    const hoje = hojeStr();
    const map = new Map();
    for (const c of contatosFiltrados) {
      if (!c.valorCapital || c.valorCapital <= 0) continue;
      const ciclo = c.cicloAtual || 1;
      const chave = ciclo >= 3 ? "3+" : String(ciclo);
      if (!map.has(chave)) {
        map.set(chave, { chave, clientes: 0, emprestado: 0, recebido: 0, comParcelas: 0, inadimplentes: 0, paybacks: [] });
      }
      const row = map.get(chave);
      row.clientes++;
      row.emprestado += c.valorCapital;
      row.recebido += recebidoDe(c);
      if ((c.parcelas || []).length > 0) {
        row.comParcelas++;
        if (c.parcelas.some((p) => parcelaAtrasada(p, hoje))) row.inadimplentes++;
      }
      const pb = diasPaybackDe(c);
      if (pb != null) row.paybacks.push(pb);
    }
    return Array.from(map.values())
      .sort((a, b) => a.chave.localeCompare(b.chave))
      .map((r) => ({
        ...r,
        lucro: r.recebido - r.emprestado,
        pctInad: r.comParcelas > 0 ? Math.round((r.inadimplentes / r.comParcelas) * 100) : 0,
        paybackMedio: r.paybacks.length > 0 ? Math.round(r.paybacks.reduce((a, b) => a + b, 0) / r.paybacks.length) : null,
      }));
  }, [contatosFiltrados]);

  // 7. Quando pagam, atrasam quanto? Separa "mau pagador" de "pagador atrasado
  // crônico" — o segundo é cliente rentável (ainda gera multa).
  const atrasoDeQuemPaga = useMemo(() => {
    const faixas = [
      { label: "Em dia", max: 0, color: "#059669" },
      { label: "1-3 dias", max: 3, color: "#84cc16" },
      { label: "4-7 dias", max: 7, color: "#fbbf24" },
      { label: "8-15 dias", max: 15, color: "#f59e0b" },
      { label: "+15 dias", max: Infinity, color: "#ef4444" },
    ].map((f) => ({ ...f, value: 0 }));
    let soma = 0;
    let total = 0;

    for (const c of contatosFiltrados) {
      for (const p of c.parcelas || []) {
        if (!p.paid || !p.paidAt) continue;
        const dias = Math.round((new Date(String(p.paidAt).slice(0, 10)) - new Date(dueStr(p))) / 86400000);
        const faixa = faixas.find((f) => dias <= f.max);
        if (faixa) faixa.value++;
        soma += Math.max(0, dias);
        total++;
      }
    }
    return { faixas, media: total > 0 ? Math.round(soma / total) : null, parcelas: total };
  }, [contatosFiltrados]);

  // 8. Em que dia do mês o dinheiro entra — costuma seguir o calendário de
  // salário/INSS, então mostra quando vale intensificar a cobrança.
  const recebimentoPorDiaMes = useMemo(() => {
    const dias = Array.from({ length: 31 }, (_, i) => ({ label: String(i + 1), value: 0 }));
    for (const c of contatosFiltrados) {
      for (const p of c.parcelas || []) {
        if (!p.paid || !p.paidAt) continue;
        const dia = new Date(p.paidAt).getDate();
        if (dia >= 1 && dia <= 31) dias[dia - 1].value += p.amountPago ?? p.amount;
      }
    }
    return dias;
  }, [contatosFiltrados]);

  // 9. Volume de lead não vale nada se a maioria manda um "oi" e some. Como
  // todo lead aqui nasce de uma mensagem recebida, o que separa lead real de
  // lead fantasma é ter mandado MAIS DE UMA mensagem.
  const engajamentoPorOrigem = useMemo(() => {
    const map = new Map();
    for (const c of contatosFiltrados) {
      const chave = c.campanha?.nome || "Sem origem (direto/indicação)";
      if (!map.has(chave)) map.set(chave, { origem: chave, leads: 0, engajaram: 0, soUmaMsg: 0 });
      const row = map.get(chave);
      row.leads++;
      const msgs = c.msgsCliente ?? 0;
      if (msgs >= 2) row.engajaram++;
      else row.soUmaMsg++;
    }
    return Array.from(map.values())
      .map((r) => ({ ...r, taxa: r.leads > 0 ? Math.round((r.engajaram / r.leads) * 100) : 0 }))
      .sort((a, b) => b.leads - a.leads);
  }, [contatosFiltrados]);

  // 10. Nenhuma métrica isolada diz se você está melhorando — essa diz.
  const comparativoMensal = useMemo(() => {
    const map = new Map();
    const garante = (mes) => {
      if (!map.has(mes)) map.set(mes, { mes, vendas: 0, liberado: 0, recebido: 0 });
      return map.get(mes);
    };
    for (const c of contatosFiltrados) {
      if (c.entrouRecebimentoEm) garante(String(c.entrouRecebimentoEm).slice(0, 7)).vendas++;
      if (c.pagamentoCapital && c.valorCapital) {
        garante(String(c.pagamentoCapital).slice(0, 7)).liberado += c.valorCapital;
      }
      for (const p of c.parcelas || []) {
        if (!p.paid || !p.paidAt) continue;
        garante(String(p.paidAt).slice(0, 7)).recebido += p.amountPago ?? p.amount;
      }
    }
    const linhas = Array.from(map.values())
      .sort((a, b) => b.mes.localeCompare(a.mes))
      .slice(0, 6)
      .map((r) => ({ ...r, ticketMedio: r.vendas > 0 ? r.liberado / r.vendas : 0 }));
    // A lista está do mais recente pro mais antigo, então o mês anterior no
    // tempo é o PRÓXIMO item do array.
    return linhas.map((r, i) => {
      const anterior = linhas[i + 1];
      return {
        ...r,
        deltaRecebido:
          anterior && anterior.recebido > 0 ? Math.round(((r.recebido - anterior.recebido) / anterior.recebido) * 100) : null,
      };
    });
  }, [contatosFiltrados]);

  // Leads por link de rastreamento (UTM/campanha) — de onde vieram e como
  // estão pagando. "Sem origem" = leads que não chegaram por nenhum link
  // (mensagem direta, indicação, etc.).
  const leadsPorCampanha = useMemo(() => {
    const hoje = hojeStr();
    const map = new Map();
    for (const s of stages) {
      for (const c of s.contacts || []) {
        const chave = c.campanha?.id || "__sem__";
        if (!map.has(chave)) {
          map.set(chave, {
            chave,
            label: c.campanha ? `${c.campanha.nome}${c.campanha.regiao ? ` (${c.campanha.regiao})` : ""}` : "Sem origem (direto/indicação)",
            leads: 0,
            adimplentes: 0,
            inadimplentes: 0,
          });
        }
        const row = map.get(chave);
        row.leads++;
        if (c.parcelas && c.parcelas.length > 0) {
          if (c.parcelas.some((p) => parcelaAtrasada(p, hoje))) row.inadimplentes++; else row.adimplentes++;
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.leads - a.leads);
  }, [stages]);

  // Cruza QUANDO o lead foi CRIADO (Contact.createdAt) com adimplência/
  // recebimento — em 3 granularidades escolhíveis (dia da semana, hora do dia,
  // dia do mês) — ajuda a enxergar se leads captados numa certa época pagam
  // melhor/pior ou trazem mais receita que outros.
  const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const CRIACAO_AGRUPAMENTOS = {
    semana: {
      label: "Dia da semana",
      keys: [1, 2, 3, 4, 5, 6, 0], // segunda primeiro, domingo por último
      labels: Object.fromEntries(DIAS_SEMANA.map((n, i) => [i, n])),
      keyFn: (d) => d.getDay(),
    },
    hora: {
      label: "Horário",
      keys: Array.from({ length: 24 }, (_, i) => i),
      labels: Object.fromEntries(Array.from({ length: 24 }, (_, i) => [i, `${String(i).padStart(2, "0")}h`])),
      keyFn: (d) => d.getHours(),
    },
    diaMes: {
      label: "Dia do mês",
      keys: Array.from({ length: 31 }, (_, i) => i + 1),
      labels: Object.fromEntries(Array.from({ length: 31 }, (_, i) => [i + 1, String(i + 1)])),
      keyFn: (d) => d.getDate(),
    },
  };
  const [criacaoGranularidade, setCriacaoGranularidade] = useState("semana");

  const inadimplenciaPorCriacao = useMemo(() => {
    const { keys, labels, keyFn } = CRIACAO_AGRUPAMENTOS[criacaoGranularidade];
    const hoje = hojeStr();
    const map = new Map();
    for (const s of stagesFiltrados) {
      for (const c of s.contacts || []) {
        if (!c.parcelas || c.parcelas.length === 0 || !c.createdAt) continue;
        const k = keyFn(new Date(c.createdAt));
        if (!map.has(k)) map.set(k, { adimplentes: 0, inadimplentes: 0 });
        const row = map.get(k);
        if (c.parcelas.some((p) => parcelaAtrasada(p, hoje))) row.inadimplentes++; else row.adimplentes++;
      }
    }
    return keys.map((k) => {
      const row = map.get(k) || { adimplentes: 0, inadimplentes: 0 };
      const total = row.adimplentes + row.inadimplentes;
      return { label: labels[k], value: total > 0 ? Math.round((row.inadimplentes / total) * 100) : 0, ...row };
    });
  }, [stagesFiltrados, criacaoGranularidade]);

  const recebidoPorCriacao = useMemo(() => {
    const { keys, labels, keyFn } = CRIACAO_AGRUPAMENTOS[criacaoGranularidade];
    const map = new Map();
    for (const s of stagesFiltrados) {
      for (const c of s.contacts || []) {
        if (!c.createdAt) continue;
        const k = keyFn(new Date(c.createdAt));
        const valor = (c.parcelas || [])
          .filter((p) => {
            if (!p.paid || !p.paidAt) return false;
            const d = new Date(p.paidAt).toLocaleDateString("en-CA");
            return d >= ini && d <= fim;
          })
          .reduce((acc, p) => acc + p.amount, 0);
        if (valor <= 0) continue;
        map.set(k, (map.get(k) || 0) + valor);
      }
    }
    return keys.map((k) => ({ label: labels[k], value: Math.round((map.get(k) || 0) * 100) / 100 }));
  }, [stagesFiltrados, ini, fim, criacaoGranularidade]);

  // Lista de UFs presentes na base, pro seletor (só mostra o que existe).
  const ufsDisponiveis = useMemo(() => {
    const set = new Set();
    for (const s of stages) for (const c of s.contacts || []) if (c.estado) set.add(c.estado);
    return Array.from(set).sort();
  }, [stages]);

  // Resumo por estado — sempre com TODOS os leads (ignora o filtro acima),
  // pra comparar os estados lado a lado numa tabela só.
  const porEstado = useMemo(() => {
    const hoje = hojeStr();
    const map = new Map();
    for (const s of stages) {
      for (const c of s.contacts || []) {
        const uf = c.estado || "Não identificado";
        if (!map.has(uf)) map.set(uf, { uf, leads: 0, emRecebimento: 0, adimplentes: 0, inadimplentes: 0 });
        const row = map.get(uf);
        row.leads++;
        if (s.name === "Recebimento") row.emRecebimento++;
        if (c.parcelas && c.parcelas.length > 0) {
          const temAtrasada = c.parcelas.some((p) => parcelaAtrasada(p, hoje));
          if (temAtrasada) row.inadimplentes++; else row.adimplentes++;
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.leads - a.leads);
  }, [stages]);

  function aplicarPreset(p) {
    setPreset(p.key);
    const [a, b] = p.range();
    setIni(a);
    setFim(b);
  }

  const receber = useMemo(() => aReceber(stagesFiltrados, multaOpts), [stagesFiltrados, multaOpts]);
  const recebido = useMemo(() => totalRecebido(stagesFiltrados, ini, fim), [stagesFiltrados, ini, fim]);
  const inad = useMemo(() => inadimplenciaCravo(stagesFiltrados), [stagesFiltrados]);

  // Funil: quantos leads em cada etapa do Kanban (usa a cor já configurada na coluna).
  const funilData = useMemo(
    () => stagesFiltrados.map((s) => ({ label: s.name, value: (s.contacts || []).length, color: s.color || "#64748b" })),
    [stagesFiltrados]
  );

  // Adimplência: entre os clientes com empréstimo ativo (têm parcelas), quantos
  // têm alguma parcela vencida e não paga agora (inadimplente) vs nenhuma (adimplente).
  const { adimplentes, inadimplentes } = useMemo(() => {
    const hoje = hojeStr();
    let ad = 0, inad = 0;
    for (const s of stagesFiltrados) {
      for (const c of s.contacts || []) {
        if (!c.parcelas || c.parcelas.length === 0) continue;
        const temAtrasada = c.parcelas.some((p) => parcelaAtrasada(p, hoje));
        if (temAtrasada) inad++; else ad++;
      }
    }
    return { adimplentes: ad, inadimplentes: inad };
  }, [stagesFiltrados]);

  // Em qual parcela o cliente parou de pagar: menor número de parcela vencida
  // e não paga (a partir dela ele deixou de honrar as cobranças em sequência).
  // Só considera quem está com atraso ativo agora.
  // Parcela em que o capital emprestado volta pro caixa — com 80% de
  // honorários, cada parcela cobre capital/10 + juro, então em ~6 parcelas
  // (10 / (1 + honorarios/100)) o capital já foi todo recuperado.
  const parcelaEquilibrio = useMemo(
    () => Math.ceil(NUM_PARCELAS / (1 + (cfg?.honorariosPct ?? 30) / 100)),
    [cfg]
  );

  const paradaData = useMemo(() => {
    const hoje = hojeStr();
    const counts = Array.from({ length: NUM_PARCELAS }, () => 0);
    for (const s of stagesFiltrados) {
      for (const c of s.contacts || []) {
        const atrasadas = (c.parcelas || []).filter((p) => parcelaAtrasada(p, hoje));
        if (atrasadas.length === 0) continue;
        const stopAt = Math.min(...atrasadas.map((p) => p.number));
        if (stopAt >= 1 && stopAt <= NUM_PARCELAS) counts[stopAt - 1]++;
      }
    }
    return counts.map((v, i) => ({
      label: `${i + 1}ª`,
      value: v,
      number: i + 1,
      color: i + 1 < parcelaEquilibrio ? "#ef4444" : "#f59e0b",
    }));
  }, [stagesFiltrados, parcelaEquilibrio]);

  // % de clientes em atraso que pararam ANTES do capital voltar — o prejuízo
  // de verdade (depois do ponto de equilíbrio já foi lucro que deixou de vir).
  const paradaAntesEquilibrio = useMemo(() => {
    const total = paradaData.reduce((acc, d) => acc + d.value, 0);
    const antes = paradaData.filter((d) => d.number < parcelaEquilibrio).reduce((acc, d) => acc + d.value, 0);
    return { total, antes, pct: total > 0 ? Math.round((antes / total) * 100) : 0 };
  }, [paradaData, parcelaEquilibrio]);

  // A receber por parcela: quantas parcelas em aberto (não pagas, de qualquer
  // vencimento) existem de cada número — 1ª, 2ª, 3ª... — e a soma de cada uma.
  const receberPorParcelaData = useMemo(() => {
    const counts = Array.from({ length: NUM_PARCELAS }, () => 0);
    const valores = Array.from({ length: NUM_PARCELAS }, () => 0);
    for (const s of stagesFiltrados) {
      for (const c of s.contacts || []) {
        for (const p of c.parcelas || []) {
          if (p.paid) continue;
          if (p.number < 1 || p.number > NUM_PARCELAS) continue;
          counts[p.number - 1]++;
          valores[p.number - 1] += p.amount;
        }
      }
    }
    return counts.map((v, i) => ({ label: `${i + 1}ª`, value: v, valor: valores[i] }));
  }, [stagesFiltrados]);

  // Payback por cliente: quanto foi liberado (capital), quanto já voltou
  // (soma das parcelas pagas) e em quantos dias o capital foi recuperado
  // (data em que a soma acumulada dos pagamentos atingiu o capital enviado,
  // contando a partir da liberação). Considera todas as parcelas de todos os
  // ciclos — se o cliente renovou, o "voltou" já inclui os ciclos seguintes.
  const paybackData = useMemo(() => {
    const out = [];
    for (const s of stagesFiltrados) {
      for (const c of s.contacts || []) {
        if (!c.valorCapital || !c.pagamentoCapital) continue;
        const pagas = (c.parcelas || [])
          .filter((p) => p.paid && p.paidAt)
          .slice()
          .sort((a, b) => new Date(a.paidAt) - new Date(b.paidAt));
        const recuperado = pagas.reduce((sum, p) => sum + (p.amountPago ?? p.amount), 0);
        let diasPayback = null;
        let acumulado = 0;
        const inicio = new Date(c.pagamentoCapital);
        for (const p of pagas) {
          acumulado += p.amountPago ?? p.amount;
          if (acumulado >= c.valorCapital) {
            diasPayback = Math.max(0, Math.round((new Date(p.paidAt) - inicio) / 86400000));
            break;
          }
        }
        out.push({
          id: c.id,
          name: c.name,
          capital: c.valorCapital,
          recuperado,
          pctRecuperado: c.valorCapital > 0 ? Math.min(100, Math.round((recuperado / c.valorCapital) * 100)) : 0,
          diasPayback,
        });
      }
    }
    return out.sort((a, b) => b.capital - a.capital);
  }, [stagesFiltrados]);

  // Lista "por cliente" só faz sentido pra quem JÁ teve payback (payback é um
  // evento que aconteceu ou não) — quem ainda está em aberto já aparece nas
  // seções de "A receber"/inadimplência, não precisa duplicar aqui.
  const paybackConcluido = useMemo(
    () => paybackData.filter((d) => d.diasPayback != null).sort((a, b) => a.diasPayback - b.diasPayback),
    [paybackData]
  );

  const paybackStats = useMemo(() => {
    const recuperados = paybackData.filter((d) => d.diasPayback != null);
    const mediaDias = recuperados.length
      ? Math.round(recuperados.reduce((s, d) => s + d.diasPayback, 0) / recuperados.length)
      : null;
    const totalCapital = paybackData.reduce((s, d) => s + d.capital, 0);
    const totalRecuperado = paybackData.reduce((s, d) => s + d.recuperado, 0);
    return {
      mediaDias,
      qtdRecuperados: recuperados.length,
      totalClientes: paybackData.length,
      totalCapital,
      totalRecuperado,
    };
  }, [paybackData]);

  // Distribuição do tempo de payback em faixas, pra virar gráfico de colunas.
  const paybackBuckets = useMemo(() => {
    const faixas = [
      { label: "≤5d", test: (d) => d <= 5 },
      { label: "6-10d", test: (d) => d > 5 && d <= 10 },
      { label: "11-20d", test: (d) => d > 10 && d <= 20 },
      { label: ">20d", test: (d) => d > 20 },
    ];
    const counts = faixas.map(() => 0);
    let naoRecuperado = 0;
    for (const d of paybackData) {
      if (d.diasPayback == null) {
        naoRecuperado++;
        continue;
      }
      const idx = faixas.findIndex((f) => f.test(d.diasPayback));
      if (idx >= 0) counts[idx]++;
    }
    return [...faixas.map((f, i) => ({ label: f.label, value: counts[i] })), { label: "Ainda não", value: naoRecuperado }];
  }, [paybackData]);

  // % de clientes por dia exato de payback (1D, 2D, 3D...) — só entre quem já
  // recuperou o capital (ignora quem ainda não bateu, esse não tem "dia").
  const paybackPorDia = useMemo(() => {
    const cores = ["#059669", "#0ea5e9", "#7c3aed", "#f59e0b", "#ef4444", "#ec4899", "#14b8a6", "#84cc16", "#6366f1", "#f97316"];
    const porDia = new Map();
    for (const d of paybackData) {
      if (d.diasPayback == null) continue;
      porDia.set(d.diasPayback, (porDia.get(d.diasPayback) || 0) + 1);
    }
    return Array.from(porDia.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([dia, value], i) => ({ label: `${dia}D`, value, color: cores[i % cores.length] }));
  }, [paybackData]);

  // LTV: total já recebido de cada cliente, somando TODAS as parcelas pagas
  // de TODOS os ciclos (empréstimo original + renovações) — o quanto aquele
  // cliente já gerou de receita desde que virou lead.
  const ltvData = useMemo(() => {
    const out = [];
    for (const s of stagesFiltrados) {
      for (const c of s.contacts || []) {
        const total = (c.parcelas || []).filter((p) => p.paid).reduce((sum, p) => sum + (p.amountPago ?? p.amount), 0);
        if (total > 0) out.push({ id: c.id, name: c.name, ltv: total, ciclos: c.cicloAtual || 1 });
      }
    }
    return out.sort((a, b) => b.ltv - a.ltv);
  }, [stagesFiltrados]);

  const ltvStats = useMemo(() => {
    if (!ltvData.length) return { media: 0, total: 0, qtd: 0 };
    const total = ltvData.reduce((s, d) => s + d.ltv, 0);
    return { media: total / ltvData.length, total, qtd: ltvData.length };
  }, [ltvData]);

  const ltvTop10 = useMemo(
    () => ltvData.slice(0, 10).map((d) => ({ id: d.id, label: d.name, value: Math.round(d.ltv * 100) / 100, color: "#7c3aed" })),
    [ltvData]
  );

  // Novos indicadores
  const { novasVendas, renovacoes } = useMemo(() => {
    const all = stagesFiltrados.flatMap((s) => s.contacts || []);
    const nv = all.filter((c) => {
      if (!c.createdAt) return false;
      const d = new Date(c.createdAt).toLocaleDateString("en-CA");
      return d >= ini && d <= fim;
    }).length;
    const ren = all.filter((c) => (c.cicloAtual || 1) > 1).length;
    return { novasVendas: nv, renovacoes: ren };
  }, [stagesFiltrados, ini, fim]);

  // Manda pro servidor os indicadores JÁ calculados aqui — refazer as contas
  // no backend abriria espaço pro PDF divergir do que está na tela.
  async function exportarPdf() {
    setGerandoPdf(true);
    try {
      const res = await fetch("/api/relatorios/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodo: `${ini} a ${fim}`,
          filtros: [
            estadoFiltro && `Estado: ${estadoFiltro}`,
            etapaFiltro && `Etapa: ${stages.find((s) => s.id === etapaFiltro)?.name || ""}`,
            generoFiltroRel && `Gênero: ${GENERO_LABEL[generoFiltroRel] || generoFiltroRel}`,
            tipoClienteFiltroRel && `Tipo: ${TIPO_CLIENTE_LABEL[tipoClienteFiltroRel] || tipoClienteFiltroRel}`,
          ].filter(Boolean).join(" · ") || "nenhum",
          novasVendas, renovacoes,
          receberDia: receber.dia, receberSemana: receber.semana, receberMes: receber.mes,
          recebido,
          inadCapital: inad.pendenteCapital, inadTotal: inad.pendenteTotal,
          adimplentes, inadimplentes,
          giro: giroCapital,
          tempoMedioLiberacao: tempoAteLiberacao.media,
          aging: agingData.map((f) => ({ label: f.label, value: f.value, parcelas: f.parcelas, clientes: f.clientes })),
          safras,
          porCiclo: porCiclo.map((c) => ({
            rotulo: c.chave === "1" ? "1º empréstimo" : c.chave === "2" ? "2º (1ª renov.)" : "3º ou mais",
            clientes: c.clientes, emprestado: c.emprestado, recebido: c.recebido, lucro: c.lucro, pctInad: c.pctInad,
          })),
          comparativo: comparativoMensal.map((m) => ({
            mes: new Date(`${m.mes}-01T00:00:00`).toLocaleDateString("pt-BR", { month: "short", year: "numeric" }),
            vendas: m.vendas, liberado: m.liberado, recebido: m.recebido,
            ticketMedio: m.ticketMedio, deltaRecebido: m.deltaRecebido,
          })),
        }),
      });
      if (!res.ok) { alert("Não foi possível gerar o PDF."); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-${hojeStr()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setGerandoPdf(false);
    }
  }

  if (loading) return <div className="p-6 text-slate-400">Carregando relatórios…</div>;

  return (
    <div className="flex-1 overflow-y-auto thin-scroll p-3 md:p-6 flex flex-col gap-4 md:gap-6">
      {/* Botão único que abre o modal com todos os filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setFiltrosAbertos(true)}
          className={`flex items-center gap-1.5 text-xs rounded-full px-3.5 py-1.5 border transition-colors ${
            filtrosAtivosCount > 0
              ? "bg-slate-800 text-white border-slate-800"
              : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
          }`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
            <path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" />
          </svg>
          Filtros
          {filtrosAtivosCount > 0 && (
            <span className="bg-white/20 rounded-full w-4 h-4 flex items-center justify-center text-[10px] leading-none">
              {filtrosAtivosCount}
            </span>
          )}
        </button>

        <button
          onClick={exportarPdf}
          disabled={gerandoPdf}
          className="flex items-center gap-1.5 text-xs rounded-full px-3.5 py-1.5 border bg-white text-slate-600 border-slate-200 hover:border-slate-300 transition-colors disabled:opacity-50"
        >
          {gerandoPdf ? "Gerando…" : "📄 Exportar PDF"}
        </button>
      </div>

      {filtrosAbertos && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={() => setFiltrosAbertos(false)}>
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto thin-scroll"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
              <h3 className="font-semibold text-slate-800">Filtros</h3>
              <div className="flex items-center gap-3">
                {filtrosAtivosCount > 0 && (
                  <button
                    onClick={() => {
                      setEstadoFiltro(""); setEtapaFiltro(""); setGeneroFiltroRel("");
                      setTipoClienteFiltroRel(""); setCriacaoIni(""); setCriacaoFim("");
                    }}
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    Limpar tudo
                  </button>
                )}
                <button onClick={() => setFiltrosAbertos(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <span className="text-xs text-slate-400">Estado</span>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <button
                    onClick={() => setEstadoFiltro("")}
                    className={`text-xs rounded-full px-3 py-1 border transition-colors ${
                      estadoFiltro === "" ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    Todos
                  </button>
                  {ufsDisponiveis.map((uf) => (
                    <button
                      key={uf}
                      onClick={() => setEstadoFiltro(uf)}
                      className={`text-xs rounded-full px-3 py-1 border transition-colors ${
                        estadoFiltro === uf ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      {uf}
                    </button>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className="text-xs text-slate-400">Etapa</span>
                <select
                  value={etapaFiltro}
                  onChange={(e) => setEtapaFiltro(e.target.value)}
                  className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:border-emerald-400"
                >
                  <option value="">Todas</option>
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs text-slate-400">Gênero</span>
                <select
                  value={generoFiltroRel}
                  onChange={(e) => setGeneroFiltroRel(e.target.value)}
                  className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:border-emerald-400"
                >
                  <option value="">Todos</option>
                  <option value="masculino">Masculino</option>
                  <option value="feminino">Feminino</option>
                </select>
              </label>

              <label className="block">
                <span className="text-xs text-slate-400">Tipo de cliente</span>
                <select
                  value={tipoClienteFiltroRel}
                  onChange={(e) => setTipoClienteFiltroRel(e.target.value)}
                  className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:border-emerald-400"
                >
                  <option value="">Todos</option>
                  <option value="motoboy">Motoboy</option>
                  <option value="uber">Uber</option>
                  <option value="comerciante">Comerciante</option>
                </select>
              </label>

              <div>
                <span className="text-xs text-slate-400">Data de criação da lead</span>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="date"
                    value={criacaoIni}
                    onChange={(e) => setCriacaoIni(e.target.value)}
                    className="flex-1 text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-emerald-400"
                  />
                  <span className="text-xs text-slate-400 shrink-0">até</span>
                  <input
                    type="date"
                    value={criacaoFim}
                    onChange={(e) => setCriacaoFim(e.target.value)}
                    className="flex-1 text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-emerald-400"
                  />
                </div>
              </div>

              <div>
                <span className="text-xs text-slate-400">Período (recebimento/vendas)</span>
                <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => aplicarPreset(p)}
                      className={`text-xs rounded-full px-3 py-1 border transition-colors ${
                        preset === p.key
                          ? "bg-slate-800 text-white border-slate-800"
                          : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <input
                    type="date"
                    value={ini}
                    onChange={(e) => { setPreset("custom"); setIni(e.target.value); }}
                    className="flex-1 text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-emerald-400"
                  />
                  <span className="text-xs text-slate-400 shrink-0">até</span>
                  <input
                    type="date"
                    value={fim}
                    onChange={(e) => { setPreset("custom"); setFim(e.target.value); }}
                    className="flex-1 text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-emerald-400"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Indicadores gerais */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Visão geral</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs text-slate-400">Novas vendas (período)</p>
            <p className="text-2xl font-semibold mt-1 text-violet-600">{novasVendas}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs text-slate-400">Renovações (leads com ciclo &gt; 1)</p>
            <p className="text-2xl font-semibold mt-1 text-amber-600">{renovacoes}</p>
          </div>
        </div>
      </section>

      {/* A receber */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">A receber</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <Card titulo="Hoje" valor={receber.dia} cor="emerald" />
          <Card titulo="Esta semana" valor={receber.semana} cor="sky" />
          <Card titulo="Este mês" valor={receber.mes} cor="violet" />
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Parcelas em aberto que vencem de hoje até o fim de cada período (já com multa de {multaPct}% nas vencidas).
        </p>
      </section>

      {/* Total recebido por período — período agora é escolhido no botão "Filtros" no topo */}
      <section>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <h2 className="text-sm font-semibold text-slate-700">Total recebido</h2>
          <button onClick={() => setFiltrosAbertos(true)} className="text-xs text-sky-600 hover:text-sky-700">
            {PRESETS.find((p) => p.key === preset)?.label || "Período personalizado"} — trocar
          </button>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-3xl font-semibold text-emerald-600">{money(recebido)}</p>
          <p className="text-xs text-slate-400 mt-1">
            Recebido entre {ini} e {fim} (parcelas baixadas no período).
          </p>
        </div>
      </section>

      {/* Inadimplência (Cravo) */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">
          Inadimplência <span className="text-slate-400 font-normal">— leads em Cravo ({inad.clientes})</span>
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <Card titulo="Pendente em capital" valor={inad.pendenteCapital} cor="red" />
          <Card titulo="Pendente total (com honorários)" valor={inad.pendenteTotal} cor="red" />
        </div>
      </section>

      {/* Resumo por estado — comparação lado a lado, independente do filtro acima */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Resumo por estado</h2>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {porEstado.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 px-5">Nenhum lead cadastrado.</p>
          ) : (
            <>
              {/* Desktop/tablet: tabela completa */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm min-w-[660px]">
                  <thead>
                    <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                      <th className="py-2.5 px-4 font-medium">Estado</th>
                      <th className="py-2.5 px-3 font-medium text-right">Leads</th>
                      <th className="py-2.5 px-3 font-medium text-right">Em Recebimento</th>
                      <th className="py-2.5 px-3 font-medium text-right">% Conversão</th>
                      <th className="py-2.5 px-3 font-medium text-right">Adimplentes</th>
                      <th className="py-2.5 px-3 font-medium text-right">Inadimplentes</th>
                      <th className="py-2.5 px-4 font-medium text-right">% Inadimplência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porEstado.map((r) => {
                      const base = r.adimplentes + r.inadimplentes;
                      const pctInad = base > 0 ? Math.round((r.inadimplentes / base) * 100) : 0;
                      const pctConversao = r.leads > 0 ? Math.round((r.emRecebimento / r.leads) * 100) : 0;
                      return (
                        <tr
                          key={r.uf}
                          className={`border-b border-slate-50 last:border-0 hover:bg-slate-50/60 cursor-pointer ${estadoFiltro === r.uf ? "bg-emerald-50/60" : ""}`}
                          onClick={() => setEstadoFiltro(r.uf === "Não identificado" ? "" : estadoFiltro === r.uf ? "" : r.uf)}
                        >
                          <td className="py-2 px-4 font-medium text-slate-700">{r.uf}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-slate-600">{r.leads}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-slate-600">{r.emRecebimento}</td>
                          <td className="py-2 px-3 text-right tabular-nums font-medium text-violet-600">
                            {r.leads > 0 ? `${pctConversao}%` : "—"}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums text-emerald-600">{r.adimplentes}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-red-500">{r.inadimplentes}</td>
                          <td className={`py-2 px-4 text-right tabular-nums font-medium ${pctInad >= 50 ? "text-red-600" : pctInad >= 25 ? "text-amber-600" : "text-slate-500"}`}>
                            {base > 0 ? `${pctInad}%` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile: cards empilhados (a tabela de 7 colunas não cabe numa tela estreita) */}
              <div className="sm:hidden divide-y divide-slate-50">
                {porEstado.map((r) => {
                  const base = r.adimplentes + r.inadimplentes;
                  const pctInad = base > 0 ? Math.round((r.inadimplentes / base) * 100) : 0;
                  const pctConversao = r.leads > 0 ? Math.round((r.emRecebimento / r.leads) * 100) : 0;
                  return (
                    <button
                      key={r.uf}
                      type="button"
                      onClick={() => setEstadoFiltro(r.uf === "Não identificado" ? "" : estadoFiltro === r.uf ? "" : r.uf)}
                      className={`w-full text-left px-4 py-3 ${estadoFiltro === r.uf ? "bg-emerald-50/60" : "hover:bg-slate-50/60"}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-700 text-sm">{r.uf}</span>
                        <span className="text-xs text-slate-400">{r.leads} lead{r.leads === 1 ? "" : "s"} · {r.emRecebimento} em Recebimento</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-1.5 text-xs">
                        <div>
                          <span className="text-slate-400 block">Conversão</span>
                          <span className="font-medium text-violet-600">{r.leads > 0 ? `${pctConversao}%` : "—"}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Adimplentes</span>
                          <span className="font-medium text-emerald-600">{r.adimplentes}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Inadimplência</span>
                          <span className={`font-medium ${pctInad >= 50 ? "text-red-600" : pctInad >= 25 ? "text-amber-600" : "text-slate-500"}`}>
                            {r.inadimplentes} {base > 0 ? `(${pctInad}%)` : ""}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <p className="text-[11px] text-slate-400 mt-1">Clique numa linha pra filtrar as métricas acima só por aquele estado.</p>

        {estadoFiltro && (
          <div className="mt-3">
            <h3 className="text-xs font-semibold text-slate-500 mb-1.5">
              Leads em {estadoFiltro} <span className="font-normal text-slate-400">({leadsDoEstadoFiltro.length})</span>
            </h3>
            <div className="bg-white rounded-xl border border-slate-200 max-h-80 overflow-y-auto thin-scroll divide-y divide-slate-50">
              {leadsDoEstadoFiltro.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setOpenContactId(c.id)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50/80 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-700 truncate">{c.name}</p>
                    <p className="text-xs text-slate-400 truncate">{c.phone || "sem telefone"} · {c.stageName}</p>
                  </div>
                  <span
                    className={`text-[10px] font-medium rounded-full px-2 py-0.5 shrink-0 ${
                      c.situacao === "inadimplente"
                        ? "bg-red-50 text-red-600"
                        : c.situacao === "adimplente"
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {c.situacao === "inadimplente" ? "Inadimplente" : c.situacao === "adimplente" ? "Adimplente" : "Sem cobrança"}
                  </span>
                </button>
              ))}
              {leadsDoEstadoFiltro.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-6">Nenhum lead nesse estado.</p>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Funil: leads por etapa */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Funil — leads por etapa</h2>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          {funilData.length === 0 || funilData.every((d) => d.value === 0) ? (
            <p className="text-sm text-slate-400 py-4">Nenhum lead cadastrado.</p>
          ) : (
            <HBarChart data={funilData} />
          )}
        </div>
      </section>

      {/* Os 3 donuts de adimplência ficam lado a lado — sozinhos em largura
          total sobra muito espaço branco em volta do gráfico. */}
      <div className="grid lg:grid-cols-3 gap-4 md:gap-6">
      {/* Adimplência vs inadimplência */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Adimplência</h2>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          {adimplentes + inadimplentes === 0 ? (
            <p className="text-sm text-slate-400 py-4">Nenhum cliente com empréstimo ativo.</p>
          ) : (
            <DonutChart
              data={[
                { label: "Adimplentes", value: adimplentes, color: "#059669" },
                { label: "Inadimplentes", value: inadimplentes, color: "#ef4444" },
              ]}
            />
          )}
        </div>
      </section>

      {/* Leads por link de rastreamento (UTM/campanha) */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">
          Leads por link de rastreamento <span className="text-slate-400 font-normal">— origem via /l/… configurado em Configurações</span>
        </h2>
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {leadsPorCampanha.length === 0 ? (
            <p className="text-sm text-slate-400 p-5">Nenhum lead ainda.</p>
          ) : (
            leadsPorCampanha.map((r) => {
              const comEmprestimo = r.adimplentes + r.inadimplentes;
              return (
                <div key={r.chave} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{r.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {r.leads} lead{r.leads === 1 ? "" : "s"}
                      {comEmprestimo > 0 && ` · ${r.inadimplentes} inadimplente${r.inadimplentes === 1 ? "" : "s"} de ${comEmprestimo}`}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Adimplência por gênero */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Adimplência por gênero</h2>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          {adimplenciaPorGenero.length === 0 ? (
            <p className="text-sm text-slate-400 py-4">Nenhum cliente com empréstimo ativo.</p>
          ) : (
            <div className="flex flex-wrap gap-6">
              {adimplenciaPorGenero.map((g) => (
                <div key={g.chave}>
                  <p className="text-xs font-medium text-slate-500 mb-2">{g.label}</p>
                  <DonutChart
                    size={110}
                    strokeWidth={18}
                    data={[
                      { label: "Adimplentes", value: g.adimplentes, color: "#059669" },
                      { label: "Inadimplentes", value: g.inadimplentes, color: "#ef4444" },
                    ]}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Adimplência por tipo de cliente */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Adimplência por tipo de cliente</h2>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          {adimplenciaPorTipoCliente.length === 0 ? (
            <p className="text-sm text-slate-400 py-4">Nenhum cliente com empréstimo ativo.</p>
          ) : (
            <div className="flex flex-wrap gap-6">
              {adimplenciaPorTipoCliente.map((g) => (
                <div key={g.chave}>
                  <p className="text-xs font-medium text-slate-500 mb-2">{g.label}</p>
                  <DonutChart
                    size={110}
                    strokeWidth={18}
                    data={[
                      { label: "Adimplentes", value: g.adimplentes, color: "#059669" },
                      { label: "Inadimplentes", value: g.inadimplentes, color: "#ef4444" },
                    ]}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
      </div>

      {/* Lucro real por perfil: recebido - emprestado, não só % de inadimplência */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">
          Lucro real por perfil <span className="text-slate-400 font-normal">— recebido menos emprestado, não só % de inadimplência</span>
        </h2>
        <div className="grid lg:grid-cols-3 gap-4">
          {[
            { titulo: "Gênero", dados: lucroPorGenero },
            { titulo: "Tipo de cliente", dados: lucroPorTipoCliente },
            { titulo: "Região", dados: lucroPorEstado },
          ].map(({ titulo, dados }) => (
            <div key={titulo} className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs font-medium text-slate-500 mb-3">{titulo}</p>
              {dados.length === 0 ? (
                <p className="text-sm text-slate-400 py-4">Nenhum cliente com capital liberado.</p>
              ) : (
                <HBarChart data={dados} valueFmt={money} />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Curva de safra: clientes agrupados pelo mês em que o capital foi liberado */}
      <section>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="text-sm font-semibold text-slate-700">
            Curva de safra <span className="text-slate-400 font-normal">— carteira agrupada pelo mês de liberação do capital</span>
          </h2>
          {safras.length > 0 && (
            <button
              onClick={() => baixarCsv("safras", [
                { label: "Safra", chave: "mes" },
                { label: "Clientes", chave: "clientes" },
                { label: "Emprestado", valor: (r) => numeroCsv(r.emprestado) },
                { label: "Recuperado", valor: (r) => numeroCsv(r.recuperado) },
                { label: "% Recuperado", chave: "pctRecuperado" },
                { label: "Payback medio (dias)", valor: (r) => r.diasMedios ?? "" },
              ], safras)}
              className="text-xs text-slate-500 hover:text-emerald-600 shrink-0"
            >
              ⬇ CSV
            </button>
          )}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {safras.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 px-5">Nenhum capital liberado ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                    <th className="py-2.5 px-4 font-medium">Safra</th>
                    <th className="py-2.5 px-3 font-medium text-right">Clientes</th>
                    <th className="py-2.5 px-3 font-medium text-right">Emprestado</th>
                    <th className="py-2.5 px-3 font-medium text-right">Recuperado</th>
                    <th className="py-2.5 px-3 font-medium text-right">% Recuperado</th>
                    <th className="py-2.5 px-4 font-medium text-right">Payback médio</th>
                  </tr>
                </thead>
                <tbody>
                  {safras.map((r) => (
                    <tr key={r.mes} className="border-b border-slate-50 last:border-0">
                      <td className="py-2 px-4 font-medium text-slate-700 capitalize">
                        {new Date(`${r.mes}-01T00:00:00`).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-600">{r.clientes}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-600">{money(r.emprestado)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-600">{money(r.recuperado)}</td>
                      <td className={`py-2 px-3 text-right tabular-nums font-medium ${r.pctRecuperado >= 100 ? "text-emerald-600" : r.pctRecuperado >= 70 ? "text-amber-600" : "text-red-600"}`}>
                        {r.pctRecuperado}%
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-500">
                        {r.diasMedios != null ? `${r.diasMedios}d` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Cruzamento com quando o lead foi criado (dia da semana / hora / dia do mês) */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h2 className="text-sm font-semibold text-slate-700">
            Por criação da lead <span className="text-slate-400 font-normal">— quando o lead entrou no funil</span>
          </h2>
          <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
            {Object.entries(CRIACAO_AGRUPAMENTOS).map(([key, g]) => (
              <button
                key={key}
                type="button"
                onClick={() => setCriacaoGranularidade(key)}
                className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                  criacaoGranularidade === key ? "bg-white shadow-sm text-slate-700 font-medium" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 overflow-x-auto">
            <p className="text-xs text-slate-400 mb-2">% de inadimplência por {CRIACAO_AGRUPAMENTOS[criacaoGranularidade].label.toLowerCase()} de criação</p>
            {inadimplenciaPorCriacao.every((d) => d.adimplentes + d.inadimplentes === 0) ? (
              <p className="text-sm text-slate-400 py-4">Nenhum cliente com empréstimo ativo.</p>
            ) : (
              <div style={{ minWidth: criacaoGranularidade === "semana" ? undefined : criacaoGranularidade === "hora" ? 620 : 700 }}>
                <VBarChart
                  data={inadimplenciaPorCriacao}
                  color="#ef4444"
                  tooltip={(d) => `${d.label}: ${d.value}% inadimplente (${d.inadimplentes} de ${d.adimplentes + d.inadimplentes})`}
                />
              </div>
            )}
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5 overflow-x-auto">
            <p className="text-xs text-slate-400 mb-2">Recebido no período por {CRIACAO_AGRUPAMENTOS[criacaoGranularidade].label.toLowerCase()} de criação</p>
            {recebidoPorCriacao.every((d) => d.value === 0) ? (
              <p className="text-sm text-slate-400 py-4">Nenhum recebimento no período selecionado.</p>
            ) : (
              <div style={{ minWidth: criacaoGranularidade === "semana" ? undefined : criacaoGranularidade === "hora" ? 620 : 700 }}>
                <VBarChart
                  data={recebidoPorCriacao}
                  color="#059669"
                  tooltip={(d) => `${d.label}: ${money(d.value)}`}
                />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Em qual parcela o cliente parou de pagar */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">
          Parcela em que o cliente parou de pagar <span className="text-slate-400 font-normal">— clientes em atraso agora</span>
        </h2>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          {paradaData.every((d) => d.value === 0) ? (
            <p className="text-sm text-slate-400 py-4">Nenhum cliente em atraso no momento.</p>
          ) : (
            <>
              <VBarChart data={paradaData} color="#f59e0b" />
              <p className="text-xs text-slate-500 mt-3">
                {paradaAntesEquilibrio.antes} de {paradaAntesEquilibrio.total} clientes em atraso ({paradaAntesEquilibrio.pct}%)
                pararam antes da parcela {parcelaEquilibrio} — abaixo dessa parcela o capital emprestado ainda não voltou.
              </p>
            </>
          )}
        </div>
      </section>

      {/* A receber por número de parcela */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">
          A receber por parcela <span className="text-slate-400 font-normal">— quantas parcelas em aberto de cada número</span>
        </h2>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          {receberPorParcelaData.every((d) => d.value === 0) ? (
            <p className="text-sm text-slate-400 py-4">Nenhuma parcela em aberto.</p>
          ) : (
            <VBarChart
              data={receberPorParcelaData}
              color="#0284c7"
              tooltip={(d) => `${d.label} parcela: ${d.value} em aberto — ${money(d.valor)}`}
            />
          )}
        </div>
      </section>

      {/* Payback: quanto foi liberado, quanto voltou e em quantos dias */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">
          Payback dos clientes <span className="text-slate-400 font-normal">— o que foi liberado, quanto voltou e em quanto tempo</span>
        </h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <Card titulo="Capital enviado" valor={paybackStats.totalCapital} cor="violet" />
          <Card titulo="Capital recuperado" valor={paybackStats.totalRecuperado} cor="emerald" />
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs text-slate-400">Payback médio</p>
            <p className="text-2xl font-semibold mt-1 text-sky-600">
              {paybackStats.mediaDias != null ? `${paybackStats.mediaDias} dia${paybackStats.mediaDias === 1 ? "" : "s"}` : "—"}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              {paybackStats.qtdRecuperados} de {paybackStats.totalClientes} clientes já recuperaram o capital
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-4 mt-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs text-slate-400 mb-2">Distribuição por faixa de dias</p>
            {paybackData.length === 0 ? (
              <p className="text-sm text-slate-400 py-4">Nenhum cliente com capital liberado ainda.</p>
            ) : (
              <VBarChart
                data={paybackBuckets}
                color="#0ea5e9"
                tooltip={(d) => `${d.label}: ${d.value} cliente${d.value === 1 ? "" : "s"}`}
              />
            )}
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs text-slate-400 mb-2">% de payback por dia exato — só quem já recuperou</p>
            {paybackPorDia.length === 0 ? (
              <p className="text-sm text-slate-400 py-4">Nenhum cliente recuperou o capital ainda.</p>
            ) : (
              <DonutChart data={paybackPorDia} />
            )}
          </div>
        </div>

        {paybackData.length > 0 && (
          <div className="mt-3">
            <h3 className="text-xs font-semibold text-slate-500 mb-1.5">
              Por cliente <span className="font-normal text-slate-400">— só quem já recuperou o capital ({paybackConcluido.length})</span>
            </h3>
            <div className="bg-white rounded-xl border border-slate-200 max-h-80 overflow-y-auto thin-scroll divide-y divide-slate-50">
              {paybackConcluido.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">Nenhum cliente recuperou o capital ainda.</p>
              ) : (
                paybackConcluido.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setOpenContactId(d.id)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50/80 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-700 truncate">{d.name}</p>
                      <p className="text-xs text-slate-400 truncate">
                        Enviou {money(d.capital)} · Voltou {money(d.recuperado)} ({d.pctRecuperado}%)
                      </p>
                    </div>
                    <span className="text-[10px] font-medium rounded-full px-2 py-0.5 shrink-0 bg-emerald-50 text-emerald-600">
                      {d.diasPayback}d
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </section>

      {/* LTV: valor total já gerado por cada cliente (todos os ciclos) */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">
          LTV dos clientes <span className="text-slate-400 font-normal">— total já recebido de cada um, somando todos os ciclos</span>
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <Card titulo="LTV médio por cliente" valor={ltvStats.media} cor="violet" />
          <Card titulo="Total já recebido" valor={ltvStats.total} cor="emerald" />
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 mt-4">
          {ltvTop10.length === 0 ? (
            <p className="text-sm text-slate-400 py-4">Nenhum recebimento registrado ainda.</p>
          ) : (
            <>
              <p className="text-xs text-slate-400 mb-2">Top 10 clientes por LTV — clique numa barra pra abrir o lead</p>
              <HBarChart data={ltvTop10} valueFmt={money} onBarClick={(d) => setOpenContactId(d.id)} />
            </>
          )}
        </div>
      </section>

      {/* Aging da carteira */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">
          Aging da carteira <span className="text-slate-400 font-normal">— valor em aberto por tempo de atraso</span>
        </h2>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          {agingData.every((f) => f.value === 0) ? (
            <p className="text-sm text-slate-400 py-4">Nenhuma parcela vencida em aberto.</p>
          ) : (
            <>
              <VBarChart
                data={agingData}
                tooltip={(d) => `${d.label}: ${money(d.value)} — ${d.parcelas} parcela(s) de ${d.clientes} cliente(s)`}
              />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                {agingData.map((f) => (
                  <div key={f.label}>
                    <p className="text-[11px] text-slate-400">{f.label}</p>
                    <p className="text-sm font-semibold" style={{ color: f.color }}>{money(f.value)}</p>
                    <p className="text-[11px] text-slate-400">{f.clientes} cliente{f.clientes === 1 ? "" : "s"}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* Conversão etapa a etapa */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">
          Conversão etapa a etapa <span className="text-slate-400 font-normal">— onde o lead para no funil (exclui Venda perdida)</span>
        </h2>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {conversaoFunil[0]?.chegaram === 0 ? (
            <p className="text-sm text-slate-400 py-4 px-5">Nenhum lead no funil.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                    <th className="py-2.5 px-4 font-medium">Etapa</th>
                    <th className="py-2.5 px-3 font-medium text-right">Chegaram</th>
                    <th className="py-2.5 px-3 font-medium text-right">% do topo</th>
                    <th className="py-2.5 px-4 font-medium text-right">% da etapa anterior</th>
                  </tr>
                </thead>
                <tbody>
                  {conversaoFunil.map((r) => (
                    <tr key={r.etapa} className="border-b border-slate-50 last:border-0">
                      <td className="py-2 px-4 font-medium text-slate-700">{r.etapa}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-600">{r.chegaram}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-violet-600">{r.pctTopo}%</td>
                      <td className={`py-2 px-4 text-right tabular-nums font-medium ${r.pctAnterior == null ? "text-slate-400" : r.pctAnterior >= 60 ? "text-emerald-600" : r.pctAnterior >= 30 ? "text-amber-600" : "text-red-600"}`}>
                        {r.pctAnterior == null ? "—" : `${r.pctAnterior}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Velocidade e giro do capital */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">
          Velocidade e giro do capital <span className="text-slate-400 font-normal">— quanto tempo até liberar e quantas vezes o dinheiro rodou</span>
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs text-slate-400">Tempo médio até liberar</p>
            <p className="text-2xl font-semibold mt-1 text-sky-600">
              {tempoAteLiberacao.media != null ? `${tempoAteLiberacao.media}d` : "—"}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">Do 1º contato ao capital na mão</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs text-slate-400">Clientes considerados</p>
            <p className="text-2xl font-semibold mt-1 text-slate-700">{tempoAteLiberacao.clientes}</p>
          </div>
          <Card titulo="Capital na rua" valor={giroCapital.capitalNaRua} cor="violet" />
          <Card titulo="Emprestado no período" valor={giroCapital.emprestadoNoPeriodo} cor="emerald" />
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs text-slate-400">Giro no período</p>
            <p className="text-2xl font-semibold mt-1 text-amber-600">
              {String(giroCapital.giro).replace(".", ",")}x
            </p>
            <p className="text-[11px] text-slate-400 mt-1">Emprestado ÷ capital na rua</p>
          </div>
        </div>
      </section>

      {/* Faixa de ticket */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">
          Inadimplência e lucro por faixa de ticket <span className="text-slate-400 font-normal">— até onde vale emprestar</span>
        </h2>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {porFaixaTicket.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 px-5">Nenhum cliente com capital liberado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[620px]">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                    <th className="py-2.5 px-4 font-medium">Faixa</th>
                    <th className="py-2.5 px-3 font-medium text-right">Clientes</th>
                    <th className="py-2.5 px-3 font-medium text-right">Emprestado</th>
                    <th className="py-2.5 px-3 font-medium text-right">Recebido</th>
                    <th className="py-2.5 px-3 font-medium text-right">Lucro</th>
                    <th className="py-2.5 px-4 font-medium text-right">% Inadimplência</th>
                  </tr>
                </thead>
                <tbody>
                  {porFaixaTicket.map((f) => (
                    <tr key={f.label} className="border-b border-slate-50 last:border-0">
                      <td className="py-2 px-4 font-medium text-slate-700">{f.label}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-600">{f.clientes}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-600">{money(f.emprestado)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-600">{money(f.recebido)}</td>
                      <td className={`py-2 px-3 text-right tabular-nums font-medium ${f.lucro >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {money(f.lucro)}
                      </td>
                      <td className={`py-2 px-4 text-right tabular-nums font-medium ${f.pctInad >= 50 ? "text-red-600" : f.pctInad >= 25 ? "text-amber-600" : "text-slate-500"}`}>
                        {f.pctInad}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Comportamento por ciclo */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">
          Comportamento por ciclo <span className="text-slate-400 font-normal">— 1º empréstimo vs. renovações</span>
        </h2>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {porCiclo.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 px-5">Nenhum cliente com capital liberado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[680px]">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                    <th className="py-2.5 px-4 font-medium">Ciclo</th>
                    <th className="py-2.5 px-3 font-medium text-right">Clientes</th>
                    <th className="py-2.5 px-3 font-medium text-right">Emprestado</th>
                    <th className="py-2.5 px-3 font-medium text-right">Recebido</th>
                    <th className="py-2.5 px-3 font-medium text-right">Lucro</th>
                    <th className="py-2.5 px-3 font-medium text-right">% Inadimplência</th>
                    <th className="py-2.5 px-4 font-medium text-right">Payback médio</th>
                  </tr>
                </thead>
                <tbody>
                  {porCiclo.map((r) => (
                    <tr key={r.chave} className="border-b border-slate-50 last:border-0">
                      <td className="py-2 px-4 font-medium text-slate-700">
                        {r.chave === "1" ? "1º empréstimo" : r.chave === "2" ? "2º (1ª renovação)" : "3º ou mais"}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-600">{r.clientes}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-600">{money(r.emprestado)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-600">{money(r.recebido)}</td>
                      <td className={`py-2 px-3 text-right tabular-nums font-medium ${r.lucro >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {money(r.lucro)}
                      </td>
                      <td className={`py-2 px-3 text-right tabular-nums font-medium ${r.pctInad >= 50 ? "text-red-600" : r.pctInad >= 25 ? "text-amber-600" : "text-slate-500"}`}>
                        {r.pctInad}%
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-500">
                        {r.paybackMedio != null ? `${r.paybackMedio}d` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Atraso de quem paga */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">
          Atraso de quem paga <span className="text-slate-400 font-normal">— separa mau pagador de pagador atrasado</span>
        </h2>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          {atrasoDeQuemPaga.parcelas === 0 ? (
            <p className="text-sm text-slate-400 py-4">Nenhuma parcela paga ainda.</p>
          ) : (
            <>
              <VBarChart
                data={atrasoDeQuemPaga.faixas}
                tooltip={(d) => `${d.label}: ${d.value} parcela${d.value === 1 ? "" : "s"}`}
              />
              <p className="text-xs text-slate-500 mt-3">
                Quando pagam, os clientes atrasam em média {atrasoDeQuemPaga.media}d — considerando {atrasoDeQuemPaga.parcelas} parcelas já baixadas.
              </p>
            </>
          )}
        </div>
      </section>

      {/* Calendário de recebimento */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">
          Calendário de recebimento <span className="text-slate-400 font-normal">— em que dia do mês o dinheiro entra</span>
        </h2>
        <div className="bg-white rounded-xl border border-slate-200 p-5 overflow-x-auto">
          {recebimentoPorDiaMes.every((d) => d.value === 0) ? (
            <p className="text-sm text-slate-400 py-4">Nenhum recebimento registrado.</p>
          ) : (
            <div style={{ minWidth: 900 }}>
              <VBarChart
                data={recebimentoPorDiaMes}
                color="#059669"
                tooltip={(d) => `Dia ${d.label}: ${money(d.value)}`}
              />
            </div>
          )}
        </div>
      </section>

      {/* Engajamento por origem */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">
          Engajamento por origem <span className="text-slate-400 font-normal">— lead que conversou de verdade vs. quem mandou um "oi" e sumiu</span>
        </h2>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {engajamentoPorOrigem.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 px-5">Nenhum lead cadastrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                    <th className="py-2.5 px-4 font-medium">Origem</th>
                    <th className="py-2.5 px-3 font-medium text-right">Leads</th>
                    <th className="py-2.5 px-3 font-medium text-right">Engajaram (2+ msgs)</th>
                    <th className="py-2.5 px-3 font-medium text-right">Só 1 mensagem</th>
                    <th className="py-2.5 px-4 font-medium text-right">% Engajamento</th>
                  </tr>
                </thead>
                <tbody>
                  {engajamentoPorOrigem.map((r) => (
                    <tr key={r.origem} className="border-b border-slate-50 last:border-0">
                      <td className="py-2 px-4 font-medium text-slate-700 truncate max-w-[260px]" title={r.origem}>{r.origem}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-600">{r.leads}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-emerald-600">{r.engajaram}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-400">{r.soUmaMsg}</td>
                      <td className={`py-2 px-4 text-right tabular-nums font-medium ${r.taxa >= 50 ? "text-emerald-600" : r.taxa >= 25 ? "text-amber-600" : "text-red-600"}`}>
                        {r.taxa}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Comparativo mês a mês */}
      <section>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="text-sm font-semibold text-slate-700">
            Comparativo mês a mês <span className="text-slate-400 font-normal">— últimos 6 meses</span>
          </h2>
          {comparativoMensal.length > 0 && (
            <button
              onClick={() => baixarCsv("comparativo-mensal", [
                { label: "Mes", chave: "mes" },
                { label: "Vendas", chave: "vendas" },
                { label: "Liberado", valor: (r) => numeroCsv(r.liberado) },
                { label: "Recebido", valor: (r) => numeroCsv(r.recebido) },
                { label: "Ticket medio", valor: (r) => numeroCsv(r.ticketMedio) },
                { label: "Delta recebido (%)", valor: (r) => r.deltaRecebido ?? "" },
              ], comparativoMensal)}
              className="text-xs text-slate-500 hover:text-emerald-600 shrink-0"
            >
              ⬇ CSV
            </button>
          )}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {comparativoMensal.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 px-5">Sem histórico ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                    <th className="py-2.5 px-4 font-medium">Mês</th>
                    <th className="py-2.5 px-3 font-medium text-right">Vendas</th>
                    <th className="py-2.5 px-3 font-medium text-right">Liberado</th>
                    <th className="py-2.5 px-3 font-medium text-right">Recebido</th>
                    <th className="py-2.5 px-3 font-medium text-right">Ticket médio</th>
                    <th className="py-2.5 px-4 font-medium text-right">Δ Recebido</th>
                  </tr>
                </thead>
                <tbody>
                  {comparativoMensal.map((r) => (
                    <tr key={r.mes} className="border-b border-slate-50 last:border-0">
                      <td className="py-2 px-4 font-medium text-slate-700 capitalize">
                        {new Date(`${r.mes}-01T00:00:00`).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-600">{r.vendas}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-600">{money(r.liberado)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-600">{money(r.recebido)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-600">{money(r.ticketMedio)}</td>
                      <td className={`py-2 px-4 text-right tabular-nums font-medium ${r.deltaRecebido == null ? "text-slate-400" : r.deltaRecebido >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {r.deltaRecebido == null ? "—" : `${r.deltaRecebido >= 0 ? "+" : ""}${r.deltaRecebido}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {openContactId && (
        <ContactModal
          contactId={openContactId}
          onClose={() => setOpenContactId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

const CORES = {
  emerald: "text-emerald-600",
  sky: "text-sky-600",
  violet: "text-violet-600",
  red: "text-red-500",
};

function Card({ titulo, valor, cor }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <p className="text-xs text-slate-400">{titulo}</p>
      <p className={`text-2xl font-semibold mt-1 ${CORES[cor] || "text-slate-700"}`}>{money(valor)}</p>
    </div>
  );
}

/* ---------------- Gráficos (SVG/CSS leves, sem lib externa) ---------------- */

// Barras horizontais — boa pra rótulos longos (nomes de etapa do funil).
function HBarChart({ data, valueFmt, onBarClick }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const fmt = valueFmt || ((v) => v);
  return (
    <div className="space-y-2.5">
      {data.map((d, i) => {
        const Row = onBarClick ? "button" : "div";
        return (
          <Row
            key={i}
            type={onBarClick ? "button" : undefined}
            onClick={onBarClick ? () => onBarClick(d) : undefined}
            className={`w-full flex items-center gap-3 ${onBarClick ? "text-left hover:opacity-75 transition-opacity cursor-pointer" : ""}`}
          >
            <span className="w-20 sm:w-28 shrink-0 text-xs text-slate-600 truncate" title={d.label}>
              {d.label}
            </span>
            <div className="flex-1 h-4 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{ width: `${Math.max(d.value > 0 ? 3 : 0, (d.value / max) * 100)}%`, background: d.color }}
                title={`${d.label}: ${fmt(d.value)}`}
              />
            </div>
            <span className="w-20 shrink-0 text-xs text-slate-500 text-right tabular-nums">{fmt(d.value)}</span>
          </Row>
        );
      })}
    </div>
  );
}

// Colunas verticais — pra sequência ordinal (1ª, 2ª, 3ª parcela...).
function VBarChart({ data, color = "#7c3aed", height = 160, tooltip }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const [hover, setHover] = useState(null);
  const tooltipFor = tooltip || ((d) => `${d.label} parcela: ${d.value} cliente${d.value === 1 ? "" : "s"}`);
  return (
    <div className="flex items-end gap-1.5 sm:gap-2.5" style={{ height: height + 34 }}>
      {data.map((d, i) => {
        const h = d.value > 0 ? Math.max(6, Math.round((d.value / max) * height)) : 0;
        return (
          <div
            key={i}
            className="flex-1 flex flex-col items-center justify-end h-full relative min-w-0"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            {hover === i && (
              <div className="absolute -top-1 -translate-y-full bg-slate-800 text-white text-[11px] rounded px-1.5 py-0.5 whitespace-nowrap z-10">
                {tooltipFor(d)}
              </div>
            )}
            <span className="text-[11px] text-slate-500 tabular-nums mb-1 h-4">{d.value > 0 ? d.value : ""}</span>
            <div
              className="w-full rounded-t-[4px]"
              style={{ height: h, background: d.color || color, maxWidth: 28, opacity: hover === null || hover === i ? 1 : 0.55, transition: "opacity .15s" }}
            />
            <span className="text-[10px] text-slate-400 mt-1.5 text-center truncate w-full">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// Donut de 2 (ou mais) categorias, com legenda + rótulo direto de valor/%.
function DonutChart({ data, size = 150, strokeWidth = 26 }) {
  const total = data.reduce((acc, d) => acc + d.value, 0) || 1;
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const [hover, setHover] = useState(null);
  let offset = 0;
  return (
    <div className="flex items-center gap-6 flex-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={strokeWidth} />
          {data
            .filter((d) => d.value > 0)
            .map((d, i) => {
              const frac = d.value / total;
              const dash = frac * c;
              const el = (
                <circle
                  key={i}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={d.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${Math.max(dash - 2, 0)} ${c - dash + 2}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="round"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  style={{ cursor: "pointer", opacity: hover === null || hover === i ? 1 : 0.45, transition: "opacity .15s" }}
                />
              );
              offset += dash;
              return el;
            })}
        </g>
        <text x="50%" y="47%" textAnchor="middle" className="fill-slate-700" style={{ fontSize: 22, fontWeight: 600 }}>
          {total}
        </text>
        <text x="50%" y="63%" textAnchor="middle" className="fill-slate-400" style={{ fontSize: 10 }}>
          cliente{total === 1 ? "" : "s"}
        </text>
      </svg>
      <ul className="space-y-2 text-xs">
        {data.map((d, i) => (
          <li
            key={i}
            className="flex items-center gap-2"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            style={{ opacity: hover === null || hover === i ? 1 : 0.55, transition: "opacity .15s" }}
          >
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
            <span className="text-slate-600">{d.label}</span>
            <span className="text-slate-400 tabular-nums">
              {d.value} ({Math.round((d.value / total) * 100)}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
