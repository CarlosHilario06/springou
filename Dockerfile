# ---------- build do painel ----------
FROM node:22-alpine AS build

# O Prisma precisa do OpenSSL para escolher o engine certo no Alpine.
RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
# postinstall roda `prisma generate`, que precisa do schema acima.
RUN npm ci

COPY . .
# Sem VITE_API_URL o painel chama a própria origem, que é o que queremos
# quando um processo só serve painel e API.
RUN npm run build

# ---------- imagem final ----------
FROM node:22-alpine AS runtime

RUN apk add --no-cache openssl

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY scripts ./scripts
COPY --from=build /app/dist ./dist

# As migrations rodam no arranque e o Prisma precisa escrever no diretório;
# sem isto o contêiner entra em ciclo de reinício ao subir sem ser root.
RUN chown -R node:node /app

# Não rodar como root.
USER node

EXPOSE 3001

# O healthcheck confirma que a API responde e que o banco está acessível.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server/index.js"]
