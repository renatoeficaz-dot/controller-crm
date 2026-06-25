import Link from "next/link";

const money = (n) =>
  "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const pct = (n) =>
  Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";

const dt = (iso) =>
  iso
    ? new Date(iso)
        .toLocaleString("pt-BR", {
          day: "2-digit", month: "2-digit", year: "numeric",
          hour: "2-digit", minute: "2-digit", second: "2-digit",
        })
        .replace(",", "")
    : "—";

// Linha de valor (label + subtítulo + valor colorido)
function MoneyRow({ label, hint, value, sign }) {
  const color = sign === "+" ? "text-emerald-600" : "text-red-500";
  return (
    <div className="flex items-start justify-between py-3 border-b border-slate-100 last:border-0">
      <div>
        <p className="text-sm text-slate-700">{label}</p>
        {hint && <p className="text-xs text-slate-400">{hint}</p>}
      </div>
      <p className={`text-sm font-semibold whitespace-nowrap ${color}`}>
        {sign} {money(value)}
      </p>
    </div>
  );
}

// Linha simples label/valor (cards Desempenho e Informação)
function Row({ label, value, valueClass = "text-emerald-600", hint }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-600">{label}</span>
      <span className={`text-sm font-semibold text-right ${valueClass}`}>
        {value}
        {hint && <span className="block text-xs font-normal text-slate-400">{hint}</span>}
      </span>
    </div>
  );
}

