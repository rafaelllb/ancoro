# Ancoro On-Premise - Guia de Instalação

Este guia descreve como instalar e configurar o Ancoro em seu próprio servidor.

## Índice

1. [Requisitos](#requisitos)
2. [Instalação Rápida](#instalação-rápida)
3. [Configuração](#configuração)
4. [Licenciamento](#licenciamento)
5. [Múltiplos Ambientes (DEV/QA/PROD)](#múltiplos-ambientes-devqaprod)
6. [SSL/HTTPS](#sslhttps)
7. [Backup e Restore](#backup-e-restore)
8. [Atualização](#atualização)
9. [Troubleshooting](#troubleshooting)

---

## Requisitos

### Hardware Mínimo

| Recurso | Mínimo | Recomendado |
|---------|--------|-------------|
| CPU | 2 cores | 4 cores |
| RAM | 2 GB | 4 GB |
| Disco | 10 GB | 50 GB |

### Software

- **Sistema Operacional**: Linux (Ubuntu 20.04+, Debian 11+, CentOS 8+)
- **Docker**: 20.10 ou superior
- **Docker Compose**: v2.0 ou superior

### Verificar Instalação

```bash
# Docker
docker --version
# Esperado: Docker version 20.10.x ou superior

# Docker Compose
docker compose version
# Esperado: Docker Compose version v2.x.x
```

### Instalar Docker (se necessário)

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Logout e login novamente para aplicar grupo
```

---

## Instalação Rápida

### 1. Obter Arquivos

```bash
# Clone ou baixe o release
git clone https://github.com/seu-usuario/ancoro.git
cd ancoro

# Ou baixe o release específico
wget https://github.com/seu-usuario/ancoro/archive/refs/tags/v1.0.0.tar.gz
tar -xzf v1.0.0.tar.gz
cd ancoro-1.0.0
```

### 2. Colocar Arquivo de Licença

```bash
# Copie o arquivo de licença para a raiz do projeto
cp /caminho/para/sua-licenca.license .license
```

### 3. Executar Script de Setup

```bash
chmod +x scripts/setup-onpremise.sh
./scripts/setup-onpremise.sh
```

O script irá:
- Verificar pré-requisitos
- Criar arquivo `.env` com configurações
- Gerar senhas seguras automaticamente
- Baixar imagens Docker
- Iniciar os serviços
- Executar migrations do banco de dados

### 4. Acessar

Após a instalação, acesse:

```
http://seu-servidor
```

Credenciais iniciais (se seed foi executado):
- **Email**: admin@ancoro.app
- **Senha**: admin123

> ⚠️ **IMPORTANTE**: Altere a senha do admin após o primeiro login!

---

## Configuração

### Variáveis de Ambiente

Edite o arquivo `.env` para customizar:

```bash
# Obrigatórios
POSTGRES_PASSWORD=sua-senha-segura
JWT_SECRET=sua-chave-jwt-32-caracteres-minimo
CORS_ORIGIN=https://ancoro.suaempresa.com.br

# Opcionais
ANCORO_VERSION=v1.0.0
WEB_PORT=80
WEB_PORT_SSL=443
LOG_LEVEL=info
```

### Gerar Secrets Seguros

```bash
# Gerar senha para PostgreSQL
openssl rand -base64 24

# Gerar JWT Secret
openssl rand -base64 48
```

### Aplicar Mudanças

Após editar `.env`:

```bash
docker compose -f docker-compose.onpremise.yml down
docker compose -f docker-compose.onpremise.yml up -d
```

---

## Licenciamento

### Arquivo de Licença

O Ancoro On-Premise requer uma licença válida para funcionar. O arquivo de licença:

- Deve estar na raiz do projeto como `.license`
- É um JWT assinado (não editável)
- Contém: cliente, tier, features, data de expiração

### Verificar Status da Licença

```bash
curl http://localhost/api/license/status
```

Resposta esperada:
```json
{
  "mode": "onpremise",
  "valid": true,
  "customerName": "Sua Empresa",
  "tier": "professional",
  "expiresAt": "2025-12-31T23:59:59.000Z",
  "daysRemaining": 365
}
```

### Renovar Licença

1. Entre em contato para obter nova licença
2. Substitua o arquivo `.license`
3. Reinicie o backend:

```bash
docker compose -f docker-compose.onpremise.yml restart backend
```

### Tiers e Features

| Feature | Pilot | Starter | Professional | Enterprise |
|---------|-------|---------|--------------|------------|
| Projetos | 1 | 3 | 10 | Ilimitado |
| Usuários/Projeto | 5 | 10 | 25 | Ilimitado |
| Requisitos/Projeto | 50 | 200 | Ilimitado | Ilimitado |
| Export PDF | ❌ | ✅ | ✅ | ✅ |
| Matriz de Cruzamento | ✅ | ✅ | ✅ | ✅ |
| Detecção de Conflitos | ❌ | ✅ | ✅ | ✅ |
| Audit Log | ❌ | ❌ | ✅ | ✅ |
| API Access | ❌ | ❌ | ✅ | ✅ |
| Custom Branding | ❌ | ❌ | ❌ | ✅ |
| **Ambientes** | 1 (prod) | 2 (qa+prod) | 3 (dev+qa+prod) | 3 (dev+qa+prod) |

---

## Múltiplos Ambientes (DEV/QA/PROD)

A licença única suporta múltiplas instalações para diferentes ambientes. Cada ambiente roda como uma instalação separada, compartilhando a mesma licença.

### Estrutura Recomendada

```
/opt/ancoro/
├── dev/
│   ├── docker-compose.onpremise.yml
│   ├── .env                    # ENVIRONMENT_TYPE=dev
│   └── .license                # Mesma licença
├── qa/
│   ├── docker-compose.onpremise.yml
│   ├── .env                    # ENVIRONMENT_TYPE=qa
│   └── .license                # Mesma licença
└── prod/
    ├── docker-compose.onpremise.yml
    ├── .env                    # ENVIRONMENT_TYPE=prod
    └── .license                # Mesma licença
```

### Configurar Cada Ambiente

1. **Copie a estrutura base** para cada ambiente:

```bash
# Criar diretórios
mkdir -p /opt/ancoro/{dev,qa,prod}

# Copiar arquivos para cada ambiente
for env in dev qa prod; do
  cp docker-compose.onpremise.yml /opt/ancoro/$env/
  cp .env.onpremise.example /opt/ancoro/$env/.env
  cp .license /opt/ancoro/$env/
done
```

2. **Configure cada `.env`** com valores únicos:

```bash
# /opt/ancoro/dev/.env
ENVIRONMENT_TYPE=dev
POSTGRES_DB=ancoro_dev
WEB_PORT=3001
CORS_ORIGIN=http://ancoro-dev.empresa.local

# /opt/ancoro/qa/.env
ENVIRONMENT_TYPE=qa
POSTGRES_DB=ancoro_qa
WEB_PORT=3002
CORS_ORIGIN=http://ancoro-qa.empresa.local

# /opt/ancoro/prod/.env
ENVIRONMENT_TYPE=prod
POSTGRES_DB=ancoro_prod
WEB_PORT=80
CORS_ORIGIN=https://ancoro.empresa.com.br
```

3. **Inicie cada ambiente**:

```bash
cd /opt/ancoro/dev && docker compose -f docker-compose.onpremise.yml up -d
cd /opt/ancoro/qa && docker compose -f docker-compose.onpremise.yml up -d
cd /opt/ancoro/prod && docker compose -f docker-compose.onpremise.yml up -d
```

### Ambientes por Tier de Licença

| Tier | Ambientes Permitidos |
|------|---------------------|
| Pilot | Apenas `prod` |
| Starter | `qa`, `prod` |
| Professional | `dev`, `qa`, `prod` |
| Enterprise | `dev`, `qa`, `prod` |

Se tentar iniciar um ambiente não permitido pela licença, o backend não iniciará e mostrará erro nos logs.

### Verificar Ambiente

```bash
curl http://localhost:3001/health
```

Resposta incluirá:
```json
{
  "status": "ok",
  "deploymentMode": "onpremise",
  "environment": "dev"
}
```

### Migrar Dados entre Ambientes

```bash
# Backup do QA
docker compose -f /opt/ancoro/qa/docker-compose.onpremise.yml exec -T postgres \
  pg_dump -U ancoro ancoro_qa > qa_backup.sql

# Restore no PROD
docker compose -f /opt/ancoro/prod/docker-compose.onpremise.yml exec -T postgres \
  psql -U ancoro ancoro_prod < qa_backup.sql
```

---

## SSL/HTTPS

### Opção 1: Let's Encrypt com Certbot

```bash
# Instalar certbot
sudo apt install certbot

# Gerar certificado
sudo certbot certonly --standalone -d ancoro.suaempresa.com.br

# Copiar certificados
sudo cp /etc/letsencrypt/live/ancoro.suaempresa.com.br/fullchain.pem nginx/certs/
sudo cp /etc/letsencrypt/live/ancoro.suaempresa.com.br/privkey.pem nginx/certs/
```

### Opção 2: Certificado Próprio

```bash
mkdir -p nginx/certs
cp seu-certificado.pem nginx/certs/fullchain.pem
cp sua-chave-privada.pem nginx/certs/privkey.pem
```

### Habilitar HTTPS

Edite `nginx/nginx.onpremise.conf` e descomente o bloco `server` para porta 443.

Reinicie:
```bash
docker compose -f docker-compose.onpremise.yml restart nginx
```

---

## Backup e Restore

### Backup Manual

```bash
# Backup do banco de dados
docker compose -f docker-compose.onpremise.yml exec -T postgres \
  pg_dump -U ancoro ancoro > backup_$(date +%Y%m%d).sql

# Backup completo (banco + configs)
tar -czf ancoro_backup_$(date +%Y%m%d).tar.gz \
  .env \
  .license \
  backup_*.sql
```

### Restore

```bash
# Restore do banco de dados
docker compose -f docker-compose.onpremise.yml exec -T postgres \
  psql -U ancoro ancoro < backup_20240115.sql
```

### Backup Automático (Cron)

```bash
# Editar crontab
crontab -e

# Adicionar backup diário às 2h
0 2 * * * cd /path/to/ancoro && ./scripts/backup.sh >> /var/log/ancoro-backup.log 2>&1
```

---

## Atualização

### Verificar Versão Atual

```bash
curl -s http://localhost/health | jq .
```

### Atualizar para Nova Versão

```bash
./scripts/upgrade-onpremise.sh v1.1.0
```

O script irá:
1. Fazer backup do banco de dados
2. Baixar novas imagens
3. Aplicar migrations
4. Reiniciar serviços
5. Verificar health
6. Rollback automático se falhar

### Atualizar para Latest

```bash
./scripts/upgrade-onpremise.sh
```

---

## Troubleshooting

### Ver Logs

```bash
# Todos os serviços
docker compose -f docker-compose.onpremise.yml logs -f

# Serviço específico
docker compose -f docker-compose.onpremise.yml logs -f backend

# Últimas 100 linhas
docker compose -f docker-compose.onpremise.yml logs --tail=100 backend
```

### Problemas Comuns

#### Container não inicia

```bash
# Verificar status
docker compose -f docker-compose.onpremise.yml ps

# Ver logs de erro
docker compose -f docker-compose.onpremise.yml logs backend
```

#### Erro de conexão com banco

```bash
# Verificar se PostgreSQL está rodando
docker compose -f docker-compose.onpremise.yml exec postgres pg_isready

# Testar conexão
docker compose -f docker-compose.onpremise.yml exec backend \
  wget -qO- http://localhost:3000/api/test-db
```

#### Licença inválida

```bash
# Verificar arquivo de licença
ls -la .license

# Verificar status
curl http://localhost/api/license/status
```

#### Porta em uso

```bash
# Verificar o que está usando a porta
sudo lsof -i :80

# Alterar porta no .env
WEB_PORT=8080
```

### Reiniciar Completamente

```bash
# Parar tudo
docker compose -f docker-compose.onpremise.yml down

# Remover volumes (CUIDADO: apaga dados!)
docker compose -f docker-compose.onpremise.yml down -v

# Reinstalar
./scripts/setup-onpremise.sh
```

### Contato Suporte

Se os problemas persistirem:

- Email: suporte@ancoro.com.br
- Documentação: https://docs.ancoro.com.br

Inclua nos tickets:
- Versão do Ancoro
- Logs relevantes
- Descrição do problema
- Passos para reproduzir
