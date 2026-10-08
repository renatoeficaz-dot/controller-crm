export const CONSULTAS_SNOOP = { cadastro: "Cadastro do cliente por CPF", telefones: "Telefones vinculados ao CPF do cliente" };
export const CAMPOS_SNOOP = { nome: "Nome", nascimento: "Nascimento", enderecos: "Endereços", emails: "E-mails", telefones: "Telefones" };
export const PADRAO_SNOOP = { consultas: Object.keys(CONSULTAS_SNOOP), campos: Object.keys(CAMPOS_SNOOP) };

export function validarOpcoesSnoop(valor) {
  return !!valor && typeof valor === "object" && !Array.isArray(valor)
    && Object.keys(valor).every((k) => ["consultas", "campos"].includes(k))
    && [["consultas", CONSULTAS_SNOOP], ["campos", CAMPOS_SNOOP]].every(([k, permitidos]) => Array.isArray(valor[k]) && valor[k].length <= Object.keys(permitidos).length && valor[k].every((v) => typeof v === "string" && Object.hasOwn(permitidos, v)) && new Set(valor[k]).size === valor[k].length);
}

export function lerOpcoesSnoop(valor) {
  if (!valor) return PADRAO_SNOOP;
  try {
    const opcoes = typeof valor === "string" ? JSON.parse(valor) : valor;
    return validarOpcoesSnoop(opcoes) ? opcoes : { consultas: [], campos: [] };
  } catch { return { consultas: [], campos: [] }; }
}

// A seleção controla a exibição, inclusive dos resultados já salvos.
export function filtrarDadosSnoop(dados, campos) {
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) return null;
  const grupos = { nome: ["nome"], nascimento: ["nascimento"], enderecos: ["endereco", "enderecos", "bairro", "cidade", "uf", "cep"], emails: ["email", "emails"], telefones: ["telefones"] };
  const permitidos = new Set(campos.flatMap((c) => grupos[c] || []));
  return Object.fromEntries(Object.entries(dados).filter(([k]) => permitidos.has(k)));
}
