// Conteúdo do módulo "Aprender" — manual de uso do sistema.
//
// Organizado por MÓDULO, na mesma ordem do menu do topo (Contatos, Chat,
// Tarefas, ...). Assim quem está numa tela acha o texto daquela tela, em vez
// de precisar adivinhar em qual "trilha" o assunto caiu.
//
// Fica em um arquivo de dados (e não espalhado no JSX) porque cresce junto com
// o produto: cada funcionalidade nova entra aqui como um passo, sem mexer em
// componente. O campo `icone` referencia o conjunto de ícones do ManualView.

export const TRILHAS = [
  {
    id: "contatos",
    titulo: "Contatos",
    icone: "funil",
    href: "/contatos",
    resumo: "O funil: onde o lead nasce, é analisado e vira cliente.",
    passos: [
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
        titulo: "Conheça as colunas do funil",
        onde: "Contatos",
        conteudo: [
          "As colunas representam o caminho do cliente: **Novo → Em conversa → Documentação → Análise → Liberação pagamento → Recebimento**.",
          "**Recebimento** é onde o cliente já pegou o dinheiro e está pagando as parcelas.",
          "**Cravo** é a coluna de quem parou de pagar. **Venda perdida** é quem não fechou.",
        ],
        atencao:
          "Algumas mudanças de etapa são automáticas: quando o cliente manda um documento, ele vai sozinho pra Documentação.",
      },
      {
        titulo: "Faça a puxada (consulta de crédito)",
        onde: "Contatos → ficha do lead → Puxada",
        conteudo: [
          "Preencha o **CPF** do cliente na ficha. A IA também preenche sozinha quando o cliente manda foto do RG ou CNH.",
          "Clique em **Puxada**: o sistema consulta o CPF e anexa o relatório completo em PDF na ficha.",
          "Clique no PDF pra abrir sem sair do sistema. O botão **Aumentar** deixa em tela quase cheia.",
        ],
      },
      {
        titulo: "Leia o score de risco",
        onde: "Contatos → ficha do lead → Puxada",
        conteudo: [
          "Junto com o PDF aparece um **score de 0 a 100** com o limite de capital sugerido.",
          "Ele desconta pontos por: cheque sem fundo, empréstimos ativos em outros bancos, processos e renda baixa.",
          "Logo abaixo dos motivos você vê o porquê da nota — não é uma caixa-preta.",
        ],
        atencao: "O score é **consultivo**: ele não bloqueia nada. Quem decide se libera e quanto é você.",
      },
      {
        titulo: "Simule antes de fechar",
        onde: "Contatos → botão Simular",
        conteudo: [
          "Digite o valor do capital e veja: total a receber, valor de cada parcela e o lucro se o cliente pagar tudo.",
          "A tabela mostra **quanto sobra ou falta se ele parar em cada parcela** — é o que explica por que sumir na 3ª é muito pior que sumir na 8ª.",
        ],
      },
      {
        titulo: "Libere o capital",
        onde: "Contatos → ficha do lead → Cobrança",
        conteudo: [
          "Preencha **Valor do capital** e **Data de liberação**. O sistema gera as 10 parcelas diárias automaticamente.",
          "Mova o lead para **Recebimento**. A partir daí ele entra na cobrança.",
        ],
      },
      {
        titulo: "Filtre e trabalhe em massa",
        onde: "Contatos → botão Filtros",
        conteudo: [
          "O botão **Filtros** abre tudo num lugar só: etapa, estado, gênero, tipo de cliente, etiqueta, responsável e data de criação.",
          "O **Em massa** ao lado permite mover, etiquetar ou mandar mensagem para vários leads de uma vez.",
        ],
      },
    ],
  },
  {
    id: "chat",
    titulo: "Chat",
    icone: "chat",
    href: "/chat",
    resumo: "Conversar, achar o que foi dito e editar o lead sem sair da tela.",
    passos: [
      {
        titulo: "Converse pelo sistema",
        onde: "Chat",
        conteudo: [
          "A lista da esquerda mostra todas as conversas. Ao abrir uma, você responde direto por aqui — a mensagem sai pelo número escolhido em **Enviar por**.",
          "Áudios recebidos são **transcritos automaticamente**, então dá pra ler sem precisar ouvir.",
        ],
      },
      {
        titulo: "Ache o que foi conversado",
        onde: "Chat → campo de busca",
        conteudo: [
          "A busca procura por nome e telefone, e também **dentro das mensagens** — inclusive no texto dos áudios transcritos.",
          "Serve pra achar aquela promessa de pagamento que o cliente fez e você não lembra quando.",
        ],
      },
      {
        titulo: "Peça o resumo por IA",
        onde: "Chat → conversa aberta",
        conteudo: [
          "Em conversas longas, o **resumo por IA** conta em poucas linhas o que já foi combinado.",
          "Útil quando outra pessoa da equipe vai assumir o atendimento.",
        ],
      },
      {
        titulo: "Edite o lead sem sair do chat",
        onde: "Chat → painel da direita",
        conteudo: [
          "O painel da direita traz a ficha completa: etapa, etiquetas, CPF, puxada, parcelas, situação financeira e notas.",
          "Dá pra **criar tarefa** e mudar o responsável ali mesmo, sem voltar pro funil.",
        ],
      },
    ],
  },
  {
    id: "tarefas",
    titulo: "Tarefas",
    icone: "tarefa",
    href: "/tarefas",
    resumo: "O que você combinou de fazer, com dia e hora.",
    passos: [
      {
        titulo: "Crie uma tarefa",
        onde: "Tarefas → Nova tarefa",
        conteudo: [
          "Dê um título, escolha o **lead**, a **data** e o **horário**. O tipo é opcional e serve pra separar (ligar, visitar, cobrar).",
          "Também dá pra criar tarefa direto da conversa, no painel do Chat.",
        ],
      },
      {
        titulo: "Trabalhe a lista do dia",
        onde: "Tarefas",
        conteudo: [
          "As de **Hoje** aparecem em destaque e as **Atrasadas** ficam marcadas — é o primeiro lugar pra olhar de manhã.",
          "Clique numa tarefa pra ver os detalhes e as observações que você anotou.",
        ],
      },
    ],
  },
  {
    id: "cobranca",
    titulo: "Cobrança",
    icone: "cobranca",
    href: "/cobranca",
    resumo: "A rotina diária: fila priorizada, modo foco e registro de tentativas.",
    passos: [
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
        onde: "Cobrança → Modo foco",
        conteudo: [
          "Mostra **um cliente por vez**, com botões grandes, feito pra usar no celular.",
          "Ao dar baixa ou registrar tentativa, ele avança sozinho pro próximo.",
          "O contador (“3 de 27”) mostra o quanto da fila você já percorreu.",
        ],
      },
      {
        titulo: "Registre as tentativas",
        onde: "Cobrança · ou ficha do lead → Cobrança",
        conteudo: [
          "Sempre que ligar ou for até o cliente, registre: **como** tentou e **o que aconteceu** (atendeu, não atendeu, prometeu pagar, recusou).",
          "Isso constrói o histórico de esforço e mostra quem realmente promete e não cumpre.",
        ],
      },
      {
        titulo: "Ofereça quitação à vista",
        onde: "Ficha do lead · configurado em Configurações → Quitação à vista",
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
    id: "metas",
    titulo: "Metas",
    icone: "meta",
    href: "/metas",
    resumo: "Quanto precisa vender e receber hoje, e quanto já saiu.",
    passos: [
      {
        titulo: "Acompanhe o dia",
        onde: "Metas",
        conteudo: [
          "A tela mostra como está o dia, quanto falta pra cada nível de meta e a lista das baixas já registradas.",
          "O mesmo indicador aparece resumido ao lado dos filtros em Contatos, pra você não precisar trocar de tela.",
        ],
      },
      {
        titulo: "Defina os níveis",
        onde: "Configurações → Metas",
        conteudo: [
          "Configure a meta de **vendas por dia** e o **% de recebimento** esperado, em 3 níveis: mínima, média e meta cheia.",
          "Três níveis existem pra que um dia ruim ainda tenha um alvo alcançável, em vez de virar tudo ou nada.",
        ],
      },
    ],
  },
  {
    id: "lancamentos",
    titulo: "Lançamentos",
    icone: "dinheiro",
    href: "/lancamentos",
    resumo: "O caixa: o que já entrou e saiu, e o que ainda vai sair.",
    passos: [
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
        titulo: "Organize por categoria e banco",
        onde: "Lançamentos",
        conteudo: [
          "Cadastre **categorias** (combustível, salário, juros recebidos) e **bancos/contas**. Os gráficos de pizza se montam sozinhos a partir disso.",
          "O **saldo** pode ser corrigido pelo lápis: em vez de mudar um número escondido, o sistema cria um lançamento de ajuste com o motivo — assim continua tudo auditável.",
        ],
      },
    ],
  },
  {
    id: "relatorios",
    titulo: "Relatórios",
    icone: "grafico",
    href: "/relatorios",
    resumo: "Os números que dizem se a carteira está saudável.",
    passos: [
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
        titulo: "Cruze pelo horário de criação",
        onde: "Relatórios",
        conteudo: [
          "O indicador de **criação** mostra o desempenho por **dia da semana**, **horário** e **dia do mês** em que o lead entrou.",
          "Serve pra descobrir, por exemplo, que lead que chega de madrugada paga pior — e ajustar o anúncio.",
        ],
      },
      {
        titulo: "Exporte quando precisar",
        onde: "Relatórios",
        conteudo: [
          "**Exportar PDF** gera um relatório completo do período filtrado.",
          "O **CSV** ao lado das tabelas baixa os dados pra abrir no Excel.",
        ],
      },
    ],
  },
  {
    id: "configuracoes",
    titulo: "Configurações",
    icone: "engrenagem",
    href: "/configuracoes",
    resumo: "WhatsApp, régua de cobrança, equipe, backup e aparência.",
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
        titulo: "Configure a régua de cobrança",
        onde: "Configurações → Régua de cobrança",
        conteudo: [
          "A régua define **qual mensagem enviar conforme os dias de atraso** — quem atrasou 1 dia não deve receber o mesmo texto de quem atrasou 20.",
          "Clique em **Criar régua sugerida** pra começar com 6 faixas prontas (véspera, vence hoje, 1-3, 4-7, 8-15, 16+) e edite os textos do seu jeito.",
          "Use variáveis como `{{nome}}`, `{{valor_aberto}}` e `{{dias_atraso}}` — elas são trocadas pelos dados reais no envio.",
        ],
        atencao: "O envio sai automaticamente 1h30 antes do horário limite de pagamento, uma vez por dia por cliente.",
      },
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
        titulo: "Receba alertas no seu WhatsApp",
        onde: "Configurações → Alertas",
        conteudo: [
          "Informe seu número e ative o **resumo diário** no horário que preferir: recebido do dia, quantos pagaram, vendas e total em atraso.",
          "Os **avisos críticos** chegam na hora quando um número de WhatsApp cai ou um cliente com capital alto vira calote.",
          "Use **Enviar teste agora** pra confirmar que está chegando.",
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
