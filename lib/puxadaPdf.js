import PDFDocument from "pdfkit";

function valor(v) {
  if (v === null || v === undefined || v === "") return null;
  if (Array.isArray(v)) return v.length ? `${v.length} registros` : null;
  if (typeof v === "object") return null;
  return String(v);
}

function first(...values) {
  for (const v of values) {
    const out = valor(v);
    if (out) return out;
  }
  return null;
}

function normalizeArray(...values) {
  for (const value of values) {
    if (Array.isArray(value) && value.length) return value;
  }
  return [];
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
  if (!items.length) {
    doc.font("Helvetica").fontSize(9).fillColor("#6b7280").text("Nenhum registro retornado.");
    return;
  }
  items.slice(0, limit).forEach((item, idx) => {
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#111827").text(`${idx + 1}. `, { continued: true });
    doc.font("Helvetica").text(render(item));
  });
  if (items.length > limit) {
    doc.font("Helvetica").fontSize(9).fillColor("#6b7280").text(`+ ${items.length - limit} registros nao exibidos neste resumo.`);
  }
}

function textByKeys(item, keys) {
  return keys.map((key) => valor(item?.[key])).filter(Boolean).join(" | ");
}

export async function gerarPuxadaPdfBuffer(resultado) {
  const consulta = resultado?.consulta || {};
  const cpf = resultado?.cpf || consulta?.cpf || consulta?.documento;
  const nome = first(consulta.nome, consulta.nomeCompleto, consulta.name, resultado?.nome);
  const telefones = normalizeArray(consulta.telefones, consulta.phones, consulta.contatos?.telefones);
  const emails = normalizeArray(consulta.emails, consulta.contatos?.emails);
  const enderecos = normalizeArray(consulta.enderecos, consulta.addresses);
  const parentes = normalizeArray(consulta.parentes, consulta.familiares);
  const processos = normalizeArray(resultado?.processosCache, consulta.processos);

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
    writeField(doc, "Nascimento", first(consulta.nascimento, consulta.dataNascimento, consulta.dtNascimento));
    writeField(doc, "Idade", consulta.idade);
    writeField(doc, "Mae", first(consulta.mae, consulta.nomeMae));
    writeField(doc, "Pai", first(consulta.pai, consulta.nomePai));
    writeField(doc, "Sexo", consulta.sexo);
    writeField(doc, "Renda", first(consulta.renda, consulta.rendaPresumida));
    writeField(doc, "Escolaridade", consulta.escolaridade);
    writeField(doc, "Naturalidade", consulta.naturalidade);
    writeField(doc, "RG", consulta.rg);
    writeField(doc, "Titulo de eleitor", first(consulta.tituloEleitor, consulta.titulo));
    writeField(doc, "CNS", consulta.cns);
    writeField(doc, "PIS/NIS", first(consulta.pis, consulta.nis));

    writeSection(doc, "Telefones");
    writeList(doc, telefones, (item) => typeof item === "string" ? item : textByKeys(item, ["telefone", "numero", "ddd", "tipo", "operadora", "whatsapp"]));

    writeSection(doc, "Emails");
    writeList(doc, emails, (item) => typeof item === "string" ? item : textByKeys(item, ["email", "tipo", "score"]));

    writeSection(doc, "Enderecos");
    writeList(doc, enderecos, (item) => {
      if (typeof item === "string") return item;
      return textByKeys(item, ["logradouro", "numero", "complemento", "bairro", "cidade", "uf", "cep"]);
    });

    writeSection(doc, "Vinculos e familiares");
    writeList(doc, parentes, (item) => {
      if (typeof item === "string") return item;
      return textByKeys(item, ["nome", "cpf", "parentesco", "tipo"]);
    }, 15);

    writeSection(doc, "Processos");
    writeList(doc, processos, (item) => {
      if (typeof item === "string") return item;
      return textByKeys(item, ["numero", "classe", "assunto", "tribunal", "uf", "data"]);
    }, 15);

    doc.moveDown(1);
    doc.font("Helvetica").fontSize(8).fillColor("#6b7280")
      .text("Relatorio anexado automaticamente ao CRM a partir da consulta autorizada no Detetive Forense.");

    doc.end();
  });
}
