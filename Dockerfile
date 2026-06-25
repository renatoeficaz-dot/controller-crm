# Imagem de produção do Controller CRM
FROM node:22-bookworm-slim

WORKDIR /app

# OpenSSL é necessário para o Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Instala dependências (cache eficiente)
COPY package.json package-lock.json ./
# --ignore-scripts evita o postinstall (prisma generate) antes do schema ser copiado;
# o prisma generate roda depois, com o código já presente (linha abaixo e no build).
RUN npm ci --ignore-scripts

# Copia o restante do código
COPY . .

# Gera o Prisma Client e faz o build de produção
RUN npx prisma generate
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Ao iniciar: garante o schema no banco e sobe o servidor
CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss && npm start"]
