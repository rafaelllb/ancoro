#!/usr/bin/env bash
# [2026-10-15] Criado: roda o Ancoro "como produção", localmente, sem tocar no banco demo/dev — Rafael Brito
#
# O que é "como produção": backend COMPILADO (tsc -> dist, node dist/index.js) com NODE_ENV=production, frontend com build de produção
# servido estaticamente (vite preview), sem dados de demo e sem seed (o seed é bloqueado em produção por design).
# O que NÃO é igual: o banco. Produção real usa PostgreSQL; aqui usamos um SQLite próprio (backend/prisma/prod-local.db) porque o
# Postgres local não está acessível. Mesma API do Prisma, mas confirme migrations/tipos em staging com Postgres antes de ir ao ar.
#
# Uso:  scripts/prod-local/prod-local.sh setup [email] [senha]   # build + banco novo + 1º ADMIN (padrão: admin@ancoro.local / Ancoro#2026)
#       scripts/prod-local/prod-local.sh start                   # backend :3000 + frontend :4173
#       scripts/prod-local/prod-local.sh stop
set -euo pipefail
# Se o seu shell exporta NODE_ENV=development (comum em máquina de dev), ele vazaria para o build/start: cada passo abaixo fixa o NODE_ENV que precisa.
# backend/.env (NODE_ENV=development, DEMO_MODE=false) é carregado pelo dotenv da config e NÃO sobrescreve o que já está no ambiente.
# Por isso o start fixa NODE_ENV=production e define DEMO_MODE/DEMO_AUTO_SEED VAZIOS: a config usa z.coerce.boolean, em que a string "false" vira true (modo demo ligado) e a vazia vira false.
unset NODE_ENV DEMO_MODE DEMO_AUTO_SEED
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DB="file:./prod-local.db"
API=http://localhost:3000
WEB=http://localhost:4173
kill_port() { for pid in $(netstat -ano | grep ":$1 " | grep LISTENING | awk '{print $5}' | sort -u); do taskkill //PID "$pid" //F >/dev/null 2>&1 || kill "$pid" 2>/dev/null || true; done; }
# segredo estável entre execuções (senão todo restart invalida os logins); fica fora do git
secret_file="$ROOT/backend/.prod-local.secret"
[ -f "$secret_file" ] || node -e "console.log(require('crypto').randomBytes(48).toString('hex'))" > "$secret_file"

case "${1:-start}" in
  setup)
    EMAIL="${2:-admin@ancoro.local}"; PASS="${3:-Ancoro#2026}"
    cd "$ROOT" && npm run build:processkit && npm run build:process-studio
    cd "$ROOT/backend"
    DATABASE_URL="$DB" npx prisma generate --schema prisma/schema.sqlite.prisma >/dev/null
    DATABASE_URL="$DB" npx prisma db push --skip-generate --schema prisma/schema.sqlite.prisma >/dev/null
    npx tsc
    DATABASE_URL="$DB" node scripts/create-admin.js "$EMAIL" "$PASS"
    cd "$ROOT/frontend"
    NODE_ENV=production VITE_API_URL="$API" VITE_APP_ENV=production VITE_DEMO_MODE=false VITE_SHOW_ENV_INDICATOR=false npx vite build --mode production
    echo "setup ok. Login: $EMAIL / $PASS" ;;
  start)
    kill_port 3000; kill_port 4173; sleep 1
    cd "$ROOT/backend"
    (NODE_ENV=production PORT=3000 DATABASE_URL="$DB" JWT_SECRET="$(cat "$secret_file")" JWT_EXPIRES_IN=7d DEMO_MODE= DEMO_AUTO_SEED= \
       CORS_ORIGIN="$WEB" LOG_LEVEL=info node dist/index.js >/tmp/ancoro-prod-local-be.log 2>&1 &)
    cd "$ROOT/frontend" && (npx vite preview --port 4173 --strictPort >/tmp/ancoro-prod-local-fe.log 2>&1 &)
    for _ in $(seq 1 30); do curl -s "$API/health" >/dev/null && break; sleep 1; done
    curl -s "$API/health"; echo; echo "frontend: $WEB   (logs: /tmp/ancoro-prod-local-*.log)" ;;
  stop) kill_port 3000; kill_port 4173 ;;
esac
