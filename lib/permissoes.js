// Permissão por AÇÃO, além da permissão por PÁGINA que já existia
// (lib/paginas.js). Admin sempre pode tudo. Pra quem não é admin, o `role`
// (vendedor/cobrador) não muda mais nada aqui — só User.permissoesExtras
// (CSV) libera ações pontuais sensíveis, uma a uma.
//
// Deliberadamente NÃO substitui o sistema de roles: continua existindo
// "admin vê tudo", isso aqui só adiciona capacidades extras e específicas
// pra quem não é admin, sem precisar promover a pessoa a admin inteiro.

export const ACOES = [
  { chave: "editar_valor_baixa", label: "Mudar o valor de uma baixa já registrada" },
  { chave: "estornar_baixa", label: "Desmarcar uma parcela como paga" },
  { chave: "excluir_lancamento", label: "Excluir lançamento financeiro" },
  { chave: "aprovar_comissao", label: "Aprovar/marcar comissão como paga" },
  { chave: "excluir_contato", label: "Excluir lead" },
  { chave: "mesclar_contatos", label: "Mesclar dois cadastros" },
];

export function podeExecutar(user, acao) {
  if (!user) return false;
  if (user.role === "admin") return true;
  const extras = (user.permissoesExtras || "").split(",").map((s) => s.trim()).filter(Boolean);
  return extras.includes(acao);
}
