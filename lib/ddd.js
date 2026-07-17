// Mapa oficial de DDD -> UF (estado) do Brasil.
const DDD_TO_UF = {
  11: "SP", 12: "SP", 13: "SP", 14: "SP", 15: "SP", 16: "SP", 17: "SP", 18: "SP", 19: "SP",
  21: "RJ", 22: "RJ", 24: "RJ",
  27: "ES", 28: "ES",
  31: "MG", 32: "MG", 33: "MG", 34: "MG", 35: "MG", 37: "MG", 38: "MG",
  41: "PR", 42: "PR", 43: "PR", 44: "PR", 45: "PR", 46: "PR",
  47: "SC", 48: "SC", 49: "SC",
  51: "RS", 53: "RS", 54: "RS", 55: "RS",
  61: "DF", 62: "GO", 64: "GO",
  63: "TO",
  65: "MT", 66: "MT",
  67: "MS",
  68: "AC",
  69: "RO",
  71: "BA", 73: "BA", 74: "BA", 75: "BA", 77: "BA",
  79: "SE",
  81: "PE", 87: "PE",
  82: "AL",
  83: "PB",
  84: "RN",
  85: "CE", 88: "CE",
  86: "PI", 89: "PI",
  91: "PA", 93: "PA", 94: "PA",
  92: "AM", 97: "AM",
  95: "RR",
  96: "AP",
  98: "MA", 99: "MA",
};

// Extrai o DDD de um telefone (com ou sem +55) e retorna a UF, ou null.
export function ufFromPhone(phone) {
  const digits = (phone || "").replace(/\D/g, "");
  const semDDI = digits.startsWith("55") && digits.length > 10 ? digits.slice(2) : digits;
  const ddd = Number(semDDI.slice(0, 2));
  return DDD_TO_UF[ddd] || null;
}

// As 27 UFs do Brasil, ordenadas alfabeticamente — pro seletor manual no front.
export const UFS_BR = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
].sort();
