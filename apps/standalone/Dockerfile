# Process Studio standalone — build a partir da RAIZ do repositório:
#   docker build -f apps/standalone/Dockerfile -t process-studio .
#   docker run -p 3200:3200 -v ps-data:/data \
#     -e PS_BASE_URL=https://processos.exemplo.com -e PS_ADMIN_EMAIL=voce@exemplo.com \
#     -e PS_SMTP_URL=smtp://usuario:senha@smtp.exemplo.com:587 process-studio
# [2026-10-16] Criado: Fase 6 — NÃO validado: o `npm ci` dentro do container falhou por ECONNRESET (rede do Docker na máquina de dev) em 2 tentativas; as etapas seguintes nunca rodaram — Rafael Brito
FROM node:22-bookworm-slim AS build
WORKDIR /repo
COPY packages ./packages
COPY apps/standalone ./apps/standalone
RUN for p in process-core process-render process-editor process-publisher; do (cd packages/$p && npm ci --fetch-retries=5 --fetch-retry-mintimeout=2000); done
RUN cd apps/standalone && npm ci --fetch-retries=5 && npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production PS_DATA_DIR=/data PS_PORT=3200 PS_TRUST_PROXY=true
WORKDIR /app
COPY --from=build /repo/apps/standalone/node_modules ./node_modules
COPY --from=build /repo/apps/standalone/dist ./dist
COPY --from=build /repo/apps/standalone/vendor ./vendor
COPY --from=build /repo/apps/standalone/public ./public
COPY apps/standalone/package.json ./
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3200
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://localhost:3200/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/server.mjs"]
