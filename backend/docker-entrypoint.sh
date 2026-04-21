#!/bin/sh
set -e

# db push sincroniza o schema com o banco sem necessidade de migrations
# Adequado para deploy inicial ou quando não há migrations versionadas
echo "Syncing Prisma schema with database..."
npx prisma db push --schema prisma/schema.prisma --accept-data-loss

echo "Starting application..."
exec node dist/index.js
