"use client";

import { useEffect, useState } from "react";
import Icone from "@/components/Icones";
import ContactModal from "@/components/ContactModal";

const money = (n) => "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDia = (d) => new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" });

function Cartao({ icone, titulo, subtitulo, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
          <Icone nome={icone} className="w-4 h-4" />
        </span>
        <h3 className="text-sm font-semibold text-slate-800">{titulo}</h3>
      </div>
      {subtitulo && <p className="text-[11px] text-slate-400 mb-3">{subtitulo}</p>}
      {children}
    </div>
  );
}

// Itens 213, 214, 215, 217, 218, 220, 287, 288, 289, 292, 297, 298, 300 —
// bloco de análises avançadas (só admin, a API já recusa quem não é).
export default function RelatoriosAvancado() {
  const [dados, setDados] = useState(null);
  const [openContactId, setOpenContactId] = useState(null);

  useEffect(() => {
    fetch("/api/relatorios/avancado").then((r) => (r.ok ? r.json() : null)).then(setDados).catch(() => setDados(null));
  }, []);

  if (!dados) return null;
  const {
    melhorHorario, curvaRecuperacao, concentracao, diaDoMes, efeitoDesconto,
    inadimplencia, identidadesCompartilhadas, atrasoAmanha, resumoSemanal,
    quitados, pertoQuitar, evolucaoCiclo,
  } = dados;

  const maxHora = Math.max(1, ...melhorHorario.horas.map((h) => h.qtd));
  const maxDiaMes = Math.max(1, ...diaDoMes.map((d) => d.qtd));

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-slate-500 pt-2">Análises avançadas</h2>

      <div className="grid md:grid-cols-2 gap-4">
        <Cartao icone="relogio" titulo="Melhor horário para cobrar" subtitulo="Quando o cliente costuma responder mensagem — cobrar nesse horário tende a dar mais retorno.">
          {melhorHorario.total === 0 ? (
            <p className="text-xs text-slate-400">Sem mensagens de clientes ainda.</p>
          ) : (
            <>
              <div className="flex items-end gap-0.5 h-16">
                {melhorHorario.horas.map((h) => (
                  <div key={h.hora} title={`${h.hora}h — ${h.qtd} resposta(s)`} className="flex-1 bg-emerald-400 rounded-t" style={{ height: `${Math.max(4, (h.qtd / maxHora) * 100)}%` }} />
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">0h — 23h</p>
              <p className="text-xs text-emerald-700 font-medium mt-2">
                Picos: {melhorHorario.melhores.map((h) => `${h.hora}h`).join(", ") || "—"}
              </p>
            </>
          )}
        </Cartao>

        <Cartao icone="grafico" titulo="Curva de recuperação por faixa de atraso" subtitulo="De tudo que já chegou a essa faixa, quanto % acabou pago.">
          <ul className="space-y-1.5">
            {curvaRecuperacao.map((f) => (
              <li key={f.label} className="flex items-center justify-between text-xs">
                <span className="text-slate-500">{f.label}</span>
                <span className="text-slate-700">
                  {f.total === 0 ? "—" : `${f.pctRecuperado}% (${f.pagas}/${f.total})`}
                </span>
              </li>
            ))}
          </ul>
        </Cartao>

        <Cartao icone="alerta" titulo="Concentração de risco (top 10)" subtitulo="Os clientes com mais dinheiro em aberto — se travarem juntos, é o pior cenário.">
          {concentracao.top10.length === 0 ? (
            <p className="text-xs text-slate-400">Ninguém com saldo em aberto.</p>
          ) : (
            <>
              <p className="text-xs text-amber-600 font-medium mb-2">
                {concentracao.top10.length === 1 ? "Esse cliente concentra" : `Esses ${concentracao.top10.length} concentram`} {concentracao.pctConcentrado}% de tudo que está em aberto ({money(concentracao.somaTop10)} de {money(concentracao.totalCarteira)}).
              </p>
              <ul className="divide-y divide-slate-50">
                {concentracao.top10.map((c) => (
                  <li key={c.id} className="py-1.5 flex items-center justify-between text-xs">
                    <span className="text-slate-600 truncate">{c.nome}</span>
                    <span className="font-medium text-slate-700 shrink-0 ml-2">{money(c.emAberto)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Cartao>

        <Cartao icone="calendario" titulo="Dia do mês que mais recebe" subtitulo="Ajuda a saber se vale concentrar cobrança perto de datas de salário/benefício.">
          <div className="flex items-end gap-px h-16">
            {diaDoMes.map((d) => (
              <div key={d.dia} title={`Dia ${d.dia} — ${d.qtd} pagamento(s), ${money(d.valor)}`} className="flex-1 bg-sky-400 rounded-t" style={{ height: `${Math.max(4, (d.qtd / maxDiaMes) * 100)}%` }} />
            ))}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Dia 1 — 31</p>
        </Cartao>

        <Cartao icone="dinheiro" titulo="Efeito do desconto na quitação à vista" subtitulo="Quanto o desconto custou, e se as pessoas costumam aceitar quando oferecido.">
          {efeitoDesconto.qtdAceitos + efeitoDesconto.qtdRecusados === 0 ? (
            <p className="text-xs text-slate-400">Nenhum desconto oferecido ainda.</p>
          ) : (
            <ul className="space-y-1 text-xs text-slate-600">
              <li>Taxa de aceite: <strong className="text-slate-800">{efeitoDesconto.taxaAceite}%</strong> ({efeitoDesconto.qtdAceitos} de {efeitoDesconto.qtdAceitos + efeitoDesconto.qtdRecusados})</li>
              <li>Total descontado: <strong className="text-red-600">{money(efeitoDesconto.totalDescontado)}</strong> ({efeitoDesconto.pctMedioDesconto}% em média)</li>
              <li>Recebido com desconto: <strong className="text-slate-800">{money(efeitoDesconto.totalNegociado)}</strong> de {money(efeitoDesconto.totalOriginal)} original</li>
            </ul>
          )}
        </Cartao>

        <Cartao icone="grafico" titulo="Evolução do valor a cada renovação" subtitulo="Valor médio de capital emprestado, por número do ciclo (1º empréstimo, 1ª renovação...).">
          {evolucaoCiclo.length === 0 ? (
            <p className="text-xs text-slate-400">Sem dados ainda.</p>
          ) : (
            <ul className="space-y-1">
              {evolucaoCiclo.map((c) => (
                <li key={c.ciclo} className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Ciclo {c.ciclo} ({c.qtd} cliente{c.qtd === 1 ? "" : "s"})</span>
                  <span className="font-medium text-slate-700">{money(c.valorMedio)}</span>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>

      <Cartao icone="pessoas" titulo="Previsão de inadimplência por perfil" subtitulo="Taxa histórica de atraso (mais de 5 dias) por estado, gênero e tipo de cliente.">
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { titulo: "Por estado", lista: inadimplencia.porEstado },
            { titulo: "Por gênero", lista: inadimplencia.porGenero },
            { titulo: "Por tipo de cliente", lista: inadimplencia.porTipoCliente },
          ].map((bloco) => (
            <div key={bloco.titulo}>
              <p className="text-xs font-medium text-slate-600 mb-1.5">{bloco.titulo}</p>
              <ul className="space-y-1">
                {bloco.lista.slice(0, 6).map((g) => (
                  <li key={g.chave} className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 truncate">{g.chave}</span>
                    <span className={`font-medium shrink-0 ml-2 ${g.taxaAtraso > 40 ? "text-red-600" : g.taxaAtraso > 15 ? "text-amber-600" : "text-emerald-600"}`}>
                      {g.taxaAtraso}%
                    </span>
                  </li>
                ))}
                {bloco.lista.length === 0 && <li className="text-xs text-slate-400">Sem dados.</li>}
              </ul>
            </div>
          ))}
        </div>
      </Cartao>

      {identidadesCompartilhadas.length > 0 && (
        <Cartao icone="alerta" titulo="Possível identidade compartilhada" subtitulo='Mesmo telefone em cadastros com CPFs diferentes — pode ser cadastro duplicado, ou o mesmo "dono" por trás de mais de um CPF (laranja). Não é um bloqueio, é um alerta pra revisar.'>
          <ul className="space-y-2">
            {identidadesCompartilhadas.map((s) => (
              <li key={s.phone} className="text-xs">
                <span className="text-slate-500">{s.phone}:</span>{" "}
                {s.cadastros.map((c) => `${c.nome} (${c.cpf})`).join(" · ")}
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      <Cartao icone="cobranca" titulo="Provável atraso amanhã" subtitulo="Vence amanhã e já atrasou antes — prioriza esses na cobrança de hoje.">
        {atrasoAmanha.length === 0 ? (
          <p className="text-xs text-slate-400">Ninguém nessa situação amanhã.</p>
        ) : (
          <ul className="divide-y divide-slate-50">
            {atrasoAmanha.map((c) => (
              <li key={c.contactId} className="py-1.5 flex items-center justify-between text-xs">
                <span className="text-slate-600">{c.nome}</span>
                <span className="text-slate-400">{money(c.valor)} · atrasou {c.vezesAtrasouAntes}x antes</span>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <div className="grid md:grid-cols-2 gap-4">
        <Cartao icone="grafico" titulo="Resumo semanal da carteira" subtitulo="Últimos 7 dias vs os 7 anteriores.">
          <ul className="space-y-1.5 text-xs text-slate-600">
            <li>Vendas: <strong>{resumoSemanal.atual.vendas}</strong> {resumoSemanal.variacaoVendas != null && (
              <span className={resumoSemanal.variacaoVendas >= 0 ? "text-emerald-600" : "text-red-600"}>({resumoSemanal.variacaoVendas >= 0 ? "+" : ""}{resumoSemanal.variacaoVendas}%)</span>
            )}</li>
            <li>Valor recebido: <strong>{money(resumoSemanal.atual.valorRecebido)}</strong> {resumoSemanal.variacaoValorRecebido != null && (
              <span className={resumoSemanal.variacaoValorRecebido >= 0 ? "text-emerald-600" : "text-red-600"}>({resumoSemanal.variacaoValorRecebido >= 0 ? "+" : ""}{resumoSemanal.variacaoValorRecebido}%)</span>
            )}</li>
            <li>Valor vendido: <strong>{money(resumoSemanal.atual.valorVendido)}</strong></li>
          </ul>
        </Cartao>

        <Cartao icone="check" titulo="Quitados no mês" subtitulo="Clientes que terminaram de pagar o ciclo atual este mês.">
          {quitados.length === 0 ? (
            <p className="text-xs text-slate-400">Ninguém quitou este mês ainda.</p>
          ) : (
            <ul className="divide-y divide-slate-50 max-h-40 overflow-y-auto thin-scroll">
              {quitados.map((c) => (
                <li key={c.id} className="py-1.5 flex items-center justify-between text-xs">
                  <button type="button" onClick={() => setOpenContactId(c.id)} className="text-slate-600 hover:text-emerald-600 hover:underline truncate text-left">
                    {c.nome}
                  </button>
                  <span className="text-slate-400 shrink-0 ml-2">{fmtDia(c.quitadoEm)}</span>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>

      <Cartao icone="repetir" titulo="Perto de quitar (janela de renovação)" subtitulo="Faltam 1 ou 2 parcelas para terminar o ciclo — bom momento pra já sondar a renovação.">
        {pertoQuitar.length === 0 ? (
          <p className="text-xs text-slate-400">Ninguém nessa janela agora.</p>
        ) : (
          <ul className="divide-y divide-slate-50">
            {pertoQuitar.map((c) => (
              <li key={c.id} className="py-1.5 flex items-center justify-between text-xs">
                <button type="button" onClick={() => setOpenContactId(c.id)} className="text-slate-600 hover:text-emerald-600 hover:underline truncate text-left">
                  {c.nome}
                </button>
                <span className="text-slate-400 shrink-0 ml-2">falta{c.faltam === 1 ? "" : "m"} {c.faltam} de {c.totalParcelas}</span>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      {openContactId && (
        <ContactModal contactId={openContactId} onClose={() => setOpenContactId(null)} onChanged={() => {}} />
      )}
    </div>
  );
}
