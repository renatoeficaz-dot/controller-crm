# Controller CRM — Resumo da sessão (alterações recentes)

Documento gerado para dar contexto a outra IA (Codex) que vai continuar editando o sistema junto com o Claude Code. Cobre tudo que foi implementado nesta sessão, em ordem cronológica, com detalhes técnicos suficientes pra não precisar reler o código do zero.

## Acesso e Deploy (pra editar E publicar)

### Repositório
- Local: `C:\Users\renat\controller-crm`
- Remoto: `https://github.com/renatoeficaz-dot/controller-crm` (branch `main`, push direto sem PR)
- Padrão de commit: mensagem curta em português explicando o "porquê", corpo com 2-4 linhas quando o motivo não é óbvio, sem `Co-Authored-By` obrigatório (o Claude Code adiciona `Co-Authored-By: Claude Sonnet 5` automaticamente nos commits dele — o Codex pode usar sua própria assinatura).

### Servidor (VPS com Coolify)
- IP: `185.101.104.154`
- Usuário SSH: `root`
- Chave privada: `C:/Users/renat/.ssh-crm/crm_key` (já existe nesta máquina — se o Codex rodar em outra máquina/ambiente, **copie o arquivo da chave diretamente** para lá em vez de transcrevê-la como texto; é uma chave privada, tratar como segredo).
- Comando de conexão: `ssh -i /c/Users/renat/.ssh-crm/crm_key -o StrictHostKeyChecking=no root@185.101.104.154 "<comando>"`
- Painel Coolify: roda no próprio container `coolify` (dashboard na porta 8000, mas o deploy é feito via CLI/tinker, não pela UI, nesta sessão).

### Como funciona o deploy (passo a passo exato usado nesta sessão)

1. **Commit + push** normal (`git add`, `git commit`, `git push origin main`).
2. **Disparar o deploy** — escrever um script PHP local e rodá-lo dentro do container `coolify` via tinker:
   ```php
   // salvar como /tmp/deploy_tinker.php (sem tag <?php no início — o tinker já espera código puro)
   $app = \App\Models\Application::find(2);
   $deployment_uuid = \Illuminate\Support\Str::orderedUuid();
   queue_application_deployment(
       deployment_uuid: $deployment_uuid,
       application: $app,
       force_rebuild: false,
   );
   echo "DEPLOY_UUID:" . $deployment_uuid . "\n";
   ```
   ```bash
   scp -i /c/Users/renat/.ssh-crm/crm_key -o StrictHostKeyChecking=no /tmp/deploy_tinker.php root@185.101.104.154:/tmp/deploy_tinker.php
   ssh -i /c/Users/renat/.ssh-crm/crm_key -o StrictHostKeyChecking=no root@185.101.104.154 \
     "docker cp /tmp/deploy_tinker.php coolify:/tmp/deploy_tinker.php && docker exec -i coolify php artisan tinker < /tmp/deploy_tinker.php"
   ```
   `Application::find(2)` — o **ID 2** é fixo pra este app dentro do banco do Coolify (não muda; é o `id` da tabela `applications`, não o `uuid` público do domínio).
3. **Aguardar o deploy terminar** (leva de 1 a 3 minutos — build do Next.js + `prisma db push` + restart):
   ```php
   // /tmp/check_deploy.php
   $d = \App\Models\ApplicationDeploymentQueue::where('deployment_uuid', '<DEPLOY_UUID_do_passo_2>')->first();
   echo $d ? $d->status : "not_found";
   ```
   Rodar em loop (`sleep 15` entre tentativas) até o status virar `finished` (ou `failed`, aí precisa olhar os logs do deploy pela mesma query, campo adicional, ou `docker logs` do container novo).
4. **Limpar os arquivos temporários** em `/tmp` local e remoto (`rm -f /tmp/deploy_tinker.php /tmp/check_deploy.php` nos dois lados).

**Não existe passo manual de schema** — o container roda `npx prisma db push --skip-generate --accept-data-loss && node prisma/ensure-stages.js && npm start` no boot, então qualquer mudança em `prisma/schema.prisma` já commitada é aplicada automaticamente no próximo deploy.

