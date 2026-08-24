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

    case "lupa":
      return <svg {...p}><circle cx="10.5" cy="10.5" r="6.5" /><path d="m20 20-4.3-4.3" /></svg>;

    case "olho":
      return <svg {...p}><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" /><circle cx="12" cy="12" r="2.7" /></svg>;

    case "olho-fechado":
      return (
        <svg {...p}>
          <path d="M3.5 3.5 20.5 20.5" />
          <path d="M9.9 5.2A9.5 9.5 0 0 1 12 5c6.5 0 10 6.5 10 6.5a15.6 15.6 0 0 1-3.4 4.1M6.5 6.9C4 8.7 2 11.5 2 11.5S5.5 18 12 18c1.1 0 2.1-.15 3-.4" />
          <path d="M9.9 12a2.7 2.7 0 0 0 3.9 2.9" />
        </svg>
      );

    case "link":
      return (
        <svg {...p}>
          <path d="M9.5 14.5 14.5 9.5" />
          <path d="M11 6.5 13 4.5a3.5 3.5 0 0 1 5 5l-2 2M13 17.5l-2 2a3.5 3.5 0 0 1-5-5l2-2" />
        </svg>
      );

    case "sinal": // wifi / conexão
      return (
        <svg {...p}>
          <path d="M4.5 9.5a11 11 0 0 1 15 0" />
          <path d="M7.5 12.7a7 7 0 0 1 9 0" />
          <path d="M10.5 15.8a3 3 0 0 1 3 0" />
          <path d="M12 19h.01" />
        </svg>
      );

    case "x":
      return <svg {...p} strokeWidth={2.4}><path d="M6 6l12 12M18 6 6 18" /></svg>;

    case "robo":
      return (
        <svg {...p}>
          <rect x="4" y="8" width="16" height="11" rx="2.5" />
          <path d="M12 8V4.5M9.5 4.5h5" />
          <circle cx="9" cy="13.5" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="15" cy="13.5" r="1.2" fill="currentColor" stroke="none" />
          <path d="M9 17h6" />
        </svg>
      );

    case "escudo":
      return <svg {...p}><path d="M12 3.5 5 6v5.5c0 5 3 8 7 9.5 4-1.5 7-4.5 7-9.5V6l-7-2.5Z" /><path d="m9 12 2 2 4-4.3" /></svg>;

    case "pessoa":
      return <svg {...p}><circle cx="12" cy="8" r="3.3" /><path d="M5 20c1-4 4-6 7-6s6 2 7 6" /></svg>;

    case "relogio":
      return <svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>;

    case "lapis":
      return <svg {...p}><path d="M4 20h4l10.3-10.3a1.6 1.6 0 0 0 0-2.3l-1.7-1.7a1.6 1.6 0 0 0-2.3 0L4 16v4Z" /><path d="M13.5 6.5 17.5 10.5" /></svg>;

    case "clipe":
      return <svg {...p}><path d="M17 7 8.5 15.5a3.5 3.5 0 0 1-5-5L12 2a2.3 2.3 0 0 1 3.3 3.3L7 13.6a1 1 0 0 1-1.5-1.5L13 5" /></svg>;

    case "microfone":
      return <svg {...p}><rect x="9" y="2.5" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" /><path d="M12 18v3.5M9 21.5h6" /></svg>;

    case "parar":
      return <svg {...p}><rect x="6" y="6" width="12" height="12" rx="1.5" /></svg>;

    case "video": // câmera de vídeo (botão de vídeo chamada)
      return <svg {...p}><rect x="3" y="6" width="12" height="12" rx="2" /><path d="m15 10 6-3.5v11L15 14z" /></svg>;

    case "imagem":
      return (
        <svg {...p}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="8.5" cy="9.5" r="1.6" />
          <path d="m5 17 5-5 4 4 2.5-2.5L21 18" />
        </svg>
      );

    case "fone": // headphones (mensagem de áudio)
      return <svg {...p}><path d="M4 15v-3a8 8 0 0 1 16 0v3" /><rect x="3" y="14" width="4" height="6" rx="1.5" /><rect x="17" y="14" width="4" height="6" rx="1.5" /></svg>;

    case "estrela": // resumir por IA
      return <svg {...p}><path d="M12 3.5 13.8 9l5.7.3-4.5 3.6 1.6 5.6L12 15.3 7.4 18.5 9 12.9 4.5 9.3 10.2 9 12 3.5Z" /></svg>;

    case "documento":
      return <svg {...p}><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4" /><path d="M9.5 12.5h5M9.5 15.5h5" /></svg>;

    case "calendario":
      return <svg {...p}><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" /></svg>;

    case "carteira":
      return <svg {...p}><path d="M4 7.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-10Z" /><path d="M15.5 12.5h2.5a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1h-2.5a1.5 1.5 0 0 1 0-3Z" /></svg>;

    case "baixar":
      return <svg {...p}><path d="M12 4v11.5M7.5 11.5l4.5 4.5 4.5-4.5" /><path d="M5 20h14" /></svg>;

    case "genero-f":
      return <svg {...p}><circle cx="12" cy="9" r="5.5" /><path d="M12 14.5V21M8.5 18h7" /></svg>;

    case "genero-m":
      return <svg {...p}><circle cx="10" cy="14" r="5.5" /><path d="m14 10 6.5-6.5M15 3.5h5.5V9" /></svg>;

    case "sol":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.5v2.3M12 19.2v2.3M4.4 4.4l1.6 1.6M18 18l1.6 1.6M2.5 12h2.3M19.2 12h2.3M4.4 19.6 6 18M18 6l1.6-1.6" />
        </svg>
      );

    case "lua":
      return <svg {...p}><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" /></svg>;

    case "monitor":
      return <svg {...p}><rect x="3" y="4.5" width="18" height="12" rx="1.7" /><path d="M9 20h6M12 16.5V20" /></svg>;

    case "calculadora":
      return (
        <svg {...p}>
          <rect x="5" y="3" width="14" height="18" rx="2" />
          <path d="M8 7h8" />
          <circle cx="8.3" cy="12" r="0.7" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="0.7" fill="currentColor" stroke="none" />
          <circle cx="15.7" cy="12" r="0.7" fill="currentColor" stroke="none" />
          <circle cx="8.3" cy="15.5" r="0.7" fill="currentColor" stroke="none" />
          <circle cx="12" cy="15.5" r="0.7" fill="currentColor" stroke="none" />
          <circle cx="15.7" cy="15.5" r="0.7" fill="currentColor" stroke="none" />
          <circle cx="8.3" cy="18.7" r="0.7" fill="currentColor" stroke="none" />
          <circle cx="12" cy="18.7" r="0.7" fill="currentColor" stroke="none" />
          <circle cx="15.7" cy="18.7" r="0.7" fill="currentColor" stroke="none" />
        </svg>
      );

    case "repetir":
      return <svg {...p}><path d="M4 12a8 8 0 0 1 13.7-5.7L20 8.5" /><path d="M20 4v4.5h-4.5" /><path d="M20 12a8 8 0 0 1-13.7 5.7L4 15.5" /><path d="M4 20v-4.5h4.5" /></svg>;

    case "banco":
      return <svg {...p}><path d="M4 9.5 12 4l8 5.5" /><path d="M4.5 9.5h15V20h-15z" /><path d="M8 13v4M12 13v4M16 13v4" /><path d="M3.5 20.5h17" /></svg>;

    case "ampulheta":
      return <svg {...p}><path d="M6 3h12M6 21h12" /><path d="M7 3c0 5 4 6.5 5 8-1 1.5-5 3-5 8M17 3c0 5-4 6.5-5 8 1 1.5 5 3 5 8" /></svg>;

    case "proibido":
      return <svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="m6.5 6.5 11 11" /></svg>;

    case "seta-cima":
      return <svg {...p}><path d="M12 19V5M6 10l6-6 6 6" /></svg>;

    case "seta-baixo":
      return <svg {...p}><path d="M12 5v14M6 14l6 6 6-6" /></svg>;

    case "celular":
      return <svg {...p}><rect x="6.5" y="2.5" width="11" height="19" rx="2.2" /><path d="M11 19h2" /></svg>;

    case "copiar":
      return <svg {...p}><rect x="8.5" y="8.5" width="12" height="13" rx="2" /><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9.5a2 2 0 0 0 2 2h2" /></svg>;

    case "bolinha":
      return <svg {...p}><circle cx="12" cy="12" r="6" fill="currentColor" stroke="none" /></svg>;

    case "pasta":
      return <svg {...p}><path d="M3.5 6.5a1.5 1.5 0 0 1 1.5-1.5h4l2 2.3H19a1.5 1.5 0 0 1 1.5 1.5v8.7a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5V6.5Z" /></svg>;

    case "pessoas":
      return <svg {...p}><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.7-3.3 2.9-5 5.5-5s4.8 1.7 5.5 5" /><circle cx="17" cy="9" r="2.3" /><path d="M15.5 13.3c2.2.2 3.7 1.7 4.2 4" /></svg>;

    case "mala":
      return <svg {...p}><rect x="3" y="7.5" width="18" height="12" rx="2" /><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" /><path d="M3 12.5h18" /></svg>;

    default:
      return null;
  }
}
