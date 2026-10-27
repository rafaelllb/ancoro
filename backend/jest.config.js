/**
 * [2026-10-15] Criado: primeira infraestrutura de testes do backend (Process Studio, Fase 4) — Rafael Brito
 * Testes de rota rodam contra um SQLite descartável (prisma/test.db) criado por jest.global-setup.js.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  setupFiles: ['<rootDir>/jest.setup-env.js'],
  globalSetup: '<rootDir>/jest.global-setup.js',
  testTimeout: 30000,
}
