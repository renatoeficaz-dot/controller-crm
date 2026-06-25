# Controller CRM

CRM de contatos com **funil Kanban** e **atendimento por WhatsApp** integrado à
[Evolution API](https://doc.evolution-api.com/). Inspirado no conceito do TryController.

Stack: **Next.js (App Router) + Prisma + SQLite + Tailwind CSS**.

## Rodando localmente

```bash
npm install
npx prisma db push      # cria o banco SQLite
node prisma/seed.js      # popula colunas + contatos de exemplo (opcional)
npm run dev              # http://localhost:3000
```

## Funcionalidades

- **Kanban de contatos**: colunas (Novo Lead → Em Conversa → Negociando → Fechado → Perdido),
  arrastar e soltar cartões entre colunas (persiste no banco).
- **Cartão do contato**: dados editáveis (nome, WhatsApp, e-mail, empresa, observações).
- **Chat WhatsApp** no próprio cartão: envia mensagem pela Evolution API e guarda o histórico.
- **Webhook**: mensagens que o cliente envia caem no chat automaticamente; se o número
  não existir, vira um lead novo na primeira coluna.

Enquanto a Evolution não estiver configurada, o chat funciona em **modo simulado**:
a mensagem é salva no histórico (marcada como `simulado`) mas não sai de verdade.

## Conectando a Evolution API

1. Suba uma instância da Evolution API (ex.: via Docker) e crie uma instância de WhatsApp.
2. Preencha o `.env`:

   ```env
   EVOLUTION_API_URL="https://sua-evolution.exemplo.com"
   EVOLUTION_API_KEY="sua-api-key"
   EVOLUTION_INSTANCE="nome-da-instancia"
   ```

3. Reinicie o `npm run dev`.
4. Para **receber** mensagens, configure o webhook da Evolution apontando para:

   ```
   https://SEU-DOMINIO/api/webhook/evolution
   ```

   habilitando o evento `messages.upsert`.

> Os números devem estar no formato internacional só com dígitos: `5511999998888`.

## Estrutura

| Caminho | O quê |
|---|---|
| `prisma/schema.prisma` | Modelos: `Stage`, `Contact`, `Message` |
| `lib/evolution.js` | Cliente da Evolution API (enviar/parsear mensagens) |
| `app/api/stages` | Lista colunas + contatos |
| `app/api/contacts/...` | CRUD de contato, mover de coluna, mensagens |
| `app/api/webhook/evolution` | Recebe mensagens do cliente |
| `components/KanbanBoard.jsx` | Board com drag-and-drop |
| `components/ContactModal.jsx` | Cartão do contato + chat |

## Migrar para Postgres (produção)

Troque o `provider` em `prisma/schema.prisma` para `postgresql`, ajuste a `DATABASE_URL`
e rode `npx prisma migrate dev`. O resto do código não muda.