### Container da aplicação (nome muda a cada deploy!)
O nome do container Docker da aplicação **muda a cada deploy** (padrão `v13h86psg1rq1ivqbjmtpalp-<timestamp>`). Pra achar o nome atual:
```bash
ssh -i /c/Users/renat/.ssh-crm/crm_key -o StrictHostKeyChecking=no root@185.101.104.154 "docker ps --format '{{.Names}}' | grep -iv coolify | grep -v waha"
```
(o `grep -iv coolify` remove os containers de infraestrutura do próprio Coolify — `coolify`, `coolify-db`, `coolify-proxy`, `coolify-redis`, `coolify-realtime`, `coolify-sentinel`; `grep -v waha` remove o container do WAHA, que é outro serviço rodando na mesma VPS).

Esse container é usado, por exemplo, pra rodar scripts Node avulsos de diagnóstico/backfill (copiar o script pra `/app/` dentro do container via `docker cp`, rodar com `docker exec -w /app <container> node script.js` — precisa ser `/app`, não `/tmp`, porque é lá que existe `node_modules` com o Prisma Client já gerado).

### Banco de dados
- **SQLite**, arquivo único: `DATABASE_URL=file:/data/prod.db` dentro do container (não é Postgres/Supabase, apesar de menções antigas em `DEPLOY.md`/`README.md` sugerirem isso — confirmado ao vivo nesta sessão via `printenv` no container).
- Sem pasta de migrations — schema é `db push` direto (ver acima). Cuidado: `--accept-data-loss` está ligado, então mudanças que exigem recriar coluna/tabela com perda de dados **não pedem confirmação**, aplicam direto no deploy.

### Variáveis de ambiente relevantes (ler do container, não estão hardcoded em lugar nenhum do repo)
```bash
ssh -i /c/Users/renat/.ssh-crm/crm_key -o StrictHostKeyChecking=no root@185.101.104.154 \
  "docker exec <nome-do-container-atual> printenv"
```
As mais usadas nesta sessão: `AUTH_SECRET` (assina o cookie de sessão — ver abaixo), `DATABASE_URL`, `EVOLUTION_API_URL`/`EVOLUTION_API_KEY` (fallback global, cada número pode ter config própria salva no banco via tela de Configurações).

### Testar autenticado em produção sem saber a senha de ninguém
Gera um cookie de sessão válido localmente, replicando a assinatura HMAC-SHA256 de `lib/auth.js` (não precisa logar de verdade nem saber senha):
```bash
node -e "
const crypto = require('crypto');
const secret = '<AUTH_SECRET do container, ver acima>';
function b64url(buf) { return buf.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+\$/,''); }
const payload = { uid: '<id do usuário admin>', role: 'admin', name: 'Nome', exp: Date.now() + 1000*60*60*24 };
const body = b64url(Buffer.from(JSON.stringify(payload)));
const sig = b64url(crypto.createHmac('sha256', secret).update(body).digest());
console.log(body + '.' + sig);
"
```
Setar como cookie `crm_session` no browser (`document.cookie = "crm_session=<token>; path=/"`) na origem de produção. Pra achar o `uid` de um admin: consultar `prisma.user.findFirst({ where: { login: 'kabrito' } })` via script no container, ou pedir pro usuário.

### Domínio de produção
`https://v13h86psg1rq1ivqbjmtpalp.185.101.104.154.sslip.io` (subdomínio automático do Coolify baseado no IP — sem domínio próprio configurado ainda).

---

## Sobre o projeto

- **Stack**: Next.js 16 (App Router), Prisma 6 + SQLite (sem pasta de migrations — schema é aplicado com `prisma db push --skip-generate --accept-data-loss`), Tailwind v4. Sem biblioteca de gráficos externa (componentes SVG/CSS próprios em `components/Relatorios.jsx`: `HBarChart`, `VBarChart`, `DonutChart`, `Card`).
- **Produto**: CRM de microcrédito ("Cap Cred") com funil Kanban, integração WhatsApp (Evolution API e WAHA), IA (DeepInfra) respondendo leads, cobrança de parcelas diárias.
- **Deploy**: VPS própria (185.101.104.154) rodando Coolify. Deploy = commit + push pro GitHub + um script PHP via `docker exec ... php artisan tinker` que chama `queue_application_deployment()` no container do Coolify, depois faz polling do status em `ApplicationDeploymentQueue`. O container da aplicação (Next.js) roda `npx prisma db push --skip-generate --accept-data-loss && node prisma/ensure-stages.js && npm start` no boot — ou seja, mudanças de schema são aplicadas automaticamente a cada deploy, sem passo manual.
- **Repo**: `C:\Users\renat\controller-crm`, branch `main`, push direto (sem PR) — autorização permanente do usuário pra alterar/implementar sem perguntar antes.

