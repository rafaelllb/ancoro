// [2026-10-14] Criado: entrada do editor — Rafael Brito
// [2026-10-14] Alterado: expõe o store em DEV (window.__ps) para testes E2E (puppeteer) — não vai para o build de produção
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useEditor } from './store';
import { startHost } from './host';
import '@ancoro/process-render/diagram.css';
import './styles.css';

if (import.meta.env.DEV) (window as unknown as { __ps: typeof useEditor }).__ps = useEditor;

// [2026-10-15] Criado: modo host (iframe do Ancoro) — liga a ponte RPC e carrega o processo do servidor — Rafael Brito
startHost();

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
