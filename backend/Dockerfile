# Dockerfile para deploy do backend Ancoro
# Otimizado para Render, Railway, Fly.io e outras plataformas PaaS
# Using Debian Slim for better Prisma compatibility and native dependencies support

FROM node:18-slim

# Install OpenSSL and CA certificates (required by Prisma and HTTPS connections)
RUN apt-get update && apt-get install -y \
    openssl \
    ca-certificates \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Criar diretÃ³rio de trabalho
WORKDIR /app

# Copiar arquivos de dependÃªncias primeiro (cache layer)
COPY package*.json ./

# Instalar TODAS as dependÃªncias (incluindo devDependencies para build)
RUN npm ci

# Copiar cÃ³digo fonte
COPY . .

# Gerar Prisma Client para staging/prod (schema.prisma = PostgreSQL)
RUN npx prisma generate --schema prisma/schema.prisma

# Compilar TypeScript
RUN npm run build

# Copy entrypoint script and make it executable
COPY docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh

# Remover devDependencies apÃ³s build (reduz tamanho da imagem)
# Note: prisma must be in dependencies for migrations to work
RUN npm prune --production

# Expor porta (configurÃ¡vel via PORT env var)
EXPOSE 3001

# Health check bÃ¡sico
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3001}/health || exit 1

# Comando de inicializaÃ§Ã£o - roda migrations antes de iniciar o servidor
# Nota: VariÃ¡veis de ambiente (DATABASE_URL, JWT_SECRET, etc.) devem ser
# configuradas na plataforma de deploy, nÃ£o no Dockerfile
CMD ["/app/docker-entrypoint.sh"]