---

## 1. Anti-bloqueio de WhatsApp (VPS/IP + padrão de envio)

**Problema relatado:** número era banido na hora ao conectar via QR code.

**Diagnóstico:** WhatsApp detecta e bane IPs de datacenter/VPS. Além disso, os disparos automáticos do sistema (lembretes de cobrança, follow-up da IA) mandavam mensagem pra cada contato elegível **em sequência, sem pausa** — padrão clássico de spam.

**Implementado:**
- **Proxy dedicado por número** (`prisma/schema.prisma` → `WhatsappNumber.proxyServer/proxyUsername/proxyPassword`): campo em Configurações → Números → "Proxy dedicado", aplicado tanto no `POST /instance/create` da Evolution (`proxyHost/Port/Protocol/Username/Password`) quanto no `config.proxy` do WAHA (`lib/waha.js`, `lib/evolution.js`, `app/api/numbers/[id]/connect/route.js`). Recomendação passada ao usuário: proxy **ISP/estático dedicado** (não datacenter, não residencial rotativo), um IP exclusivo por número.
- **Espaçamento aleatório (5-15s) entre envios em massa**: `lib/lembreteCobranca.js` e `lib/followUp.js` (dois loops: follow-up de 30min e resposta a mensagens sem resposta) — antes de cada envio (exceto o primeiro do ciclo), `await new Promise(r => setTimeout(r, 5000 + Math.random()*10000))`.
- Recomendações adicionais dadas ao usuário (não implementadas em código): aquecimento gradual de número novo, evitar reconectar/desconectar à toa, preferir WAHA (engine WEBJS, Chromium real) sobre Evolution (Baileys, reimplementa o protocolo) para números de risco.

---

## 2. Puxada (consulta de crédito) e CPF no lead

**Pedido:** campo pra anexar PDF da "puxada" (consulta de crédito feita manualmente em site externo) no card do lead, sempre visível.

**Implementado:**
- `Contact.puxadaUrl / puxadaFileName / puxadaEm` no schema.
- `app/api/contacts/[id]/puxada/route.js`: `POST` (recebe `{base64, fileName, mimetype}`, valida `application/pdf`, salva via `lib/mediaStorage.js::saveMediaBase64`, atualiza o contato) e `DELETE`.
- `components/PuxadaAnexo.jsx` (componente compartilhado, extraído depois de duplicado sem querer entre `ContactModal.jsx` e `ChatView.jsx`): botão "+ Anexar PDF", preview inline via `MediaLightbox` (reaproveitado de `MediaBubble.jsx`, que foi exportado nomeadamente pra isso), botão "Remover".
- Botão **"🔍 Puxada"**: abre `https://detetiveforense.com` em nova aba e copia o telefone do lead pra área de transferência — login/busca/exportação continuam **manuais**. Decisão deliberada: automatizar login com senha de terceiro (mesmo "só o sistema fazendo, não você Claude") foi recusado — exigiria login real durante o desenvolvimento pra mapear o site, categoria de ação proibida, e provavelmente violaria os termos de uso do serviço (scraping/autoclique).
- Visualizador de PDF (`MediaLightbox` em `components/MediaBubble.jsx`) ganhou botão **"⤢ Aumentar"** (alterna entre `max-w-3xl` e quase tela cheia `98vw/95vh`).
- **CPF**: `Contact.cpf` (String?). IA preenche sozinha ao ler RG/CNH em `lib/ia.js` (nova função de extração, chamada dentro do fluxo de `respondWithIa`, não sobrescreve valor já preenchido manualmente). Campo com botão de copiar (📋 → ✓ por 1,5s).
- Tudo isso existia só no `ContactModal.jsx` (modal do Kanban) — **não aparecia no Chat**, porque `components/ChatView.jsx` tem um form de edição de lead **próprio e separado** (raiz do bug: duas telas, duas implementações). Corrigido replicando CPF + `<PuxadaAnexo/>` lá também.

**Ponto de atenção pra próximas mudanças:** qualquer campo novo do `Contact` editável precisa ser adicionado em **dois lugares**: `components/ContactModal.jsx` (Kanban) e `components/ChatView.jsx` (painel do Chat) — não há um componente de edição de lead único ainda. Seria uma boa refatoração futura unificar isso.

---

