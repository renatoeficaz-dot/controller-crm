// Exportação de tabela pra CSV, feita no navegador (não precisa de servidor).
//
// Separador ";" e BOM UTF-8 no começo: sem isso o Excel em português abre o
// arquivo com acento quebrado e joga tudo numa coluna só.
export function baixarCsv(nomeArquivo, colunas, linhas) {
  const escapar = (v) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    // Excel trata campo começando com = + - @ como FÓRMULA. Como o nome do
    // lead vem do WhatsApp (quem manda mensagem escolhe o próprio nome), dava
    // pra plantar um `=HYPERLINK(...)` que executava ao abrir a planilha
    // exportada. A aspa simples na frente força o Excel a ler como texto.
    // Número negativo ("-150,00") não é fórmula: com a aspa na frente o Excel lia prejuízo como TEXTO e não somava.
    if (/^[=+\-@\t\r]/.test(s) && !/^-\d[\d.,]*$/.test(s)) s = "'" + s;
    // Aspas duplas dentro do campo viram duplicadas; campo com ; " ou quebra
    // de linha precisa vir entre aspas.
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; // \r também quebrava a linha no Excel
  };

  const cabecalho = colunas.map((c) => escapar(c.label)).join(";");
  const corpo = linhas
    .map((linha) => colunas.map((c) => escapar(typeof c.valor === "function" ? c.valor(linha) : linha[c.chave])).join(";"))
    .join("\n");

  const blob = new Blob(["﻿" + cabecalho + "\n" + corpo], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo.endsWith(".csv") ? nomeArquivo : `${nomeArquivo}.csv`;
  a.click();
  // Revogar na hora cancelava o download em alguns navegadores (Safari/Firefox): espera o clique ser processado.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Números pra CSV: vírgula decimal, sem "R$" nem separador de milhar — assim
// o Excel entende como número e permite somar/filtrar.
export function numeroCsv(n) {
  if (n === null || n === undefined || n === "") return "";
  const v = Number(n);
  if (!Number.isFinite(v)) return ""; // antes saía "NaN" na planilha
  return v.toFixed(2).replace(".", ",");
}
