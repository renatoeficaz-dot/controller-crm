import PDFDocument from "pdfkit";

function valor(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "object") return null;
  const s = String(v).trim();
  return s === "" || s === "Invalid Date" ? null : s;
}

function first(...values) {
  for (const v of values) {
    const out = valor(v);
    if (out) return out;
  }
  return null;
}

// Normaliza tanto data ISO ("1958-06-19T03:00:00.000Z") quanto "dd/mm/yyyy"
// já pronta (alguns campos da API já vêm formatados, outros não).
function fmtDate(v) {
  const s = valor(v);
  if (!s) return null;
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function moeda(v) {
  const s = valor(v);
  if (!s) return null;
  const n = Number(String(s).replace(/[^\d.,-]/g, "").replace(",", "."));
  if (Number.isNaN(n)) return s;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function writeSection(doc, title) {
  if (doc.y > 720) doc.addPage();
  doc.moveDown(0.8);
  doc.font("Helvetica-Bold").fontSize(13).fillColor("#111827").text(title);
  doc.moveDown(0.2);
  doc.strokeColor("#d1d5db").moveTo(doc.x, doc.y).lineTo(555, doc.y).stroke();
  doc.moveDown(0.45);
}

function writeField(doc, label, value) {
  const text = valor(value);
  if (!text) return;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#374151").text(`${label}: `, { continued: true });
  doc.font("Helvetica").fillColor("#111827").text(text);
}

function writeList(doc, items, render, limit = 30) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    doc.font("Helvetica").fontSize(9).fillColor("#6b7280").text("Nenhum registro retornado.");
    return;
  }
  let n = 0;
  for (const item of list.slice(0, limit)) {
    const text = render(item);
    if (!text) continue;
    n++;
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#111827").text(`${n}. `, { continued: true });
    doc.font("Helvetica").text(text);
  }
  if (!n) {
    doc.font("Helvetica").fontSize(9).fillColor("#6b7280").text("Nenhum registro retornado.");
  } else if (list.length > limit) {
    doc.font("Helvetica").fontSize(9).fillColor("#6b7280").text(`+ ${list.length - limit} registros nao exibidos neste resumo.`);
  }
}

// Rótulos em português dos flags booleanos de "propensões" — só mostra os
// que vieram truthy (a API manda um objeto com dezenas de flags 0/1).
const PROPENSAO_LABEL = {
  turismo: "Turismo", luxo: "Consumo de Luxo", tvcabo: "TV a Cabo", bandalarga: "Banda Larga",
  credimob: "Credito Imobiliario", comprainternet: "Compra pela Internet", consignado: "Credito Consignado",
  clipremium: "Cliente Premium", mobile: "Usuario Mobile", segauto: "Seguro Auto", finanauto: "Financiamento Auto",
  credpessoal: "Credito Pessoal", investidor: "Investidor", tomador: "Tomador de Credito",
  prevprivada: "Previdencia Privada", internetbanking: "Internet Banking", cartaocredito: "Cartao de Credito",
  cartaoprime: "Cartao Prime", varioscartoes: "Varios Cartoes", segsaude: "Seguro Saude", segvida: "Seguro Vida",
  segcasa: "Seguro Residencial", celpos: "Celular Pos-pago", celpre: "Celular Pre-pago", highuser: "High User",
  milhas: "Programa de Milhas", cinefilo: "Cinefilo", casapropria: "Casa Propria",
  transportepublico: "Usuario de Transporte Publico", jogaonline: "Joga Online", videogame: "Videogame",
  leitordigital: "Leitor Digital", cacadesconto: "Cacador de Descontos", adiantado: "Pagador Adiantado",
  fitness: "Fitness",
};

