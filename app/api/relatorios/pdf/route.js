import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { getCurrentUser, podeAcessarPagina } from "@/lib/session";

export const runtime = "nodejs";

const money = (n) =>
  "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function secao(doc, titulo) {
  if (doc.y > 700) doc.addPage();
  doc.moveDown(0.7);
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#111827").text(titulo);
  doc.moveDown(0.15);
  doc.strokeColor("#d1d5db").moveTo(doc.x, doc.y).lineTo(555, doc.y).stroke();
  doc.moveDown(0.4);
}

function campo(doc, label, valor) {
  if (valor === null || valor === undefined || valor === "") return;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#374151").text(`${label}: `, { continued: true });
  doc.font("Helvetica").fillColor("#111827").text(String(valor));
}

// Tabela simples com larguras fixas — pdfkit não tem tabela nativa.
function tabela(doc, colunas, linhas) {
  if (!linhas?.length) {
    doc.font("Helvetica").fontSize(9).fillColor("#6b7280").text("Nenhum registro.");
    return;
  }
  const larguras = colunas.map((c) => c.largura || 90);
  const x0 = doc.x;

  const escreverLinha = (valores, negrito, cor) => {
    if (doc.y > 760) doc.addPage();
    const y = doc.y;
    let x = x0;
    doc.font(negrito ? "Helvetica-Bold" : "Helvetica").fontSize(8).fillColor(cor || "#111827");
    valores.forEach((v, i) => {
      doc.text(String(v ?? ""), x, y, { width: larguras[i], align: i === 0 ? "left" : "right" });
      x += larguras[i];
    });
    doc.x = x0;
    doc.y = y + 13;
  };

  escreverLinha(colunas.map((c) => c.label), true, "#374151");
  for (const l of linhas) escreverLinha(colunas.map((c) => l[c.chave]), false);
}

// Gera o PDF a partir dos indicadores que o front já calculou — refazer as
// contas aqui abriria espaço pro relatório impresso divergir da tela.
export async function POST(req) {
  const user = await getCurrentUser();
  if (!podeAcessarPagina(user, "relatorios")) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }

  const d = await req.json().catch(() => ({}));

  const pdf = await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(19).fillColor("#064e3b").text("Relatório — Controller CRM");
    doc.font("Helvetica").fontSize(9).fillColor("#6b7280")
      .text(`Gerado em ${new Date().toLocaleString("pt-BR")}`);
    if (d.periodo) doc.text(`Período: ${d.periodo}`);
    if (d.filtros) doc.text(`Filtros: ${d.filtros}`);

    secao(doc, "Visão geral");
    campo(doc, "Novas vendas no período", d.novasVendas);
    campo(doc, "Renovações (ciclo > 1)", d.renovacoes);
    campo(doc, "A receber hoje", d.receberDia != null ? money(d.receberDia) : null);
    campo(doc, "A receber na semana", d.receberSemana != null ? money(d.receberSemana) : null);
    campo(doc, "A receber no mês", d.receberMes != null ? money(d.receberMes) : null);
    campo(doc, "Total recebido no período", d.recebido != null ? money(d.recebido) : null);
    campo(doc, "Inadimplência — pendente em capital", d.inadCapital != null ? money(d.inadCapital) : null);
    campo(doc, "Inadimplência — pendente total", d.inadTotal != null ? money(d.inadTotal) : null);
    campo(doc, "Clientes adimplentes", d.adimplentes);
    campo(doc, "Clientes inadimplentes", d.inadimplentes);

    if (d.giro) {
      secao(doc, "Velocidade e giro do capital");
      campo(doc, "Capital na rua", money(d.giro.capitalNaRua));
      campo(doc, "Emprestado no período", money(d.giro.emprestadoNoPeriodo));
      campo(doc, "Giro no período", `${d.giro.giro}x`);
      campo(doc, "Tempo médio até liberar", d.tempoMedioLiberacao != null ? `${d.tempoMedioLiberacao} dias` : null);
    }

    if (d.aging?.length) {
      secao(doc, "Aging da carteira");
      tabela(doc, [
        { chave: "label", label: "Faixa de atraso", largura: 150 },
        { chave: "valorFmt", label: "Valor", largura: 120 },
        { chave: "parcelas", label: "Parcelas", largura: 80 },
        { chave: "clientes", label: "Clientes", largura: 80 },
      ], d.aging.map((f) => ({ ...f, valorFmt: money(f.value) })));
    }

    if (d.safras?.length) {
      secao(doc, "Curva de safra");
      tabela(doc, [
        { chave: "mes", label: "Safra", largura: 80 },
        { chave: "clientes", label: "Clientes", largura: 65 },
        { chave: "empFmt", label: "Emprestado", largura: 100 },
        { chave: "recFmt", label: "Recuperado", largura: 100 },
        { chave: "pctFmt", label: "% Recup.", largura: 70 },
        { chave: "paybackFmt", label: "Payback", largura: 70 },
      ], d.safras.map((s) => ({
        ...s,
        empFmt: money(s.emprestado),
        recFmt: money(s.recuperado),
        pctFmt: `${s.pctRecuperado}%`,
        paybackFmt: s.diasMedios != null ? `${s.diasMedios}d` : "—",
      })));
    }

    if (d.porCiclo?.length) {
      secao(doc, "Comportamento por ciclo");
      tabela(doc, [
        { chave: "rotulo", label: "Ciclo", largura: 110 },
        { chave: "clientes", label: "Clientes", largura: 60 },
        { chave: "empFmt", label: "Emprestado", largura: 95 },
        { chave: "recFmt", label: "Recebido", largura: 95 },
        { chave: "lucroFmt", label: "Lucro", largura: 95 },
        { chave: "inadFmt", label: "% Inad.", largura: 60 },
      ], d.porCiclo.map((c) => ({
        ...c,
        empFmt: money(c.emprestado),
        recFmt: money(c.recebido),
        lucroFmt: money(c.lucro),
        inadFmt: `${c.pctInad}%`,
      })));
    }

    if (d.comparativo?.length) {
      secao(doc, "Comparativo mês a mês");
      tabela(doc, [
        { chave: "mes", label: "Mês", largura: 80 },
        { chave: "vendas", label: "Vendas", largura: 60 },
        { chave: "libFmt", label: "Liberado", largura: 100 },
        { chave: "recFmt", label: "Recebido", largura: 100 },
        { chave: "ticketFmt", label: "Ticket médio", largura: 100 },
        { chave: "deltaFmt", label: "Δ Receb.", largura: 65 },
      ], d.comparativo.map((m) => ({
        ...m,
        libFmt: money(m.liberado),
        recFmt: money(m.recebido),
        ticketFmt: money(m.ticketMedio),
        deltaFmt: m.deltaRecebido == null ? "—" : `${m.deltaRecebido >= 0 ? "+" : ""}${m.deltaRecebido}%`,
      })));
    }

    doc.moveDown(1);
    doc.font("Helvetica").fontSize(8).fillColor("#6b7280")
      .text("Relatório gerado pelo Controller CRM.");
    doc.end();
  });

  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="relatorio-${new Date().toLocaleDateString("en-CA")}.pdf"`,
    },
  });
}
