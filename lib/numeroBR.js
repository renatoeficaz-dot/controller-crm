// Número digitado no padrão brasileiro: "1.234,56", "1234,56", "R$ 80". Devolve NaN quando não é número.
// O jeito antigo (`Number(v.replace(",", "."))`) lia "1.234,56" como NaN e recusava/zerava o valor.
// Sem vírgula, o ponto é decimal ("1.5" = 1,5): é o que os campos numéricos do navegador mandam.
export function numeroBR(v) {
  if (typeof v === "number") return v;
  let s = String(v ?? "").replace(/R\$/gi, "").replace(/\s/g, "");
  if (!s) return NaN;
  const virgula = s.lastIndexOf(",");
  const ponto = s.lastIndexOf(".");
  if (virgula > -1 && ponto > -1) s = virgula > ponto ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (virgula > -1) s = s.replace(",", ".");
  return Number(s);
}
