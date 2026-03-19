# S4U-LEAN Application

Aplicação desktop-first para gestão colaborativa de requisitos SAP S/4 Utilities seguindo a metodologia **S4U-LEAN v2.0**.

## Visão Geral

Sistema de gestão de requisitos que implementa os três pilares do S4U-LEAN:
1. **Pensamento Estruturado** (5W2H Duplo)
2. **Integração Explícita** (Cross-Module Awareness)
3. **Melhoria Contínua Pragmática**

## Funcionalidades Principais

- ✅ Base de dados compartilhada por projeto
- ✅ Consultores acessam requisitos do módulo respectivo (com visibilidade cross-module)
- ✅ Edição própria + comentários colaborativos
- ✅ Matriz de Cruzamento híbrida (auto-gerada + validação manual)
- ✅ Notificações de conflitos em tempo real
- ✅ Versionamento completo e histórico de mudanças
- ✅ Geração automática de BPD (Business Process Design)
- ✅ Dashboard de métricas do projeto

## Stack Tecnológica

### Backend
- **Node.js + Express** - API REST
- **PostgreSQL** - Database relacional
- **Prisma ORM** - Type-safe database access
- **Socket.io** - Real-time notifications

### Frontend
- **Electron** - Desktop application framework
- **React + TypeScript** - UI components
- **TanStack Query** - Data synchronization
- **Zustand** - State management
- **Tailwind CSS** - Styling
- **Radix UI** - Accessible components

## Estrutura do Projeto

```
s4u-lean-app/
├── backend/          # Express + Prisma backend
├── frontend/         # Electron + React frontend
├── docs/             # Documentação
├── .gitignore
└── README.md
```

## Setup Development

### Backend

```bash
cd backend
npm install
npx prisma migrate dev
npx prisma generate
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Autor

**Rafael Brito** - Consultor SAP Utilities ISU/S4HANA

## Filosofia

> "Estrutura liberta. Cerimônia aprisiona."

Esta aplicação implementa a metodologia S4U-LEAN v2.0 como ferramenta pragmática, não como burocracia.

## Licença

Proprietário - Uso interno para projetos SAP Utilities
