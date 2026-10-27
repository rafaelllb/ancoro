// [2026-10-15] Criado: recria o SQLite de teste a partir do schema (db push, sem migrations versionadas no projeto) — Rafael Brito
const { execSync } = require('node:child_process')
module.exports = async () => {
  execSync('npx prisma db push --skip-generate --force-reset --accept-data-loss --schema prisma/schema.sqlite.prisma', {
    cwd: __dirname, stdio: 'pipe', env: { ...process.env, DATABASE_URL: 'file:./test.db' },
  })
}
