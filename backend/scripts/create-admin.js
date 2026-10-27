/**
 * Cria (ou atualiza a senha d)o usuário ADMIN inicial. O seed é bloqueado em produção de propósito, então um banco novo precisa de um primeiro usuário.
 * [2026-10-15] Criado: apoio ao "produção local" (scripts/prod-local/prod-local.sh) — Rafael Brito
 * Uso: DATABASE_URL=... node scripts/create-admin.js <email> <senha> [nome]
 */
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcrypt')

const [email, password, name = 'Administrador'] = process.argv.slice(2)
if (!email || !password || password.length < 8) {
  console.error('uso: node scripts/create-admin.js <email> <senha (min. 8)> [nome]')
  process.exit(1)
}
const prisma = new PrismaClient()
;(async () => {
  const hash = await bcrypt.hash(password, 10)
  const u = await prisma.user.upsert({
    where: { email },
    update: { password: hash, role: 'ADMIN' },
    create: { email, name, password: hash, role: 'ADMIN' },
  })
  console.log(`ADMIN pronto: ${u.email}`)
})().catch((e) => { console.error(e.message); process.exit(1) }).finally(() => prisma.$disconnect())
