#!/usr/bin/env bash
# [2026-10-15] Criado: sobe um ambiente ISOLADO para o E2E full-stack do Process Studio (README Process Studio §6.4, etapa 4) — Rafael Brito
# Backend :3100 com SQLite descartável (backend/prisma/e2e.db, semeado com o dataset demo) e frontend :5199 apontando para ele.
# NODE_ENV=development só para desligar o rate limit global (100 req/15 min), que o E2E estoura; não afeta o banco real/demo.
# Uso:  scripts/e2e/process-studio-env.sh up      # (re)cria o banco pristino e sobe backend+frontend
#       scripts/e2e/process-studio-env.sh reset   # volta o banco ao estado inicial e reinicia só o backend
#       scripts/e2e/process-studio-env.sh down
# Depois:  cd packages/process-editor && node e2e/ancoro-fullstack.mjs   (precisa de `npm run build:processkit` e `npm run build:process-studio`)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
kill_port() { for pid in $(netstat -ano | grep ":$1 " | grep LISTENING | awk '{print $5}' | sort -u); do taskkill //PID "$pid" //F >/dev/null 2>&1 || kill "$pid" 2>/dev/null || true; done; }
start_backend() {
  kill_port 3100; sleep 1
  cp "$ROOT/backend/prisma/e2e.base.db" "$ROOT/backend/prisma/e2e.db"
  (cd "$ROOT/backend" && DATABASE_URL="file:./e2e.db" PORT=3100 NODE_ENV=development npx dotenv -e .env.demo -- ts-node src/index.ts >/tmp/ps-e2e-be.log 2>&1 &)
  for _ in $(seq 1 40); do curl -s localhost:3100/health >/dev/null && return 0; sleep 1; done
  echo "backend não subiu (veja /tmp/ps-e2e-be.log)" >&2; exit 1
}
case "${1:-up}" in
  up)
    cd "$ROOT/backend"
    export DATABASE_URL="file:./e2e.db"
    kill_port 3100; sleep 2
    rm -f prisma/e2e.db* prisma/e2e.base.db
    npx prisma generate --schema prisma/schema.sqlite.prisma >/dev/null
    npx prisma db push --skip-generate --schema prisma/schema.sqlite.prisma >/dev/null
    NODE_ENV=demo npx dotenv -e .env.demo -- ts-node prisma/seed.ts >/dev/null
    cp prisma/e2e.db prisma/e2e.base.db
    start_backend
    kill_port 5199
    (cd "$ROOT/frontend" && VITE_API_URL=http://localhost:3100 npx vite --mode demo --port 5199 >/tmp/ps-e2e-fe.log 2>&1 &)
    sleep 6; echo "ok: backend :3100, frontend :5199" ;;
  reset) start_backend; echo "banco restaurado" ;;
  down) kill_port 3100; kill_port 5199 ;;
esac