## 3. Data de criação do lead + cruzamento em Relatórios

- Campo **"Criação"** (só-leitura) mostrando dia da semana + data + hora (`Contact.createdAt`), adicionado em `ContactModal.jsx` e `ChatView.jsx`.
- Em `components/Relatorios.jsx`, nova seção **"Por criação da lead"**: dois gráficos (% inadimplência e valor recebido no período) agrupados pelo `createdAt`, com **3 granularidades alternáveis por botão**: dia da semana, horário do dia (0-23h), dia do mês (1-31). Implementado com um objeto `CRIACAO_AGRUPAMENTOS` genérico (`{ label, keys, labels, keyFn }`) que parametriza o `Date` extraído — fácil de adicionar uma 4ª granularidade se precisar.

---

## 4. Links de rastreamento (UTM) — sistema completo de atribuição de leads

**Pedido:** gerar links de redirecionamento pro WhatsApp de vendas, rastreando por UTM, região, dispositivo, navegador, dia/horário do clique.

**Modelo de dados (`prisma/schema.prisma`):**
```prisma
model LinkCampanha {
  id, nome, slug (unique), numeroId (FK WhatsappNumber), regiao (texto livre),
  utmSource, utmMedium, utmCampaign (metadados "de etiqueta", definidos na criação do link),
  mensagem (texto pré-preenchido no wa.me), cliques (Int, contador),
  leads (Contact[] — relação reversa), cliquesLog (LinkClique[])
}
model LinkClique {
  id, campanhaId, dispositivo, navegador (parseados do User-Agent),
  regiao (geoip do IP, best-effort), utmSource/Medium/Campaign/Term/Content
  (os que vieram NA URL do clique — diferentes das UTMs "de etiqueta" da campanha),
  createdAt
}
```
`Contact.campanhaId` (FK opcional) — atribuição de **primeiro toque**, setada só na criação do lead.

**Fluxo:**
1. Admin cria um link em **Configurações → Links (UTM)** (`components/Configuracoes.jsx`, função `Campanhas()`): nome, número de destino, região, UTM source/medium/campaign, mensagem pré-preenchida. Slug gerado automaticamente (nome normalizado + sufixo aleatório).
2. `GET /l/[slug]` (`app/l/[slug]/route.js`) — rota **pública** (adicionada em `middleware.js` → `PUBLIC_PREFIXES` como `"/l/"`, **com a barra no final** pra não colidir com `/lancamentos`, que é admin-only): loga o clique **em segundo plano** (`logClique()` sem `await` — processo Node persistente, não serverless, então não corta a promise) e redireciona **imediatamente** (302) pra `https://wa.me/<numero>?text=<mensagem>+[ref:slug]`.
3. `logClique()`: parseia User-Agent (`lib/userAgent.js` — dispositivo Celular/Tablet/Computador, navegador Chrome/Safari/Firefox/Edge/Instagram-in-app/Facebook-in-app), geolocaliza o IP (`lib/geoip.js`, usa `http://ip-api.com/json/{ip}` — gratuito, sem chave, ~45 req/min, timeout de 3s, falha silenciosa), lê `utm_*` da query string da própria URL do clique, grava um `LinkClique` e incrementa `LinkCampanha.cliques`.
4. Quando o lead manda a mensagem pré-preenchida (com a tag `[ref:slug]`), `lib/webhookCommon.js::processIncomingMessage` detecta o padrão `/\[ref:([a-z0-9-]+)\]/i` no texto **antes** de criar o contato, remove a tag do texto visível, busca a `LinkCampanha` pelo slug e seta `campanhaId` na criação do `Contact` (só nessa hora — não sobrescreve depois).
5. `app/api/stages/route.js` inclui `campanha: { select: { id, nome, regiao } }` no include dos contatos, pra Relatórios conseguir cruzar.
6. `components/Relatorios.jsx`: seção **"Leads por link de rastreamento"** (contagem + inadimplência por campanha, incluindo "Sem origem" pros leads sem link).
7. Em Configurações → Links, cada link tem **"Ver cliques"** clicável (`GET /api/campanhas/[id]/cliques`, últimos 100), tabela com quando/dispositivo/navegador/região/UTMs (as 5: source, medium, campaign, term, content).

**Decisão deliberada:** região do clique usa geoip por IP (não pedimos permissão de geolocalização no browser — não faz sentido pra um redirect sem interação). Região da campanha (metadado) é texto livre, sem geoip — o admin já sabe pra onde está anunciando.

