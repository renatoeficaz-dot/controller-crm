@AGENTS.md

# Controller CRM — Guia do Projeto

## Stack
- **Next.js 16** (App Router, JavaScript/JSX, Tailwind CSS v4)
- **Prisma 6** + **SQLite** (banco em volume `/data/prod.db` em produção)
- **bcryptjs** para senhas; auth custom com HMAC-SHA256 (lib/auth.js + middleware.js)
- Sem TypeScript, sem ORMs adicionais, sem libs de UI externas

## Produção
- **URL**: `https://v13h86psg1rq1ivqbjmtpalp.185.101.104.154.sslip.io`
- **VPS**: HostMF 185.101.104.154, Ubuntu, 2GB RAM
- **Coolify** v4.1.2 na porta 8000 (app ID=2, uuid=v13h86psg1rq1ivqbjmtpalp)
- **SSH**: chave em `C:\Users\renat\.ssh-crm\crm_key` (acesso root sem senha)
- **Volumes**: `/data` (banco), `/app/public/uploads` (anexos)
- **HTTPS**: Let's Encrypt via Traefik (custom_labels no banco do Coolify)
- **Evolution API**: webhook em `https://.../api/webhook/evolution`, instância "Vendas"

## Deploy
A API do Coolify está **desativada**. Deploy é via tinker do Laravel:
```php
$app = \App\Models\Application::find(2);
$uuid = (string) new \Visus\Cuid2\Cuid2();
queue_application_deployment(application: $app, deployment_uuid: $uuid, force_rebuild: false);
```
Variáveis de ambiente devem ser inseridas **via model** (o Coolify criptografa os valores):
```php
$ev = new \App\Models\EnvironmentVariable();
$ev->key = 'NOME'; $ev->value = 'valor';
$ev->is_runtime = true; $ev->is_buildtime = false;
$ev->resourceable_type = 'App\\Models\\Application'; $ev->resourceable_id = 2;
$ev->save();
```

## Autenticação
- Login por cookie httpOnly assinado (`crm_session`, HMAC-SHA256 com AUTH_SECRET)
- Middleware protege todas as rotas exceto `/login`, `/api/auth/*` e `/api/webhook/*`
- 3 níveis: **admin** (tudo), **vendedor**, **cobrador**
- Admin vê tudo; não-admin tem: `verTodosLeads`, `kanbansVisiveis`, `numerosVisiveis`
- Login produção: `admin` / `admin123` (usuário "Maça", role admin)

## Estrutura do código
```
app/
  api/
    auth/login|logout|me/     → autenticação
    contacts/[id]/             → CRUD contato (GET marca msgs como lidas)
    contacts/[id]/messages/    → envio/listagem de msgs WhatsApp
    contacts/[id]/parcelas/    → gera/lista parcelas
    contacts/[id]/renovar/     → renovação de empréstimo
    contacts/[id]/tags/        → atribui/remove tags
    contacts/bulk/             → ações em massa
    stages/                    → colunas Kanban (aplica permissões)
    numbers/[id]/connect/      → conecta WhatsApp + seta webhook automático
    lancamentos/               → extrato financeiro (categorias, bancos)
    tags/ + tags/rules/        → tags e auto-tag
    webhook/evolution/         → recebe msgs da Evolution (PÚBLICO)
    units/ + users/ + config/  → CRUD auxiliares
  chat/           → página de chat unificado
  contatos/       → página do Kanban
  configuracoes/  → página de config (admin only)
  lancamentos/    → página de lançamentos (admin only)
  relatorios/     → página de relatórios
  login/          → tela de login
  rutas/[id]/     → detalhe de ruta (legado, pode remover)

components/
  TopNav.jsx           → menu responsivo com hamburger mobile
  KanbanBoard.jsx      → funil com filtros, ações em massa, bolinha verde
  ContactModal.jsx     → modal do contato (dados + chat + parcelas + renovação)
  ChatView.jsx         → chat unificado com painel editável do lead
  LancamentosView.jsx  → extrato + gráficos pizza/torre
  Relatorios.jsx       → relatórios financeiros
  Configuracoes.jsx    → abas: Ruta, Honorários/Multa, Usuários, Números, Tags, Mensagens

lib/
  auth.js       → signSession/verifySession (HMAC, sem dependência)
  session.js    → getCurrentUser, isAdmin, helpers de permissão
  prisma.js     → singleton do PrismaClient
  evolution.js  → client da Evolution API + setWebhook
  finance.js    → cálculos de parcelas, multa, horário limite
  cobranca.js   → regenerarParcelas
  relatorios.js → aReceber, totalRecebido, inadimplenciaCravo
```

## Funcionalidades implementadas
1. **Kanban** com drag-and-drop, filtros (situação, responsável, tag), ações em massa
2. **Chat unificado** com painel editável do lead, auto-refresh, envio otimista
3. **WhatsApp** via Evolution API (webhook recebe msgs, auto-tag na 1ª msg)
4. **Login + níveis** (admin/vendedor/cobrador) com permissões granulares
5. **Tags/etiquetas** nos leads + auto-tag por regras + filtro no funil
6. **Lançamentos** (categorias, bancos, extrato, gráficos pizza/torre)
7. **Parcelas** com multa configurável + horário limite
8. **Renovação** de empréstimo (quita → arquiva → novo ciclo com cores verde/vermelho)
9. **Relatórios** (A receber, Recebido, Inadimplência, Caixa Inicial, Novas vendas, Renovações)
10. **Bolinha verde** de notificação em msgs não lidas + cards ordenados por msg mais antiga
11. **Responsivo** para mobile (menu hambúrguer, layouts empilhados)

## Regras importantes
- O webhook `/api/webhook/evolution` DEVE ser público (sem auth) — é assim que a Evolution entrega msgs
- `ciclo` é NOT NULL no schema (default 1) — nunca filtrar por `ciclo: null` no Prisma (o client rejeita a query com "Argument ciclo must not be null", mesmo sem nenhum dado nulo real no banco)
- O `regenerarParcelas` deleta e recria do ciclo atual (não mexe em ciclos anteriores)
- Pagamento de parcela gera lançamento automático de entrada
- `custom_labels` do Traefik ficam em base64 no banco do Coolify (não basta mudar o fqdn)
- Mensagens enviadas têm `instance: null`; recebidas têm a instância da Evolution
