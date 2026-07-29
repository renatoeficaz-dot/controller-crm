// Páginas do sistema que podem ser restringidas por usuário (User.paginasVisiveis).
// Lançamentos e Configurações ficam fora de propósito — continuam exclusivas
// de admin, controladas por role (não faz sentido "liberar" pra outro nível).
export const PAGINAS_SISTEMA = [
  { key: "contatos", label: "Contatos" },
  { key: "chat", label: "Chat" },
  { key: "tarefas", label: "Tarefas" },
  { key: "cobranca", label: "Cobrança" },
  { key: "metas", label: "Metas" },
  { key: "relatorios", label: "Relatórios" },
];
