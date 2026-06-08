#!/bin/bash
# ============================================
# Ancoro On-Premise - Script de Atualização
# ============================================
# Uso: ./scripts/upgrade-onpremise.sh [versão]
#
# Exemplos:
#   ./scripts/upgrade-onpremise.sh           # Atualiza para latest
#   ./scripts/upgrade-onpremise.sh v1.2.0    # Atualiza para versão específica
#
# Este script:
# 1. Verifica versão atual e nova
# 2. Faz backup do banco de dados
# 3. Baixa novas imagens
# 4. Aplica migrations
# 5. Reinicia containers
# 6. Verifica health
# 7. Rollback se falhar

set -e  # Exit on error

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Funções de logging
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Variáveis
TARGET_VERSION=${1:-latest}
COMPOSE_FILE="docker-compose.onpremise.yml"
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/ancoro_backup_${TIMESTAMP}.sql"

# Banner
echo ""
echo "============================================"
echo "   Ancoro On-Premise - Atualização"
echo "============================================"
echo ""

# ===== VERIFICAÇÕES INICIAIS =====
log_info "Verificando ambiente..."

if [ ! -f "$COMPOSE_FILE" ]; then
    log_error "Execute este script a partir do diretório raiz do Ancoro"
    exit 1
fi

if [ ! -f ".env" ]; then
    log_error "Arquivo .env não encontrado. Execute setup-onpremise.sh primeiro."
    exit 1
fi

source .env

# Verificar se containers estão rodando
if ! docker compose -f $COMPOSE_FILE ps | grep -q "running"; then
    log_error "Containers não estão rodando. Inicie com: docker compose -f $COMPOSE_FILE up -d"
    exit 1
fi

log_success "Ambiente verificado"

# ===== VERIFICAR VERSÕES =====
log_info "Verificando versões..."

# Versão atual (do health endpoint)
CURRENT_VERSION=$(docker compose -f $COMPOSE_FILE exec -T backend wget -qO- http://localhost:3000/health 2>/dev/null | grep -o '"version":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
log_info "Versão atual: $CURRENT_VERSION"
log_info "Versão alvo: $TARGET_VERSION"

if [ "$CURRENT_VERSION" = "$TARGET_VERSION" ] && [ "$TARGET_VERSION" != "latest" ]; then
    log_warn "Já está na versão $TARGET_VERSION. Deseja continuar mesmo assim?"
    read -p "[y/N]: " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 0
    fi
fi

# ===== BACKUP DO BANCO DE DADOS =====
log_info "Fazendo backup do banco de dados..."

mkdir -p "$BACKUP_DIR"

if docker compose -f $COMPOSE_FILE exec -T postgres pg_dump -U ${POSTGRES_USER:-ancoro} ${POSTGRES_DB:-ancoro} > "$BACKUP_FILE" 2>/dev/null; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    log_success "Backup criado: $BACKUP_FILE ($BACKUP_SIZE)"
else
    log_error "Falha ao criar backup"
    exit 1
fi

# ===== ATUALIZAR VERSÃO NO .env =====
if [ "$TARGET_VERSION" != "latest" ]; then
    sed -i "s/^ANCORO_VERSION=.*/ANCORO_VERSION=$TARGET_VERSION/" .env
    log_info "Versão atualizada no .env para $TARGET_VERSION"
fi

# ===== BAIXAR NOVAS IMAGENS =====
log_info "Baixando novas imagens..."

if ! docker compose -f $COMPOSE_FILE pull; then
    log_error "Falha ao baixar imagens"
    log_info "Restaurando versão anterior no .env..."
    sed -i "s/^ANCORO_VERSION=.*/ANCORO_VERSION=$CURRENT_VERSION/" .env
    exit 1
fi

log_success "Imagens baixadas"

# ===== PARAR CONTAINERS =====
log_info "Parando containers..."

docker compose -f $COMPOSE_FILE stop backend frontend

log_success "Containers parados"

# ===== INICIAR COM NOVAS IMAGENS =====
log_info "Iniciando com novas imagens..."

docker compose -f $COMPOSE_FILE up -d

# ===== AGUARDAR E VERIFICAR =====
log_info "Aguardando serviços ficarem prontos..."

MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    HEALTH=$(docker compose -f $COMPOSE_FILE exec -T backend wget -qO- http://localhost:3000/health 2>/dev/null || echo "")
    if echo "$HEALTH" | grep -q '"status":"ok"'; then
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo -n "."
    sleep 3
done
echo ""

# ===== VERIFICAR SUCESSO OU ROLLBACK =====
if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    log_error "Atualização falhou - serviços não ficaram prontos"
    log_warn "Iniciando rollback..."

    # Restaurar versão anterior
    sed -i "s/^ANCORO_VERSION=.*/ANCORO_VERSION=$CURRENT_VERSION/" .env

    # Baixar imagens antigas
    docker compose -f $COMPOSE_FILE pull

    # Reiniciar com versão antiga
    docker compose -f $COMPOSE_FILE up -d

    # Verificar se rollback funcionou
    sleep 10
    ROLLBACK_HEALTH=$(docker compose -f $COMPOSE_FILE exec -T backend wget -qO- http://localhost:3000/health 2>/dev/null || echo "")

    if echo "$ROLLBACK_HEALTH" | grep -q '"status":"ok"'; then
        log_success "Rollback concluído - sistema restaurado para $CURRENT_VERSION"
    else
        log_error "Rollback falhou! Restaure manualmente o backup: $BACKUP_FILE"
        log_info "Para restaurar: docker compose -f $COMPOSE_FILE exec -T postgres psql -U ${POSTGRES_USER:-ancoro} ${POSTGRES_DB:-ancoro} < $BACKUP_FILE"
    fi

    exit 1
fi

# ===== SUCESSO =====
NEW_VERSION=$(docker compose -f $COMPOSE_FILE exec -T backend wget -qO- http://localhost:3000/health 2>/dev/null | grep -o '"version":"[^"]*"' | cut -d'"' -f4 || echo "$TARGET_VERSION")

echo ""
echo "============================================"
log_success "Atualização concluída com sucesso!"
echo "============================================"
echo ""
echo "Versão anterior: $CURRENT_VERSION"
echo "Versão atual:    $NEW_VERSION"
echo ""
echo "Backup disponível em: $BACKUP_FILE"
echo ""
echo "Para verificar a saúde do sistema:"
echo "  curl http://localhost:${WEB_PORT:-80}/health"
echo ""

# ===== LIMPEZA DE BACKUPS ANTIGOS =====
# Mantém apenas os últimos 5 backups
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/*.sql 2>/dev/null | wc -l || echo "0")
if [ "$BACKUP_COUNT" -gt 5 ]; then
    log_info "Limpando backups antigos (mantendo últimos 5)..."
    ls -1t "$BACKUP_DIR"/*.sql | tail -n +6 | xargs rm -f
    log_success "Backups antigos removidos"
fi
