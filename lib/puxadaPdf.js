import PDFDocument from "pdfkit";

function valor(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "object") return null;
  const s = String(v).trim();
  return s || null;
}

function first(...values) {
  for (const v of values) {
    const out = valor(v);
    if (out) return out;
  }
  return null;
}

function writeSection(doc, title) {
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

function writeList(doc, items, render, limit = 20) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    doc.font("Helvetica").fontSize(9).fillColor("#6b7280").text("Nenhum registro retornado.");
    return;
  }
  list.slice(0, limit).forEach((item, idx) => {
    const text = render(item);
    if (!text) return;
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#111827").text(`${idx + 1}. `, { continued: true });
    doc.font("Helvetica").text(text);
  });
  if (list.length > limit) {
    doc.font("Helvetica").fontSize(9).fillColor("#6b7280").text(`+ ${list.length - limit} registros nao exibidos neste resumo.`);
  }
}

// Formato real da resposta da API do Detetive Forense (confirmado direto na
// consulta em produção) — os dados da pessoa ficam aninhados em
// consulta.cadastral, não soltos em consulta.* como a 1a versão assumia
// (por isso o PDF antigo saía com "Titular nao identificado" e telefones com
// campos numéricos soltos concatenados por engano).
export async function gerarPuxadaPdfBuffer(resultado) {
  const consulta = resultado?.consulta || {};
  const cad = consulta.cadastral || {};
  const cpf = first(resultado?.cpf, cad.cpfMask, cad.cpf);
  const nome = first(cad.nome, cad.nomeSocial);
  const telefones = Array.isArray(consulta.telefones) ? consulta.telefones : [];
  const emails = Array.isArray(consulta.emails) ? consulta.emails : [];
  const enderecos = Array.isArray(consulta.enderecos) ? consulta.enderecos : [];
  const parentes = Array.isArray(consulta.parentes) ? consulta.parentes : [];
  const processos = Array.isArray(resultado?.processosCache?.content) ? resultado.processosCache.content : [];

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
    writeField(doc, "CPF", cpf);
    writeField(doc, "Nascimento", cad.dataNasc);
    writeField(doc, "Idade", cad.idade);
    writeField(doc, "Mae", cad.mae?.nome);
    writeField(doc, "Pai", cad.pai?.nome);
    writeField(doc, "Sexo", cad.sexo === "M" ? "Masculino" : cad.sexo === "F" ? "Feminino" : cad.sexo);
    writeField(doc, "Renda", cad.renda);
    writeField(doc, "Classe social", first(cad.classeSocial, cad.subClasseSocial));
    writeField(doc, "Escolaridade", cad.escolaridade);
    writeField(doc, "Naturalidade", cad.naturalidade);
    writeField(doc, "RG", first(cad.rg?.numero && `${cad.rg.numero}${cad.rg.orgao ? "/" + cad.rg.orgao : ""}`));
    writeField(doc, "Titulo de eleitor", cad.tituloEleitor?.numero);
    writeField(doc, "CNS", cad.cns);
    writeField(doc, "PIS", cad.pis);

    writeSection(doc, "Telefones");
    writeList(doc, telefones, (t) => {
      const partes = [t.telefone, t.flagWhatsApp ? "WhatsApp" : null, t.classificacao].filter(Boolean);
      return partes.join(" - ");
    });

    writeSection(doc, "Emails");
    // Nao inclui o campo "password" que a API às vezes retorna (vazamentos) —
    // não deve ir pra um documento anexado ao lead.
    writeList(doc, emails, (e) => [e.email, e.avaliacao].filter(Boolean).join(" - "));

    writeSection(doc, "Enderecos");
    writeList(doc, enderecos, (e) => {
      const linha1 = [e.endereco, e.numero, e.complemento].filter(Boolean).join(", ");
      const linha2 = [e.bairro, e.cidade, e.uf, e.cep].filter(Boolean).join(" - ");
      return [linha1, linha2].filter(Boolean).join(" | ");
    });

    writeSection(doc, "Vinculos e familiares");
    writeList(doc, parentes, (p) => [p.nome, p.grau].filter(Boolean).join(" - "), 15);

    writeSection(doc, "Processos");
    writeList(doc, processos, (p) => {
      const t = p.tramitacoes?.[0];
      const classe = t?.classe?.[0]?.descricao;
      const assunto = t?.assunto?.[0]?.descricao;
      return [p.numeroProcesso, p.siglaTribunal, classe, assunto].filter(Boolean).join(" - ");
    }, 15);

    doc.moveDown(1);
    doc.font("Helvetica").fontSize(8).fillColor("#6b7280")
      .text("Relatorio anexado automaticamente ao CRM a partir da consulta autorizada no Detetive Forense.");

    doc.end();
  });
}