---

## 5. Reorganização de UI: filtros em modal, título/busca na mesma linha

Motivação: o usuário foi pedindo, passo a passo, pra reduzir o espaço vertical "gasto" com filtros/controles espalhados em várias linhas, especialmente no Kanban (`components/KanbanBoard.jsx`), que é a tela mais usada.

**Padrão aplicado (repetido em Kanban/Chat/Relatórios/Tarefas):** em vez de várias linhas de `<select>`/pills de filtro, um único botão **"Filtros"** (com badge de contagem de filtros ativos) que abre um modal (`fixed inset-0 z-50 bg-slate-900/40 ...`) com todos os controles dentro, mais um botão **"Limpar tudo"**.

- **KanbanBoard.jsx**: removido o link "⚡ Automatizar funil". Uma linha só: **Título "Funil de contatos" + subtítulo | busca | botão Filtros | MetasMini (pill horizontal) | select "Em massa" | botão "+ Novo contato"**. O modal de filtros cobre: Situação (multi-seleção), Responsável, Tag, Região, Gênero, Tipo de cliente, Tarefas, Ordenar.
  - `app/contatos/page.js` foi simplificado até virar só `<KanbanBoard/>` — título, metas e botão "Novo contato", que antes viviam no `page.js` (Server Component), foram **movidos pra dentro do próprio `KanbanBoard.jsx`** (Client Component) pra caber tudo numa linha só. Chegou a existir um `NovoContatoButton.jsx` com evento global (`window.dispatchEvent(new Event("kanban:novo-contato"))`) como ponte entre Server/Client Component — **foi removido** depois que o título também migrou pra dentro do Client Component (deixou de ser necessário).
- **ChatView.jsx**: lista de conversas — situação/etapa/etiqueta/número/ordenação saem da coluna lateral, viram botão "Filtros" ao lado da busca.
- **Relatorios.jsx**: pills de "Estado" viram botão "Filtros"; modal ganhou também Etapa, Gênero, Tipo de cliente, **Data de criação da lead** (novo filtro por range de `createdAt`) e Período (preset + range, que antes vivia solto na seção "Total recebido" — o controle de lá virou um link "trocar" que abre o mesmo modal). O cálculo de `stagesFiltrados` foi generalizado pra aplicar os 5 filtros combinados (estado/etapa/gênero/tipoCliente/criação), não só estado.
- **TarefasView.jsx**: form "Nova tarefa" saiu do topo da página, virou modal atrás de um botão **"+ Incluir tarefa"**.

**MetasMini — história tumultuada (vale ler se for mexer):**
1. Existia como cards verticais (~124px de altura) no cabeçalho de Contatos (`app/contatos/page.js`), num grid de 3 colunas ao lado do título.
2. Usuário reclamou de espaço vazio entre título e busca — causa raiz identificada: o card de metas tem fundo quase branco sobre fundo cinza claro (`bg-white` vs `bg-slate-50`), com pouco contraste — em screenshot comprimido parecia "espaço vazio", mas era o widget carregado.
3. Tentativa 1: esconder no mobile (`hidden md:block`) — não resolveu pois o usuário via em telas ≥768px (md), onde o widget ainda aparecia.
4. Tentativa 2: **removido inteiramente** do cabeçalho (`components/MetasMini.jsx` deletado) — usuário reclamou "sumiu as metas".
5. Versão final: `MetasMini.jsx` recriado como **pill horizontal única linha** (`"Vendas X% · Recebimentos Y%"`, mesma altura ~30px do botão Filtros), inserida na linha de filtros do `KanbanBoard.jsx` (não mais em `page.js`).

**Fica pra próxima IA:** se o usuário pedir mais ajuste de layout no Kanban, o padrão de "um botão + modal" já está estabelecido — reaproveitar em vez de reinventar. Testar sempre em pelo menos 2 larguras (768px e mobile 375px) porque os breakpoints Tailwind (`sm`=640, `md`=768) já causaram confusão nessa sessão sobre "que elemento aparece em qual largura".

---

## 6. Controle de acesso por página, por usuário

**Pedido:** além de já existir controle por usuário de quais **colunas do Kanban** (`kanbansVisiveis`) e quais **números de WhatsApp** (`numerosVisiveis`) ele vê, adicionar controle de quais **páginas/áreas do sistema** ele pode acessar.