export default function UnitDetail({ unit }) {
  // Derivados
  const vendasTotais = (unit.novasVendas || 0) + (unit.vendasRenovadas || 0);
  const pastaFim = (unit.pastaInicial || 0) - (unit.colecao || 0);
  const variacao = unit.pastaInicial ? ((pastaFim - unit.pastaInicial) / unit.pastaInicial) * 100 : 0;
  const portfolio = unit.pastaInicial ? ((unit.colecao || 0) / unit.pastaInicial) * 100 : 0;
  const conformidade = unit.alegadamente ? ((unit.colecao || 0) / unit.alegadamente) * 100 : 0;
  const eficiencia = unit.credAtivos ? ((unit.movPagamentos || 0) / unit.credAtivos) * 100 : 0;

  const tabs = ["Unidade", "Dispositivo", "Usuários", "Cobrança"];

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-slate-800">
          {unit.number} - {unit.name}
        </h1>
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-700">
          ← Voltar para Rutas
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* ---------- DINHEIRO ATUAL (roxo) ---------- */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-br from-purple-700 to-purple-500 text-white p-5">
            <h2 className="text-sm font-medium opacity-90">Dinheiro Atual</h2>
            <div className="mt-6 text-right">
              <span className="text-xs align-middle mr-1 opacity-80">BRL</span>
              <span className="text-3xl font-bold">{money(unit.caixaFinal)}</span>
            </div>
            <div className="mt-3 flex justify-center">
              <span className="bg-white/95 text-slate-600 text-xs rounded-full px-3 py-1 shadow">
                {dt(unit.ultimaSync)}
              </span>
            </div>
          </div>
          <div className="p-5">
            <MoneyRow label="Caixa inicial" hint="Dinheiro disponível ao abrir o caixa" value={unit.caixaInicial} sign="+" />
            <MoneyRow label="Novas vendas" hint={`R$ ${unit.novasVendas} novas vendas registradas`} value={unit.novasVendas} sign="-" />
            <MoneyRow label="Vendas renovadas" hint={`R$ ${unit.vendasRenovadas} Vendas renovadas registradas`} value={unit.vendasRenovadas} sign="-" />
            <MoneyRow label="Vendas totais" hint={`Vendas registradas em R$ ${vendasTotais}`} value={vendasTotais} sign="-" />
            <MoneyRow label="Coleção" hint="Total em dinheiro recebido dos clientes" value={unit.colecao} sign="+" />
            <MoneyRow label="Renda" hint="Dinheiro adicionado ao caixa" value={unit.renda} sign="+" />
            <MoneyRow label="Contas" hint="Total em dinheiro usado para despesas" value={unit.contas} sign="-" />
            <MoneyRow label="Retiradas" hint="Total retirado" value={unit.retiradas} sign="-" />
          </div>
        </section>

        {/* ---------- DESEMPENHO (laranja) ---------- */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-amber-400 text-white p-5">
            <h2 className="text-sm font-medium">Desempenho</h2>
          </div>
          <div className="p-5 space-y-4">
            <div className="rounded-lg border border-slate-100 p-3">
              <p className="text-xs font-semibold text-slate-400 mb-1">Pasta</p>
              <Row label="Fim" value={money(pastaFim)} />
              <Row label="Variação" value={pct(variacao)} valueClass={variacao < 0 ? "text-red-500" : "text-emerald-600"} />
              <Row label="Inicial" value={money(unit.pastaInicial)} />
              <Row label="Portfólio Colecionado" value={pct(portfolio)} />
            </div>
            <div className="rounded-lg border border-slate-100 p-3">
              <p className="text-xs font-semibold text-slate-400 mb-1">Coleção</p>
              <Row label="Alegadamente" value={money(unit.alegadamente)} />
              <Row label="Clientes para coletar" value={unit.clientesParaColetar} />
              <Row label="Coleção" value={money(unit.colecao)} />
              <Row label="Receita adicional" value={money(unit.receitaAdicional)} />
              <Row label="Conformidade" value={pct(conformidade)} />
              <Row label="% Receita Unitária" value={pct(conformidade)} hint={money(unit.colecao)} />
              <Row label="Receita extra" value={money(unit.receitaExtra)} />
              <Row label="Clientes sem agendamento" value={unit.clientesSemAgendamento} valueClass="text-slate-700" />
            </div>
          </div>
        </section>

        {/* ---------- INFORMAÇÃO (azul) ---------- */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-indigo-500 text-white p-5">
            <h2 className="text-sm font-medium mb-4">Informação</h2>
            <div className="grid grid-cols-4 gap-2">
              {tabs.map((t, i) => (
                <button
                  key={t}
                  className={`rounded-md py-2 text-xs font-medium border border-white/40 ${
                    i === 0 ? "bg-white/20" : "bg-white/5 hover:bg-white/15"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="p-5 text-sm">
            <p className="font-semibold text-slate-800">Caixa CN {unit.number}</p>
            <div className="grid grid-cols-3 gap-3 mt-2">
              <div>
                <p className="text-slate-500">Caixa UGI {unit.caixa ?? "—"}</p>
                <p className="text-xs text-slate-400 mt-2">Data de abertura</p>
                <p className="text-xs text-slate-600">{dt(unit.dataAbertura)}</p>
              </div>
              <div>
                <p className="text-slate-500">Trabalhador:</p>
                <p className="text-xs text-slate-400 mt-2">Comece pelo seu dispositivo móvel.</p>
                <p className="text-xs text-slate-600">{dt(unit.dataDispositivo)}</p>
              </div>
              <div>
                <p className="text-slate-700">{unit.trabalhador || "—"}</p>
                <p className="text-xs text-slate-400 mt-2">Data de encerramento</p>
                <p className="text-xs text-slate-600">{dt(unit.dataEncerramento)}</p>
              </div>
            </div>

            <p className="font-semibold text-slate-700 mt-5 mb-2">Créditos</p>
            <div className="grid grid-cols-3 gap-y-3 text-xs">
              <Stat label="Para aumentar" value={unit.credParaAumentar} />
              <Stat label="Sem horário definido" value={unit.credSemHorario} />
              <Stat label="Novo" value={unit.credNovo} />
              <Stat label="Cancelado" value={unit.credCancelado} color="text-red-500" />
              <Stat label="Ativos" value={unit.credAtivos} />
            </div>

            <p className="font-semibold text-slate-700 mt-5 mb-2">Movimento de Crédito</p>
            <div className="grid grid-cols-3 gap-y-3 text-xs">
              <Stat label="Pagamentos" value={unit.movPagamentos} />
              <Stat label="Eu não pago" value={unit.movEuNaoPago} />
              <Stat label="Sincronizado" value={unit.movSincronizado} />
            </div>
            <div className="mt-3 text-xs">
              <p className="text-slate-500">Eficiência do Cliente</p>
              <p className="font-semibold text-emerald-600">{pct(eficiencia)}</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, color = "text-emerald-600" }) {
  return (
    <div>
      <p className="text-slate-500">{label}</p>
      <p className={`font-semibold ${color}`}>{value}</p>
    </div>
  );
}
