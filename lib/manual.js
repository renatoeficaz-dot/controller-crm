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
        titulo: "Respeite o limite do ciclo",
        onde: "Contatos → ficha do lead",
        conteudo: [
          "Com o **capital escalonado** ligado, cada ciclo tem um teto: o 1º empréstimo é o mais baixo e vai subindo a cada ciclo quitado.",
          "Abaixo do campo **Valor do capital** aparece o limite daquele ciclo. Se passar, o campo avisa em vermelho.",
          "Quem não é administrador é **bloqueado** ao tentar mover pra Liberação pagamento acima do limite.",
        ],
        atencao:
          "É a regra que mais protege seu dinheiro: cliente novo é onde a carteira historicamente perde. Configure em Configurações → Risco / Limites.",
      },
      {
        titulo: "Fique atento ao CPF que já deu calote",
        onde: "Contatos → ficha do lead → CPF",
        conteudo: [
          "Quando um lead vai pra **Cravo**, o CPF dele fica marcado pra sempre — mesmo que ele saia de Cravo depois.",
          "Se esse mesmo CPF aparecer em outro cadastro (com telefone novo, por exemplo), um **aviso vermelho** aparece assim que você salva o CPF.",
          "Ao tentar avançar esse lead no funil, o sistema **barra**. Só administrador consegue liberar, se quiser dar outra chance.",
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
        titulo: "Veja quanto tempo o lead está parado",
        onde: "Contatos (no cartão)",
        conteudo: [
          "Cada cartão mostra há quanto tempo o lead está **naquela coluna**, no formato curto: `2d 5h`, `40m`.",
          "A cor avisa sozinha: **cinza** até 3 dias, **âmbar** de 3 a 7, **vermelho** acima de 7 dias.",
          "O contador zera quando o lead muda de coluna — não quando você edita a ficha dele.",
        ],
        atencao:
          "Lead vermelho em Documentação ou Análise costuma ser lead esquecido: ou falta um documento, ou ninguém retomou a conversa.",
      },
      {
        titulo: "Filtre e trabalhe em massa",
        onde: "Contatos → botão Filtros",
        conteudo: [
          "O botão **Filtros** abre tudo num lugar só: etapa, estado, gênero, tipo de cliente, etiqueta, responsável e data de criação.",
          "O **Em massa** ao lado permite mover, etiquetar ou mandar mensagem para vários leads de uma vez.",
        ],
      },
      {
        titulo: "Veja tudo que já aconteceu com o lead",
        onde: "Ficha do lead → Linha do tempo",
        conteudo: [
          "A linha do tempo junta, em ordem de data, os eventos de **negócio** do lead: mudanças de etapa, baixas, tentativas de contato, negociações e documentos conferidos.",
          "Também mostra **quem já foi responsável** por ele — toda troca fica registrada com quem fez e quando.",
          "As conversas não entram aqui: elas ficam no Chat, pra não misturar as duas coisas.",
        ],
      },
      {
        titulo: "Não dá pra excluir quem ainda deve",
        onde: "Ficha do lead → Excluir",
        conteudo: [
          "Se o lead tem parcela em aberto, o sistema avisa **quanto ele deve** antes de deixar excluir.",
          "Isso evita esconder dívida sem querer — um lead excluído some das listas e ninguém cobra mais.",
        ],
        atencao:
          "A exclusão é reversível por 24h. Depois disso, uma limpeza automática apaga de vez.",
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
      {
        titulo: "Saiba quando a mensagem não saiu",
        onde: "Chat · ficha do lead",
        conteudo: [
          "Se o envio falhar, a mensagem **fica na conversa marcada como \"falhou\"** em vez de sumir sem avisar.",
          "Assim dá pra ver depois que aquele cliente não recebeu — e reenviar quando o número voltar.",
        ],
        atencao:
          "O WhatsApp não informa \"entregue\" e \"lido\" de forma confiável por aqui, então o sistema mostra só o que consegue garantir: saiu ou falhou.",
      },
      {
        titulo: "Descubra que o cliente bloqueou seu número",
        onde: "Ficha do lead (aviso vermelho acima da conversa)",
        conteudo: [
          "O WhatsApp não avisa quando alguém bloqueia você. O único sinal é o envio começar a falhar sempre.",
          "Quando **3 mensagens seguidas falham**, aparece um aviso vermelho sugerindo ligar ou tentar outro canal.",
          "A cobrança automática também para de mandar pra esse número, pra não gastar a cota do WhatsApp à toa.",
        ],
      },
      {
        titulo: "Cancele uma mensagem agendada",
        onde: "Ficha do lead → ícone de calendário (ao lado do relógio)",
        conteudo: [
          "O ícone de **relógio** agenda uma mensagem pra outro momento. O de **calendário** mostra as que ainda não saíram.",
          "Nessa lista você vê a data de cada uma e pode **cancelar** antes do envio.",
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
      {
        titulo: "Se excluir por engano, dá pra desfazer",
        onde: "Tarefas",
        conteudo: [
          "Ao excluir uma tarefa, some um aviso no rodapé da tela por alguns segundos com o botão **Desfazer** — clique nele e a tarefa volta.",
          "Se não clicar, a exclusão é confirmada depois de alguns segundos, do jeito de sempre.",
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
        titulo: "Mude a ordem da fila",
        onde: "Cobrança (botões no topo)",
        conteudo: [
          "**Prioridade** (padrão): valor em aberto cruzado com urgência do atraso — quem atrasou menos vem antes, porque tem mais chance de pagar.",
          "**Mais atrasados**: do atraso maior pro menor. Serve pra atacar o que está encalhando.",
          "**Maior valor**: do maior valor em aberto pro menor, quando o objetivo é recuperar volume.",
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
        titulo: "Cobre quem prometeu e não pagou",
        onde: "Cobrança · registrar tentativa",
        conteudo: [
          "Ao marcar **Prometeu pagar**, o sistema pede a **data** que ele combinou.",
          "Passando dessa data sem o pagamento entrar, o cliente aparece com a etiqueta vermelha **promessa quebrada** e sobe pro topo da fila.",
          "É o caso mais quente que existe: já teve contato e compromisso assumido.",
        ],
      },
      {
        titulo: "Faça um acordo parcelado",
        onde: "Ficha do lead → Cobrança → + Acordo",
        conteudo: [
          "Quando o cliente não tem o valor todo, o botão **+ Acordo** transforma o que está em aberto em parcelas novas: você escolhe o valor total, em quantas vezes e o vencimento.",
          "O valor do acordo pode ser **menor** que a dívida — o desconto fica embutido e aparece na prévia antes de confirmar.",
          "As parcelas antigas saem da cobrança e são substituídas pelas do acordo. O que já foi pago não muda.",
        ],
        atencao:
          "A dívida não é somada duas vezes: depois do acordo, o valor em aberto do cliente é só o do acordo, em toda a tela do sistema.",
      },
      {
        titulo: "Consulte o histórico de negociações",
        onde: "Ficha do lead → Cobrança",
        conteudo: [
          "Cada acordo fechado e cada desconto **aceito ou recusado** fica registrado, com valor, data e quem negociou.",
          "Serve pra não oferecer duas vezes o mesmo desconto a quem já ignorou — e pra saber o que já foi tentado antes de ligar.",
        ],
      },
      {
        titulo: "Acompanhe sua comissão",
        onde: "Cobrança (no topo)",
        conteudo: [
          "Se o administrador configurou comissão, o painel no topo mostra **quanto você já garantiu pra receber** no fim de semana.",
          "Abrindo o painel, você vê dia por dia (segunda a sábado) quanto recuperou e em quais dias bateu a meta.",
          "Só conta o que **você mesmo** deu baixa. O acerto é no fim de semana — domingo é folga e não entra na conta.",
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
      {
        titulo: "Receba um valor quebrado (baixa parcial)",
        onde: "Ficha do lead → parcela → ícone de repetir",
        conteudo: [
          "Quando o cliente paga só uma parte, use a **baixa parcial** em vez de esperar o valor cheio.",
          "A parcela continua em aberto, mas já mostra quanto foi pago. Ela só é quitada quando a soma alcança o valor devido.",
          "Cada pedaço recebido vira um lançamento de entrada na hora — o caixa nunca fica esperando o valor fechar.",
        ],
      },
      {
        titulo: "Receba adiantado (sobra cai nas próximas)",
        onde: "Ficha do lead → parcela → ícone de repetir",
        conteudo: [
          "Se o valor recebido for **maior que o da parcela**, o que sobra não vira troco solto: o sistema usa nas **próximas parcelas em aberto**, na ordem de vencimento.",
          "Ele quita quantas der e deixa a última como parcial, se o valor não fechar exatamente.",
          "No fim aparece um aviso dizendo quais parcelas foram quitadas com a sobra.",
        ],
        atencao:
          "Cada parcela registra só o que era dela. Se o cliente pagar R$ 1.200 e a parcela devia R$ 510, ela registra R$ 510 e os R$ 690 restantes vão pras seguintes — o caixa nunca conta o mesmo dinheiro duas vezes.",
      },
      {
        titulo: "Peça desconto numa parcela",
        onde: "Ficha do lead → parcela → ícone de lápis",
        conteudo: [
          "Precisa reduzir o valor de uma parcela pra fechar o acordo? Clique no lápis, informe o **novo valor** e o **motivo**.",
          "O pedido vai pra aprovação em **Configurações → Auditoria**. O valor só muda de verdade depois que um administrador aprovar.",
        ],
        atencao:
          "Enquanto não for aprovado, a parcela continua com o valor cheio. Não prometa o desconto ao cliente antes da aprovação sair.",
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
      {
        titulo: "Consulte outros dias",
        onde: "Metas (seletor de data no topo)",
        conteudo: [
          "As setas andam um dia pra trás ou pra frente, e o campo de data pula direto pro dia que você quiser. O botão **Hoje** volta pro dia atual.",
          "O que **foi vendido e recebido** naquele dia é histórico real e não muda.",
          "Não dá pra escolher um dia futuro — não existe meta de dia que ainda não aconteceu.",
        ],
        atencao:
          "Em dias passados a **meta** de recebimento é só referência: ela é recalculada sobre a carteira de hoje, porque o sistema não guarda o tamanho que a carteira tinha naquele dia.",
      },
      {
        titulo: "Dê meta própria a um vendedor",
        onde: "Configurações → Usuários → editar",
        conteudo: [
          "No cadastro de cada vendedor há o campo **Meta de vendas própria**, com os mesmos 3 níveis.",
          "Preenchido, ele passa a ver a meta dele na tela Metas em vez da meta geral da empresa.",
          "Deixe em branco pra usar a meta global — e os 3 níveis precisam estar preenchidos juntos pra valer.",
        ],
      },
      {
        titulo: "Veja o que foi fechado no dia",
        onde: "Metas",
        conteudo: [
          "Clique no cartão **Meta de vendas hoje** pra abrir a lista de quem fechou empréstimo hoje, com o valor liberado.",
          "Clique no cartão **Meta de recebimentos hoje** pra ver o que entrou: quem pagou, qual parcela e a que hora.",
          "Clicando num nome, a ficha do lead abre na hora.",
        ],
      },
      {
        titulo: "Acompanhe a meta de uma equipe",
        onde: "Metas (seletor no topo) e Configurações → Equipe",
        conteudo: [
          "Crie a equipe em **Configurações → Equipe**: dê um nome, escolha os membros e, se quiser, uma meta própria (deixe em branco pra usar a meta geral).",
          "Na tela **Metas**, o mesmo seletor que tem “Empresa” e as pessoas agora também lista as equipes — escolha uma pra ver o resultado somado só de quem é dela.",
          "Só administrador enxerga esse seletor.",
        ],
      },
      {
        titulo: "Dê uma meta diferente pra um dia da semana",
        onde: "Configurações → Metas → Meta por dia da semana",
        conteudo: [
          "Sábado costuma render menos que terça — em vez de uma meta única pro ano todo, dá pra abrir cada dia da semana e colocar um número só pra ele.",
          "Dia sem meta própria continua usando a meta geral, normalmente.",
        ],
      },
      {
        titulo: "Compare dois períodos lado a lado",
        onde: "Metas → Comparar dois períodos",
        conteudo: [
          "Escolha as datas do **Período A** e do **Período B** e clique em **Comparar**.",
          "A tabela mostra vendas, capital liberado, recebido e recuperado dos dois lados, com a diferença percentual entre eles — útil pra ver se um mês foi melhor que o anterior, por exemplo.",
        ],
      },
      {
        titulo: "Exporte o histórico de metas",
        onde: "Metas → Exportar CSV (acima do gráfico)",
        conteudo: [
          "Baixa em CSV os últimos 30 dias que aparecem no gráfico: vendas, meta de vendas, capital liberado, recebido, recuperado e se aquele dia tem meta registrada.",
          "Abre certinho no Excel — já sai com separador `;` e acento correto.",
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
        titulo: "Saiba quem está esperando dinheiro",
        onde: "Lançamentos → Fila de liberação",
        conteudo: [
          "Lista quem já foi aprovado e está esperando o capital sair, com quem espera **há mais tempo primeiro**.",
          "O número verde ao lado do nome indica até onde o **saldo de hoje** alcança — o card do topo mostra quantos dá pra atender agora.",
          "Quando entra dinheiro no caixa, essa é a tela pra decidir quem atender.",
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
      {
        titulo: "Transfira entre contas",
        onde: "Lançamentos → Transferir entre contas",
        conteudo: [
          "Pra mover dinheiro de um banco/conta pra outro sem bagunçar o caixa: escolha origem, destino e valor.",
          "O sistema cria os dois lançamentos ligados (saída na origem, entrada no destino) de uma vez.",
        ],
      },
      {
        titulo: "Se excluir por engano, dá pra desfazer",
        onde: "Lançamentos",
        conteudo: [
          "Ao excluir um lançamento, some um aviso no rodapé da tela por alguns segundos com o botão **Desfazer** — clique nele e ele volta.",
          "Se não clicar, a exclusão é confirmada depois de alguns segundos, do jeito de sempre.",
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
        titulo: "Compare seus cobradores",
        onde: "Relatórios → Comparativo entre cobradores",
        conteudo: [
          "Mostra quanto **cada um recuperou**, quantas baixas deu e o **% que recebeu em dia**.",
          "**Carteira aberta** e **calotes** ficam sob quem é responsável pelo lead — são coisas diferentes de quem deu a última baixa.",
          "Serve pra saber quem realmente destrava cobrança e quem deixa a carteira envelhecer.",
        ],
      },
      {
        titulo: "Veja quanto provavelmente não volta",
        onde: "Relatórios → Projeção de perda",
        conteudo: [
          "Aplica o **% de perda esperado** de cada faixa de atraso sobre o que está atrasado, e mostra a perda provável em reais.",
          "Quem parou de pagar é provisionado pelo **saldo inteiro** dele, não só pela parcela vencida — se parou, o risco é do plano todo.",
          "Ajuste os percentuais em Configurações → Risco / Limites.",
        ],
        atencao:
          "É referência pra decidir quanto emprestar, não lançamento contábil: nada disso entra no seu caixa automaticamente.",
      },
      {
        titulo: "Descubra quais clientes dão lucro",
        onde: "Relatórios → Rentabilidade por cliente",
        conteudo: [
          "O lucro de cada cliente é **tudo que ele já pagou menos tudo que você já liberou pra ele**, somando a vida inteira dele na carteira.",
          "Alterne entre **Mais lucro** e **Mais prejuízo** pra ver as duas pontas.",
          "Quem aparece no topo é candidato natural a limite maior; quem está no fundo, o contrário.",
        ],
      },
      {
        titulo: "Exporte quando precisar",
        onde: "Relatórios",
        conteudo: [
          "**Exportar PDF** gera um relatório completo do período filtrado.",
          "O **CSV** ao lado das tabelas baixa os dados pra abrir no Excel — vale também pro comparativo de cobradores e pra rentabilidade.",
        ],
      },
      {
        titulo: "Descubra a melhor hora de cobrar",
        onde: "Relatórios → Análises avançadas",
        conteudo: [
          "O gráfico **Melhor horário para cobrar** mostra em que hora do dia seus clientes mais respondem mensagem.",
          "Cobrar no horário em que eles já costumam responder rende mais que insistir num horário morto.",
        ],
      },
      {
        titulo: "Veja até quando vale insistir",
        onde: "Relatórios → Análises avançadas",
        conteudo: [
          "A **curva de recuperação por faixa de atraso** mostra, de tudo que já chegou a X dias de atraso, quanto % acabou pago.",
          "É o número que responde \"vale a pena continuar cobrando quem está há 60 dias?\" com dado seu, não com achismo.",
          "O **dia do mês que mais recebe** ajuda a concentrar esforço perto das datas de salário e benefício.",
        ],
      },
      {
        titulo: "Saiba onde seu risco está concentrado",
        onde: "Relatórios → Análises avançadas",
        conteudo: [
          "**Concentração de risco** lista os clientes com mais dinheiro em aberto e quanto % da carteira eles representam juntos.",
          "Se poucos clientes concentram muito, o estrago de um calote é bem maior — vale acompanhar esses de perto.",
          "**Previsão de inadimplência por perfil** mostra a taxa histórica de atraso por estado, gênero e tipo de cliente.",
        ],
      },
      {
        titulo: "Antecipe o atraso e a renovação",
        onde: "Relatórios → Análises avançadas",
        conteudo: [
          "**Provável atraso amanhã** lista quem vence amanhã e **já atrasou antes** — priorize esses na cobrança de hoje.",
          "**Perto de quitar** mostra quem está a 1 ou 2 parcelas do fim: é a melhor janela pra sondar a renovação antes do cliente sumir.",
          "**Quitados no mês** e **evolução do valor a cada renovação** mostram quem fechou o ciclo e se o valor emprestado cresce a cada renovação.",
        ],
      },
      {
        titulo: "Confira se o desconto está valendo a pena",
        onde: "Relatórios → Análises avançadas",
        conteudo: [
          "**Efeito do desconto na quitação à vista** mostra quantos aceitaram, quanto foi descontado no total e o % médio de desconto.",
          "Serve pra decidir se o desconto está trazendo dinheiro que não viria, ou só barateando o que já ia entrar.",
        ],
      },
      {
        titulo: "Fique de olho em identidade repetida",
        onde: "Relatórios → Análises avançadas",
        conteudo: [
          "Quando o **mesmo telefone** aparece em cadastros com **CPFs diferentes**, o sistema levanta um alerta.",
          "Pode ser cadastro duplicado inocente — ou a mesma pessoa por trás de mais de um CPF.",
        ],
        atencao:
          "É só um alerta pra você revisar, nunca um bloqueio automático. O sistema não decide sozinho que alguém é laranja.",
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
        titulo: "Limite os envios por hora",
        onde: "Configurações → Números → Aquecimento",
        conteudo: [
          "Além do teto diário do aquecimento, dá pra definir um **teto de envio automático por hora** em cada número.",
          "Serve pra evitar rajada: mandar tudo concentrado em poucos minutos é um padrão que o WhatsApp reconhece como spam, mesmo em número já aquecido.",
          "Deixe **vazio** pra não ter teto por hora.",
        ],
        atencao:
          "O teto vale só pro envio automático (cobrança, Pix, campanha). Mensagem que você manda na mão pelo chat nunca é bloqueada por ele.",
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
        titulo: "Mande o Pix sozinho pra quem está em dia",
        onde: "Configurações → Operação",
        conteudo: [
          "Diferente da régua (que é pra quem já atrasou), essa automação é pro cliente que **ainda não deve nada**: todo dia, no horário escolhido, quem tem uma parcela vencendo e nenhuma parcela atrasada recebe o código Pix pronto pra copiar e colar.",
          "Cadastre a **chave Pix**, o **nome do recebedor** e a **cidade** antes de ligar — sem isso o botão fica bloqueado.",
          "Escolha com quantos dias de antecedência avisar (0 = só no dia do vencimento) e o horário do disparo.",
          "Use `{{pix_copia_cola}}` na mensagem, no lugar onde o código deve entrar.",
        ],
        atencao:
          "Quem tem qualquer parcela atrasada NUNCA entra nessa automação — continua sendo trabalho do cobrador, pela fila de cobrança e pela régua.",
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
        titulo: "Proteja o dinheiro na origem",
        onde: "Configurações → Risco / Limites",
        conteudo: [
          "**Capital escalonado**: defina o valor do 1º empréstimo, quanto sobe por ciclo e um teto. A prévia mostra quanto cada ciclo libera.",
          "**Bloquear CPF que já deu calote**: barra no funil quem já virou Cravo, mesmo voltando com telefone novo.",
          "**Passar cobrança velha pro cobrador sênior**: escolha a partir de quantos dias de atraso o lead troca de responsável sozinho.",
          "**Alerta de capital ocioso**: avisa no seu WhatsApp se o dinheiro fica X dias em caixa sem nenhum empréstimo liberado.",
          "**Provisão de perda**: o % que você espera não receber em cada faixa de atraso, usado na projeção de perda em Relatórios.",
        ],
        atencao:
          "O bloqueio vale no servidor, não só na tela: vendedor e cobrador não conseguem furar o limite nem recarregando a página.",
      },
      {
        titulo: "Configure a comissão dos cobradores",
        onde: "Configurações → Comissão",
        conteudo: [
          "Defina a **meta do dia** (em R$ recuperados) e quanto ele ganha em cada dia que bater.",
          "Defina a **meta da semana** e o bônus que ele ganha uma vez, se o total de segunda a sábado alcançar.",
          "A tabela abaixo mostra a semana atual de cada cobrador: quanto recuperou, quantos dias bateu e quanto tem a receber.",
        ],
        atencao:
          "A semana de cobrança é **segunda a sábado** — domingo é folga e não conta. Cada um vê o próprio acumulado na tela Cobrança.",
      },
      {
        titulo: "Premie quem recupera mais (bônus por faixa)",
        onde: "Configurações → Comissão",
        conteudo: [
          "Em **Bônus progressivo por faixa**, defina faixas do tipo \"a partir de R$ 2.000 recuperados, ganha +3%\".",
          "Vale a **maior faixa alcançada**, e o % incide sobre tudo que a pessoa recuperou na semana — mais fácil de explicar pro cobrador que uma conta em degraus.",
          "O **Simulador** logo abaixo responde \"se eu recuperar X, ganho quanto?\" — útil pra mostrar a meta pra equipe.",
        ],
        atencao:
          "O bônus por faixa vem **desligado**. Enquanto o interruptor estiver desmarcado, ele aparece só como simulação e não entra no acerto real.",
      },
      {
        titulo: "Desconte por lead perdido",
        onde: "Configurações → Comissão",
        conteudo: [
          "O campo **Desconto por lead perdido na semana** tira um valor da comissão a cada lead que a pessoa marcou como perdido.",
          "Deixe em **0** pra manter desligado — é o padrão.",
        ],
        atencao:
          "A comissão nunca fica negativa: se o desconto passar do bônus, o total a receber para em zero.",
      },
      {
        titulo: "Passe a carteira de alguém que saiu",
        onde: "Configurações → Equipe / Fechamento",
        conteudo: [
          "Em **Transferir carteira**, escolha de quem e pra quem, e o sistema troca o responsável de todos os leads de uma vez.",
          "A opção **só os que estão em Recebimento** deixa vendas e negociações em aberto como estão — normalmente é o que você quer.",
          "Toda troca fica registrada na linha do tempo de cada lead e no log de auditoria.",
        ],
      },
      {
        titulo: "Organize a equipe",
        onde: "Configurações → Usuários",
        conteudo: [
          "Crie um usuário por pessoa e escolha o nível: **Administrador**, **Vendedor** ou **Cobrador**.",
          "Para quem não é admin, dá pra restringir: quais **colunas do funil** vê, quais **WhatsApp** acompanha e quais **páginas** acessa.",
          "Deixar tudo desmarcado significa “vê tudo”.",
          "Marque **Somente leitura** pra alguém que só precisa acompanhar, sem poder alterar nada — o sistema mostra tudo, mas recusa qualquer gravação vinda dessa conta.",
          "A coluna **Último acesso** na lista mostra quando cada um entrou pela última vez.",
        ],
      },
      {
        titulo: "Duplique um agente de IA",
        onde: "Configurações → IA",
        conteudo: [
          "Cada agente tem seu prompt, modelo e ferramentas (enviar contato, mandar template, mudar de etapa).",
          "Pra criar um parecido com outro sem reconfigurar tudo de novo, abra o agente que já existe e clique em **Duplicar agente** — nasce uma cópia com “(cópia)” no nome, com tudo igual, só o nome pra você trocar.",
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
        titulo: "Veja quem fez o quê",
        onde: "Configurações → Auditoria",
        conteudo: [
          "Registra as ações que mexem em dinheiro, lead e permissão: mudança de etapa, exclusão de lead ou usuário, baixa e estorno de parcela, acordo fechado, troca de nível e de senha.",
          "Cada linha traz **quem fez, o que fez e quando**. Dá pra filtrar por tipo de ação.",
          "Só administrador vê essa aba.",
        ],
      },
      {
        titulo: "Cheque a saúde do sistema",
        onde: "Configurações → Auditoria (no topo)",
        conteudo: [
          "O painel **Saúde do sistema** resume, num lugar só, o que pode estar quebrado sem ninguém ter percebido: número de WhatsApp desconectado, mensagens que falharam nas últimas 24h e alertas de integridade.",
          "Se estiver tudo certo, aparece **Tudo certo** em verde. Vale olhar no começo do dia.",
        ],
      },
      {
        titulo: "Ache dinheiro que sumiu de vista",
        onde: "Configurações → Auditoria",
        conteudo: [
          "**Integridade dos dados** roda três conferências: lead **excluído que ainda deve**, parcelas que **não fecham a conta** e baixa em dinheiro **sem registro de espécie**.",
          "São os três jeitos mais comuns de dinheiro sumir do controle sem ninguém notar.",
          "O botão **Verificar de novo** roda as checagens na hora.",
        ],
      },
      {
        titulo: "Aprove pedidos de desconto",
        onde: "Configurações → Auditoria",
        conteudo: [
          "Quando um cobrador pede desconto numa parcela, o pedido aparece aqui com o valor original, o pedido e o motivo.",
          "**Aprovar** muda o valor da parcela de verdade; **Recusar** mantém como está. Os dois ficam no log de auditoria.",
        ],
        atencao:
          "A seção só aparece quando há pedido pendente — se não estiver na tela, é porque não há nada pra aprovar.",
      },
      {
        titulo: "Acompanhe o tempo de uso da equipe",
        onde: "Configurações → Auditoria",
        conteudo: [
          "Mostra quanto tempo cada pessoa passou **de fato usando** o sistema hoje e nos últimos 7 dias.",
          "Só conta enquanto há movimento de mouse ou teclado com a aba aberta — deixar o sistema aberto e sair não soma tempo.",
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
