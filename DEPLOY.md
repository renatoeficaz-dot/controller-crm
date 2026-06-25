# Deploy — Vercel + Supabase (grátis)

Stack: **Next.js** (Vercel) + **Postgres** (Supabase). As mídias do WhatsApp ficam
guardadas no próprio banco (data URL), então **não precisa de storage separado**.

## Passo 1 — Supabase (banco)
1. Crie conta em https://supabase.com e um **New Project** (guarde a senha do banco).
2. **Project Settings → Database → Connection string** e copie duas URLs:
   - **Transaction / Pooler** (porta **6543**) → vira o `DATABASE_URL` (adicione `?pgbouncer=true`)
   - **Direct** (porta **5432**) → vira o `DIRECT_URL`

## Passo 2 — Criar as tabelas (uma vez)
No seu PC, com as URLs no `.env`:
```bash
npx prisma db push      # cria as tabelas no Supabase
node prisma/seed.js      # (opcional) colunas + dados de exemplo
```

## Passo 3 — Subir o código no GitHub
```bash
git add -A
git commit -m "Controller CRM"
git push    # para um repositório seu no GitHub
```

## Passo 4 — Vercel
1. Crie conta em https://vercel.com e **Add New → Project**, importando o repo.
2. Em **Environment Variables**, adicione:
   - `DATABASE_URL` (pooler, 6543, com `?pgbouncer=true`)
   - `DIRECT_URL` (direta, 5432)
   - *(opcional)* `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`
3. **Deploy**. (O build roda `prisma generate && next build`.)
4. A Vercel te dá uma URL pública, ex.: `https://controller-crm.vercel.app`.

## Passo 5 — Ligar a entrada de leads (webhook)
Com a URL pública da Vercel:
1. No app → **Configurações → Números**: salve URL + API Key da Evolution e **Conecte** os números (QR).
2. Na Evolution, configure o **webhook** de cada instância para:
   ```
   https://SEU-APP.vercel.app/api/webhook/evolution
   ```
   com o evento **`messages.upsert`** habilitado.

A partir daí, cliente que mandar mensagem e não tiver cadastro **entra na coluna "Novo"**.

---

## Notas
- **Mídia no banco**: áudios/imagens/anexos viram data URL e ficam na tabela `Message`.
  Ótimo para o volume de um CRM de cobrança. Se crescer muito, migramos para Supabase Storage.
- **Variáveis Evolution**: opcionais aqui porque URL + API Key também são configuráveis na tela.
- **Migrações futuras de schema**: rode `npx prisma db push` localmente (usa `DIRECT_URL`).
