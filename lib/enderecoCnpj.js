// Compara o endereço comercial informado pelo cliente com o endereço do CNPJ (Receita).
// O cliente escreve de qualquer jeito ("Osvaldo aranha, 45", "Rua dentista bento aherni"), então não exige texto igual:
// bate se o CEP é o mesmo OU se o nome da rua do CNPJ aparece (com tolerância a erro de digitação) no que o cliente escreveu.
const SEM_VALOR = new Set([
  "rua", "r", "avenida", "av", "estrada", "est", "rodovia", "rod", "travessa", "tv", "alameda", "al", "praca", "pca", "largo", "via", "viela", "beco",
  "de", "da", "do", "dos", "das", "e", "sala", "loja", "casa", "bairro", "jardim", "jd", "vila", "centro", "cep", "n", "no", "numero", "sp", "cp",
  "prof", "professor", "professora", "dr", "dra", "doutor", "dent", "dentista", "eng", "engenheiro", "cel", "coronel", "pref", "prefeito", "ver", "vereador", "dep", "deputado", "pres", "presidente", "gen", "general", "mal", "marechal", "cap", "capitao", "ten", "tenente", "sao", "santa", "santo", "sto", "sta",
]);

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function distancia(a, b) {
  if (a === b) return 0;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

const palavraParecida = (a, b) => {
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) return true;
  const tol = Math.max(a.length, b.length) >= 7 ? 2 : 1;
  return distancia(a, b) <= tol;
};

const palavras = (s) => norm(s).replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);

// A rua do CNPJ é o que vem antes da primeira vírgula/ponto (ex.: "RUA MINEIROS, 355 · BARRA DO UNA · ...").
function ruaDoCnpj(endereco) {
  const antes = String(endereco || "").split(/[,·]/)[0];
  return palavras(antes).filter((p) => !SEM_VALOR.has(p) && !/^\d+$/.test(p));
}

const cepDe = (s) => (String(s || "").match(/\b\d{5}-?\d{3}\b/) || [])[0]?.replace(/\D/g, "") || null;

// → { bate: true|false|null, motivo }. null = não deu para comparar (sem um dos endereços).
export function enderecoBateComCnpj(enderecoComercial, enderecoCnpj) {
  if (!String(enderecoComercial || "").trim() || !String(enderecoCnpj || "").trim()) return { bate: null, motivo: "sem endereço para comparar" };
  const cepA = cepDe(enderecoComercial);
  const cepB = cepDe(enderecoCnpj);
  if (cepA && cepB && cepA === cepB) return { bate: true, motivo: "mesmo CEP" };
  const rua = ruaDoCnpj(enderecoCnpj);
  const texto = palavras(enderecoComercial).filter((p) => !SEM_VALOR.has(p) && !/^\d+$/.test(p));
  if (!rua.length) return { bate: null, motivo: "rua do CNPJ ilegível" };
  const achadas = rua.filter((p) => texto.some((t) => palavraParecida(p, t)));
  const parte = achadas.length / rua.length;
  if (parte >= 0.6) return { bate: true, motivo: `rua parecida (${achadas.length}/${rua.length} palavras)` };
  return { bate: false, motivo: `rua diferente: CNPJ "${rua.join(" ")}" × informado "${texto.join(" ")}"` };
}
