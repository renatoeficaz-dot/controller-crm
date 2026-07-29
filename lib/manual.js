// Conteúdo do módulo "Aprender" — manual de uso do sistema, em etapas.
//
// Fica em um arquivo de dados (e não espalhado no JSX) porque cresce junto com
// o produto: cada funcionalidade nova entra aqui como um passo, sem mexer em
// componente.

export const TRILHAS = [
  {
    id: "primeiros-passos",
    titulo: "Primeiros passos",
    emoji: "🚀",
    resumo: "Ligue o WhatsApp e entenda como o lead entra no sistema.",
    passos: [
      {
        titulo: "Conecte um número de WhatsApp",
        onde: "Configurações → Números",
        conteudo: [
          "Clique em **+ Conectar número**, dê um nome (ex.: “Vendas SP”), informe o número com DDI e DDD (5511999998888) e escolha o provedor.",
          "Um QR Code aparece: abra o WhatsApp no celular → Aparelhos conectados → Conectar aparelho → aponte pro QR.",
          "Assim que conectar, a bolinha ao lado do número fica **verde**. É por esse número que o sistema envia e recebe mensagens.",
        ],
        atencao:
          "Número novo é o mais frágil: ative o **Aquecimento** (no mesmo modal) pra limitar os envios automáticos nos primeiros dias e evitar bloqueio.",
      },
      {
        titulo: "Entenda de onde vêm os leads",
        onde: "Contatos",
        conteudo: [
          "Toda vez que alguém manda mensagem pro seu WhatsApp, o sistema **cria o lead sozinho** na primeira coluna do funil.",
          "Você não precisa cadastrar cliente na mão — mas pode, pelo botão **+ Novo contato**.",
          "Cada cartão do funil é um lead. Clique nele pra abrir a ficha; arraste entre colunas pra mudar a etapa.",
        ],
      },
      {
        titulo: "Conheça o funil",
        onde: "Contatos",
        conteudo: [
          "As colunas representam o caminho do cliente: **Novo → Em conversa → Documentação → Análise → Liberação pagamento → Recebimento**.",
          "**Recebimento** é onde o cliente já pegou o dinheiro e está pagando as parcelas.",
          "**Cravo** é a coluna de quem parou de pagar. **Venda perdida** é quem não fechou.",
        ],
        atencao: "Algumas mudanças de etapa são automáticas: quando o cliente manda um documento, ele vai sozinho pra Documentação.",
      },
    ],
  },
  {
    id: "vender",
    titulo: "Analisar e liberar",
    emoji: "💰",
    resumo: "Consulte o CPF, veja o risco e simule antes de emprestar.",
    passos: [
      {
        titulo: "Faça a puxada (consulta de crédito)",
        onde: "Ficha do lead → Puxada",
        conteudo: [
          "Preencha o **CPF** do cliente na ficha. A IA também preenche sozinha quando o cliente manda foto do RG ou CNH.",
          "Clique em **🔍 Puxada**: o sistema consulta o CPF e anexa o relatório completo em PDF na ficha.",
          "Clique no PDF pra abrir sem sair do sistema. O botão **⤢ Aumentar** deixa em tela quase cheia.",
        ],
      },
      {
        titulo: "Leia o score de risco",
        onde: "Ficha do lead → Puxada",
        conteudo: [
          "Junto com o PDF aparece um **score de 0 a 100** com o limite de capital sugerido.",
          "Ele desconta pontos por: cheque sem fundo, empréstimos ativos em outros bancos, processos e renda baixa.",
          "Logo abaixo dos motivos você vê o porquê da nota — não é uma caixa-preta.",
        ],
        atencao:
          "O score é **consultivo**: ele não bloqueia nada. Quem decide se libera e quanto é você.",
      },
      {
        titulo: "Simule antes de fechar",
        onde: "Contatos → botão 🧮 Simular",
        conteudo: [
          "Digite o valor do capital e veja: total a receber, valor de cada parcela e o lucro se o cliente pagar tudo.",
          "A tabela mostra **quanto sobra ou falta se ele parar em cada parcela** — é o que explica por que sumir na 3ª é muito pior que sumir na 8ª.",
        ],
      },
      {
        titulo: "Libere o capital",
        onde: "Ficha do lead → Cobrança",
        conteudo: [
          "Preencha **Valor do capital** e **Data de liberação**. O sistema gera as 10 parcelas diárias automaticamente.",
          "Mova o lead para **Recebimento**. A partir daí ele entra na cobrança.",
        ],
      },
    ],
  },
  {
    id: "cobrar",
    titulo: "Cobrar todo dia",
    emoji: "📞",
    resumo: "A rotina diária: régua automática, fila priorizada e baixas.",
    passos: [
      {
        titulo: "Configure a régua de cobrança",
        onde: "Configurações → Régua de cobrança",
        conteudo: [
          "A régua define **qual mensagem enviar conforme os dias de atraso** — quem atrasou 1 dia não deve receber o mesmo texto de quem atrasou 20.",
          "Clique em **Criar régua sugerida** pra começar com 6 faixas prontas (véspera, vence hoje, 1-3, 4-7, 8-15, 16+) e edite os textos do seu jeito.",
          "Use variáveis como `{{nome}}`, `{{valor_aberto}}` e `{{dias_atraso}}` — elas são trocadas pelos dados reais no envio.",
        ],
        atencao:
          "O envio sai automaticamente 1h30 antes do horário limite de pagamento, uma vez por dia por cliente.",
      },
      {
        titulo: "Trabalhe a fila do dia",
        onde: "Cobrança",
        conteudo: [
          "A fila mostra **quem cobrar hoje**, já ordenada por prioridade: valor em aberto × urgência do atraso.",
          "Quem atrasou menos aparece antes — tem mais chance de recuperar.",
          "Em cada linha você pode abrir o WhatsApp, **dar baixa** na parcela ou **registrar a tentativa** de contato.",
        ],
      },
      {
        titulo: "Use o modo foco na rua",
        onde: "Cobrança → 🎯 Modo foco",
        conteudo: [
          "Mostra **um cliente por vez**, com botões grandes, feito pra usar no celular.",
          "Ao dar baixa ou registrar tentativa, ele avança sozinho pro próximo.",
          "O contador (“3 de 27”) mostra o quanto da fila você já percorreu.",
        ],
      },
      {
        titulo: "Registre as tentativas",
        onde: "Ficha do lead → Cobrança",
        conteudo: [
          "Sempre que ligar ou for até o cliente, registre: **como** tentou e **o que aconteceu** (atendeu, não atendeu, prometeu pagar, recusou).",
          "Isso constrói o histórico de esforço e mostra quem realmente promete e não cumpre.",
        ],
      },
      {
        titulo: "Ofereça quitação à vista",
        onde: "Configurações → Quitação à vista",
        conteudo: [
          "Defina o **desconto** e a partir de **quantos dias de atraso** ele vale.",
          "Quando o cliente se qualifica, a oferta aparece na ficha dele com o valor já calculado e um botão pra copiar a mensagem.",
        ],
        atencao:
          "Nada é enviado sozinho: o desconto só é oferecido quando você decide mandar. Recuperar parte costuma valer mais que insistir num valor cheio que não vem.",
      },
    ],
  },
  {
    id: "acompanhar",
    titulo: "Acompanhar o negócio",
    emoji: "📊",
    resumo: "Metas, relatórios e os números que dizem se está indo bem.",
    passos: [
      {
        titulo: "Defina e acompanhe metas",
        onde: "Configurações → Metas · e a aba Metas",
        conteudo: [
          "Configure a meta de **vendas por dia** e o **% de recebimento** esperado, em 3 níveis: mínima, média e meta cheia.",
          "Na aba **Metas** você vê como está o dia, quanto falta pra cada nível e a lista das baixas já registradas.",
        ],
      },
      {
        titulo: "Controle o que entra e o que sai",
        onde: "Lançamentos",
        conteudo: [
          "A aba **Lançamentos** é o caixa realizado: tudo que já entrou ou saiu de verdade. É ela que forma o seu saldo.",
          "A aba **Contas a pagar** é o que ainda vai sair: aluguel, internet, funcionário. Enquanto a conta está em aberto ela **não mexe no saldo** — só quando você aperta **Pagar** é que vira uma saída no caixa.",
          "Se errou a baixa, o **Estornar** desfaz os dois: a conta volta a ficar em aberto e o lançamento some.",
        ],
        atencao:
          "Contas a pagar é previsão, não é dinheiro que já saiu. Por isso ela fica separada — se entrasse direto no caixa, seu saldo mostraria menos dinheiro do que você realmente tem.",
      },
      {
        titulo: "Repita as contas fixas uma vez só",
        onde: "Lançamentos → Contas a pagar",
        conteudo: [
          "Ao criar a conta, marque **Repetir todo mês**. Escolha **Por X meses** quando tem fim (um parcelamento em 10 vezes) ou **Ilimitada** pra despesa fixa que não acaba (aluguel, internet).",
          "O sistema já deixa as próximas na lista com o vencimento certo em cada mês — conta do dia 31 cai no dia 28 em fevereiro e volta pro 31 em março.",
          "Pra cancelar uma recorrência, exclua uma ocorrência e escolha **apagar também as próximas**. O que já foi pago fica no histórico.",
        ],
      },
      {
        titulo: "Leia os relatórios que importam",
        onde: "Relatórios",
        conteudo: [
          "**Aging da carteira**: quanto está atrasado e há quanto tempo — R$ atrasado há 3 dias é fluxo de caixa, há 40 dias é quase perda.",
          "**Comportamento por ciclo**: compara o 1º empréstimo com as renovações. Costuma mostrar que cliente renovado paga muito melhor.",
          "**Ponto de equilíbrio**: no gráfico de “parcela em que parou de pagar”, as barras vermelhas são os clientes que pararam antes do seu capital voltar.",
          "**Curva de safra**: mostra se a carteira está melhorando ou piorando mês a mês.",
          "**Giro de capital**: quantas vezes seu dinheiro rodou no período.",
        ],
      },
      {
        titulo: "Exporte quando precisar",
        onde: "Relatórios",
        conteudo: [
          "**📄 Exportar PDF** gera um relatório completo do período filtrado.",
          "O **⬇ CSV** ao lado das tabelas baixa os dados pra abrir no Excel.",
        ],
      },
      {
        titulo: "Receba alertas no seu WhatsApp",
        onde: "Configurações → Alertas",
        conteudo: [
          "Informe seu número e ative o **resumo diário** no horário que preferir: recebido do dia, quantos pagaram, vendas e total em atraso.",
          "Os **avisos críticos** chegam na hora quando um número de WhatsApp cai ou um cliente com capital alto vira calote.",
          "Use **Enviar teste agora** pra confirmar que está chegando.",
        ],
      },
    ],
  },
  {
    id: "crescer",
    titulo: "Crescer e proteger",
    emoji: "🛡️",
    resumo: "Rastreie a origem dos leads, organize a equipe e proteja os dados.",
    passos: [
      {
        titulo: "Rastreie de onde vêm seus leads",
        onde: "Configurações → Links (UTM)",
        conteudo: [
          "Crie um link para cada anúncio ou campanha. Ele redireciona pro seu WhatsApp e **conta os cliques**.",
          "Quando o lead chega por esse link, o sistema marca a origem dele automaticamente.",
          "Clique em “N cliques” pra ver dispositivo, navegador, região e horário de cada acesso.",
          "Em Relatórios, a seção **Leads por link de rastreamento** mostra qual campanha traz cliente que paga.",
        ],
      },
      {
        titulo: "Organize a equipe",
        onde: "Configurações → Usuários",
        conteudo: [
          "Crie um usuário por pessoa e escolha o nível: **Administrador**, **Vendedor** ou **Cobrador**.",
          "Para quem não é admin, dá pra restringir: quais **colunas do funil** vê, quais **WhatsApp** acompanha e quais **páginas** acessa.",
          "Deixar tudo desmarcado significa “vê tudo”.",
        ],
      },
      {
        titulo: "Proteja seus dados",
        onde: "Configurações → Backup",
        conteudo: [
          "O sistema gera uma cópia do banco **todo dia** e guarda as últimas 14.",
          "Clique em **Baixar o mais recente** de vez em quando e guarde o arquivo em outro lugar (seu computador, Google Drive).",
        ],
        atencao:
          "Backup que só existe dentro do servidor não protege contra perder o servidor. A cópia externa é o que realmente salva.",
      },
      {
        titulo: "Deixe do seu jeito",
        onde: "Configurações → Aparência",
        conteudo: [
          "Escolha tema **claro**, **escuro** ou **do sistema** (acompanha o aparelho).",
          "A escolha vale por aparelho — cada pessoa da equipe define o seu.",
        ],
      },
    ],
  },
];

export const TOTAL_PASSOS = TRILHAS.reduce((acc, t) => acc + t.passos.length, 0);
