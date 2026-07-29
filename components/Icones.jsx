// Conjunto de ícones do sistema.
//
// Traçados em `currentColor`, então herdam a cor do texto e funcionam no tema
// claro e no escuro sem precisar de variante. Emoji não faz isso: cada sistema
// operacional desenha do seu jeito, a cor é fixa e o alinhamento varia.
//
// Compartilhado entre a barra lateral e o manual pra que o mesmo destino tenha
// sempre o mesmo desenho.

export default function Icone({ nome, className = "w-4 h-4" }) {
  const p = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };

  switch (nome) {
    case "funil": // Contatos
      return <svg {...p}><path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" /></svg>;

    case "chat":
      return <svg {...p}><path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12Z" /></svg>;

    case "tarefa":
      return (
        <svg {...p}>
          <path d="M9 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3" />
          <rect x="9" y="3" width="6" height="4" rx="1" />
          <path d="m9 13.5 2 2 4-4.5" />
        </svg>
      );

    case "cobranca": // telefone
      return (
        <svg {...p}>
          <path d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.5 5.7 2 2 0 0 1 6.5 3.5Z" />
        </svg>
      );

    case "meta": // alvo
      return <svg {...p}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></svg>;

    case "dinheiro": // Lançamentos
      return (
        <svg {...p}>
          <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
          <circle cx="12" cy="12" r="2.5" />
          <path d="M6 10v4M18 10v4" />
        </svg>
      );

    case "grafico": // Relatórios
      return <svg {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>;

    case "engrenagem": // Configurações
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
        </svg>
      );

    case "formatura": // Aprender
      return (
        <svg {...p}>
          <path d="M12 4 2.5 8.5 12 13l9.5-4.5L12 4Z" />
          <path d="M6.5 10.7V15c0 1.5 2.5 3 5.5 3s5.5-1.5 5.5-3v-4.3" />
          <path d="M21.5 8.5V14" />
        </svg>
      );

    case "local": // "onde fica", no manual
      return <svg {...p}><path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" /></svg>;

    case "check":
      return <svg {...p} strokeWidth={2.6}><path d="m5 12.5 4.5 4.5L19 7" /></svg>;

    case "seta":
      return <svg {...p}><path d="m6 9 6 6 6-6" /></svg>;

    case "trofeu":
      return (
        <svg {...p}>
          <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
          <path d="M7 5.5H4.5v1a3.5 3.5 0 0 0 3 3.4M17 5.5h2.5v1a3.5 3.5 0 0 1-3 3.4" />
          <path d="M12 14v3M9 20h6M10 17h4" />
        </svg>
      );

    case "alerta":
      return <svg {...p}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></svg>;

    default:
      return null;
  }
}
