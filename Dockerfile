# Imagem de produção do Controller CRM
FROM node:22-bookworm-slim

WORKDIR /app

# OpenSSL é necessário para o Prisma. poppler-utils (pdftoppm) converte a 1ª
# página de um PDF recebido (CNH digital, comprovante, extrato) em imagem, pra
# poder passar pelo mesmo pipeline de visão que já analisa foto/documento —
# sem isso, todo PDF recebido era ignorado silenciosamente pela IA.
RUN apt-get update -y && apt-get install -y openssl poppler-utils && rm -rf /var/lib/apt/lists/*

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

# Ao iniciar: garante o schema, cria as colunas padrão (só se o banco estiver vazio) e sobe o servidor
CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss && node prisma/ensure-stages.js && npm start"]
