# Status do deploy — onde paramos

## Já feito
- App completo e funcionando local (Next.js + Prisma SQLite). Código commitado (branch `master`).
- VPS (HostMF) no ar: IP **185.101.104.154**, Ubuntu, acesso por Console Web.
- **Coolify instalado** na VPS e rodando em **http://185.101.104.154:8000** (conta admin criada).
- Dockerfile + .dockerignore + DEPLOY.md prontos (deploy mantém SQLite com volumes).

## Falta (próximos passos)
1. **Criar um repositório no GitHub** (público) — ex.: `controller-crm`.
2. No PC, apontar o remote e enviar:
   ```
   cd C:\Users\renat\controller-crm
   git remote add origin https://github.com/SEU-USUARIO/controller-crm.git
   git push -u origin master
   ```
   (o push abre o login do GitHub no navegador — autorizar.)
3. No **Coolify** (http://185.101.104.154:8000):
   - New Resource → Application → **Public Repository** → URL do repo.
   - Build Pack: **Dockerfile**.
   - **Persistent Storage (volumes):**
     - `/data` (pro banco) e setar env `DATABASE_URL=file:/data/prod.db`
     - `/app/public/uploads` (pros anexos)
   - Porta: **3000**.
   - Domínio: atribuir (SSL automático).
   - Deploy.
4. Depois: em **Configurações → Números** do app, reconfigurar URL+API Key da Evolution e conectar números; e apontar o **webhook** da Evolution para `https://DOMINIO/api/webhook/evolution` (evento `messages.upsert`).

## Observação
SQLite roda bem na VPS de 2 GB; só precisa dos volumes pra não perder dados em cada deploy.
