# Controller CRM — guia para quem vai alterar o sistema (Codex / outra IA)

Dono: Renato (microcrédito). Idioma de tudo: **português** (código, mensagens, commits). Ele quer execução direta e respostas curtas.
O `DEPLOY.md` (Vercel/Supabase) está **desatualizado** — a produção roda numa VPS com Coolify, como descrito abaixo.

## 1. Stack e onde roda
- Next.js 16 (App Router, Turbopack) + React, Prisma 6 + **SQLite** (uma conexão só), Tailwind. Antes de mexer em APIs do Next, leia `AGENTS.md` / `node_modules/next/dist/docs/`.
- Produção: VPS (8 GB / 50 GB) com **Coolify**; o container do app fica em `/app`. O `prisma db push` roda quando o container sobe (colunas novas no `schema.prisma` aparecem sozinhas após o deploy).
- Repositório: `https://github.com/renatoeficaz-dot/controller-crm` (branch `main`). O Coolify faz o build da `main`.
- Pasta local: `C:\Users\renat\controller-crm` (Windows 11, Git Bash/PowerShell).

## 2. Regras de trabalho
1. Sempre rodar `npm run build` antes de commitar. O script também roda `scripts-check-ctrl.js`, que barra caracteres de controle em regex (ex.: `\b` virando backspace). Ao escrever código por heredoc/Python, confira com `grep -nP "\x08"`.
2. O `next build` imprime vários "Ecmascript file had an error" sobre `lib/mediaStorage.js`; são avisos antigos, o que vale é o **exit code 0**.
3. `git push` ao GitHub às vezes falha com erro 500: repetir (loop com `sleep 8`).
4. **Aplicar em produção**, não só local (o dono espera isso). Deploy: fazer push na `main` e disparar o deploy do app no Coolify (a VPS é acessada por SSH como root; peça o acesso ao Renato — **nunca** coloque senhas/tokens no repositório).
5. Casar leads por telefone/nome exatos (nunca `contains` em nome curto). Antes de scripts que alterem muitos leads, faça backup/consulta de leitura primeiro.
6. Segredos (chaves de API: DeepInfra, Catta, CNPJá etc.) ficam **só no banco de produção**, na tabela `Config` (tela Configurações). Não escreva chaves em código, `.env` commitado, logs ou respostas.
7. Não enviar mensagens de WhatsApp a clientes reais em teste. Envios em massa precisam de atraso entre mensagens (risco de bloqueio do número).

## 3. Mapa do código
- `prisma/schema.prisma` — modelos: `Contact` (lead/cliente), `Stage` (etapas do Kanban), `Message`, `Parcela`, `Task`, `Config` (singleton `id="singleton"`), `EtapaLog`, `SuporteIa`, `AuditLog`, `WhatsappNumber`, `ContatoReferencia` etc.
- `app/api/**` — rotas (REST). `app/**/page.js` — páginas. `components/**` — UI (Kanban em `KanbanBoard.jsx`, chat em `ChatView.jsx`, ficha em `ContactModal.jsx`, configurações em `Configuracoes.jsx`).
- `lib/**` — regras de negócio:
  - **IA de atendimento (“Iris”)**: `ia.js` (moves, tools, LLM), `fluxoIa.js` (regras determinísticas + leitor de mensagem `lerMensagem`), `fluxoDoc.js` (checklist de documentos, leitura de imagens), `checklistDoc.js` (passos por tipo: `uber`/motoboy e `comerciante`), `followUp.js`, `autoVendaPerdida.js`, `reprocessarSemResposta.js` (varredura de leads sem resposta).
  - **Cobrança/Pix**: `lembreteCobranca.js`, `pixAdimplentes.js`, `guardaPix.js` (trava anti chave antiga/duplicada), `cobranca.js`, `comissao*.js`.
  - **Integrações**: `waha.js` (WhatsApp cobrança), `evolution.js` (WhatsApp vendas), `webhookCommon.js` (entrada de mensagens; webhook em `app/api/webhook/waha/route.js`), `catta.js` (dono do telefone), `cnpja.js` (consulta de CNPJ: cnpj.ws primeiro, CNPJá reserva), `deepinfra.js`.
  - Métricas: `metas.js` (venda = entrada em Recebimento, `Contact.entrouRecebimentoEm`), `relatorios.js`, `alertas.js`.
- `instrumentation.js` — “relógio” do servidor: a cada 5 min roda followUp, leads parados, varredura de sem resposta, lembretes de cobrança, Pix adimplentes, backups etc.

## 4. Como a IA funciona (resumo)
- Fluxo: Novo → Em conversa → Documentação → Análise → Vídeo chamada → Liberação pagamento → Recebimento (+ Venda perdida, Pago, Renovação, Cravo...).
- Modelos (DeepInfra): texto/JSON `Qwen3-235B-A22B-Instruct-2507`; visão e reserva `Llama-4-Maverick-17B-128E-Instruct-FP8`; áudio `Whisper large-v3-turbo` (pt).
- Cada mensagem recebida passa por `fluxoIa` (fila serial por lead): regras fixas primeiro, LLM só para ler/entender. O próximo item do checklist é pedido por `perguntarProximo` (`fluxoDoc.js`). Passos “dado” ficam prontos quando o campo da ficha é preenchido (`derivado` em `estadoDocumentacao`).
- Venda perdida automática é desligada por padrão (`IA_PODE_PERDER=false`), com exceções explícitas em `autoVendaPerdida.js` (ex.: não respondeu após o follow-up final).
- O comando do dono **“conversas”** = auditar todas as conversas Novo→Documentação, corrigir erros/silêncios **e a causa** nas regras.

## 5. Armadilhas conhecidas
- Evento do WAHA: aceitar `message` **e** `message.any` (antes se perdiam mensagens recebidas).
- Eco de mensagens enviadas pelo celular: há dedupe em `webhookCommon.js`.
- A chave Pix telefone antiga **não existe mais** e não pode aparecer em lugar nenhum; só a chave e-mail atual, protegida por `guardaPix.js`. Envios de Pix/lembrete reservam o registro **antes** de enviar (evita duplicar).
- `scrollIntoView` empurra a tela inteira no celular: use `rolarAteOFim` (`lib/rolar.js`).
- Funções locais com o mesmo nome de um import já travaram o card de “Liberação pagamento” (loop infinito).
- `Contact` em “Venda perdida” não conta em totais/relatórios.

## 6. Pendências abertas (07/10/2026)
- Catta (dono do telefone de referência): integração pronta e ativa, mas a conta está sem crédito (`out_of_credits`).
- Alguns números de WhatsApp de cobrança (Santa Catarina) com erros de envio de Pix repetidos a cada 5 min; causa não investigada (talvez número sem WhatsApp). Falta limitar as tentativas.
- Varredura `varrerSemResposta`: não ficou confirmado que reprocessa todos os leads sem resposta após deploys.
- Consulta de CPF: o Hub do Desenvolvedor foi testado e descartado por custo; nada de CPF está integrado.
- Provedores de dados pessoais de origem duvidosa (ex.: data-api.click) **não** devem ser integrados — dados de terceiros sem base legal (LGPD). Para placa/telefone, usar provedores com origem de dados declarada.

## 7. Como fazer uma mudança típica
1. Ler o código ao redor e seguir o estilo (comentários em português explicando o porquê).
2. Alterar, `npm run build`, `git add -A && git commit && git push origin HEAD:main`.
3. Deploy no Coolify; conferir se o app voltou e o log não tem erro.
4. Se mexeu em regra da IA, testar com um lead de teste/leitura do histórico, nunca com cliente real.