**Implementado:**
- `User.paginasVisiveis` (String?, CSV — ex.: `"contatos,chat"`). Vazio/null = acessa todas (mesmo padrão UX já usado pros outros dois campos: "nenhum marcado = vê tudo").
- `lib/paginas.js`: `PAGINAS_SISTEMA = [{key,label}]` — **contatos, chat, tarefas, metas, relatorios**. Deliberadamente **exclui** `lancamentos` e `configuracoes`, que continuam travadas por `role === "admin"` no `middleware.js` (não faz sentido "liberar" configurações pra não-admin).
- `lib/session.js`: `paginasVisiveis(user)` (retorna `null` ou array) e `podeAcessarPagina(user, key)` (bool).
- **Dupla camada de enforcement:**
  1. **Server-side real** (não é só estético): cada `app/{contatos,chat,tarefas,metas,relatorios}/page.js` virou `async function` que chama `getCurrentUser()` + `podeAcessarPagina()` — se bloqueado, renderiza `<div>Você não tem acesso a esta página.</div>` em vez do conteúdo. Acesso direto por URL não passa.
  2. **UI**: dois componentes de navegação (existem os dois, são independentes!) filtram os links: `components/TopNav.jsx` (menu do topo) e `components/SideNav.jsx` (trilho de ícones fixo à esquerda, `hidden md:flex`). **Os dois precisam ser mantidos em sincronia** — nessa sessão o `SideNav.jsx` foi esquecido na primeira leva e corrigido depois.
  3. **Não foi tocado o `middleware.js`** pra essa parte — ele roda em runtime leve (comentário no código: "compatível com o runtime edge", evita import de `next/headers`/Prisma) e só faz checagem de `role` via JWT, sem ir ao banco. A checagem de `paginasVisiveis` precisa do banco (dado por-usuário, não cabe no JWT sem re-login), por isso foi feita nos Server Components das páginas em vez do middleware.
- UI de edição: `components/Configuracoes.jsx` → aba Usuários → painel lateral → seção **"Locais que pode acessar"**, mesmo padrão visual (grid de checkboxes) já usado em "Kanbans que pode ver" e "WhatsApp cujas mensagens pode ver". `app/api/users/route.js` (POST) e `app/api/users/[id]/route.js` (PATCH) aceitam `paginasVisiveis: string[]`, salvam como `.join(",")`.

**Testado em produção:** criado usuário de teste vendedor com `paginasVisiveis=["contatos"]`, logado de verdade, confirmado que `/chat` mostra a mensagem de bloqueio e que tanto TopNav quanto SideNav só mostram "Contatos". Usuário de teste removido depois.

---

## Coisas que ficaram pendentes / não implementadas (e por quê)

1. **Autoclique/login automático no site de puxada (detetiveforense.com)** — recusado. Exigiria login com senha real feito pelo assistente (mesmo que "só o sistema" execute depois, o desenvolvimento/teste exige), categoria de ação que não deve ser automatizada; também provável violação dos termos do serviço de terceiro.
2. **IP geolocation pra região dos leads** (diferente da região do *clique* no link, que já tem geoip) — decisão consciente de não usar, pra manter simples/gratuito; a região do lead continua vindo só do DDD do telefone (`lib/ddd.js`) e do que a IA extrai da conversa.
3. **Unificação do form de edição de lead** (Kanban vs Chat usam componentes duplicados) — mencionado como dívida técnica, não foi refatorado nessa sessão (só evitado que piorasse, extraindo `PuxadaAnexo.jsx` como componente compartilhado).
4. As projeções financeiras de bônus/faturamento discutidas no chat (fases de bônus do cobrador, faturamento da empresa) foram só **cálculos apresentados em texto**, sem virar feature no sistema — se o usuário quiser, dá pra transformar isso numa tela de simulação em Configurações ou Metas.

## Padrões gerais do código (pra manter consistência)

- Comentários em português, curtos, só explicando o "porquê" não óbvio (não o "o quê").
- Sem lib de UI externa — Tailwind puro, componentes pequenos reaproveitados (`SectionCard`, `Field`, `NumberField` em `Configuracoes.jsx`).
- Padrão "nenhum marcado = vê/acessa tudo" é usado em toda permissão por lista (kanbans, números, páginas) — manter esse comportamento em qualquer permissão nova.
- Todo deploy precisa ir pra produção (VPS), nunca só local — usuário confirmou isso como preferência permanente.
