// Itens do "Checklist de documentação" por tipo de cliente (usado na ficha do
// Kanban e no painel do Chat). A chave é o que fica salvo em
// Contact.checklistDocumentacao e o que a IA marca ao receber cada item.
export const CHECKLIST_DOC = {
  comerciante: [
    ["enderecoComercial", "Endereço comercial"],
    ["enderecoResidencial", "Endereço residencial"],
    ["redeSocial", "Rede social"],
    ["referencias", "Contatos de referência"],
    ["cnpj", "CNPJ"],
    ["cpf", "CPF"],
  ],
  uber: [
    ["endereco", "Endereço"],
    ["cpf", "CPF"],
    ["referencias", "Contatos de referência"],
    ["enderecoResidencial", "Endereço residencial"],
  ],
};
