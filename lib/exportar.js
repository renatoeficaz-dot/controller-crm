// Exportação de tabela pra CSV, feita no navegador (não precisa de servidor).
//
// Separador ";" e BOM UTF-8 no começo: sem isso o Excel em português abre o
// arquivo com acento quebrado e joga tudo numa coluna só.
export function baixarCsv(nomeArquivo, colunas, linhas) {
  const escapar = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    // Aspas duplas dentro do campo viram duplicadas; campo com ; " ou quebra
    // de linha precisa vir entre aspas.
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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
  URL.revokeObjectURL(url);
}

// Números pra CSV: vírgula decimal, sem "R$" nem separador de milhar — assim
// o Excel entende como número e permite somar/filtrar.
export function numeroCsv(n) {
  if (n === null || n === undefined || n === "") return "";
  return String(Number(n).toFixed(2)).replace(".", ",");
}