// Formato real da resposta da API do Detetive Forense (confirmado direto na
// consulta em produção) — os dados da pessoa ficam aninhados em
// consulta.cadastral, não soltos em consulta.* como a 1a versão assumia.
// Cobre as mesmas seções do relatório completo baixado direto do site
// (identidades, CNH, escolaridade, veiculos, empregos, contas, emprestimos,
// vacinas, IRPF, CCF etc.) usando os mesmos dados já retornados na consulta.
export async function gerarPuxadaPdfBuffer(resultado) {
  const consulta = resultado?.consulta || {};
  const cad = consulta.cadastral || {};
  const cpf = first(resultado?.cpf, cad.cpfMask, cad.cpf);
  const nome = first(cad.nome, cad.nomeSocial);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(20).fillColor("#064e3b").text("Puxada - Detetive Forense");
    doc.font("Helvetica").fontSize(9).fillColor("#6b7280").text(`Gerado em ${new Date().toLocaleString("pt-BR")}`);
    doc.moveDown(0.7);
    doc.font("Helvetica-Bold").fontSize(15).fillColor("#111827").text(nome || "Titular nao identificado");
    doc.font("Helvetica").fontSize(10).fillColor("#374151").text(`CPF: ${cpf || "nao informado"}`);

    writeSection(doc, "Dados cadastrais");
    writeField(doc, "Nome", nome);
    writeField(doc, "Nome social", cad.nomeSocial);
    writeField(doc, "CPF", cpf);
    writeField(doc, "Nascimento", fmtDate(cad.dataNasc));
    writeField(doc, "Idade", cad.idade);
    writeField(doc, "Mae", cad.mae?.nome);
    writeField(doc, "Pai", cad.pai?.nome && cad.pai.nome !== "N/a" ? cad.pai.nome : null);
    writeField(doc, "Sexo", cad.sexo === "M" ? "Masculino" : cad.sexo === "F" ? "Feminino" : cad.sexo);
    writeField(doc, "Naturalidade", cad.naturalidade);
    writeField(doc, "Renda presumida", moeda(cad.renda));
    writeField(doc, "Classe social", first(cad.classeSocial, cad.subClasseSocial));
    writeField(doc, "Titulo de eleitor", cad.tituloEleitor?.numero);
    writeField(doc, "CNS", cad.cns);
    writeField(doc, "PIS", cad.pis);
    writeField(doc, "CTPS", first(cad.ctps?.numero && `${cad.ctps.numero}${cad.ctps.serie ? " / serie " + cad.ctps.serie : ""}`));

    writeSection(doc, "Identidades (RG)");
    writeList(doc, consulta.rgs, (r) => [r.rg, r.orgaorg, r.ufrg].filter(Boolean).join(" - "));

    if (consulta.cnh) {
      writeSection(doc, "CNH");
      writeField(doc, "Registro", consulta.cnh.registro);
      writeField(doc, "1a habilitacao", fmtDate(consulta.cnh.data_primeira_cnh));
      writeField(doc, "UF", consulta.cnh.uf_cnh);
    }

    writeSection(doc, "Escolaridade");
    writeList(doc, consulta.escolaridade, (e) => (typeof e === "string" ? e : e.nivel));

    writeSection(doc, "Enderecos");
    writeList(doc, consulta.enderecos, (e) => {
      const linha1 = [e.endereco, e.numero, e.complemento].filter(Boolean).join(", ");
      const linha2 = [e.bairro, e.cidade, e.uf, e.cep].filter(Boolean).join(" - ");
      return [linha1, linha2].filter(Boolean).join(" | ");
    });

    writeSection(doc, "Telefones");
    writeList(doc, consulta.telefones, (t) => {
      const partes = [t.telefone, t.flagWhatsApp ? "WhatsApp" : null, t.classificacao].filter(Boolean);
      return partes.join(" - ");
    });

    writeSection(doc, "Emails");
    // Nao inclui o campo "password" que a API às vezes retorna (vazamentos) —
    // não deve ir pra um documento anexado ao lead.
    writeList(doc, consulta.emails, (e) => [e.email, e.avaliacao].filter(Boolean).join(" - "));

    writeSection(doc, "Vinculos e familiares");
    writeList(
      doc,
      consulta.parentes,
      (p) => [p.nome, p.grau, p.cpfParente].filter(Boolean).join(" - "),
      30
    );

    if (Array.isArray(consulta.relacionadosPorEndereco) && consulta.relacionadosPorEndereco.length) {
      writeSection(doc, "Possiveis parentes por endereco");
      writeList(
        doc,
        consulta.relacionadosPorEndereco,
        (p) => [p.nome, p.cpf, p.profissao, `${p.cidade || ""}/${p.uf || ""}`].filter(Boolean).join(" - "),
        20
      );
    }

    writeSection(doc, "Profissoes");
    writeList(doc, consulta.profissoes, (p) => p.descricao);

    writeSection(doc, "Veiculos");
    writeList(doc, consulta.placas, (v) => [v.placa, v.modelo, v.anoModelo].filter(Boolean).join(" - "));

    writeSection(doc, "Empregos");
    writeList(
      doc,
      consulta.empregos,
      (e) =>
        [
          e.razao_social,
          e.descricao_cbo,
          moeda(e.salario),
          fmtDate(e.data_admissao) && `Admissao: ${fmtDate(e.data_admissao)}`,
          fmtDate(e.data_demissao) ? `Demissao: ${fmtDate(e.data_demissao)}` : "Atual",
        ]
          .filter(Boolean)
          .join(" | "),
      15
    );

    writeSection(doc, "Beneficios (INSS)");
    writeList(doc, consulta.beneficios, (b) => `NB ${b.nb}${b.dataInicioBeneficio ? " - inicio " + b.dataInicioBeneficio : ""}`);

    writeSection(doc, "Contas em banco");
    writeList(doc, consulta.contasBancos, (c) => [c.banco, c.agencia && `Ag. ${c.agencia}`, c.conta && `Conta ${c.conta}`].filter(Boolean).join(" - "));

    writeSection(doc, "Emprestimos");
    writeList(
      doc,
      consulta.emprestimos,
      (e) => [e.banco, moeda(e.valor), e.quantidadeParcelas && `${e.quantidadeParcelas}x`, e.quitado ? "Quitado" : "Em aberto"].filter(Boolean).join(" - "),
      15
    );

    writeSection(doc, "Planos moveis");
    writeList(doc, consulta.planosMoveis, (p) => [p.telefone, p.operadora, p.plano].filter(Boolean).join(" - "));

    writeSection(doc, "Vacinas");
    writeList(
      doc,
      consulta.vacinas,
      (v) => [v.vacina_nome, v.vacina_dose, fmtDate(v.vacina_dt_aplicacao)].filter(Boolean).join(" - "),
      15
    );

    if (Array.isArray(consulta.ccf) && consulta.ccf.length) {
      writeSection(doc, "Cheques sem fundo (CCF)");
      writeList(doc, consulta.ccf, (c) => [c.nomeBanco, `Ag. ${c.agencia}`, fmtDate(c.dataRestricao)].filter(Boolean).join(" - "));
    }

    if (Array.isArray(consulta.irpf) && consulta.irpf.length) {
      writeSection(doc, "Imposto de renda (IRPF)");
      writeList(doc, consulta.irpf, (i) => [i.ano, i.situacao].filter(Boolean).join(" - "), 15);
    }

    if (Array.isArray(consulta.credenciaisVazadas) && consulta.credenciaisVazadas.length) {
      writeSection(doc, "Possiveis credenciais vazadas");
      // So mostra email/host/data — nunca a senha, mesmo que a API retorne.
      for (const grupo of consulta.credenciaisVazadas) {
        const resultados = Array.isArray(grupo.resultados) ? grupo.resultados : [];
        writeField(doc, valor(grupo.valor), `${resultados.length} vazamento(s) encontrado(s)`);
        writeList(doc, resultados, (r) => [r.host, r.file_date].filter(Boolean).join(" - "), 5);
        doc.moveDown(0.2);
      }
    }

    const propensoesAtivas = Object.entries(consulta.propensoes || {})
      .filter(([k, v]) => PROPENSAO_LABEL[k] && v)
      .map(([k]) => PROPENSAO_LABEL[k]);
    if (propensoesAtivas.length) {
      writeSection(doc, "Propensoes");
      doc.font("Helvetica").fontSize(9).fillColor("#111827").text(propensoesAtivas.join(", "));
    }

    writeSection(doc, "Processos");
    const processos = Array.isArray(resultado?.processosCache?.content) ? resultado.processosCache.content : [];
    writeList(
      doc,
      processos,
      (p) => {
        const t = p.tramitacoes?.[0];
        const classe = t?.classe?.[0]?.descricao;
        const assunto = t?.assunto?.[0]?.descricao;
        return [p.numeroProcesso, p.siglaTribunal, classe, assunto].filter(Boolean).join(" - ");
      },
      15
    );

    doc.moveDown(1);
    doc.font("Helvetica").fontSize(8).fillColor("#6b7280")
      .text("Relatorio anexado automaticamente ao CRM a partir da consulta autorizada no Detetive Forense.");

    doc.end();
  });
}
