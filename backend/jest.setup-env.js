// [2026-10-24] Criado: segredo JWT fixo só para testes — o fallback inseguro foi removido de middleware/auth.ts — Rafael Brito
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret-not-for-production-0123456789'
