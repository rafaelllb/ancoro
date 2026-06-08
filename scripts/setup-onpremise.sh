#!/bin/bash
# ============================================
# Ancoro On-Premise - Script de Instalação
# ============================================
# Uso: ./scripts/setup-onpremise.sh
#
# Este script:
# 1. Verifica pré-requisitos (Docker, Docker Compose)
# 2. Cria arquivo .env a partir do template
# 3. Gera secrets se não fornecidos
# 4. Inicia os containers
# 5. Executa migrations
# 6. Cria usuário admin inicial
# 7. Verifica health da instalação

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

# Banner
echo ""
echo "============================================"
echo "   Ancoro On-Premise - Instalação"
echo "============================================"
echo ""

# ===== VERIFICAR PRÉ-REQUISITOS =====
log_info "Verificando pré-requisitos..."

# Docker
if ! command -v docker &> /dev/null; then
    log_error "Docker não encontrado. Instale em: https://docs.docker.com/get-docker/"
    exit 1
fi
DOCKER_VERSION=$(docker --version | grep -oE '[0-9]+\.[0-9]+' | head -1)
log_success "Docker instalado (v$DOCKER_VERSION)"

# Docker Compose
if ! docker compose version &> /dev/null; then
    log_error "Docker Compose não encontrado. Instale a versão v2."
    exit 1
fi
COMPOSE_VERSION=$(docker compose version | grep -oE '[0-9]+\.[0-9]+' | head -1)
log_success "Docker Compose instalado (v$COMPOSE_VERSION)"

# Verificar se está no diretório correto
if [ ! -f "docker-compose.onpremise.yml" ]; then
    log_error "Execute este script a partir do diretório raiz do Ancoro"
    exit 1
fi

# ===== VERIFICAR ARQUIVO DE LICENÇA =====
log_info "Verificando licença..."

if [ ! -f ".license" ]; then
    log_warn "Arquivo .license não encontrado!"
    echo ""
    echo "Para instalar o Ancoro On-Premise você precisa de uma licença válida."
    echo "Entre em contato para obter sua licença: contato@ancoro.com.br"
    echo ""
    read -p "Deseja continuar sem licença? (apenas para testes) [y/N]: " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
    log_warn "Continuando sem licença - funcionalidades limitadas"
else
    log_success "Arquivo de licença encontrado"
fi

# ===== CONFIGURAR AMBIENTE =====
log_info "Configurando ambiente..."

if [ ! -f ".env" ]; then
    if [ -f ".env.onpremise.example" ]; then
        cp .env.onpremise.example .env
        log_info "Arquivo .env criado a partir do template"
    else
        log_error "Template .env.onpremise.example não encontrado"
        exit 1
    fi
fi

# Verificar se variáveis obrigatórias estão configuradas
source .env 2>/dev/null || true

# Gerar POSTGRES_PASSWORD se não definido
if [ -z "$POSTGRES_PASSWORD" ]; then
    GENERATED_PG_PASS=$(openssl rand -base64 24 | tr -d '=+/' | cut -c1-24)
    sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$GENERATED_PG_PASS/" .env
    log_info "POSTGRES_PASSWORD gerado automaticamente"
fi

# Gerar JWT_SECRET se não definido
if [ -z "$JWT_SECRET" ]; then
    GENERATED_JWT=$(openssl rand -base64 48 | tr -d '=+/' | cut -c1-48)
    sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$GENERATED_JWT/" .env
    log_info "JWT_SECRET gerado automaticamente"
fi

# Recarregar variáveis
source .env

log_success "Ambiente configurado"

# ===== BAIXAR IMAGENS =====
log_info "Baixando imagens Docker (pode demorar na primeira vez)..."

docker compose -f docker-compose.onpremise.yml pull

log_success "Imagens baixadas"

# ===== INICIAR CONTAINERS =====
log_info "Iniciando containers..."

docker compose -f docker-compose.onpremise.yml up -d

log_success "Containers iniciados"

# ===== AGUARDAR BANCO DE DADOS =====
log_info "Aguardando banco de dados ficar pronto..."

MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if docker compose -f docker-compose.onpremise.yml exec -T postgres pg_isready -U ${POSTGRES_USER:-ancoro} &> /dev/null; then
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo -n "."
    sleep 2
done
echo ""

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    log_error "Banco de dados não ficou pronto em tempo hábil"
    exit 1
fi

log_success "Banco de dados pronto"

# ===== EXECUTAR MIGRATIONS =====
log_info "Executando migrations..."

# As migrations são executadas automaticamente pelo entrypoint do container
# Aguarda o backend ficar healthy

RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    HEALTH=$(docker compose -f docker-compose.onpremise.yml exec -T backend wget -qO- http://localhost:3000/health 2>/dev/null || echo "")
    if echo "$HEALTH" | grep -q '"status":"ok"'; then
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo -n "."
    sleep 3
done
echo ""

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    log_error "Backend não ficou pronto em tempo hábil"
    log_info "Verifique os logs com: docker compose -f docker-compose.onpremise.yml logs backend"
    exit 1
fi

log_success "Migrations executadas"

# ===== VERIFICAR HEALTH GERAL =====
log_info "Verificando saúde da instalação..."

# Verificar cada serviço
SERVICES=("postgres" "backend" "frontend" "nginx")
ALL_HEALTHY=true

for SERVICE in "${SERVICES[@]}"; do
    STATUS=$(docker compose -f docker-compose.onpremise.yml ps $SERVICE --format json 2>/dev/null | grep -o '"Health":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
    if [ "$STATUS" = "healthy" ] || [ "$STATUS" = "" ]; then
        log_success "$SERVICE: OK"
    else
        log_warn "$SERVICE: $STATUS"
        ALL_HEALTHY=false
    fi
done

# ===== INFORMAÇÕES FINAIS =====
echo ""
echo "============================================"
if [ "$ALL_HEALTHY" = true ]; then
    log_success "Instalação concluída com sucesso!"
else
    log_warn "Instalação concluída com avisos"
fi
echo "============================================"
echo ""

# Obter porta configurada
WEB_PORT=${WEB_PORT:-80}

echo "Acesse o Ancoro em: http://localhost:${WEB_PORT}"
echo ""
echo "Credenciais do usuário demo (se seed foi executado):"
echo "  Email: admin@ancoro.app"
echo "  Senha: admin123"
echo ""
echo "Comandos úteis:"
echo "  Ver logs:      docker compose -f docker-compose.onpremise.yml logs -f"
echo "  Parar:         docker compose -f docker-compose.onpremise.yml down"
echo "  Reiniciar:     docker compose -f docker-compose.onpremise.yml restart"
echo "  Atualizar:     ./scripts/upgrade-onpremise.sh"
echo ""
